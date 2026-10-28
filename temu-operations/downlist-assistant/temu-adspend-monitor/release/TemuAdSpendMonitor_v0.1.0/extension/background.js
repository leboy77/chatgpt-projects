const DEFAULT_SETTINGS = {
  intervalSec: 60,
  defaultSpendLimitCny: 0,
  defaultCostPerOrderLimitCny: 0,
  mode: "observe",
  pauseAuthorized: false
};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const existing = await chrome.storage.local.get(["settings", "rules"]);
  await chrome.storage.local.set({
    settings: { ...DEFAULT_SETTINGS, ...(existing.settings || {}) },
    rules: existing.rules || {},
    runtime: {
      running: false,
      lastCheckAt: null,
      lastError: null,
      spus: []
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "injectPageBridge" && sender.tab?.id) {
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
