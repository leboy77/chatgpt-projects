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
      defaultSpendLimitCny: 0,
      defaultCostPerOrderLimitCny: 0,
      mode: "observe",
      pauseAuthorized: false
    });
    storage.set("rules", {});
    globalThis.__contentIntegrationStorage = storage;
    window.chrome = window.chrome || {};
    chrome.runtime = {
      onMessage: {
        addListener(listener) {
          globalThis.__contentIntegrationListener = listener;
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
  });

  await page.addScriptTag({
    path: path.resolve("extension/page-bridge.js")
  });
  await page.addScriptTag({ path: path.resolve("extension/core.js") });
  await page.addScriptTag({ path: path.resolve("extension/content.js") });
  await page.waitForTimeout(200);

  const result = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const timeout = setTimeout(
        () => resolve({ ok: false, error: "content integration timeout" }),
        25_000
      );
      const returned = globalThis.__contentIntegrationListener(
        { type: "refreshNow" },
        {},
        (response) => {
          clearTimeout(timeout);
          resolve(response);
        }
      );
      if (!returned) {
        clearTimeout(timeout);
        resolve({ ok: false, error: "listener did not accept async response" });
      }
    });
  });

  const runtime = await page.evaluate(() =>
    globalThis.__contentIntegrationStorage.get("runtime")
  );
  const floatingPanel = await page.evaluate(() => {
    const host = document.querySelector("#temu-adspend-floating-host");
    const panel = host?.shadowRoot?.querySelector(".floating-panel");
    const rect = panel?.getBoundingClientRect();
    return {
      mounted: Boolean(host && panel),
      width: rect ? Math.round(rect.width) : 0,
      height: rect ? Math.round(rect.height) : 0,
      draggableHeader: Boolean(
        host?.shadowRoot?.querySelector(".floating-header")
      ),
      minimizable: Boolean(host?.shadowRoot?.querySelector(".minimize"))
    };
  });
  const output = {
    response: result,
    floatingPanel,
    runtime: {
      running: runtime?.running,
      totalAds: runtime?.totalAds,
      spus: runtime?.spus?.length,
      lastFetchMs: runtime?.lastFetchMs,
      lastError: runtime?.lastError,
      dataBackend: runtime?.dataBackend
    }
  };
  await fs.writeFile(
    "test-artifacts/content-integration.json",
    JSON.stringify(output, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(output, null, 2));
} finally {
  if (page) {
    await page
      .evaluate(() => {
        globalThis.__temuAdSpendStopFloatingPanel?.();
        document.querySelector("#temu-adspend-floating-host")?.remove();
        for (const name of [
          "__temuAdSpendMonitorLoaded",
          "__temuAdSpendStopFloatingPanel",
          "__contentIntegrationStorage",
          "__contentIntegrationListener",
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
      })
      .catch(() => {});
  }
  await browser.close();
}
