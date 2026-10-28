import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const endpoint = process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:50262";
const browser = await chromium.connectOverCDP(endpoint);
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes("ads.temu.com/ad-list.html"));
  if (!page) throw new Error("未找到商品推广页面");

  await page.screenshot({
    path: "test-artifacts/ad-list-current.png",
    fullPage: true
  });

  const controls = await page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 1 &&
        rect.height > 1 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    };
    return [...document.querySelectorAll(
      "button,[role=button],a,[title],[aria-label],[class*=refresh],[class*=Refresh]"
    )]
      .filter(visible)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: normalize(element.innerText).slice(0, 180),
        title: element.getAttribute("title") || "",
        ariaLabel: element.getAttribute("aria-label") || "",
        className: String(element.className || "").slice(0, 180),
        html: element.outerHTML.slice(0, 700)
      }))
      .filter(
        (item, index, items) =>
          items.findIndex(
            (candidate) =>
              candidate.tag === item.tag &&
              candidate.text === item.text &&
              candidate.title === item.title &&
              candidate.ariaLabel === item.ariaLabel
          ) === index
      )
      .slice(0, 300);
  });

  console.log(JSON.stringify(controls, null, 2));
} finally {
  await browser.close();
}
