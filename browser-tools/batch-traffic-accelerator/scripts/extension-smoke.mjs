import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const chrome =
  "C:\\Users\\QZJLKJ\\AppData\\Local\\PODStudio\\temu_listing_pod\\domestic\\playwright-browsers\\chromium-1223\\chrome-win64\\chrome.exe";
const extensionPath = path.resolve(".");
const profile = await mkdtemp(path.join(tmpdir(), "traffic-extension-"));
const port = 9338;
const browser = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-component-extensions-with-background-pages",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForTarget(predicate, timeout = 18000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const target = targets.find(predicate);
      if (target) return target;
    } catch {
      // Chrome has not started the debugging endpoint yet.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the extension service worker");
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
  const serviceWorker = await waitForTarget(
    (target) =>
      target.type === "service_worker" &&
      target.url.startsWith("chrome-extension://"),
  );
  const extensionId = new URL(serviceWorker.url).hostname;
  console.log(
    JSON.stringify(
      {
        extensionPath,
        serviceWorker,
        allTargets: await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
          response.json(),
        ),
      },
      null,
      2,
    ),
  );
  const page = await waitForTarget((target) => target.type === "page");
  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  const navigation = await cdp.send("Page.navigate", {
    url: `chrome-extension://${extensionId}/sidepanel/panel.html`,
  });
  await delay(1200);
  const contextInfo = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      href: location.href,
      title: document.title,
      chromeKeys: Object.keys(globalThis.chrome || {}),
      body: document.body?.innerText?.slice(0, 200) || ""
    })`,
  });
  console.log(JSON.stringify({ navigation, contextInfo }, null, 2));

  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
      const initial = text("#previewCount");
      document.querySelector("#primaryButton").click();
      await sleep(100);
      document.querySelector("#primaryButton").click();
      await sleep(7200);
      return {
        extensionId: ${JSON.stringify(extensionId)},
        initial,
        activePanel: document.querySelector(".tab-panel.is-active")?.dataset.panel,
        status: text("#runStatusEyebrow"),
        processed: text("#processedCount"),
        succeeded: text("#successCount"),
        failed: text("#failedCount"),
        percent: text("#runPercent")
      };
    })()`,
  });

  const exceptions = cdp.events.filter(
    (event) => event.method === "Runtime.exceptionThrown",
  );
  console.log(JSON.stringify({ result, exceptions }, null, 2));
  if (exceptions.length) {
    throw new Error(`Extension runtime exceptions: ${JSON.stringify(exceptions)}`);
  }

  const value = result.result.value;
  if (
    value.initial !== "14" ||
    value.activePanel !== "result" ||
    value.status !== "执行完成" ||
    value.processed !== "14" ||
    value.percent !== "100%"
  ) {
    throw new Error(`Unexpected extension smoke-test result: ${JSON.stringify(value)}`);
  }
  console.log(JSON.stringify(value, null, 2));
  cdp.close();
} finally {
  browser.kill();
  await delay(400);
  await rm(profile, { recursive: true, force: true });
}
