(function attachTemuAdSpendCore(root, factory) {
  const api = factory();
  root.TemuAdSpendCore = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(globalThis, function createTemuAdSpendCore() {
  const STATUS = Object.freeze({
    INSUFFICIENT_BALANCE: 0,
    DAY_LIMIT: 1,
    SOLD_OUT: 2,
    REMOVED: 3,
    UNDER_REVIEW: 4,
    REVIEW_REJECTED: 5,
    PROMOTION_LIMIT: 6,
    MANUAL_PAUSE: 7,
    PROMOTION: 8,
    DELETED: 9,
    ROAS_LIMIT: 12,
    MONTH_LIMIT: 14,
    GOODS_LIMIT: 15
  });

  const STATUS_LABELS = Object.freeze({
    0: "余额不足",
    1: "日预算达到上限",
    2: "售罄",
    3: "商品已移除",
    4: "审核中",
    5: "审核驳回",
    6: "推广受限",
    7: "手动暂停",
    8: "推广中",
    9: "已删除",
    12: "ROAS 限制",
    14: "月度限制",
    15: "商品数量限制"
  });

  const PAUSE_ACTION_STATUS = 2;
  const RESTORE_ACTION_STATUS = 0;

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function toCnyFromMinor(value) {
    return Math.round(toNumber(value, 0)) / 100;
  }

  function formatCny(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return "暂无";
    }
    return `¥${Number(value).toFixed(2)}`;
  }

  function localDateKey(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function statusLabel(status) {
    return STATUS_LABELS[toNumber(status, -1)] || `未知状态 ${status}`;
  }

  function isAdListUrl(url) {
    try {
      const parsed = new URL(String(url || ""));
      return (
        parsed.origin === "https://ads.temu.com" &&
        parsed.pathname === "/ad-list.html"
      );
    } catch (_) {
      return false;
    }
  }

  function normalizeAd(record) {
    const spendMinor = toNumber(record?.summary?.spend?.total?.val, 0);
    const orderCount = toNumber(
      record?.summary?.order_pay_cnt?.total?.val,
      0
    );
    return {
      adId: String(record?.ad_id || ""),
      goodsId: String(record?.goods_id || ""),
      spuId: String(record?.spu_id || ""),
      title: String(record?.goods_title || ""),
      status: toNumber(record?.ad_show_status, -1),
      statusList: Array.isArray(record?.ad_show_status_list)
        ? record.ad_show_status_list
        : [],
      spendMinor,
      spendCny: toCnyFromMinor(spendMinor),
      spendDisplay: String(record?.summary?.spend?.total?.trans_val || ""),
      orderCount,
      transactionCostMinor: toNumber(
        record?.summary?.transaction_cost?.total?.val,
        0
      ),
      budgetMinor: toNumber(record?.budget, 0)
    };
  }

  function aggregateBySpu(records) {
    const groups = new Map();
    for (const record of records || []) {
      const ad = normalizeAd(record);
      if (!ad.spuId) continue;
      if (!groups.has(ad.spuId)) {
        groups.set(ad.spuId, {
          spuId: ad.spuId,
          title: ad.title,
          ads: [],
          spendMinor: 0,
          orderCount: 0,
          activeAdCount: 0,
          pausedAdCount: 0
        });
      }
      const group = groups.get(ad.spuId);
      if (!group.title && ad.title) group.title = ad.title;
      group.ads.push(ad);
      group.spendMinor += ad.spendMinor;
      group.orderCount += ad.orderCount;
      if (ad.status === STATUS.PROMOTION) group.activeAdCount += 1;
      if (ad.status === STATUS.MANUAL_PAUSE) group.pausedAdCount += 1;
    }

    return [...groups.values()].map((group) => ({
      ...group,
      spendCny: toCnyFromMinor(group.spendMinor),
      costPerOrderCny:
        group.orderCount > 0
          ? toCnyFromMinor(group.spendMinor) / group.orderCount
          : null,
      status:
        group.activeAdCount > 0
          ? STATUS.PROMOTION
          : group.pausedAdCount === group.ads.length
            ? STATUS.MANUAL_PAUSE
            : group.ads[0]?.status ?? -1
    }));
  }

  function effectiveRule(spuId, settings, rules) {
    const override = rules?.[spuId];
    if (override && override.enabled !== false) {
      return {
        spendLimitCny: Math.max(0, toNumber(override.spendLimitCny, 0)),
        costPerOrderLimitCny: Math.max(
          0,
          toNumber(override.costPerOrderLimitCny, 0)
        ),
        source: "spu"
      };
    }
    return {
      spendLimitCny: Math.max(
        0,
        toNumber(settings?.defaultSpendLimitCny, 0)
      ),
      costPerOrderLimitCny: Math.max(
        0,
        toNumber(settings?.defaultCostPerOrderLimitCny, 0)
      ),
      source: "default"
    };
  }

  function evaluateRule(summary, settings, rules) {
    const rule = effectiveRule(summary.spuId, settings, rules);
    const reasons = [];
    if (
      rule.spendLimitCny > 0 &&
      summary.spendCny >= rule.spendLimitCny
    ) {
      reasons.push("spend");
    }
    if (
      rule.costPerOrderLimitCny > 0 &&
      summary.orderCount > 0 &&
      summary.costPerOrderCny !== null &&
      summary.costPerOrderCny >= rule.costPerOrderLimitCny
    ) {
      reasons.push("costPerOrder");
    }
    return {
      ...rule,
      hit: reasons.length > 0,
      reasons
    };
  }

  function activeTargets(summary) {
    return (summary?.ads || []).filter(
      (ad) => ad.status === STATUS.PROMOTION && ad.goodsId
    );
  }

  function pauseIdempotencyKey(summary, rule, date = new Date()) {
    const thresholds = [
      `spend:${Math.round(toNumber(rule.spendLimitCny, 0) * 100)}`,
      `cpa:${Math.round(toNumber(rule.costPerOrderLimitCny, 0) * 100)}`
    ].join(",");
    return `${localDateKey(date)}:${summary.spuId}:${thresholds}`;
  }

  function classifyModifyResponse(response, targetGoodsIds, action) {
    const body = response?.body || response || {};
    const success =
      body?.success === true && toNumber(body?.error_code, -1) === 1000000;
    const failures = body?.result?.createGoodsFailMap || {};
    const rejectedGoodsIds = targetGoodsIds.filter((goodsId) =>
      Object.prototype.hasOwnProperty.call(failures, goodsId)
    );
    if (!success) {
      return {
        ok: false,
        code: `${action}_REJECTED`,
        message:
          body?.error_msg ||
          body?.message ||
          `推广状态修改接口返回失败，error_code=${body?.error_code ?? "未知"}`
      };
    }
    if (rejectedGoodsIds.length) {
      return {
        ok: false,
        code: `${action}_PARTIALLY_REJECTED`,
        message: rejectedGoodsIds
          .map((goodsId) => `${goodsId}: ${failures[goodsId]}`)
          .join("；"),
        rejectedGoodsIds
      };
    }
    return { ok: true, code: `${action}_ACCEPTED` };
  }

  function classifyPauseResponse(response, targetGoodsIds) {
    return classifyModifyResponse(response, targetGoodsIds, "PAUSE");
  }

  function classifyRestoreResponse(response, targetGoodsIds) {
    return classifyModifyResponse(response, targetGoodsIds, "RESTORE");
  }

  function verifyPaused(records, targetGoodsIds) {
    const statusByGoodsIds = new Map(
      (records || []).map((record) => [
        String(record.goods_id || ""),
        toNumber(record.ad_show_status, -1)
      ])
    );
    const missingGoodsIds = targetGoodsIds.filter(
      (goodsId) => !statusByGoodsIds.has(goodsId)
    );
    const notPausedGoodsIds = targetGoodsIds.filter(
      (goodsId) =>
        statusByGoodsIds.has(goodsId) &&
        statusByGoodsIds.get(goodsId) !== STATUS.MANUAL_PAUSE
    );
    return {
      verified:
        missingGoodsIds.length === 0 && notPausedGoodsIds.length === 0,
      missingGoodsIds,
      notPausedGoodsIds,
      statuses: Object.fromEntries(statusByGoodsIds)
    };
  }

  function verifyRestored(records, targetGoodsIds) {
    const statusByGoodsIds = new Map(
      (records || []).map((record) => [
        String(record.goods_id || ""),
        toNumber(record.ad_show_status, -1)
      ])
    );
    const missingGoodsIds = targetGoodsIds.filter(
      (goodsId) => !statusByGoodsIds.has(goodsId)
    );
    const notPromotingGoodsIds = targetGoodsIds.filter(
      (goodsId) =>
        statusByGoodsIds.has(goodsId) &&
        statusByGoodsIds.get(goodsId) !== STATUS.PROMOTION
    );
    return {
      verified:
        missingGoodsIds.length === 0 && notPromotingGoodsIds.length === 0,
      missingGoodsIds,
      notPromotingGoodsIds,
      statuses: Object.fromEntries(statusByGoodsIds)
    };
  }

  return {
    STATUS,
    STATUS_LABELS,
    PAUSE_ACTION_STATUS,
    RESTORE_ACTION_STATUS,
    toNumber,
    toCnyFromMinor,
    formatCny,
    localDateKey,
    statusLabel,
    isAdListUrl,
    normalizeAd,
    aggregateBySpu,
    effectiveRule,
    evaluateRule,
    activeTargets,
    pauseIdempotencyKey,
    classifyModifyResponse,
    classifyPauseResponse,
    classifyRestoreResponse,
    verifyPaused,
    verifyRestored
  };
});
