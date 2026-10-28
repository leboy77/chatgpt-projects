import fs from "node:fs/promises";
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
    const pageSize = 20;
    async function requestPage(pageNumber) {
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
          page_size: pageSize,
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
      return response.json();
    }

    const firstStarted = performance.now();
    let first = null;
    let firstAttempts = 0;
    do {
      firstAttempts += 1;
      first = await requestPage(1);
      if (first?.success !== true) {
        await new Promise((resolve) =>
          setTimeout(resolve, firstAttempts * 650)
        );
      }
    } while (first?.success !== true && firstAttempts < 5);
    if (first?.success !== true) {
      return { ok: false, phase: "first", firstAttempts };
    }

    const total = Number(first.total || 0);
    const pageCount = Math.ceil(total / pageSize);
    const records = [...(first.result?.ads_detail || [])];
    let retries = 0;
    const failedPages = [];
    for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
      let body = null;
      let attempts = 0;
      do {
        attempts += 1;
        body = await requestPage(pageNumber);
        if (body?.success !== true) {
          retries += 1;
          await new Promise((resolve) =>
            setTimeout(resolve, attempts * 650)
          );
        }
      } while (body?.success !== true && attempts < 5);
      if (body?.success !== true) {
        failedPages.push({ pageNumber, attempts, errorCode: body?.error_code });
      } else {
        records.push(...(body.result?.ads_detail || []));
      }
    }

    const unique = new Set(records.map((item) => item.ad_id));
    return {
      ok: failedPages.length === 0 && unique.size >= total,
      total,
      pageSize,
      pageCount,
      firstAttempts,
      retries,
      failedPages,
      records: unique.size,
      durationMs: Math.round(performance.now() - firstStarted)
    };
  });
  await fs.writeFile(
    "test-artifacts/stable-pagination.json",
    JSON.stringify(result, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
