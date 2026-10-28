import fs from "node:fs/promises";
import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const browser = await chromium.connectOverCDP(
  process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:51930"
);
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes("ads.temu.com/ad-list.html"));
  if (!page) throw new Error("未找到商品推广页面");

  const result = await page.evaluate(async () => {
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
    const sizes = [10, 20, 50, 100];
    const attempts = [];
    for (const pageSize of sizes) {
      const startedAt = performance.now();
      try {
        const response = await fetch("/api/v1/coconut/ad/ads_detail", {
          method: "POST",
          credentials: "include",
          headers: {
            accept: "application/json, text/plain, */*",
            "content-type": "application/json;charset=UTF-8",
            "x-ad-request-id": crypto.randomUUID()
          },
          body: JSON.stringify({
            ad_status: [],
            ad_advice_types: [],
            page_size: pageSize,
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
          })
        });
        const body = await response.json();
        attempts.push({
          pageSize,
          httpStatus: response.status,
          success: body?.success,
          errorCode: body?.error_code,
          errorMessage: body?.error_msg,
          total: body?.total,
          adsCount: body?.result?.ads_detail?.length,
          hasMore: body?.has_more,
          durationMs: Math.round(performance.now() - startedAt)
        });
      } catch (error) {
        attempts.push({
          pageSize,
          error: String(error?.message || error),
          durationMs: Math.round(performance.now() - startedAt)
        });
      }
    }
    return {
      title: document.title,
      url: location.href,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      attempts
    };
  });
  await fs.writeFile(
    "test-artifacts/large-store-pagination.json",
    JSON.stringify(result, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
