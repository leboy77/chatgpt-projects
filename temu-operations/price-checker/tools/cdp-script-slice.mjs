#!/usr/bin/env node

const [webSocketUrl, scriptId, offsetArg, lengthArg = "1600"] =
  process.argv.slice(2);
const offset = Number(offsetArg);
const length = Number(lengthArg);

if (!webSocketUrl || !scriptId || !Number.isFinite(offset)) {
  console.error(
    "Usage: node tools/cdp-script-slice.mjs <webSocketDebuggerUrl> <scriptId> <offset> [length]",
  );
  process.exit(2);
}

const socket = new WebSocket(webSocketUrl);
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) {
    return;
  }
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) {
    reject(new Error(JSON.stringify(message.error)));
  } else {
    resolve(message.result);
  }
});

socket.addEventListener("open", async () => {
  try {
    await send("Debugger.enable");
    const source = await send("Debugger.getScriptSource", { scriptId });
    const start = Math.max(0, offset - 400);
    console.log(source.scriptSource.slice(start, start + length));
    socket.close();
  } catch (error) {
    console.error(error.message);
    socket.close();
    process.exitCode = 1;
  }
});

socket.addEventListener("error", () => {
  console.error("WebSocket connection failed");
  process.exitCode = 1;
});
