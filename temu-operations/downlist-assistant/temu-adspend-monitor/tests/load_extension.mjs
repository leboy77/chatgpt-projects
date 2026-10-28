import path from "node:path";
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

  const extensionPath = path.resolve("extension");
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 5000 });
  await page.getByRole("button", { name: "加载未打包的扩展程序" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(extensionPath);
  await page.waitForTimeout(2500);
  await page.reload();
  await page.waitForTimeout(2000);

  const bodyText = await page.locator("body").innerText();
  console.log(
    JSON.stringify(
      {
        loaded: bodyText.includes("Temu 商品推广花费监控"),
        matches: bodyText
          .split("\n")
          .filter((line) => /花费监控|错误|重复/.test(line))
          .slice(0, 30)
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
