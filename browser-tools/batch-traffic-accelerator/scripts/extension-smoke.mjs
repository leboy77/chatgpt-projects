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
  const serviceWorkerCdp = connect(serviceWorker.webSocketDebuggerUrl);
  await serviceWorkerCdp.ready;
  await delay(500);
  await serviceWorkerCdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `chrome.storage.local.set({
      traffic_spec_app_state: {
        schemaVersion: 5,
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
        stations: [
          { code: "DE", name: "德国", station: "德国站", group: "欧盟", region: "eu", enabled: true, targetPrice: 120, otherPrice: null, submitMode: "", note: "" },
          { code: "FR", name: "法国", station: "法国站", group: "欧盟", region: "eu", enabled: true, targetPrice: 150, otherPrice: null, submitMode: "", note: "" },
          { code: "NL", name: "荷兰", station: "荷兰站", group: "欧盟", region: "eu", enabled: true, targetPrice: 120, otherPrice: 110, submitMode: "", note: "" }
        ],
        pairs: [{ spu: "21000000016", skc: "220000000016" }],
        logs: []
      }
    })`,
  });
  serviceWorkerCdp.close();
  await delay(250);
  const page = await waitForTarget((target) => target.type === "page");
  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const attempts = {};
      chrome.tabs.query = async () => [{ id: 1, url: "https://agentseller-eu.temu.com/main/flux-analysis" }];
      chrome.tabs.get = async () => ({ id: 1, url: "https://agentseller-eu.temu.com/main/flux-analysis" });
      chrome.tabs.update = async () => ({ id: 1 });
      chrome.tabs.sendMessage = async (_tabId, message) => {
        if (message?.type === "GET_STORE_CONTEXT") {
          return {
            ok: true,
            store: {
              storeName: "TestStore",
              host: "agentseller-eu.temu.com",
              region: "eu"
            }
          };
        }
        if (message?.type === "PING") {
          return { ok: true, context: { kind: "traffic" } };
        }
        if (message?.type !== "RUN_PRODUCT_STATIONS") return { ok: true };
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
      };
    })();`,
  });
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

  const leaseResult = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const acquireA = await chrome.runtime.sendMessage({
        type: "ACQUIRE_EXECUTION_LEASE",
        ownerId: "lease-test-a",
        ttlMs: 60000
      });
      const acquireBWhileA = await chrome.runtime.sendMessage({
        type: "ACQUIRE_EXECUTION_LEASE",
        ownerId: "lease-test-b",
        ttlMs: 60000
      });
      await chrome.runtime.sendMessage({
        type: "RELEASE_EXECUTION_LEASE",
        ownerId: "lease-test-a"
      });
      const acquireBAfterRelease = await chrome.runtime.sendMessage({
        type: "ACQUIRE_EXECUTION_LEASE",
        ownerId: "lease-test-b",
        ttlMs: 60000
      });
      await chrome.runtime.sendMessage({
        type: "RELEASE_EXECUTION_LEASE",
        ownerId: "lease-test-b"
      });
      return {
        acquireA,
        acquireBWhileA,
        acquireBAfterRelease
      };
    })()`
  });
  const leaseCheck = leaseResult.result.value;
  console.log(JSON.stringify({ leaseCheck }, null, 2));
  if (
    !leaseCheck.acquireA.acquired ||
    leaseCheck.acquireBWhileA.acquired ||
    !leaseCheck.acquireBAfterRelease.acquired
  ) {
    throw new Error(`Execution lease check failed: ${JSON.stringify(leaseCheck)}`);
  }

  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
      globalThis.confirm = () => true;
      document.querySelector("#bindStoreButton").click();
      await sleep(120);
      const storeBinding = text("#storeBindingLabel");
      const initial = text("#pairCount");
      const initialSource = text("#sourceLabel");
      const downloadLink = document.querySelector("#downloadTemplateButton");
      const downloadResponse = await fetch(downloadLink.href);
      const downloadBytes = (await downloadResponse.arrayBuffer()).byteLength;
      const templateDownload = {
        href: downloadLink.href,
        download: downloadLink.download,
        status: downloadResponse.status,
        bytes: downloadBytes
      };
      document.querySelector('[data-station="DE"]').click();
      await sleep(80);
      const stationModal = {
        open: !document.querySelector("#stationModal").hidden,
        title: text("#stationModalTitle"),
        targetPrice: document.querySelector("#modalTargetPrice").value,
        otherPrice: document.querySelector("#modalOtherPrice").value
      };
      document.querySelector("#stationModalCancel").click();
      document.querySelector("#primaryButton").click();
      await sleep(120);
      const check = {
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
        cards: document.querySelectorAll(".queue-card").length
      };
      document.querySelector("#primaryButton").click();
      await sleep(120);
      document.querySelector("#pauseButton").click();
      await sleep(650);
      const paused = text("#runStatusEyebrow");
      document.querySelector("#pauseButton").click();
      await sleep(1200);
      const run = {
        activePanel: document.querySelector(".tab-panel.is-active")?.dataset.panel,
        status: text("#runStatusEyebrow"),
        success: text("#runSuccess"),
        exceptions: text("#runExceptions"),
        failed: text("#runFailed"),
        percent: text("#runPercent"),
        timelineRows: document.querySelectorAll(".timeline-item").length
      };
      document.querySelector("#retryButton").click();
      await sleep(1200);
      return {
        extensionId: ${JSON.stringify(extensionId)},
        manifestVersion: chrome.runtime.getManifest().version,
        storeBinding,
        environmentButtons: {
          export: !!document.querySelector("#exportEnvironmentButton"),
          import: !!document.querySelector("#importEnvironmentButton")
        },
        templateDownload,
        initial,
        initialSource,
        stationModal,
        check,
        queueAdded,
        paused,
        run,
        retried: {
          success: text("#runSuccess"),
          exceptions: text("#runExceptions"),
          failed: text("#runFailed"),
          queueDone: text("#queueDoneCount")
        }
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
    value.manifestVersion !== "0.6.19" ||
    !value.storeBinding.includes("TestStore") ||
    !value.environmentButtons.export ||
    !value.environmentButtons.import ||
    value.templateDownload.status !== 200 ||
    value.templateDownload.bytes < 10000 ||
    !value.templateDownload.href.endsWith(
      "/assets/templates/standard-traffic-template.xlsx",
    ) ||
    value.templateDownload.download !== "指定规格流量加速_标准导入模板.xlsx" ||
    value.initial !== "1" ||
    !value.initialSource.includes("1 组页面 ID 已缓存") ||
    !value.stationModal.open ||
    value.stationModal.title !== "设置德国站价格" ||
    value.stationModal.targetPrice !== "120" ||
    value.stationModal.otherPrice !== "" ||
    value.check.stationMetric !== "3" ||
    value.check.fallbackMetric !== "6" ||
    value.check.riskMetric !== "6" ||
    value.check.priceRows !== 12 ||
    value.queueAdded.activePanel !== "queue" ||
    value.queueAdded.count !== "1" ||
    value.queueAdded.cards !== 1 ||
    value.paused !== "已暂停" ||
    value.run.activePanel !== "run" ||
    value.run.status !== "已暂停" ||
    value.run.success !== "1" ||
    value.run.exceptions !== "1" ||
    value.run.failed !== "1" ||
    value.run.percent !== "100%" ||
    value.run.timelineRows !== 3 ||
    value.retried.success !== "2" ||
    value.retried.exceptions !== "1" ||
    value.retried.failed !== "0" ||
    value.retried.queueDone !== "1"
  ) {
    throw new Error(`Unexpected extension smoke-test result: ${JSON.stringify(value)}`);
  }
  console.log(JSON.stringify(value, null, 2));

  await cdp.send("Page.reload");
  await delay(1400);
  const persistedResult = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      queueCount: document.querySelector("#queueCount")?.textContent?.trim(),
      queueDone: document.querySelector("#queueDoneCount")?.textContent?.trim(),
      queueCards: document.querySelectorAll(".queue-card").length,
      runStatus: document.querySelector("#runStatusEyebrow")?.textContent?.trim()
    })`,
  });
  const persisted = persistedResult.result.value;
  console.log(JSON.stringify({ persisted }, null, 2));
  if (
    persisted.queueCount !== "1" ||
    persisted.queueDone !== "1" ||
    persisted.queueCards !== 1
  ) {
    throw new Error(`Queue persistence failed: ${JSON.stringify(persisted)}`);
  }

  const managementResult = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      document.querySelector("#clearDoneTasksButton").click();
      await sleep(120);
      document.querySelector('[data-tab="config"]').click();
      await sleep(80);
      document.querySelector("#primaryButton").click();
      await sleep(120);
      document.querySelector("#primaryButton").click();
      await sleep(160);

      document.querySelector('[data-tab="config"]').click();
      await sleep(80);
      const sku = document.querySelector("#skuKeyword");
      sku.value = "ZSK-QUEUE-B";
      sku.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(80);
      document.querySelector("#primaryButton").click();
      await sleep(350);
      document.querySelector("#primaryButton").click();
      await sleep(180);

      const cardsBefore = [...document.querySelectorAll(".queue-card")];
      const titlesBefore = cardsBefore.map((card) =>
        card.querySelector(".queue-card-title strong")?.textContent?.trim()
      );
      cardsBefore[1].dispatchEvent(new Event("dragstart", { bubbles: true }));
      cardsBefore[0].dispatchEvent(new Event("drop", { bubbles: true }));
      await sleep(180);
      const cardsAfter = [...document.querySelectorAll(".queue-card")];
      const titlesAfter = cardsAfter.map((card) =>
        card.querySelector(".queue-card-title strong")?.textContent?.trim()
      );
      cardsAfter[0]
        .querySelector('[data-queue-action="edit"]')
        .click();
      await sleep(120);
      return {
        queueCount: document.querySelector("#queueCount")?.textContent?.trim(),
        titlesBefore,
        titlesAfter,
        editedSku: document.querySelector("#skuKeyword")?.value,
        activePanel: document.querySelector(".tab-panel.is-active")?.dataset.panel
      };
    })()`,
  });
  const management = managementResult.result.value;
  console.log(JSON.stringify({ management }, null, 2));
  if (
    management.queueCount !== "2" ||
    management.titlesBefore.length !== 2 ||
    management.titlesAfter[0] !== management.titlesBefore[1] ||
    management.editedSku !== "ZSK-QUEUE-B" ||
    management.activePanel !== "config"
  ) {
    throw new Error(`Queue management failed: ${JSON.stringify(management)}`);
  }
  cdp.close();
} finally {
  browser.kill();
  await delay(400);
  await rm(profile, { recursive: true, force: true });
}
