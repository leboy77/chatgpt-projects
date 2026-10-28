import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const browser = await chromium.connectOverCDP(
  process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:50262"
);
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes("ads.temu.com/ad-list.html"));
  if (!page) throw new Error("未找到商品推广页面");

  await page.addScriptTag({
    path: path.resolve("extension/page-bridge.js")
  });

  const result = await page.evaluate(async () => {
    const startedAt = performance.now();
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );
    const requestId = `integration-${Date.now()}`;
    return new Promise((resolve) => {
      const timeout = setTimeout(
        () => finish({ ok: false, error: "bridge timeout" }),
        20_000
      );
      function finish(value) {
        clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        resolve(value);
      }
      function onMessage(event) {
        if (event.source !== window || event.origin !== location.origin) return;
        const data = event.data;
        if (
          data?.source !== "temu-adspend-page-bridge" ||
          data.type !== "result" ||
          data.requestId !== requestId
        ) {
          return;
        }
        const body = data.data?.body;
        const ads = body?.result?.ads_detail || [];
        finish({
          ok: data.ok === true,
          status: data.data?.status,
          success: body?.success,
          errorCode: body?.error_code,
          total: body?.total,
          adsCount: ads.length,
          spuCount: new Set(ads.map((ad) => ad.spu_id).filter(Boolean)).size,
          durationMs: Math.round(performance.now() - startedAt)
        });
      }
      window.addEventListener("message", onMessage);
      window.postMessage(
        {
          source: "temu-adspend-content",
          type: "fetchAdsDetail",
          requestId,
          timeoutMs: 20_000,
          payload: {
            ad_status: [],
            ad_advice_types: [],
            page_size: 20,
            page_number: 1,
            specific_query_info: "",
            sort_by: 0,
            sort_type: "desc",
            start_time: start.getTime(),
            end_time: Date.now(),
            need_calculate_goods_summary: true,
            columns_type: 22,
            selected_roas_type: 1,
            filter_cooperative_ad_type: 0,
            ad_phase: -1
          }
        },
        location.origin
      );
    });
  });

  await fs.mkdir("test-artifacts", { recursive: true });
  await fs.writeFile(
    "test-artifacts/bridge-integration.json",
    JSON.stringify(result, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
