const [, , wsUrl, method, paramsJson = "{}"] = process.argv;
if (!wsUrl || !method) {
  console.error(
    "Usage: node tools/cdp-call.cjs <ws-url> <method> [json-params]",
  );
  process.exit(1);
}

const ws = new WebSocket(wsUrl);
const id = 1;
ws.addEventListener("open", () => {
  ws.send(
    JSON.stringify({
      id,
      method,
      params: JSON.parse(paramsJson),
    }),
  );
});
ws.addEventListener("message", (event) => {
  console.log(JSON.stringify(JSON.parse(event.data), null, 2));
  ws.close();
});
ws.addEventListener("error", (event) => {
  console.error(event.message || event.type);
  process.exitCode = 1;
});
