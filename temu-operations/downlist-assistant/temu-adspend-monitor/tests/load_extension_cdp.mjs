import path from "node:path";
import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const browser = await chromium.connectOverCDP(
  process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:50262"
);
try {
  const session = await browser.newBrowserCDPSession();
  let result;
  try {
    result = await session.send("Extensions.loadUnpacked", {
      path: path.resolve("extension")
    });
  } catch (error) {
    result = { error: String(error?.message || error) };
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
