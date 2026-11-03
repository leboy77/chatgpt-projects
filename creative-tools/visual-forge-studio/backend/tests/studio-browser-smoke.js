const fs = require("node:fs");

const cdpPort = process.env.CDP_PORT || "9224";
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8765/";
const outputPath = process.env.SMOKE_OUTPUT || "data/studio-dashboard.png";

async function getPageTarget() {
  const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
  if (!response.ok) throw new Error(`Unable to list CDP targets: ${response.status}`);
  const targets = await response.json();
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("No local studio page target found");
  return page;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
}

function createClient(socket) {
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });
  return function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result?.value;
}

async function main() {
  const target = await getPageTarget();
  const socket = await connect(target.webSocketDebuggerUrl);
  const send = createClient(socket);
  const consoleErrors = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails || {};
      consoleErrors.push(
        details.exception?.description ||
          [details.text, details.url, details.lineNumber, details.columnNumber]
            .filter((value) => value !== undefined)
            .join(" "),
      );
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      const entry = message.params.entry;
      if (!String(entry.url || "").endsWith("/favicon.ico")) {
        consoleErrors.push(`${entry.text}${entry.url ? ` (${entry.url})` : ""}`);
      }
    }
  });

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: baseUrl });
  await delay(1200);
  await evaluate(
    send,
    `localStorage.setItem(
      "muse-visual-forge-auth",
      JSON.stringify({ phone: "demo", name: "Browser Smoke", mode: "demo" })
    )`,
  );
  await send("Page.reload", { ignoreCache: true });
  await delay(2200);
  consoleErrors.length = 0;

  const initial = await evaluate(
    send,
    `({
      title: document.title,
      appVisible: !document.querySelector("#appShell").hidden,
      activePage: document.querySelector(".view.is-active")?.dataset.page,
      featureCount: document.querySelectorAll(".feature-card").length,
      queueText: document.querySelector("#sideQueueTitle")?.textContent
    })`,
  );
  if (!initial.appVisible || initial.activePage !== "home") {
    throw new Error(`Dashboard did not open correctly: ${JSON.stringify(initial)}`);
  }

  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  fs.mkdirSync(require("node:path").dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));

  await evaluate(send, `document.querySelector('[data-category="t_shirt"]').click()`);
  await delay(400);
  await evaluate(
    send,
    `document.querySelector("#createPrompt").value =
      "一件奶油白色重磅纯棉T恤，正面极简植物印花，棚拍，面料纹理清晰，保持服装版型"`,
  );
  await evaluate(send, `document.querySelector("#generateButton").click()`);
  await delay(5000);

  const result = await evaluate(
    send,
    `({
      activePage: document.querySelector(".view.is-active")?.dataset.page,
      resultCards: document.querySelectorAll("#createResults .job-result-card").length,
      resultImages: document.querySelectorAll("#createResults img").length,
      toast: document.querySelector("#toast")?.textContent,
      errorText: document.querySelector("#createResults")?.textContent.includes("失败")
    })`,
  );

  const resultScreenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  fs.writeFileSync(
    outputPath.replace(/\.png$/i, "-result.png"),
    Buffer.from(resultScreenshot.data, "base64"),
  );

  console.log(JSON.stringify({ initial, result, consoleErrors }, null, 2));
  socket.close();
  if (consoleErrors.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
