#!/usr/bin/env node

import fs from "node:fs/promises";

const [webSocketUrl, outputPath, widthArg = "900", heightArg = "1000"] =
  process.argv.slice(2);

if (!webSocketUrl || !outputPath) {
  console.error(
    "Usage: node tools/cdp-screenshot.mjs <webSocketDebuggerUrl> <outputPath> [width] [height]",
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
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: Number(widthArg),
      height: Number(heightArg),
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Runtime.evaluate", {
      expression: "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      awaitPromise: true,
    });
    const screenshot = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
    });
    await fs.writeFile(outputPath, Buffer.from(screenshot.data, "base64"));
    console.log(outputPath);
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
