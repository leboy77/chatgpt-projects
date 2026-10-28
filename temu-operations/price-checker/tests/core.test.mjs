import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  createSkcRetryGroups,
  differenceSkcIds,
  parseSkcRows,
  splitIdList,
  summarizeSkcCompleteness,
} from "../src/core/skc.mjs";
import { parseWorkbookFile } from "../src/shared/xlsx-reader.mjs";
import {
  COUNTRIES,
  countryRowExplicitlyDisabled,
  countryRowHasRmbPrice,
  shouldImportCountryRow,
} from "../src/core/countries.mjs";
import {
  ComparisonPolicy,
  Decision,
  buildSubmissionPlan,
  convertPlatformPriceToRmbCents,
  createIdempotencyKey,
  decidePrice,
  toCents,
} from "../src/core/pricing.mjs";

test("parseSkcRows accepts aliases, trims IDs and removes duplicates", () => {
  const result = parseSkcRows([
    { 货号: "Y2-18", "SKC ID": " 741234567890 ", 启用: "是" },
    { ProductCode: "Y2-18", skcid: "741234567890", enabled: "yes" },
    { "商品货号": "Y2-18", "商品ID": "741234567891", 启用: "否" },
  ]);

  assert.equal(result.ready, true);
  assert.equal(result.productCode, "Y2-18");
  assert.deepEqual(result.rows.map((row) => row.skcId), ["741234567890"]);
  assert.equal(result.stats.duplicates, 1);
});

test("parseSkcRows blocks mixed product codes", () => {
  const result = parseSkcRows([
    { 货号: "A-1", "SKC ID": "741234567890" },
    { 货号: "A-2", "SKC ID": "741234567891" },
  ]);

  assert.equal(result.ready, false);
  assert.match(result.issues.at(-1).message, /只能包含一个货号/);
});

test("parseSkcRows accepts 50 IDs and splits 51 IDs into two batches", () => {
  const rows = (count) =>
    Array.from({ length: count }, (_, index) => ({
      货号: "Y2-18",
      "SKC ID": `74123456${String(index).padStart(4, "0")}`,
    }));

  assert.equal(parseSkcRows(rows(50)).ready, true);
  assert.equal(parseSkcRows(rows(51)).batches.length, 2);
  assert.deepEqual(
    parseSkcRows(rows(51)).batches.map((batch) => batch.skcIds.length),
    [50, 1],
  );
});

test("parseSkcRows accepts 1000 IDs as twenty query batches", () => {
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    货号: "Y2-18",
    "SKC ID": `74123456${String(index).padStart(4, "0")}`,
  }));
  const result = parseSkcRows(rows);

  assert.equal(result.ready, true);
  assert.equal(result.stats.valid, 1000);
  assert.equal(result.stats.batches, 20);
  assert.equal(result.batches[0].skcIds.length, 50);
  assert.equal(result.batches.at(-1).skcIds.length, 50);
});

test("parseSkcRows rejects 1001 unique IDs", () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    货号: "Y2-18",
    "SKC ID": `74123456${String(index).padStart(4, "0")}`,
  }));
  const overLimit = parseSkcRows(rows);
  assert.equal(overLimit.ready, false);
  assert.match(overLimit.issues.at(-1).message, /超过单批上限 1000/);
});

test("parseSkcRows rejects scientific notation and blank product code", () => {
  const scientific = parseSkcRows([
    { 货号: "Y2-18", "SKC ID": "7.412345e+11" },
  ]);
  assert.equal(scientific.ready, false);
  assert.match(scientific.issues[0].message, /科学计数法/);

  const blankProduct = parseSkcRows([
    { 货号: "", "SKC ID": "741234567890" },
  ]);
  assert.equal(blankProduct.ready, false);
  assert.match(blankProduct.issues[0].message, /货号不能为空/);
});

test("parseSkcRows ignores unused template rows with a repeated product code", () => {
  const result = parseSkcRows([
    { 货号: "6MJK", "SKC ID": "415874833895", 启用: "是" },
    { 货号: "6MJK", "SKC ID": "", 启用: "是" },
    { 货号: "6MJK", "SKC ID": "", 启用: "是" },
  ]);

  assert.equal(result.ready, true);
  assert.equal(result.stats.valid, 1);
  assert.equal(result.issues.length, 0);
});

