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

  const capture = JSON.parse(
    await fs.readFile("test-artifacts/network-capture.json", "utf8")
  );
  const observed = capture.requests.find((request) =>
    request.url.endsWith("/api/v1/coconut/ad/ads_detail")
  );
  const observedPhan = observed?.headers?.["x-phan-data"] || "";

  const result = await page.evaluate(async (phanData) => {
    const now = Date.now();
    const startTime = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
    const payload = {
      ad_status: [],
      ad_advice_types: [],
      page_size: 20,
      page_number: 1,
      specific_query_info: "",
      sort_by: 0,
      sort_type: "desc",
      start_time: startTime,
      end_time: now,
      need_calculate_goods_summary: true,
      columns_type: 22,
      selected_roas_type: 1,
      filter_cooperative_ad_type: 0,
      ad_phase: -1
    };

    async function attempt(name, extraHeaders = {}) {
      const startedAt = performance.now();
      try {
        const response = await fetch("/api/v1/coconut/ad/ads_detail", {
          method: "POST",
          credentials: "include",
          headers: {
            accept: "application/json, text/plain, */*",
            "content-type": "application/json;charset=UTF-8",
            ...extraHeaders
          },
          body: JSON.stringify(payload)
        });
        const text = await response.text();
        let body = null;
        try {
          body = JSON.parse(text);
        } catch (_) {
          // Keep raw text for the diagnostic.
        }
        const ads = body?.result?.ads_detail || [];
        return {
          name,
          status: response.status,
          durationMs: Math.round(performance.now() - startedAt),
          success: body?.success ?? null,
          errorCode: body?.error_code ?? null,
          errorMessage: body?.error_msg ?? null,
          total: body?.total ?? null,
          hasMore: body?.has_more ?? null,
          adsCount: ads.length,
          sample: ads.slice(0, 3).map((ad) => ({
            adId: ad.ad_id,
            goodsId: ad.goods_id,
            spuId: ad.spu_id,
            status: ad.ad_show_status,
            statusList: ad.ad_show_status_list,
            spend: ad.summary?.spend?.total,
            netSpend: ad.summary?.spend?.net_total,
            budget: ad.budget
          })),
          bodyPrefix: body ? "" : text.slice(0, 500)
        };
      } catch (error) {
        return {
          name,
          status: 0,
          durationMs: Math.round(performance.now() - startedAt),
          error: String(error?.message || error)
        };
      }
    }

    return {
      pageUrl: location.href,
      pageTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      attempts: [
        await attempt("minimal_fetch"),
        await attempt("observed_antibot_headers", {
          "x-ad-request-id": crypto.randomUUID(),
          ...(phanData ? { "x-phan-data": phanData } : {})
        })
      ]
    };
  }, observedPhan);

  await fs.writeFile(
    "test-artifacts/fetch-test.json",
    JSON.stringify(result, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
