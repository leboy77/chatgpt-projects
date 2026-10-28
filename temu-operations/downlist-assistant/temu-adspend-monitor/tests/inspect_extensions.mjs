import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const browser = await chromium.connectOverCDP(
  process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:50262"
);
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url() === "chrome://extensions/");
  if (!page) throw new Error("未找到扩展程序页面");

  await page.keyboard.press("Escape").catch(() => {});
  const api = await page.evaluate(() => ({
    hasChrome: typeof chrome !== "undefined",
    hasDeveloperPrivate: Boolean(globalThis.chrome?.developerPrivate),
    developerPrivateMethods: Object.keys(
      globalThis.chrome?.developerPrivate || {}
    ).slice(0, 100),
    loadMethods: Object.keys(globalThis.chrome?.developerPrivate || {}).filter(
      (key) => /load|pack|path|extension/i.test(key)
    )
  })).catch((error) => ({ error: String(error) }));
  console.log(JSON.stringify(api, null, 2));
} finally {
  await browser.close();
}
