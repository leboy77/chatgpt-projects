import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const browser = await chromium.connectOverCDP(
  process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:51930"
);
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url() === "chrome://extensions/");
  if (!page) throw new Error("未找到扩展程序页");

  const items = await page.evaluate(
    () =>
      new Promise((resolve) => {
        chrome.developerPrivate.getExtensionsInfo(
          { includeDisabled: true },
          (value) => resolve(value || [])
        );
      })
  );
  const target = items.find((item) =>
    String(item.name || "").includes("推广花费监控")
  );
  if (!target) {
    throw new Error("未找到 Temu 商品推广花费监控扩展");
  }

  const reloadResult = await page.evaluate(
    (extensionId) =>
      new Promise((resolve) => {
        const timeout = setTimeout(
          () => resolve({ ok: false, error: "reload timeout" }),
          15_000
        );
        try {
          chrome.developerPrivate.reload(
            extensionId,
            {
              failQuietly: false
            },
            () => {
              clearTimeout(timeout);
              resolve({
                ok: !chrome.runtime.lastError,
                error: chrome.runtime.lastError?.message || ""
              });
            }
          );
        } catch (error) {
          clearTimeout(timeout);
          resolve({ ok: false, error: String(error?.message || error) });
        }
      }),
    target.id
  );
  console.log(
    JSON.stringify(
      {
        extension: {
          id: target.id,
          name: target.name,
          version: target.version,
          location: target.location,
          keys: Object.keys(target),
          path: target.path || target.directoryPath || "",
          runtimeErrors: target.runtimeErrors || [],
          manifestErrors: target.manifestErrors || []
        },
        reloadResult
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
