const fs = require("fs");

const [, , wsUrl, scriptPath, extensionPath] = process.argv;
if (!wsUrl || !scriptPath || !extensionPath) {
  console.error(
    "Usage: node tools/cdp-load-extension.cjs <ws-url> <rect-script> <extension-path>",
  );
  process.exit(1);
}

const rectExpression = fs.readFileSync(scriptPath, "utf8");
const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();
const events = [];

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

ws.addEventListener("message", async (event) => {
  const message = JSON.parse(event.data);
  if (message.method) {
    events.push(message);
    if (message.method === "Page.fileChooserOpened") {
      console.log("FILE_CHOOSER", JSON.stringify(message.params));
      try {
        await send("DOM.setFileInputFiles", {
          files: [extensionPath],
          backendNodeId: message.params.backendNodeId,
        });
        console.log("SET_FILES_OK");
      } catch (error) {
        console.error("SET_FILES_ERROR", error.message);
      }
    }
    return;
  }
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
});

ws.addEventListener("open", async () => {
  try {
    await send("Page.enable");
    await send("DOM.enable");
    await send("Page.bringToFront");
    await send("Page.setInterceptFileChooserDialog", { enabled: true });
    const result = await send("Runtime.evaluate", {
      expression: rectExpression,
      returnByValue: true,
      userGesture: true,
    });
    const point = result.result.value;
    if (!point) throw new Error("Load button not found");
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x,
      y: point.y,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      button: "left",
      clickCount: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log(
      JSON.stringify(
        {
          clicked: point,
          chooserEvents: events.filter(
            (item) => item.method === "Page.fileChooserOpened",
          ).length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    ws.close();
  }
});
