import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const browser = await chromium.connectOverCDP(
  process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:51930"
);
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes("ads.temu.com/ad-list.html"));
  if (!page) throw new Error("未找到商品推广页面");
  await page.waitForTimeout(1200);

  const panel = await page.evaluate(() => {
    const host = document.querySelector("#temu-adspend-floating-host");
    const shadow = host?.shadowRoot;
    const element = shadow?.querySelector(".floating-panel");
    const rect = element?.getBoundingClientRect();
    const iframe = shadow?.querySelector("iframe");
    return {
      mounted: Boolean(host && element),
      width: rect ? Math.round(rect.width) : 0,
      height: rect ? Math.round(rect.height) : 0,
      left: rect ? Math.round(rect.left) : 0,
      top: rect ? Math.round(rect.top) : 0,
      iframeUrl: iframe?.src || "",
      minimized: element?.classList.contains("hidden") || false
    };
  });
  const frame = page
    .frames()
    .find(
      (candidate) =>
        candidate.url().startsWith("chrome-extension://") &&
        candidate.url().endsWith("/sidepanel.html")
    );
  const frameState = frame
    ? await frame.evaluate(() => ({
        scrollY: window.scrollY,
        firstText: (document.querySelector(".app-header h1")?.textContent || "").trim(),
        connectionText: (
          document.querySelector("#connectionBadge")?.textContent || ""
        ).trim()
      }))
    : null;

  await page.screenshot({
    path: "test-artifacts/live-floating-panel.png",
    fullPage: false
  });
  console.log(JSON.stringify({ panel, frameState }, null, 2));
} finally {
  await browser.close();
}
