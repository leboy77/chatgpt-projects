const options = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((value) => value.startsWith("--"))
    .map((value) => {
      const [key, ...rest] = value.slice(2).split("=");
      return [key, rest.join("=")];
    }),
);

const port = Number(options.port);
const extensionId = options.id;
if (!port || !extensionId) {
  throw new Error("Usage: reload-live-extension.mjs --port=PORT --id=EXTENSION_ID");
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readTargets() {
  return fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
    response.json(),
  );
}

async function findManagerTarget() {
  let targets = await readTargets();
  let manager = targets.find(
    (target) => target.type === "page" && target.url === "chrome://extensions/",
  );
  if (manager) return manager;

  try {
    await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(
        "chrome://extensions/",
      )}`,
      { method: "PUT" },
    );
  } catch {
    // The caller will get the explicit error below if the manager cannot open.
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    await delay(200);
    targets = await readTargets();
    manager = targets.find(
      (target) =>
        target.type === "page" && target.url === "chrome://extensions/",
    );
    if (manager) return manager;
  }
  throw new Error("Open chrome://extensions and run the update again.");
}

function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    ready,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

const manager = await findManagerTarget();
const cdp = connect(manager.webSocketDebuggerUrl);
await cdp.ready;

try {
  const reload = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `new Promise((resolve, reject) => {
      chrome.developerPrivate.reload(
        ${JSON.stringify(extensionId)},
        { failQuietly: false },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve({ reloaded: true });
          }
        }
      );
    })`,
  });
  if (reload.exceptionDetails) {
    throw new Error(JSON.stringify(reload.exceptionDetails));
  }

  await delay(1600);
  const info = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const items = await chrome.developerPrivate.getExtensionsInfo({
        includeDisabled: true,
        includeTerminated: true
      });
      return items.find((item) => item.id === ${JSON.stringify(extensionId)});
    })()`,
  });
  const item = info.result.value;
  if (!item || item.state !== "ENABLED" || item.manifestErrors?.length) {
    throw new Error(`Extension verification failed: ${JSON.stringify(item)}`);
  }

  console.log(
    JSON.stringify(
      {
        id: item.id,
        name: item.name,
        version: item.version,
        state: item.state,
        path: item.path,
        manifestErrors: item.manifestErrors,
      },
      null,
      2,
    ),
  );
} finally {
  cdp.close();
}
