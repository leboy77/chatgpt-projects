export const ComparisonPolicy = Object.freeze({
  STRICT_GREATER: "STRICT_GREATER",
  GREATER_OR_EQUAL: "GREATER_OR_EQUAL",
});

export const Decision = Object.freeze({
  APPROVED: "APPROVED",
  ACCEPT_PLATFORM: "ACCEPT_PLATFORM",
  REPRICE: "REPRICE",
  MANUAL_REVIEW: "MANUAL_REVIEW",
  REJECTED: "REJECTED",
  BLOCKED: "BLOCKED",
  ALREADY_SUBMITTED: "ALREADY_SUBMITTED",
});

export function toCents(value) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("金额必须是有限数值");
  }

  const raw = String(value ?? "")
    .trim()
    .replace(/[¥￥,\s]/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(raw)) {
    throw new TypeError(`无法解析金额：${value}`);
  }

  const negative = raw.startsWith("-");
  const unsigned = raw.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const paddedFraction = `${fraction}00`;
  let cents = Number(whole) * 100 + Number(paddedFraction.slice(0, 2));

  if (Number(paddedFraction[2]) >= 5) {
    cents += 1;
  }

  return negative ? -cents : cents;
}

export function centsToNumber(cents) {
  if (!Number.isInteger(cents)) {
    throw new TypeError("cents 必须是整数");
  }
  return cents / 100;
}

export function convertPlatformPriceToRmbCents(
  platformPrice,
  currency,
  fxRateToRmb,
) {
  const normalizedCurrency = String(currency ?? "").trim().toUpperCase();
  if (!normalizedCurrency) {
    throw new TypeError("缺少币种");
  }

  const originalCents = toCents(platformPrice);
  if (originalCents <= 0) {
    throw new RangeError("平台价格必须大于 0");
  }
  if (["CNY", "RMB"].includes(normalizedCurrency)) {
    return originalCents;
  }

  const rate = Number(fxRateToRmb);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new RangeError("汇率必须大于 0");
  }

  return Math.round(originalCents * rate);
}

export function decidePrice({
  platformRmbCents,
  floorRmbCents,
  policy = ComparisonPolicy.GREATER_OR_EQUAL,
  alreadySubmitted = false,
  blockedReason = null,
}) {
  if (alreadySubmitted) {
    return {
      decision: Decision.ALREADY_SUBMITTED,
      differenceCents: 0,
      reason: "平台显示已确认或本地已有成功记录",
    };
  }
  if (blockedReason) {
    return {
      decision: Decision.BLOCKED,
      differenceCents: null,
      reason: blockedReason,
    };
  }
  if (
    !Number.isInteger(platformRmbCents) ||
    !Number.isInteger(floorRmbCents) ||
    platformRmbCents <= 0 ||
    floorRmbCents <= 0
  ) {
    return {
      decision: Decision.BLOCKED,
      differenceCents: null,
      reason: "平台价或最低接受价无效",
    };
  }
  if (!Object.values(ComparisonPolicy).includes(policy)) {
    return {
      decision: Decision.BLOCKED,
      differenceCents: null,
      reason: "比较规则无效",
    };
  }

  const differenceCents = platformRmbCents - floorRmbCents;
  if (
    differenceCents > 0 ||
    (differenceCents === 0 && policy === ComparisonPolicy.GREATER_OR_EQUAL)
  ) {
    return {
      decision: Decision.ACCEPT_PLATFORM,
      differenceCents,
      reason:
        differenceCents === 0
          ? "平台价等于申报价，直接接受平台价"
          : "平台价高于申报价，直接接受平台价",
    };
  }

  return {
    decision: Decision.REPRICE,
    differenceCents,
    reason: "平台价低于申报价，还价至目标价",
  };
}

export function rowIdentity(row) {
  return [
    row.productCode,
    row.skcId,
    row.siteCode,
    row.skuId,
  ]
    .map((value) => String(value ?? "").trim())
    .join("|");
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

export function createIdempotencyKey({
  accountFingerprint,
  productCode,
  skcId,
  siteCode,
  skuId,
  platformRmbCents,
  floorRmbCents,
}) {
  const source = [
    accountFingerprint,
    productCode,
    skcId,
    siteCode,
    skuId,
    platformRmbCents,
    floorRmbCents,
  ]
    .map((value) => String(value ?? "").trim())
    .join("\u001f");
  return fnv1a64(source);
}

export function buildSubmissionPlan(rows, { selectedKeys = null } = {}) {
  const selected = selectedKeys ? new Set(selectedKeys) : null;
  const seen = new Set();
  const approved = [];
  const excluded = [];
  const duplicates = [];

  for (const row of rows) {
    const identity = rowIdentity(row);
    if (seen.has(identity)) {
      duplicates.push({ ...row, reason: "重复的 SKC + 站点 + SKU 行" });
      continue;
    }
    seen.add(identity);

    if (
      ![
        Decision.APPROVED,
        Decision.ACCEPT_PLATFORM,
        Decision.REPRICE,
      ].includes(row.decision)
    ) {
      excluded.push({ ...row, reason: `非可提交状态：${row.decision}` });
      continue;
    }
    if (selected && !selected.has(identity)) {
      excluded.push({ ...row, reason: "用户取消了勾选" });
      continue;
    }
    approved.push(row);
  }

  return {
    approved,
    excluded,
    duplicates,
    summary: {
      input: rows.length,
      approved: approved.length,
      excluded: excluded.length,
      duplicates: duplicates.length,
    },
  };
}
