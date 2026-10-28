import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const browser = await chromium.connectOverCDP(
  process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:50262"
);
let page;
try {
  const context = browser.contexts()[0];
  page = await context.newPage();
  await page.addInitScript(() => {
    const sampleSummary = {
      spuId: "7840050509",
      title:
        "Men's Half Zip Crew Neck Sweatshirt, Relaxed Fit Long Sleeve Pullover Top",
      ads: [{ adId: "ad-1", goodsId: "goods-1", status: 7 }],
      spendCny: 52.4,
      spendMinor: 5240,
      orderCount: 2,
      costPerOrderCny: 26.2,
      status: 7,
      rule: {
        spendLimitCny: 50,
        costPerOrderLimitCny: 20,
        hit: true,
        reasons: ["spend", "costPerOrder"]
      }
    };
    const state = {
      settings: {
        intervalSec: 60,
        defaultSpendLimitCny: 50,
        defaultCostPerOrderLimitCny: 20,
        mode: "observe",
        pauseAuthorized: false
      },
      rules: {},
      runtime: {
        running: true,
        totalAds: 19,
        lastFetchMs: 724,
        lastCheckAt: new Date().toISOString(),
        spus: [sampleSummary],
        lastError: null
      },
      pauseRecords: [
        {
          recordId: "2026-10-22:7840050509:spend:5000,cpa:2000",
          spuId: "7840050509",
          title: "Men's Half Zip Crew Neck Sweatshirt",
          goodsIds: ["607657423433664"],
          pausedAt: new Date(Date.now() - 120000).toISOString(),
          spendCny: 52.4,
          orderCount: 2,
          costPerOrderCny: 26.2,
          reasons: ["spend", "costPerOrder"],
          pauseResult: "PAUSED_VERIFIED",
          restoreStatus: "available",
          lastError: null
        }
      ],
      audits: [
        {
          at: new Date().toISOString(),
          spuId: "7840050509",
          spendCny: 52.4,
          orderCount: 2,
          costPerOrderCny: 26.2,
          reasons: ["spend", "costPerOrder"],
          result: "TRIGGERED_OBSERVE_ONLY"
        }
      ]
    };
    globalThis.chrome = {
      storage: {
        local: {
          get: async (keys) => {
            if (typeof keys === "string") return { [keys]: state[keys] };
            if (Array.isArray(keys)) {
              return Object.fromEntries(keys.map((key) => [key, state[key]]));
            }
            return state;
          },
          set: async (values) => {
            Object.assign(state, values);
          },
          remove: async (key) => {
            delete state[key];
          }
        },
        onChanged: { addListener: () => {} }
      },
      tabs: {
        query: async () => [
          {
            id: 1,
            url: "https://ads.temu.com/ad-list.html",
            title: "Temu | 商品推广"
          }
        ],
        get: async () => ({
          id: 1,
          url: "https://ads.temu.com/ad-list.html",
          title: "Temu | 商品推广"
        }),
        sendMessage: async () => ({ ok: true })
      }
    };
  });

  await page.goto(
    pathToFileURL(path.resolve("extension/sidepanel.html")).href,
    { waitUntil: "load" }
  );
  await page.waitForTimeout(500);
  await page.setViewportSize({ width: 430, height: 900 });
  await page.screenshot({
    path: "test-artifacts/sidepanel-preview-collapsed.png",
    fullPage: true
  });
  await page.locator("#toggleSpuSection").click();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: "test-artifacts/sidepanel-preview.png",
    fullPage: true
  });
  console.log(
    JSON.stringify(
      {
        title: await page.title(),
        spuExpanded: await page
          .locator("#toggleSpuSection")
          .getAttribute("aria-expanded"),
        spuBodyVisible: await page.locator("#spuSectionBody").isVisible(),
        width: await page.evaluate(() => document.documentElement.scrollWidth),
        height: await page.evaluate(() => document.documentElement.scrollHeight)
      },
      null,
      2
    )
  );
} finally {
  if (page) await page.close();
  await browser.close();
}
