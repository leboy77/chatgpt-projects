import { writeFile } from "node:fs/promises";
import path from "node:path";

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
const output = path.resolve(
  options.output || "environment-config.json",
);
if (!port) {
  throw new Error(
    "Usage: export-live-environment.mjs --port=PORT [--output=FILE]",
  );
}

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
  (response) => response.json(),
);
const target = targets.find(
  (item) =>
    item.type === "page" &&
    item.url.startsWith("chrome-extension://") &&
    item.url.includes("/sidepanel/panel.html"),
);
if (!target?.webSocketDebuggerUrl) {
  throw new Error("Open the extension side panel before exporting.");
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
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
          expression: `(async () => {
            const stored = await chrome.storage.local.get("traffic_spec_app_state");
            const state = stored.traffic_spec_app_state;
            const manifest = chrome.runtime.getManifest();
            if (!state) throw new Error("No saved app state");
            return {
              format: "temu-traffic-accelerator-environment",
              formatVersion: 1,
              pluginVersion: manifest.version,
              exportedAt: new Date().toISOString(),
              state: {
                config: state.config,
                stations: state.stations,
                pairs: state.pairs,
                cacheMeta: state.cacheMeta,
                taskQueue: state.taskQueue,
                queueState: state.queueState,
                importDiagnostics: state.importDiagnostics,
                logs: state.logs
              }
            };
          })()`,
        },
      }),
    );
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  await writeFile(
    output,
    `${JSON.stringify(result.result?.value, null, 2)}\n`,
    "utf8",
  );
  console.log(output);
} finally {
  socket.close();
}
