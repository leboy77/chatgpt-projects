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
if (!port) throw new Error("Usage: query-extension-info.mjs --port=PORT");
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
  (response) => response.json(),
);
const manager = targets.find(
  (target) => target.type === "page" && target.url === "chrome://extensions/",
);
if (!manager) throw new Error("chrome://extensions target not found");

const socket = new WebSocket(manager.webSocketDebuggerUrl);
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
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
try {
  const id = nextId++;
  const result = await new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(
      JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: {
          awaitPromise: true,
          returnByValue: true,
          expression: `chrome.developerPrivate.getExtensionsInfo({
            includeDisabled: true,
            includeTerminated: true
          }).then((items) => items.filter((item) =>
            item.name.includes("流量加速")
          ).map((item) => ({
            id: item.id,
            name: item.name,
            version: item.version,
            state: item.state,
            path: item.path,
            manifestErrors: item.manifestErrors
          })))`
        }
      }),
    );
  });
  console.log(JSON.stringify(result.result.value, null, 2));
} finally {
  socket.close();
}
