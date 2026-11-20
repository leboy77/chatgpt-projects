import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const profile = await mkdtemp(path.join(tmpdir(), "traffic-performance-"));
const port = 9340;
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
    "about:blank"
  ],
  { stdio: "ignore", windowsHide: true }
);

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForPage(timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
        (response) => response.json()
      );
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {
      // Browser is still starting.
    }
    await delay(200);
  }
  throw new Error("Timed out waiting for browser");
}

function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result);
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
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
    }
  };
}

try {
  const page = await waitForPage();
  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const stationCodes = ["DE","FR","IT","NL","ES","PT","PL","SE","BG","CZ","HU","DK","BE","AT","FI","EE","LV","MT","LU"];
      const stations = stationCodes.map((code) => ({
        code,
        name: code,
        station: code + "站",
        group: "欧盟",
        region: "eu",
        enabled: true,
        targetPrice: null,
        otherPrice: 120,
        tierPrice: null,
        submitMode: "指定规格批量加速",
        note: ""
      }));
      const pairs = Array.from({ length: 200 }, (_, index) => ({
        idType: "SPU",
        spu: String(40000000000 + index),
        skc: ""
      }));
      const taskId = "task_performance";
      const state = {
        schemaVersion: 17,
        config: {
          productSource: "tableImport",
          skuKeyword: "DWRG",
          specName: "",
          searchMode: "sku",
          categoryPath: "",
          idType: "SPU",
          region: "eu",
          duration: "14",
          taskIntervalSeconds: 15,
          accelerationMode: "custom",
          tierStrategy: "maxTraffic",
          fallbackReferencePrice: false,
          navigationGuard: true,
          dryRun: false
        },
        stations,
        pairs,
        cacheMeta: {
          source: "import",
          region: "eu",
          skuKeyword: "DWRG",
          specName: "",
          verified: true,
          scannedAt: Date.now()
        },
        storeBinding: {
          storeName: "PerformanceStore",
          host: "agentseller-eu.temu.com",
          region: "eu",
          boundAt: Date.now()
        },
        taskQueue: [{
          id: taskId,
          name: "性能测试任务",
          status: "paused",
          config: {
            productSource: "tableImport",
            skuKeyword: "DWRG",
            specName: "",
            searchMode: "sku",
            categoryPath: "",
            idType: "SPU",
            region: "eu",
            duration: "14",
            accelerationMode: "custom",
            tierStrategy: "maxTraffic",
            fallbackReferencePrice: false,
            navigationGuard: true,
            dryRun: false,
            taskIntervalSeconds: 15
          },
          stations,
          pairs,
          enabledStationCodes: stationCodes,
          storeContext: { storeName: "PerformanceStore" },
          preparationLogs: [],
          run: {
            status: "paused",
            paused: true,
            items: [],
            groups: [],
            logs: []
          }
        }],
        queueState: {
          status: "paused",
          currentTaskId: taskId,
          currentIndex: 0,
          logs: []
        },
        operationLock: null,
        importDiagnostics: null,
        logs: []
      };
      const runtimeListeners = [];
      globalThis.__savedState = null;
      globalThis.chrome = {
        runtime: {
          id: "performance-test",
          getManifest: () => ({ version: "0.6.19" }),
          onMessage: {
            addListener(listener) {
              runtimeListeners.push(listener);
            }
          },
          sendMessage: async (message) => {
            if (message?.type === "GET_APP_STATE") return { ok: true, state };
            if (message?.type === "SAVE_APP_STATE") {
              globalThis.__savedState = message.state;
              return { ok: true, state: message.state };
            }
            if (message?.type === "ACQUIRE_EXECUTION_LEASE") {
              return { ok: true, acquired: true };
            }
            if (message?.type === "RENEW_EXECUTION_LEASE") {
              return { ok: true, renewed: true };
            }
            if (message?.type === "RELEASE_EXECUTION_LEASE") {
              return { ok: true, released: true };
            }
            if (message?.type === "FORCE_PAUSE_QUEUE") {
              return { ok: true, paused: true };
            }
            return { ok: true };
          }
        },
        storage: {
          local: {
            get: async () => ({})
          }
        },
        tabs: {
          query: async () => [{
            id: 1,
            active: true,
            url: "https://agentseller-eu.temu.com/main/flux-analysis",
            lastAccessed: 1
          }],
          get: async () => ({
            id: 1,
            url: "https://agentseller-eu.temu.com/main/flux-analysis"
          }),
          update: async () => ({ id: 1 }),
          create: async () => ({ id: 1 }),
          sendMessage: async (_tabId, message) => {
            if (message?.type === "GET_STORE_CONTEXT") {
              return {
                ok: true,
                store: {
                  storeName: "PerformanceStore",
                  host: "agentseller-eu.temu.com",
                  region: "eu"
                }
              };
            }
            if (message?.type === "PING") {
              return { ok: true, context: { kind: "traffic" } };
            }
            return { ok: true };
          }
        }
      };
    })();`
  });
  await cdp.send("Page.navigate", {
    url: "http://127.0.0.1:8899/sidepanel/panel.html"
  });
  await delay(1400);

  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      document.querySelector('[data-tab="run"]').click();
      await sleep(120);
      const timelineItems = document.querySelectorAll(".timeline-item").length;
      const domNodes = document.getElementsByTagName("*").length;
      const input = document.querySelector("#skuKeyword");
      input.value = "DWRG-PERF";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(700);
      return {
        timelineItems,
        domNodes,
        runStatus: document.querySelector("#runStatusEyebrow")?.textContent.trim(),
        runTotal: document.querySelector("#runTotal")?.textContent.trim(),
        savedItems: globalThis.__savedState?.taskQueue?.[0]?.run?.items?.length,
        savedStateMB: globalThis.__savedState
          ? (JSON.stringify(globalThis.__savedState).length / 1024 / 1024).toFixed(2)
          : null
      };
    })()`
  });
  const value = result.result.value;
  console.log(JSON.stringify(value, null, 2));
  if (
    value.timelineItems !== 80 ||
    value.runTotal !== "3800" ||
    value.domNodes > 20000 ||
    value.savedItems !== 0 ||
    Number(value.savedStateMB) > 1
  ) {
    throw new Error(`Performance UI check failed: ${JSON.stringify(value)}`);
  }
  cdp.close();
} finally {
  browser.kill();
  await delay(400);
  await rm(profile, { recursive: true, force: true });
}
