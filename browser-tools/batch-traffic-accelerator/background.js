const RUN_KEY = "traffic_acceleration_demo_run";
const DEFAULT_STATE = {
  id: null,
  status: "idle",
  startedAt: null,
  finishedAt: null,
  stopRequested: false,
  config: null,
  summary: {
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0
  },
  items: [],
  logs: []
};

let activeRun = null;

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ [RUN_KEY]: DEFAULT_STATE });
  await chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_PANEL") {
    openPanelForTab(sender?.tab)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_RUN_STATE") {
    getState()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "START_DEMO_RUN") {
    startDemoRun(message.payload)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "STOP_DEMO_RUN") {
    stopDemoRun()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "RESET_DEMO_RUN") {
    resetDemoRun()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function openPanelForTab(tab) {
  if (!tab?.id) {
    throw new Error("没有可用的目标标签页");
  }
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "sidepanel/panel.html",
    enabled: true
  });
  await chrome.sidePanel.open({ tabId: tab.id });
}

async function getState() {
  const stored = await chrome.storage.local.get(RUN_KEY);
  return stored[RUN_KEY] || DEFAULT_STATE;
}

async function saveState(state) {
  await chrome.storage.local.set({ [RUN_KEY]: state });
  broadcast({ type: "RUN_STATE", state });
}

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function startDemoRun(payload) {
  const previous = await getState();
  if (previous.status === "running" || previous.status === "stopping") {
    throw new Error("已有演示任务正在运行");
  }
  if (!Array.isArray(payload?.items) || payload.items.length === 0) {
    throw new Error("没有可以执行的商品");
  }

  const state = {
    id: `demo-${Date.now()}`,
    status: "running",
    startedAt: Date.now(),
    finishedAt: null,
    stopRequested: false,
    config: clone(payload.config || {}),
    summary: {
      total: payload.items.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0
    },
    items: payload.items.map((item, index) => ({
      ...clone(item),
      runStatus: "queued",
      resultMessage: "等待执行",
      processedAt: null,
      order: index + 1
    })),
    logs: [
      {
        at: Date.now(),
        level: "info",
        message: `演示任务已创建，共 ${payload.items.length} 个商品`
      }
    ]
  };

  activeRun = state;
  await saveState(state);
  runDemo(state).catch(async (error) => {
    state.status = "error";
    state.finishedAt = Date.now();
    state.logs.push({
      at: Date.now(),
      level: "error",
      message: `演示任务异常：${error.message}`
    });
    await saveState(state);
  });
  return clone(state);
}

async function stopDemoRun() {
  const state = activeRun || (await getState());
  if (state.status !== "running" && state.status !== "stopping") {
    return state;
  }
  state.stopRequested = true;
  state.status = "stopping";
  if (activeRun) {
    activeRun.stopRequested = true;
    activeRun.status = "stopping";
  }
  await saveState(state);
  return clone(state);
}

async function resetDemoRun() {
  activeRun = null;
  const state = clone(DEFAULT_STATE);
  await saveState(state);
  return state;
}

async function runDemo(state) {
  const interval = Math.max(120, Number(state.config.intervalMs) || 360);

  for (const item of state.items) {
    if (state.stopRequested) {
      item.runStatus = "skipped";
      item.resultMessage = "任务已停止";
      state.summary.skipped += 1;
      state.summary.processed += 1;
      continue;
    }

    item.runStatus = "submitting";
    item.resultMessage = "正在提交价格增长";
    await saveState(state);
    await sleep(interval);

    if (state.stopRequested) {
      item.runStatus = "skipped";
      item.resultMessage = "任务已停止";
      state.summary.skipped += 1;
      state.summary.processed += 1;
      continue;
    }

    const shouldFail =
      item.projectedMargin < 0 ||
      (Number(item.stock || 0) > 0 && Number(item.rank || 0) % 9 === 0);

    if (shouldFail) {
      item.runStatus = "failed";
      item.resultMessage = "演示失败：价格不在可申报区间";
      state.summary.failed += 1;
    } else {
      item.runStatus = "succeeded";
      item.resultMessage = `已按 ¥${Number(item.projectedPrice).toFixed(2)} 提交`;
      state.summary.succeeded += 1;
    }

    item.processedAt = Date.now();
    state.summary.processed += 1;
    state.logs.push({
      at: Date.now(),
      level: shouldFail ? "error" : "success",
      message: `${item.sku} ${shouldFail ? "失败" : "成功"}`
    });
    await saveState(state);
  }

  state.status = state.stopRequested ? "stopped" : "completed";
  state.finishedAt = Date.now();
  state.logs.push({
    at: Date.now(),
    level: state.stopRequested ? "warn" : "success",
    message: state.stopRequested
      ? `任务已停止，成功 ${state.summary.succeeded}，失败 ${state.summary.failed}，跳过 ${state.summary.skipped}`
      : `演示任务完成，成功 ${state.summary.succeeded}，失败 ${state.summary.failed}`
  });
  await saveState(state);
  activeRun = null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
