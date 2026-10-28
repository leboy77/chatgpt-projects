"use strict";

function isTemuUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "temu.com" || url.hostname.endsWith(".temu.com"))
    );
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "TEC_CLEAR_TEMU_CACHE") return false;

  const sourceUrl = sender.tab?.url || sender.url || "";
  if (!isTemuUrl(sourceUrl)) {
    sendResponse({ ok: false, error: "只允许从 Temu 页面清理缓存" });
    return false;
  }

  const origin = new URL(sourceUrl).origin;
  chrome.browsingData.remove(
    { origins: [origin] },
    {
      cache: true,
      cacheStorage: true,
      serviceWorkers: true,
    },
    () => {
      const error = chrome.runtime.lastError;
      if (error) {
        sendResponse({ ok: false, error: error.message });
      } else {
        sendResponse({ ok: true, origin });
      }
    },
  );
  return true;
});
