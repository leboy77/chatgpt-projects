importScripts("shared.js");

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "openBitBrowserProfile") {
    openBitBrowserProfile(message.browserId)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "injectMainWorldBridge" && _sender.tab?.id) {
    chrome.scripting
      .executeScript({
        target: { tabId: _sender.tab.id },
        world: "MAIN",
        files: ["page-bridge.js"]
      })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function openBitBrowserProfile(browserId) {
  if (!browserId) {
    throw new Error("未填写 BitBrowser ID");
  }
  const response = await fetch("http://127.0.0.1:54345/browser/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: browserId })
  });

  if (!response.ok) {
    throw new Error(`比特浏览器 API 返回 HTTP ${response.status}`);
  }

  const result = await response.json();
  if (!result?.success) {
    throw new Error(result?.msg || result?.message || "比特浏览器窗口打开失败");
  }

  return result.data || {};
}
