import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const browser = await chromium.connectOverCDP(
  process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:50262"
);
try {
  const pages = browser.contexts().flatMap((context) => context.pages());
  const panel = pages.find((page) =>
    page.url().startsWith("chrome-extension://") &&
    page.url().endsWith("/sidepanel.html")
  );
  if (!panel) throw new Error("未找到花费监控侧边栏");
  const state = await panel.evaluate(async () => {
    const stored = await chrome.storage.local.get(null);
    return {
      panelUrl: location.href,
      sidePanelMethods: Object.keys(chrome.sidePanel || {}),
      sidePanelCloseArity: chrome.sidePanel?.close?.length,
      sidePanelCloseSource: String(chrome.sidePanel?.close || "").slice(0, 200),
      actionMethods: Object.keys(chrome.action || {}),
      settings: stored.settings,
      lockedAdTab: stored.lockedAdTab,
      runtime: stored.runtime,
      pauseRecords: (stored.pauseRecords || []).slice(0, 5)
    };
  });
  console.log(JSON.stringify(state, null, 2));
} finally {
  await browser.close();
}
