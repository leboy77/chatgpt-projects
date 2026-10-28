#!/usr/bin/env node

const [webSocketUrl, xArg, yArg] = process.argv.slice(2);
const x = Number(xArg);
const y = Number(yArg);

if (!webSocketUrl || !Number.isFinite(x) || !Number.isFinite(y)) {
  console.error("Usage: node tools/cdp-click.mjs <webSocketDebuggerUrl> <x> <y>");
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
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
    });
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    console.log(JSON.stringify({ clicked: true, x, y }));
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
