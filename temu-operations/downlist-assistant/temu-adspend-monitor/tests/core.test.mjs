import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../extension/core.js");

function record({
  adId = "ad-1",
  goodsId = "goods-1",
  spuId = "spu-1",
  status = 8,
  spendMinor = 0,
  orders = 0
} = {}) {
  return {
    ad_id: adId,
    goods_id: goodsId,
    spu_id: spuId,
    goods_title: "Test product",
    ad_show_status: status,
    summary: {
      spend: { total: { val: spendMinor, trans_val: "" } },
      order_pay_cnt: { total: { val: orders, trans_val: String(orders) } },
      transaction_cost: { total: { val: 0, trans_val: "" } }
    },
    budget: 10000
  };
}

assert.equal(core.toCnyFromMinor(10000), 100);
assert.equal(core.toCnyFromMinor(4999), 49.99);
assert.equal(core.statusLabel(8), "推广中");
assert.equal(core.statusLabel(7), "手动暂停");
assert.equal(
  core.isAdListUrl(
    "https://ads.temu.com/ad-list.html?_x_source=11&refer_page_name=home"
  ),
  true
);
assert.equal(core.isAdListUrl("https://ads.temu.com/index.html"), false);
assert.equal(core.isAdListUrl("https://agentseller.temu.com/ad-list.html"), false);
assert.equal(core.isAdListUrl("not-a-url"), false);

const summaries = core.aggregateBySpu([
  record({ adId: "ad-1", goodsId: "goods-1", spendMinor: 2500, orders: 1 }),
  record({ adId: "ad-2", goodsId: "goods-2", spendMinor: 2500, orders: 1 })
]);
assert.equal(summaries.length, 1);
assert.equal(summaries[0].spendCny, 50);
assert.equal(summaries[0].orderCount, 2);
assert.equal(summaries[0].costPerOrderCny, 25);
assert.equal(summaries[0].activeAdCount, 2);

const thresholdRule = {
  spendLimitCny: 50,
  costPerOrderLimitCny: 20
};
const hit = core.evaluateRule(
  summaries[0],
  { defaultSpendLimitCny: 0, defaultCostPerOrderLimitCny: 0 },
  { "spu-1": thresholdRule }
);
assert.equal(hit.hit, true);
assert.deepEqual(hit.reasons, ["spend", "costPerOrder"]);

const zeroOrders = core.aggregateBySpu([
  record({ spendMinor: 4000, orders: 0 })
])[0];
const zeroOrderRule = core.evaluateRule(
  zeroOrders,
  { defaultSpendLimitCny: 0, defaultCostPerOrderLimitCny: 20 },
  {}
);
assert.equal(zeroOrderRule.costPerOrderLimitCny, 20);
assert.equal(zeroOrderRule.hit, false);

const belowThreshold = core.aggregateBySpu([
  record({ spendMinor: 4999, orders: 10 })
])[0];
const below = core.evaluateRule(
  belowThreshold,
  { defaultSpendLimitCny: 50, defaultCostPerOrderLimitCny: 0 },
  {}
);
assert.equal(below.hit, false);

const equalThreshold = core.aggregateBySpu([
  record({ spendMinor: 5000, orders: 10 })
])[0];
const equal = core.evaluateRule(
  equalThreshold,
  { defaultSpendLimitCny: 50, defaultCostPerOrderLimitCny: 0 },
  {}
);
assert.equal(equal.hit, true);

assert.equal(core.activeTargets(summaries[0]).length, 2);
assert.equal(
  core.activeTargets(
    core.aggregateBySpu([record({ status: core.STATUS.MANUAL_PAUSE })])[0]
  ).length,
  0
);

assert.equal(
  core.classifyPauseResponse(
    {
      body: {
        success: true,
        error_code: 1000000,
        result: { createGoodsFailMap: {} }
      }
    },
    ["goods-1"]
  ).ok,
  true
);

assert.equal(
  core.classifyPauseResponse(
    {
      body: {
        success: true,
        error_code: 1000000,
        result: { createGoodsFailMap: { "goods-1": "不可暂停" } }
      }
    },
    ["goods-1"]
  ).code,
  "PAUSE_PARTIALLY_REJECTED"
);

const verified = core.verifyPaused(
  [
    record({ goodsId: "goods-1", status: 7 }),
    record({ adId: "ad-2", goodsId: "goods-2", status: 7 })
  ],
  ["goods-1", "goods-2"]
);
assert.equal(verified.verified, true);

const notVerified = core.verifyPaused(
  [record({ goodsId: "goods-1", status: 8 })],
  ["goods-1"]
);
assert.equal(notVerified.verified, false);
assert.deepEqual(notVerified.notPausedGoodsIds, ["goods-1"]);

assert.equal(
  core.classifyRestoreResponse(
    {
      body: {
        success: true,
        error_code: 1000000,
        result: { createGoodsFailMap: {} }
      }
    },
    ["goods-1"]
  ).code,
  "RESTORE_ACCEPTED"
);

assert.equal(
  core.classifyRestoreResponse(
    {
      body: {
        success: true,
        error_code: 1000000,
        result: { createGoodsFailMap: { "goods-1": "商品已下架" } }
      }
    },
    ["goods-1"]
  ).code,
  "RESTORE_PARTIALLY_REJECTED"
);

const restored = core.verifyRestored(
  [record({ goodsId: "goods-1", status: core.STATUS.PROMOTION })],
  ["goods-1"]
);
assert.equal(restored.verified, true);

const restoreNotVerified = core.verifyRestored(
  [record({ goodsId: "goods-1", status: core.STATUS.MANUAL_PAUSE })],
  ["goods-1"]
);
assert.equal(restoreNotVerified.verified, false);
assert.deepEqual(restoreNotVerified.notPromotingGoodsIds, ["goods-1"]);

const keyA = core.pauseIdempotencyKey(
  summaries[0],
  thresholdRule,
  new Date(2026, 9, 22, 9, 0, 0)
);
const keyB = core.pauseIdempotencyKey(
  summaries[0],
  thresholdRule,
  new Date(2026, 9, 23, 9, 0, 0)
);
assert.notEqual(keyA, keyB);
assert.match(keyA, /^2026-10-22:spu-1:/);

console.log(
  JSON.stringify(
    {
      passed: 28,
      aggregateSpendCny: summaries[0].spendCny,
      aggregateCostPerOrderCny: summaries[0].costPerOrderCny,
      thresholdBoundary: equal.hit,
      restoreVerified: restored.verified,
      idempotencyKey: keyA
    },
    null,
    2
  )
);
