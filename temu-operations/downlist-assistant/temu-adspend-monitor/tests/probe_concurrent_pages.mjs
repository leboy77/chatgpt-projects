import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const browser = await chromium.connectOverCDP(
  process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:53534"
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
    async function fetchPage(pageNumber) {
      const startedAt = performance.now();
      try {
        const response = await fetch("/api/v1/coconut/ad/ads_detail", {
          method: "POST",
          credentials: "include",
          headers: {
            accept: "application/json, text/plain, */*",
            "content-type": "application/json;charset=UTF-8"
          },
          body: JSON.stringify({
            ad_status: [],
            ad_advice_types: [],
            page_size: 20,
            page_number: pageNumber,
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
        return {
          pageNumber,
          success: body?.success,
          errorCode: body?.error_code,
          adsCount: body?.result?.ads_detail?.length,
          durationMs: Math.round(performance.now() - startedAt)
        };
      } catch (error) {
        return {
          pageNumber,
          error: String(error?.message || error),
          durationMs: Math.round(performance.now() - startedAt)
        };
      }
    }

    const concurrent = await Promise.all([2, 3, 4, 5].map(fetchPage));
    const sequential = [];
    for (const pageNumber of [6, 7, 8, 9]) {
      sequential.push(await fetchPage(pageNumber));
    }
    return { concurrent, sequential };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
