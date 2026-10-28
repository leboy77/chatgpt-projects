#!/usr/bin/env node

const [webSocketUrl, expression] = process.argv.slice(2);
if (!webSocketUrl || !expression) {
  console.error(
    "Usage: node tools/cdp-listeners.mjs <webSocketDebuggerUrl> <elementExpression>",
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
    await send("Runtime.enable");
    const object = await send("Runtime.evaluate", {
      expression,
      objectGroup: "listener-inspection",
    });
    if (!object.result?.objectId) {
      throw new Error(object.exceptionDetails?.text || "Element not found");
    }
    const listeners = await send("DOMDebugger.getEventListeners", {
      objectId: object.result.objectId,
      depth: -1,
      pierce: true,
    });
    console.log(
      JSON.stringify(
        listeners.listeners.map((listener) => ({
          type: listener.type,
          useCapture: listener.useCapture,
          passive: listener.passive,
          once: listener.once,
          scriptId: listener.scriptId,
          lineNumber: listener.lineNumber,
          columnNumber: listener.columnNumber,
          handler: listener.handler?.description?.slice(0, 500) || null,
        })),
        null,
        2,
      ),
    );
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
