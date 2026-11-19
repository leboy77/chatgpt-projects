"use strict";

const fs = require("node:fs");
const path = require("node:path");

const dashboardUrl = process.argv[2] || "http://127.0.0.1:8766";
const outputPath =
  process.argv[3] ||
  path.resolve(__dirname, "..", "artifacts", "dashboard-ui.png");
const targetJson =
  process.argv[4] || process.env.__VF_DASHBOARD_TARGET__;

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("CDP connection failed"));
  });
  return {
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      socket.close();
    },
  };
}

async function main() {
  const response = await fetch(dashboardUrl.replace(/\/$/, "") + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  if (!response.ok) throw new Error("Admin login failed");
  const { token } = await response.json();

  const pageResponse = await fetch(dashboardUrl + "/", { method: "GET" });
  if (!pageResponse.ok) throw new Error("Dashboard page is not running");

  const webSocketDebuggerUrl = targetJson;
  if (!webSocketDebuggerUrl?.startsWith("ws")) {
    throw new Error("Provide a CDP webSocketDebuggerUrl as the fourth argument");
  }
  const client = await connect(webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send("Page.navigate", { url: dashboardUrl + "/" });
  await new Promise((resolve) => setTimeout(resolve, 600));
  await client.send("Runtime.evaluate", {
    expression: `localStorage.setItem('vfDashboardToken', ${JSON.stringify(token)}); location.reload();`,
  });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const state = await client.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      appVisible: !document.querySelector('#appView').hidden,
      metrics: [...document.querySelectorAll('.metrics strong')].map((node) => node.textContent),
      tasks: document.querySelectorAll('.task-card').length,
      membersVisible: !document.querySelector('#memberSection').hidden
    })`,
    returnByValue: true,
  });
  const result = JSON.parse(state.result.value);
  if (!result.appVisible || result.tasks < 1) {
    throw new Error(`Dashboard did not render: ${JSON.stringify(result)}`);
  }
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));
  console.log(JSON.stringify({ outputPath, ...result }, null, 2));
  client.close();
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