test("splitIdList handles common pasted separators", () => {
  assert.deepEqual(splitIdList("741234567890, 741234567891\n741234567892；741234567893"), [
    "741234567890",
    "741234567891",
    "741234567892",
    "741234567893",
  ]);
});

test("query completeness separates returned, no-pending and unresolved SKCs", () => {
  const requested = ["111111111111", "222222222222", "333333333333"];
  const returned = ["111111111111"];
  const noPending = ["222222222222"];
  const missing = differenceSkcIds(requested, returned);

  assert.deepEqual(missing, ["222222222222", "333333333333"]);
  assert.deepEqual(createSkcRetryGroups(missing, 10), [
    ["222222222222", "333333333333"],
  ]);
  assert.deepEqual(
    summarizeSkcCompleteness({
      requestedIds: requested,
      returnedIds: returned,
      noPendingIds: noPending,
    }),
    {
      requested: 3,
      returned: 1,
      noPending: 1,
      unaccounted: ["333333333333"],
      complete: false,
    },
  );
});

test("query completeness is true only when every requested SKC is accounted for", () => {
  assert.deepEqual(
    summarizeSkcCompleteness({
      requestedIds: ["111111111111", "222222222222"],
      returnedIds: ["111111111111"],
      noPendingIds: ["222222222222"],
    }),
    {
      requested: 2,
      returned: 1,
      noPending: 1,
      unaccounted: [],
      complete: true,
    },
  );
});

test("toCents rounds to integer cents without float surprises", () => {
  assert.equal(toCents("0.1"), 10);
  assert.equal(toCents("0.105"), 11);
  assert.equal(toCents("¥ 1,234.56"), 123456);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.throws(() => toCents("abc"), /无法解析金额/);
});

test("convertPlatformPriceToRmbCents handles RMB and foreign currency", () => {
  assert.equal(convertPlatformPriceToRmbCents("55.00", "CNY", null), 5500);
  assert.equal(convertPlatformPriceToRmbCents("8.50", "USD", 7.2), 6120);
  assert.throws(
    () => convertPlatformPriceToRmbCents("8.50", "USD", 0),
    /汇率必须大于 0/,
  );
  assert.throws(() => convertPlatformPriceToRmbCents("8.50", "", 7.2), /缺少币种/);
});

test("platform price at or above the merchant target is accepted directly", () => {
  assert.equal(
    decidePrice({ platformRmbCents: 5501, floorRmbCents: 5500 }).decision,
    Decision.ACCEPT_PLATFORM,
  );
  assert.equal(
    decidePrice({ platformRmbCents: 5500, floorRmbCents: 5500 }).decision,
    Decision.ACCEPT_PLATFORM,
  );
});

test("platform price below the merchant target is repriced instead of rejected", () => {
  assert.equal(
    decidePrice({ platformRmbCents: 5499, floorRmbCents: 5500 }).decision,
    Decision.REPRICE,
  );
});

test("strict-greater policy reprices equality while still accepting higher prices", () => {
  assert.equal(
    decidePrice({
      platformRmbCents: 5500,
      floorRmbCents: 5500,
      policy: ComparisonPolicy.STRICT_GREATER,
    }).decision,
    Decision.REPRICE,
  );
  assert.equal(
    decidePrice({
      platformRmbCents: 5501,
      floorRmbCents: 5500,
      policy: ComparisonPolicy.STRICT_GREATER,
    }).decision,
    Decision.ACCEPT_PLATFORM,
  );
});

