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

  await page.screenshot({
    path: "test-artifacts/modal-current.png",
    fullPage: true
  });

  const details = await page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    return [...document.querySelectorAll('[data-testid*="modal"],button,[role="button"]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && style.display !== "none";
      })
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        testid: element.getAttribute("data-testid") || "",
        text: normalize(element.innerText).slice(0, 400),
        ariaLabel: element.getAttribute("aria-label") || "",
        html: element.outerHTML.slice(0, 900)
      }))
      .slice(-80);
  });
  console.log(JSON.stringify(details, null, 2));

  const cancel = page
    .locator('[role="button"]')
    .filter({ hasText: /^取消$/ })
    .last();
  if (await cancel.count()) {
    await cancel.click();
    await page.waitForTimeout(500);
    console.log("CLOSED_MODAL");
  }
} finally {
  await browser.close();
}
