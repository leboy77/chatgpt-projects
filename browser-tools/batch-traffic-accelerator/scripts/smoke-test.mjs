import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const profile = await mkdtemp(path.join(tmpdir(), "traffic-demo-"));
const port = 9337;
const browser = spawn(
  edge,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--disable-background-networking",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Browser hasn't opened the debugging endpoint yet.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const events = [];
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    events.push(message);
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    events,
    ready,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

try {
  const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("No page target found");

  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", {
    url: "http://127.0.0.1:8899/sidepanel/panel.html",
  });
  await delay(1200);

  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
      const initial = {
        previewCount: text("#previewCount"),
        actionCount: text("#actionCount")
      };
      document.querySelector("#primaryButton").click();
      await sleep(100);
      const preview = {
        activePanel: document.querySelector(".tab-panel.is-active")?.dataset.panel,
        hitCount: text("#hitCount"),
        excludedCount: text("#excludedCount")
      };
      document.querySelector("#primaryButton").click();
      await sleep(6800);
      const run = {
        activePanel: document.querySelector(".tab-panel.is-active")?.dataset.panel,
        status: text("#runStatusEyebrow"),
        processed: text("#processedCount"),
        succeeded: text("#successCount"),
        failed: text("#failedCount"),
        percent: text("#runPercent"),
        rows: document.querySelectorAll(".result-row").length
      };
      return { initial, preview, run };
    })()`,
  });

  const exceptions = cdp.events.filter(
    (event) => event.method === "Runtime.exceptionThrown"
  );
  if (exceptions.length) {
    throw new Error(`Browser runtime exceptions: ${JSON.stringify(exceptions)}`);
  }

  const value = result.result.value;
  if (
    value.initial.previewCount !== "14" ||
    value.preview.activePanel !== "preview" ||
    value.run.activePanel !== "result" ||
    value.run.status !== "执行完成" ||
    value.run.percent !== "100%" ||
    value.run.rows !== 14
  ) {
    throw new Error(`Unexpected smoke-test result: ${JSON.stringify(value)}`);
  }

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 420,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    path.resolve("demo-result.png"),
    Buffer.from(screenshot.data, "base64"),
  );
  cdp.close();
  console.log(JSON.stringify(value, null, 2));
} finally {
  browser.kill();
  await delay(400);
  await rm(profile, { recursive: true, force: true });
}