test("blocked and already-submitted rows never enter the submission plan", () => {
  const base = {
    productCode: "Y2-18",
    skcId: "741234567890",
    siteCode: "US",
    skuId: "SKU-1",
  };
  const rows = [
    { ...base, decision: Decision.ACCEPT_PLATFORM },
    { ...base, skuId: "SKU-6", decision: Decision.REPRICE },
    { ...base, skuId: "SKU-2", decision: Decision.BLOCKED },
    { ...base, skuId: "SKU-3", decision: Decision.ALREADY_SUBMITTED },
    { ...base, skuId: "SKU-4", decision: Decision.MANUAL_REVIEW },
  ];
  const plan = buildSubmissionPlan(rows);
  assert.deepEqual(plan.approved.map((row) => row.skuId), ["SKU-1", "SKU-6"]);
  assert.equal(plan.summary.excluded, 3);
});

test("submission plan removes duplicate identities and supports user exclusions", () => {
  const root = {
    productCode: "Y2-18",
    skcId: "741234567890",
    siteCode: "US",
    skuId: "SKU-1",
    decision: Decision.APPROVED,
  };
  const plan = buildSubmissionPlan(
    [
      root,
      { ...root },
      {
        ...root,
        skuId: "SKU-2",
      },
    ],
    {
      selectedKeys: ["Y2-18|741234567890|US|SKU-2"],
    },
  );

  assert.deepEqual(plan.approved.map((row) => row.skuId), ["SKU-2"]);
  assert.equal(plan.duplicates.length, 1);
  assert.equal(plan.excluded.length, 1);
});

test("idempotency key is stable and changes when amount changes", () => {
  const root = {
    accountFingerprint: "store-a",
    productCode: "Y2-18",
    skcId: "741234567890",
    siteCode: "US",
    skuId: "SKU-1",
    platformRmbCents: 6120,
    floorRmbCents: 5500,
  };
  assert.equal(createIdempotencyKey(root), createIdempotencyKey({ ...root }));
  assert.notEqual(
    createIdempotencyKey(root),
    createIdempotencyKey({ ...root, platformRmbCents: 6121 }),
  );
});

test("CSV workbook import returns canonical SKC rows", async () => {
  const csv = [
    "货号,SKC ID,启用(是/否),备注",
    "Y2-18,741234567890,是,首批",
    "Y2-18,741234567891,否,禁用",
    "",
  ].join("\n");
  const parsed = await parseWorkbookFile({
    name: "skc.csv",
    text: async () => csv,
  });

  assert.equal(parsed.sheetName, "CSV");
  assert.deepEqual(parsed.rows[0], {
    货号: "Y2-18",
    "SKC ID": "741234567890",
    "启用(是/否)": "是",
    备注: "首批",
  });
});

test("v2 import template exposes SKC and 59 RMB country price rows", async () => {
  const bytes = await fs.readFile("extension-src/assets/import-template-v2.xlsx");
  const parsed = await parseWorkbookFile({
    name: "import-template-v2.xlsx",
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });

  assert.deepEqual(parsed.sheetNames, ["SKC导入", "国家价格"]);
  assert.equal(parsed.countryRows.length, 59);
  assert.equal(COUNTRIES.length, 59);
  assert.deepEqual(parsed.countryRows[0], {
    国家代码: "US",
    国家名称: "美国",
    分组: "美国",
    "启用(是/否)": "否",
    "最低接受价(RMB)": "",
    "提交价格(RMB)": "",
    提交方式: "填写方案提交价并提交",
    备注: "",
  });
});

test("US country row is imported automatically when an RMB price is filled", () => {
  const usRow = {
    国家代码: "US",
    国家名称: "美国",
    分组: "美国",
    "启用(是/否)": "否",
    "最低接受价(RMB)": "99.50",
    "提交价格(RMB)": "",
  };

  assert.equal(countryRowHasRmbPrice(usRow), true);
  assert.equal(countryRowExplicitlyDisabled(usRow), true);
  assert.equal(shouldImportCountryRow(usRow), true);
});

test("US remains disabled when it has no price", () => {
  const usRow = {
    国家代码: "US",
    国家名称: "美国",
    分组: "美国",
    "启用(是/否)": "否",
    "最低接受价(RMB)": "",
    "提交价格(RMB)": "",
  };

  assert.equal(countryRowHasRmbPrice(usRow), false);
  assert.equal(shouldImportCountryRow(usRow), false);
});
