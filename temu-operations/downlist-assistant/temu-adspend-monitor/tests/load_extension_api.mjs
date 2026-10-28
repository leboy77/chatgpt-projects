import path from "node:path";
import { pathToFileURL } from "node:url";
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

  const directoryUrl = `${pathToFileURL(path.resolve("extension")).href}/`;
  const result = await page.evaluate(async (url) => {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      setTimeout(
        () =>
          finish({
            ok: false,
            error: "loadDirectory callback timeout"
          }),
        20_000
      );
      try {
        chrome.developerPrivate.loadDirectory(
          {
            directoryUrl: url,
            failQuietly: false,
            populateError: true,
            retryGuid: crypto.randomUUID()
          },
          (value) => {
            const error = chrome.runtime.lastError?.message || "";
            finish({ ok: !error, value: value || null, error });
          }
        );
      } catch (error) {
        finish({ ok: false, error: String(error?.message || error) });
      }
    });
  }, directoryUrl);

  await page.waitForTimeout(1500);
  const extensions = await page.evaluate(
    () =>
      new Promise((resolve) => {
        chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true }, (items) =>
          resolve(
            (items || []).map((item) => ({
              id: item.id,
              name: item.name,
              version: item.version,
              location: item.location,
              state: item.state,
              errors: item.runtimeErrors || []
            }))
          )
        );
      })
  );
  console.log(
    JSON.stringify(
      {
        directoryUrl,
        result,
        installed: extensions.filter((item) =>
          /花费监控/.test(item.name)
        ),
        extensionCount: extensions.length
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
