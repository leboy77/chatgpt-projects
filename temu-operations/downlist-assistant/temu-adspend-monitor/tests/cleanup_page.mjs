import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const browser = await chromium.connectOverCDP(
  process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:50262"
);
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes("ads.temu.com/ad-list.html"));
  if (!page) throw new Error("未找到商品推广页面");
  const cleaned = await page.evaluate(() => {
    globalThis.__temuAdSpendStopFloatingPanel?.();
    document.querySelector("#temu-adspend-floating-host")?.remove();
    if (globalThis.__nativePostMessage) {
      window.postMessage = globalThis.__nativePostMessage;
    }
    const names = [
      "__temuAdSpendMonitorLoaded",
      "__temuAdSpendStopFloatingPanel",
      "__contentIntegrationStorage",
      "__contentIntegrationListener",
      "__restoreIntegrationStorage",
      "__restoreIntegrationListener",
      "__restoreIntegrationStatus",
      "__nativePostMessage",
      "TemuAdSpendCore"
    ];
    for (const name of names) {
      try {
        delete globalThis[name];
      } catch (_) {
        // Ignore properties that cannot be deleted.
      }
    }
    if (globalThis.chrome) {
      for (const name of ["runtime", "storage"]) {
        try {
          delete globalThis.chrome[name];
        } catch (_) {
          // Ignore properties that cannot be deleted.
        }
      }
    }
    return {
      monitorLoaded: Boolean(globalThis.__temuAdSpendMonitorLoaded),
      coreLoaded: Boolean(globalThis.TemuAdSpendCore),
      hasChromeStorage: Boolean(globalThis.chrome?.storage),
      hasChromeRuntime: Boolean(globalThis.chrome?.runtime),
      url: location.href
    };
  });
  console.log(JSON.stringify(cleaned, null, 2));
} finally {
  await browser.close();
}
