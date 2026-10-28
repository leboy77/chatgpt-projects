importScripts("core.js");

const core = globalThis.TemuAdSpendCore;
const DEFAULT_SETTINGS = {
  intervalSec: 60,
  defaultSpendLimitCny: 0,
  defaultCostPerOrderLimitCny: 0,
  mode: "observe",
  pauseAuthorized: false
};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const existing = await chrome.storage.local.get([
    "settings",
    "rules",
    "pauseRecords"
  ]);
  await chrome.storage.local.set({
    settings: { ...DEFAULT_SETTINGS, ...(existing.settings || {}) },
    rules: existing.rules || {},
    pauseRecords: Array.isArray(existing.pauseRecords)
      ? existing.pauseRecords
      : [],
    runtime: {
      running: false,
      lastCheckAt: null,
      lastError: null,
      spus: []
    }
  });
  await refreshAllTabAvailability();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
  refreshAllTabAvailability();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "registerAdPage" && sender.tab?.id) {
    registerAdPage(sender.tab)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) =>
        sendResponse({ ok: false, error: String(error?.message || error) })
      );
    return true;
  }

  if (message?.type === "injectPageBridge" && sender.tab?.id) {
    if (!core.isAdListUrl(sender.tab.url)) {
      sendResponse({
        ok: false,
        error: "页面已离开商品推广页，拒绝注入数据桥接"
      });
      return false;
    }
    chrome.scripting
      .executeScript({
        target: { tabId: sender.tab.id },
        world: "MAIN",
        files: ["page-bridge.js"]
      })
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, error: String(error?.message || error) })
      );
    return true;
  }

  if (message?.type === "openSidePanel" && sender.tab?.id) {
    chrome.sidePanel
      .open({ tabId: sender.tab.id })
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ ok: false, error: String(error?.message || error) })
      );
    return true;
  }
  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    updateTabAvailability(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateTabAvailability(tabId, tab.url);
  } catch (_) {
    // The tab may have closed during the update.
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const stored = await chrome.storage.local.get("lockedAdTab");
  if (stored.lockedAdTab?.tabId === tabId) {
    await chrome.storage.local.remove("lockedAdTab");
  }
});

async function registerAdPage(tab) {
  if (!core.isAdListUrl(tab.url)) {
    throw new Error("当前页面不是 Temu 商品推广页");
  }
  const stored = await chrome.storage.local.get("lockedAdTab");
  const existing = stored.lockedAdTab;
  if (
    !existing ||
    existing.tabId === tab.id ||
    !core.isAdListUrl(existing.url)
  ) {
    const lockedAdTab = {
      tabId: tab.id,
      url: tab.url,
      title: tab.title || "",
      lockedAt: new Date().toISOString()
    };
    await chrome.storage.local.set({ lockedAdTab });
    return lockedAdTab;
  }
  return existing;
}

async function refreshAllTabAvailability() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) => updateTabAvailability(tab.id, tab.url))
  );
}

async function updateTabAvailability(tabId, url) {
  if (!tabId) return;
  const enabled = core.isAdListUrl(url);
  const tasks = [
    chrome.sidePanel
      .setOptions({
        tabId,
        enabled,
        path: "sidepanel.html"
      })
      .catch(() => {})
  ];
  tasks.push(
    enabled
      ? chrome.action.enable(tabId).catch(() => {})
      : chrome.action.disable(tabId).catch(() => {})
  );
  await Promise.all(tasks);
  if (!enabled) {
    const stored = await chrome.storage.local.get("lockedAdTab");
    if (stored.lockedAdTab?.tabId === tabId) {
      await chrome.storage.local.remove("lockedAdTab");
    }
  }
}
