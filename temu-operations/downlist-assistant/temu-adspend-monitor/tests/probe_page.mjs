import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const CDP_ENDPOINT = process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:50262";
const TARGET_URL_PART = "ads.temu.com/ad-list.html";

const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
try {
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => candidate.url().includes(TARGET_URL_PART));
  if (!page) {
    throw new Error(`未找到目标页面：${TARGET_URL_PART}`);
  }

  const result = await page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 1 &&
        rect.height > 1
      );
    };

    const text = normalize(document.body?.innerText || "");
    const spendingLines = text
      .split(/(?=花费|消耗|支出|今日)/)
      .filter((line) => /花费|消耗|支出|今日/.test(line))
      .slice(0, 30)
      .map((line) => normalize(line).slice(0, 300));

    const tables = [...document.querySelectorAll("table")].map((table) => ({
      rows: table.rows.length,
      headers: [...table.querySelectorAll("thead th")].map((cell) =>
        normalize(cell.innerText)
      ),
      firstRows: [...table.querySelectorAll("tbody tr")]
        .slice(0, 3)
        .map((row) => normalize(row.innerText).slice(0, 1500))
    }));

    const resources = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => /ads\.temu\.com|kwcdn\.com/.test(url))
      .filter((url) => !/\.(?:js|css|png|jpe?g|webp|svg|woff2?|ttf)(?:\?|$)/i.test(url))
      .slice(-100);

    const storageKeys = {
      localStorage: Object.keys(localStorage),
      sessionStorage: Object.keys(sessionStorage)
    };

    return {
      url: location.href,
      title: document.title,
      bodyTextLength: text.length,
      spendingLines,
      tables,
      resources,
      storageKeys,
      selectors: {
        rows: document.querySelectorAll("tr").length,
        buttons: [...document.querySelectorAll("button")]
          .filter(visible)
          .map((element) => normalize(element.innerText))
          .filter(Boolean)
          .slice(0, 80),
        inputs: [...document.querySelectorAll("input")]
          .filter(visible)
          .map((element) => ({
            type: element.type,
            placeholder: element.placeholder,
            value: element.value
          }))
          .slice(0, 50)
      }
    };
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
