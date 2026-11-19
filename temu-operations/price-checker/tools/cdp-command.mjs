#!/usr/bin/env node

const [webSocketUrl, method, paramsJson = "{}"] = process.argv.slice(2);
if (!webSocketUrl || !method) {
  console.error(
    "Usage: node tools/cdp-command.mjs <webSocketDebuggerUrl> <method> [paramsJson]",
  );
  process.exit(2);
}

const socket = new WebSocket(webSocketUrl);

socket.addEventListener("open", () => {
  socket.send(
    JSON.stringify({
      id: 1,
      method,
      params: JSON.parse(paramsJson),
    }),
  );
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== 1) {
    return;
  }
  if (message.error) {
    console.error(JSON.stringify(message.error, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(message.result, null, 2));
  }
  socket.close();
});

socket.addEventListener("error", () => {
  console.error("WebSocket connection failed");
  process.exitCode = 1;
});
