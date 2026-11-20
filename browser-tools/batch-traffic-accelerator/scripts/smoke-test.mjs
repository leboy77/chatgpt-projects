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
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 420,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const attempts = {};
      globalThis.__productCalls = [];
      globalThis.__testStoreName = "TestStore";
      globalThis.__forceScanMismatch = false;
      globalThis.__contentRecoveryCount = 0;
      let trafficContentReady = false;
      const stations = [
        { code: "DE", name: "德国", station: "德国站", group: "欧盟", region: "eu", enabled: true, targetPrice: 120, otherPrice: null, submitMode: "", note: "" },
        { code: "FR", name: "法国", station: "法国站", group: "欧盟", region: "eu", enabled: true, targetPrice: 150, otherPrice: null, submitMode: "", note: "" },
        { code: "NL", name: "荷兰", station: "荷兰站", group: "欧盟", region: "eu", enabled: true, targetPrice: 120, otherPrice: 110, submitMode: "", note: "" },
        { code: "US", name: "美国", station: "美国站", group: "美国", region: "us", enabled: true, targetPrice: 130, otherPrice: null, submitMode: "", note: "" },
        { code: "GLOBAL", name: "全球", station: "全球站", group: "其他站点", region: "global", enabled: true, targetPrice: 125, otherPrice: null, submitMode: "", note: "" }
      ];
      const state = {
        schemaVersion: 2,
        config: {
          skuKeyword: "DWRG",
          specName: "Mixed Color2",
          idType: "SPU",
          duration: "30",
          taskIntervalSeconds: 0.2,
          fallbackReferencePrice: false,
          navigationGuard: true,
          dryRun: false
        },
        stations,
        pairs: [{ spu: "21000000016", skc: "220000000016" }],
        cacheMeta: {
          skuKeyword: "DWRG",
          specName: "Mixed Color2",
          source: "page",
          verified: true,
          scannedAt: Date.now()
        },
        logs: []
      };
      const runtimeListeners = [];
      globalThis.chrome = {
        runtime: {
          id: "smoke-extension",
          getManifest: () => ({ version: "0.6.19" }),
          onMessage: {
            addListener(listener) {
              runtimeListeners.push(listener);
            }
          },
          sendMessage: async (message) => {
            if (message?.type === "GET_APP_STATE") return { ok: true, state };
            if (message?.type === "SAVE_APP_STATE") return { ok: true, state: message.state };
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
          query: async (queryInfo = {}) => {
            const urls = queryInfo.url || [];
            if (urls.some((url) => url.includes("/goods/list"))) {
              return [{ id: 2, url: "https://agentseller.temu.com/goods/list", active: false, lastAccessed: 1 }];
            }
            return [{ id: 1, url: "https://agentseller-eu.temu.com/main/flux-analysis", active: true, lastAccessed: 2 }];
          },
          get: async (tabId) => ({ id: tabId, url: tabId === 2 ? "https://agentseller.temu.com/goods/list" : "https://agentseller-eu.temu.com/main/flux-analysis" }),
          update: async (tabId) => ({ id: tabId }),
          create: async ({ url }) => ({ id: url.includes("/goods/list") ? 2 : 1, url, active: true }),
          sendMessage: async (tabId, message) => {
            if (
              tabId === 1 &&
              message?.type === "PING" &&
              !trafficContentReady
            ) {
              throw new Error(
                "Could not establish connection. Receiving end does not exist."
              );
            }
            if (tabId === 2 && message?.type === "SCAN_GOODS") {
              for (const listener of runtimeListeners) {
                listener({
                  type: "SCAN_PROGRESS",
                  operationId: message.operationId,
                  progress: {
                    page: 2,
                    currentPairs: 1,
                    uniquePairs: 1,
                    elapsedMs: 120
                  }
                });
              }
              await new Promise((resolve) => setTimeout(resolve, 500));
              if (globalThis.__forceScanMismatch) {
                return {
                  ok: true,
                  pairs: [{ spu: "21000000016", skc: "220000000016" }],
                  rawCount: 1,
                  total: 2,
                  verified: true
                };
              }
              return {
                ok: true,
                pairs: [{ spu: "21000000016", skc: "220000000016" }],
                rawCount: 1,
                total: 1,
                pageSize: 200,
                verified: true
              };
            }
            if (tabId === 2 && message?.type === "PING") {
              return { ok: true, context: { kind: "goods" } };
            }
            if (message?.type === "GET_STORE_CONTEXT") {
              return {
                ok: true,
                store: {
                  storeName: globalThis.__testStoreName,
                  host: "agentseller-eu.temu.com",
                  region: "eu"
                }
              };
            }
            if (message?.type === "PING") {
              return { ok: true, context: { kind: "traffic" } };
            }
            if (message?.type !== "RUN_PRODUCT_STATIONS") return { ok: true };
            globalThis.__productCalls.push(
              (message.config.stations || []).map((station) => station.code)
            );
            await new Promise((resolve) => setTimeout(resolve, 900));
            const results = [];
            let rateLimited = false;
            for (const station of message.config.stations || []) {
              const key = station.code + ":" + message.config.spu;
              attempts[key] = (attempts[key] || 0) + 1;
              if (station.code === "FR") {
                results.push({ code: "FR", status: "exception", submitted: false, message: "申报价异常 6 个，未提交" });
              } else if (station.code === "NL" && attempts[key] === 1) {
                results.push({ code: "NL", status: "failed", submitted: true, retryable: true, message: "请求频繁，请稍后重试" });
                rateLimited = true;
              } else {
                results.push({
                  code: station.code,
                  status: "success",
                  submitted: message.config.dryRun !== true,
                  message: message.config.dryRun ? "预检通过，未提交" : "平台已返回流量加速成功"
                });
              }
            }
            return { ok: true, results, rateLimited };
          }
        },
        scripting: {
          executeScript: async ({ target }) => {
            if (target?.tabId === 1) {
              trafficContentReady = true;
              globalThis.__contentRecoveryCount += 1;
            }
          }
        }
      };
    })();`,
  });
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
        pairCount: text("#pairCount"),
        actionCount: text("#actionCount"),
        sourceLabel: text("#sourceLabel")
      };
      globalThis.confirm = () => true;
      document.querySelector("#bindStoreButton").click();
      await sleep(120);
      const storeBinding = {
        label: text("#storeBindingLabel"),
        current: text("#currentStoreName")
      };
      globalThis.__testStoreName = "TestStore 0 人关注";
      globalThis.__forceScanMismatch = true;
      document.querySelector("#scanGoodsButton").click();
      await sleep(1500);
      const scanMismatch = {
        toast: text("#toast"),
        pairCount: text("#pairCount"),
        buttonText: text("#scanGoodsButton"),
        disabled: document.querySelector("#scanGoodsButton").disabled
      };
      globalThis.__forceScanMismatch = false;
      document.querySelector("#searchMode").value = "category";
      document.querySelector("#searchMode").dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(60);
      const categoryMode = {
        visible: !document.querySelector("#categoryField").hidden,
        skuLabel: text("#skuFieldLabel")
      };
      document.querySelector("#productSource").value = "tableImport";
      document.querySelector("#productSource").dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(60);
      const tableProductSource = {
        searchHidden: document.querySelector("#searchModeField").hidden,
        idTypeHidden: document.querySelector("#idTypeField").hidden,
        importVisible: !document.querySelector("#productImportPanel").hidden
      };
      document.querySelector("#productSource").value = "goodsList";
      document.querySelector("#productSource").dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector("#searchMode").value = "sku";
      document.querySelector("#searchMode").dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector("#region").value = "us";
      document.querySelector("#region").dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(60);
      const usRegionMetric = text("#stationMetric");
      document.querySelector("#region").value = "eu";
      document.querySelector("#region").dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(60);
      const skuInput = document.querySelector("#skuKeyword");
      skuInput.value = "ZSK";
      skuInput.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(80);
      const staleCache = text("#sourceLabel");
      document.querySelector('[data-station="DE"]').click();
      await sleep(80);
      const stationModal = {
        open: !document.querySelector("#stationModal").hidden,
        title: text("#stationModalTitle"),
        targetPrice: document.querySelector("#modalTargetPrice").value,
        otherPrice: document.querySelector("#modalOtherPrice").value
      };
      document.querySelector("#stationModalCancel").click();
      const accelerationMode = document.querySelector("#accelerationMode");
      accelerationMode.value = "priceTier";
      accelerationMode.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(60);
      document.querySelector('[data-station="DE"]').click();
      await sleep(60);
      const tierModal = {
        strategyVisible: !document.querySelector("#tierStrategyField").hidden,
        strategyValue: document.querySelector("#tierStrategy").value,
        tierFieldVisible: !document.querySelector("#modalTierPriceField").hidden,
        defaultFieldsHidden:
          document.querySelector("#modalTargetPriceField").hidden &&
          document.querySelector("#modalOtherPriceField").hidden
      };
      document.querySelector("#modalTierPrice").value = "120";
      document.querySelector("#stationModalSave").click();
      await sleep(80);
      accelerationMode.value = "reduceThenTier";
      accelerationMode.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(60);
      document.querySelector('[data-station="DE"]').click();
      await sleep(60);
      const hybridModal = {
        targetVisible: !document.querySelector("#modalTargetPriceField").hidden,
        otherVisible: !document.querySelector("#modalOtherPriceField").hidden,
        tierHidden: document.querySelector("#modalTierPriceField").hidden,
        strategyVisible: !document.querySelector("#tierStrategyField").hidden
      };
      document.querySelector("#stationModalCancel").click();
      accelerationMode.value = "custom";
      accelerationMode.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(60);
      document.querySelector("#primaryButton").click();
      await sleep(100);
      const scanning = {
        disabled: document.querySelector("#primaryButton").disabled,
        source: text("#sourceLabel")
      };
      await sleep(700);
      const autoScan = {
        source: text("#sourceLabel"),
        pairCount: text("#pairCount")
      };
      const check = {
        activePanel: document.querySelector(".tab-panel.is-active")?.dataset.panel,
        pairMetric: text("#pairMetric"),
        stationMetric: text("#stationMetric"),
        fallbackMetric: text("#fallbackMetric"),
        riskMetric: text("#riskMetric"),
        priceRows: document.querySelectorAll(".price-row").length
      };
      document.querySelector("#primaryButton").click();
      await sleep(180);
      const queueAdded = {
        activePanel: document.querySelector(".tab-panel.is-active")?.dataset.panel,
        count: text("#queueCount"),
        cards: document.querySelectorAll(".queue-card").length,
        cardMeta: document.querySelector(".queue-card-meta")?.textContent?.trim() || ""
      };
      document.querySelector("#primaryButton").click();
      await sleep(120);
      document.querySelector("#pauseButton").click();
      await sleep(650);
      const paused = {
        status: text("#runStatusEyebrow"),
        button: text("#pauseButton")
      };
      document.querySelector("#pauseButton").click();
      await sleep(1200);
      const run = {
        activePanel: document.querySelector(".tab-panel.is-active")?.dataset.panel,
        status: text("#runStatusEyebrow"),
        percent: text("#runPercent"),
        success: text("#runSuccess"),
        exceptions: text("#runExceptions"),
        failed: text("#runFailed"),
        rows: document.querySelectorAll(".timeline-item").length
      };
      document.querySelector("#retryButton").click();
      await sleep(1200);
      const retried = {
        percent: text("#runPercent"),
        success: text("#runSuccess"),
        exceptions: text("#runExceptions"),
        failed: text("#runFailed"),
        queueDone: text("#queueDoneCount"),
        queueStatus: text("#runStatusEyebrow")
      };
      document.querySelector('[data-tab="config"]').click();
      const skuAgain = document.querySelector("#skuKeyword");
      skuAgain.value = "DWRG";
      skuAgain.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("#primaryButton").click();
      await sleep(700);
      document.querySelector("#primaryButton").click();
      await sleep(180);
      document.querySelector("#primaryButton").click();
      await sleep(120);
      document.querySelector("#pauseButton").click();
      await sleep(1100);
      document.querySelector('[data-tab="queue"]').click();
      const pausedCard = [...document.querySelectorAll(".queue-card")].find(
        (card) => card.querySelector(".queue-card-status")?.textContent?.trim() === "已暂停"
      );
      const pausedDeleteButton = pausedCard?.querySelector(
        '[data-queue-action="delete"]'
      );
      const pausedDelete = {
        buttonVisible: Boolean(pausedDeleteButton),
        cardsBefore: document.querySelectorAll(".queue-card").length
      };
      pausedDeleteButton?.click();
      await sleep(220);
      pausedDelete.cardsAfter = document.querySelectorAll(".queue-card").length;
      pausedDelete.pausedCount = text("#queuePausedCount");
      pausedDelete.queueStatus = text("#runStatusEyebrow");
      const originalCreateObjectUrl = URL.createObjectURL;
      const originalRevokeObjectUrl = URL.revokeObjectURL;
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = (blob) => {
        globalThis.__environmentBlob = blob;
        return "blob:environment-test";
      };
      URL.revokeObjectURL = () => {};
      HTMLAnchorElement.prototype.click = function () {
        globalThis.__environmentDownload = this.download;
      };
      document.querySelector("#exportEnvironmentButton").click();
      await sleep(120);
      const environmentText = await globalThis.__environmentBlob.text();
      const environmentPayload = JSON.parse(environmentText);
      const environmentFile = new File(
        [environmentText],
        "environment.json",
        { type: "application/json" }
      );
      const transfer = new DataTransfer();
      transfer.items.add(environmentFile);
      const environmentInput = document.querySelector("#importEnvironmentFile");
      environmentInput.files = transfer.files;
      environmentInput.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(220);
      const importToast = text("#toast");
      globalThis.__testStoreName = "OtherStore";
      document.querySelector("#exportEnvironmentButton").click();
      await sleep(160);
      const mismatchToast = text("#toast");
      globalThis.__testStoreName = "TestStore";
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
      const environmentMigration = {
        download: globalThis.__environmentDownload,
        format: environmentPayload.format,
        store: environmentPayload.storeBinding?.storeName,
        importToast,
        binding: text("#storeBindingLabel"),
        mismatchToast
      };
      return {
        initial,
        storeBinding,
        scanMismatch,
        categoryMode,
        tableProductSource,
        usRegionMetric,
        staleCache,
        scanning,
        autoScan,
        stationModal,
        tierModal,
        hybridModal,
        check,
        queueAdded,
        paused,
        run,
        retried,
        pausedDelete,
        environmentMigration,
        productCalls: globalThis.__productCalls,
        contentRecoveryCount: globalThis.__contentRecoveryCount
      };
    })()`,
  });

  const exceptions = cdp.events.filter(
    (event) => event.method === "Runtime.exceptionThrown"
  );
  if (exceptions.length) {
    throw new Error(`Browser runtime exceptions: ${JSON.stringify(exceptions)}`);
  }

  const value = result.result.value;
  if (!value?.initial) {
    throw new Error(`Smoke expression returned no value: ${JSON.stringify(result)}`);
  }
  if (
    value.initial.pairCount !== "1" ||
    value.contentRecoveryCount < 1 ||
    !value.initial.sourceLabel.includes("1 组页面 ID 已缓存") ||
    !value.storeBinding.label.includes("TestStore") ||
    value.storeBinding.current !== "TestStore" ||
    !value.scanMismatch.toast.includes("数量校验失败") ||
    value.scanMismatch.pairCount !== "1" ||
    !value.categoryMode.visible ||
    !value.categoryMode.skuLabel.includes("可选") ||
    !value.tableProductSource.searchHidden ||
    !value.tableProductSource.idTypeHidden ||
    !value.tableProductSource.importVisible ||
    value.usRegionMetric !== "1" ||
    !value.staleCache.includes("参数已修改") ||
    !value.scanning.disabled ||
    !value.scanning.source.includes("扫描第 2 页") ||
    value.autoScan.pairCount !== "1" ||
    !value.autoScan.source.includes("已校验 1/1") ||
    !value.stationModal.open ||
    value.stationModal.title !== "设置德国站价格" ||
    value.stationModal.targetPrice !== "120" ||
    value.stationModal.otherPrice !== "" ||
    !value.tierModal.strategyVisible ||
    value.tierModal.strategyValue !== "maxTraffic" ||
    !value.tierModal.tierFieldVisible ||
    !value.tierModal.defaultFieldsHidden ||
    !value.hybridModal.targetVisible ||
    !value.hybridModal.otherVisible ||
    !value.hybridModal.tierHidden ||
    !value.hybridModal.strategyVisible ||
    value.check.activePanel !== "check" ||
    value.check.pairMetric !== "1" ||
    value.check.stationMetric !== "3" ||
    value.check.fallbackMetric !== "6" ||
    value.check.riskMetric !== "6" ||
    value.check.priceRows !== 12 ||
    value.queueAdded.activePanel !== "queue" ||
    value.queueAdded.count !== "1" ||
    value.queueAdded.cards !== 1 ||
    !value.queueAdded.cardMeta.includes("TestStore") ||
    value.paused.status !== "已暂停" ||
    value.paused.button !== "继续" ||
    value.run.activePanel !== "run" ||
    value.run.status !== "已暂停" ||
    value.run.percent !== "100%" ||
    value.run.success !== "1" ||
    value.run.exceptions !== "1" ||
    value.run.failed !== "1" ||
    value.run.rows !== 3 ||
    value.retried.success !== "2" ||
    value.retried.exceptions !== "1" ||
    value.retried.failed !== "0" ||
    value.retried.queueDone !== "1" ||
    !value.pausedDelete.buttonVisible ||
    value.pausedDelete.cardsBefore !== 2 ||
    value.pausedDelete.cardsAfter !== 1 ||
    value.pausedDelete.pausedCount !== "0" ||
    value.environmentMigration.format !== "temu-batch-traffic-environment" ||
    value.environmentMigration.store !== "TestStore" ||
    !value.environmentMigration.download.includes("流量加速环境_TestStore") ||
    !value.environmentMigration.binding.includes("TestStore") ||
    !value.environmentMigration.importToast.includes("环境已导入") ||
    !value.environmentMigration.mismatchToast.includes("店铺不匹配") ||
    JSON.stringify(value.productCalls) !==
      JSON.stringify([["DE", "FR", "NL"], ["NL"], ["DE", "FR", "NL"]])
  ) {
    throw new Error(`Unexpected smoke-test result: ${JSON.stringify(value)}`);
  }

  await delay(3200);
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('[data-tab="check"]').click()`,
  });
  await delay(250);
  const checkScreenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    path.resolve("demo-check.png"),
    Buffer.from(checkScreenshot.data, "base64"),
  );

  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('[data-tab="queue"]').click()`,
  });
  await delay(180);
  const queueScreenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    path.resolve("demo-queue.png"),
    Buffer.from(queueScreenshot.data, "base64"),
  );

  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('[data-station="DE"]').click()`,
  });
  await delay(180);
  const stationScreenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(
    path.resolve("demo-station-settings.png"),
    Buffer.from(stationScreenshot.data, "base64"),
  );
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#stationModalCancel").click()`,
  });

  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector('[data-tab="run"]').click()`,
  });
  await delay(200);
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
