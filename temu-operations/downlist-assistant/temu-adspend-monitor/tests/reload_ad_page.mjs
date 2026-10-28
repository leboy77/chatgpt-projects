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
  await page.bringToFront();
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(1000);
  console.log(JSON.stringify({ url: page.url(), title: await page.title() }, null, 2));
} finally {
  await browser.close();
}
