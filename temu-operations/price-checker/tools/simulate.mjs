import {
  Decision,
  buildSubmissionPlan,
  convertPlatformPriceToRmbCents,
  decidePrice,
} from "../src/core/pricing.mjs";
import { parseSkcRows } from "../src/core/skc.mjs";

const sites = [
  { siteCode: "US", siteName: "美国", currency: "USD", fx: 7.2, floorRmb: 55 },
  { siteCode: "UK", siteName: "英国", currency: "GBP", fx: 9.35, floorRmb: 58 },
  { siteCode: "DE", siteName: "德国", currency: "EUR", fx: 7.82, floorRmb: 60 },
  { siteCode: "FR", siteName: "法国", currency: "EUR", fx: 7.82, floorRmb: 60 },
  { siteCode: "CA", siteName: "加拿大", currency: "CAD", fx: 5.18, floorRmb: 54 },
  { siteCode: "AU", siteName: "澳大利亚", currency: "AUD", fx: 4.72, floorRmb: 62 },
];

function buildRows(runIndex) {
  const imported = Array.from({ length: 50 }, (_, index) => ({
    货号: "Y2-18",
    "SKC ID": `74123456${String(index).padStart(4, "0")}`,
    启用: index % 17 === 0 && runIndex % 3 === 0 ? "否" : "是",
  }));
  const parsed = parseSkcRows(imported);
  if (!parsed.ready) {
    throw new Error(JSON.stringify(parsed.issues));
  }

  const rows = [];
  parsed.rows.forEach((skc, skcIndex) => {
    sites.forEach((site, siteIndex) => {
      const skuCount = (skcIndex + siteIndex + runIndex) % 5 === 0 ? 2 : 1;
      for (let skuIndex = 0; skuIndex < skuCount; skuIndex += 1) {
        const scenario =
          (skcIndex * 7 + siteIndex * 11 + skuIndex * 3 + runIndex) % 1000;
        let normalizedRmbCents;
        let blockedReason = null;
        let alreadySubmitted = false;

        if (scenario < 4) {
          normalizedRmbCents = site.floorRmb * 100;
        } else if (scenario < 7) {
          normalizedRmbCents = site.floorRmb * 100 + 100;
          blockedReason = "汇率来源缺失";
        } else if (scenario < 10) {
          normalizedRmbCents = site.floorRmb * 100 + 100;
          alreadySubmitted = true;
        } else {
          const delta = (scenario % 41) - 20;
          const targetRmbCents = site.floorRmb * 100 + delta;
          const currencyCents = Math.round(targetRmbCents / site.fx);
          const platformPrice = currencyCents / 100;
          normalizedRmbCents = convertPlatformPriceToRmbCents(
            platformPrice,
            site.currency,
            site.fx,
          );
        }
        rows.push({
          productCode: skc.productCode,
          skcId: skc.skcId,
          skuId: `${site.siteCode}-${String(skuIndex + 1).padStart(2, "0")}`,
          siteCode: site.siteCode,
          siteName: site.siteName,
          platformRmbCents: normalizedRmbCents,
          floorRmbCents: site.floorRmb * 100,
          ...decidePrice({
            platformRmbCents: normalizedRmbCents,
            floorRmbCents: site.floorRmb * 100,
            blockedReason,
            alreadySubmitted,
          }),
        });
      }
    });
  });

  return { parsed, rows };
}

const runCount = 5000;
const counts = Object.fromEntries(Object.values(Decision).map((key) => [key, 0]));
let skcTotal = 0;
let rowTotal = 0;
let approvedTotal = 0;
let duplicateTotal = 0;
const startedAt = performance.now();

for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
  const { parsed, rows } = buildRows(runIndex);
  const plan = buildSubmissionPlan(rows);
  skcTotal += parsed.rows.length;
  rowTotal += rows.length;
  approvedTotal += plan.approved.length;
  duplicateTotal += plan.duplicates.length;
  rows.forEach((row) => {
    counts[row.decision] += 1;
  });
}

const elapsedMs = performance.now() - startedAt;
const results = {
  note: "本结果验证本地业务规则和任务规划，不代表 Temu 页面实测性能",
  runs: runCount,
  averageSkcPerBatch: Number((skcTotal / runCount).toFixed(2)),
  averageRowsPerBatch: Number((rowTotal / runCount).toFixed(2)),
  decisions: counts,
  approvedRate: Number((approvedTotal / rowTotal).toFixed(4)),
  duplicateRows: duplicateTotal,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  averagePlanningMs: Number((elapsedMs / runCount).toFixed(4)),
};

console.log(JSON.stringify(results, null, 2));
