#!/usr/bin/env node

const [webSocketUrl, selector, filePath] = process.argv.slice(2);
if (!webSocketUrl || !selector || !filePath) {
  console.error(
    "Usage: node tools/cdp-set-file.mjs <webSocketDebuggerUrl> <selector> <filePath>",
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
    await send("DOM.enable");
    const document = await send("DOM.getDocument", { depth: -1 });
    const node = await send("DOM.querySelector", {
      nodeId: document.root.nodeId,
      selector,
    });
    if (!node.nodeId) {
      throw new Error(`Selector not found: ${selector}`);
    }
    await send("DOM.setFileInputFiles", {
      files: [filePath],
      nodeId: node.nodeId,
    });
    console.log(JSON.stringify({ selected: true, selector, filePath }));
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
