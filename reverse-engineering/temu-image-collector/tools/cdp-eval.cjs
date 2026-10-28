const fs = require("fs");

const [, , wsUrl, scriptPath, outputPath] = process.argv;
if (!wsUrl || !scriptPath) {
  console.error(
    "Usage: node tools/cdp-eval.cjs <ws-url> <expression-file> [json-output]",
  );
  process.exit(1);
}

const expression = fs.readFileSync(scriptPath, "utf8");
const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) {
    reject(new Error(JSON.stringify(message.error)));
  } else {
    resolve(message.result);
  }
});

ws.addEventListener("open", async () => {
  try {
    await send("Runtime.enable");
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text,
      );
    }
    const value = result.result.value;
    const rendered = JSON.stringify(value, null, 2);
    if (outputPath) {
      fs.writeFileSync(outputPath, `${rendered}\n`, "utf8");
    }
    console.log(rendered);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    ws.close();
  }
});

ws.addEventListener("error", (event) => {
  console.error("WebSocket error:", event.message || event.type);
  process.exitCode = 1;
});
