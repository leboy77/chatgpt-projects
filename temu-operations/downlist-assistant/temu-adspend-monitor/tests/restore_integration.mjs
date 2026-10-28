import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const browser = await chromium.connectOverCDP(
  process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:50262"
);
let page;
try {
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes("ads.temu.com/ad-list.html"));
  if (!page) throw new Error("未找到商品推广页面");

  await page.evaluate(() => {
    const storage = new Map();
    storage.set("settings", {
      intervalSec: 60,
      defaultSpendLimitCny: 50,
      defaultCostPerOrderLimitCny: 0,
      mode: "observe",
      pauseAuthorized: false
    });
    storage.set("rules", {});
    storage.set("pauseRecords", [
      {
        recordId: "test-record",
        spuId: "spu-test",
        title: "Restore integration product",
        goodsIds: ["goods-test"],
        adIds: ["ad-test"],
        pausedAt: new Date().toISOString(),
        dateKey: "2026-10-22",
        spendCny: 50,
        orderCount: 1,
        costPerOrderCny: 50,
        reasons: ["spend"],
        pauseResult: "PAUSED_VERIFIED",
        restoreStatus: "available",
        restoreRequestedAt: null,
        restoredAt: null,
        lastError: null
      }
    ]);
    storage.set("audits", []);
    globalThis.__restoreIntegrationStorage = storage;
    globalThis.__restoreIntegrationStatus = 7;
    globalThis.__nativePostMessage = window.postMessage.bind(window);

    window.chrome = window.chrome || {};
    chrome.runtime = {
      onMessage: {
        addListener(listener) {
          globalThis.__restoreIntegrationListener = listener;
        }
      },
      sendMessage: async (message) =>
        message?.type === "injectPageBridge"
          ? { ok: true }
          : { ok: false, error: "unexpected runtime message" },
      getURL: (resource) => `about:blank#${resource}`
    };
    chrome.storage = {
      local: {
        async get(keys) {
          if (typeof keys === "string") {
            return { [keys]: storage.get(keys) };
          }
          if (Array.isArray(keys)) {
            return Object.fromEntries(
              keys.map((key) => [key, storage.get(key)])
            );
          }
          return Object.fromEntries(storage);
        },
        async set(values) {
          for (const [key, value] of Object.entries(values)) {
            storage.set(key, value);
          }
        }
      },
      onChanged: { addListener() {} }
    };

    window.postMessage = (data) => {
      if (data?.source !== "temu-adspend-content") return;
      if (data.type === "modifyAds") {
        globalThis.__restoreIntegrationStatus = 8;
      }
      const ad = {
        ad_id: "ad-test",
        goods_id: "goods-test",
        spu_id: "spu-test",
        goods_title: "Restore integration product",
        ad_show_status: globalThis.__restoreIntegrationStatus,
        summary: {
          spend: { total: { val: 5000, trans_val: "¥50.00" } },
          order_pay_cnt: { total: { val: 1, trans_val: "1" } },
          transaction_cost: { total: { val: 5000, trans_val: "¥50.00" } }
        }
      };
      const body =
        data.type === "modifyAds"
          ? {
              success: true,
              error_code: 1000000,
              result: { createGoodsFailMap: {} }
            }
          : {
              success: true,
              error_code: 1000000,
              result: { ads_detail: [ad] },
              total: 1,
              has_more: false
            };
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          origin: location.origin,
          data: {
            source: "temu-adspend-page-bridge",
            type: "result",
            requestId: data.requestId,
            ok: true,
            data: { status: 200, body }
          }
        })
      );
    };
  });

  await page.addScriptTag({ path: path.resolve("extension/core.js") });
  await page.addScriptTag({ path: path.resolve("extension/content.js") });
  await page.waitForTimeout(200);

  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const timeout = setTimeout(
          () => resolve({ ok: false, error: "restore timeout" }),
          15_000
        );
        globalThis.__restoreIntegrationListener(
          {
            type: "restoreSpu",
            spuId: "spu-test",
            recordId: "test-record"
          },
          {},
          (response) => {
            clearTimeout(timeout);
            resolve(response);
          }
        );
      })
  );
  const stored = await page.evaluate(() => ({
    record: globalThis.__restoreIntegrationStorage.get("pauseRecords")[0],
    audits: globalThis.__restoreIntegrationStorage.get("audits")
  }));
  const output = {
    response: result,
    restoreStatus: stored.record.restoreStatus,
    restoredAt: stored.record.restoredAt,
    mockStatusAfterRestore: await page.evaluate(
      () => globalThis.__restoreIntegrationStatus
    ),
    auditResults: stored.audits.map((item) => item.result)
  };
  await fs.writeFile(
    "test-artifacts/restore-integration.json",
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(output, null, 2));
} finally {
  if (page) await page.evaluate(() => {
    if (globalThis.__nativePostMessage) {
      window.postMessage = globalThis.__nativePostMessage;
    }
    for (const name of [
      "__temuAdSpendMonitorLoaded",
      "__restoreIntegrationStorage",
      "__restoreIntegrationListener",
      "__restoreIntegrationStatus",
      "__nativePostMessage",
      "TemuAdSpendCore"
    ]) {
      try {
        delete globalThis[name];
      } catch (_) {
        // Ignore properties that cannot be deleted.
      }
    }
    if (globalThis.chrome) {
      try {
        delete globalThis.chrome.runtime;
        delete globalThis.chrome.storage;
      } catch (_) {
        // Ignore properties that cannot be deleted.
      }
    }
  }).catch(() => {});
  await browser.close();
}
