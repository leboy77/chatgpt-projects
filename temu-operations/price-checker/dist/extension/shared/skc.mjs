const HEADER_ALIASES = {
  productCode: [
    "货号",
    "商品货号",
    "货品编号",
    "productcode",
    "product_code",
    "spu",
  ],
  skcId: [
    "skc",
    "skcid",
    "skc id",
    "skc编号",
    "skc id编号",
    "商品id",
    "商品 id",
    "productid",
    "product id",
  ],
  enabled: ["启用", "是否启用", "enabled", "enable", "active"],
  remark: ["备注", "remark", "note", "notes"],
};

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function aliasMap(aliases) {
  return new Set(aliases.map(normalizeHeader));
}

const NORMALIZED_ALIASES = Object.fromEntries(
  Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, aliasMap(aliases)]),
);

export function normalizeSkcId(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\s\u00A0]+/g, "")
    .trim();
}

export function parseEnabled(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return true;
  }

  const normalized = String(value).trim().toLowerCase();
  return !["否", "n", "no", "false", "0", "禁用"].includes(normalized);
}

function detectColumns(row) {
  const entries = Object.entries(row).map(([header, value]) => [
    normalizeHeader(header),
    value,
  ]);

  const columns = {};
  for (const [header, value] of entries) {
    for (const [key, aliases] of Object.entries(NORMALIZED_ALIASES)) {
      if (aliases.has(header) && columns[key] === undefined) {
        columns[key] = value;
      }
    }
  }

  return columns;
}

function isLikelyScientificNotation(value) {
  return /^\d+(?:\.\d+)?e[+-]?\d+$/i.test(String(value ?? "").trim());
}

function validateSkc(skcId) {
  if (!skcId) {
    return "SKC ID 不能为空";
  }
  if (isLikelyScientificNotation(skcId)) {
    return "SKC ID 被 Excel 转成了科学计数法，请把单元格设置为文本后重新填写";
  }
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(skcId)) {
    return "SKC ID 只能包含字母、数字、下划线或短横线，长度为 4-64";
  }
  return null;
}

export function parseSkcRows(
  inputRows,
  {
    maxSkc = 1000,
    batchSize = 50,
    requireSingleProduct = true,
    requireProductCode = true,
  } = {},
) {
  if (!Array.isArray(inputRows)) {
    throw new TypeError("inputRows 必须是数组");
  }
  if (!Number.isSafeInteger(maxSkc) || maxSkc <= 0) {
    throw new RangeError("maxSkc 必须是正整数");
  }
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new RangeError("batchSize 必须是正整数");
  }

  const issues = [];
  const validRows = [];
  const seen = new Set();
  const productCodes = new Set();

  inputRows.forEach((sourceRow, index) => {
    const row = detectColumns(sourceRow);
    const skcId = normalizeSkcId(row.skcId);
    const productCode = String(row.productCode ?? "").trim();
    const rowNumber = index + 2;

    if (!parseEnabled(row.enabled)) {
      return;
    }
    if (skcId === "" && String(row.remark ?? "").trim() === "") {
      return;
    }
    if (requireProductCode && !productCode) {
      issues.push({ rowNumber, skcId, message: "货号不能为空" });
      return;
    }

    const skcError = validateSkc(skcId);
    if (skcError) {
      issues.push({ rowNumber, skcId, message: skcError });
      return;
    }

    const duplicateKey = skcId.toLowerCase();
    if (seen.has(duplicateKey)) {
      issues.push({ rowNumber, skcId, message: "重复 SKC ID，已自动忽略" });
      return;
    }

    seen.add(duplicateKey);
    if (productCode) {
      productCodes.add(productCode);
    }
    validRows.push({
      rowNumber,
      productCode,
      skcId,
      remark: String(row.remark ?? "").trim(),
    });
  });

  if (requireSingleProduct && productCodes.size > 1) {
    issues.push({
      rowNumber: null,
      skcId: null,
      message: `本批只能包含一个货号，实际发现 ${productCodes.size} 个：${[
        ...productCodes,
      ].join("、")}`,
    });
  }
  if (validRows.length > maxSkc) {
    issues.push({
      rowNumber: null,
      skcId: null,
      message: `有效 SKC 数量为 ${validRows.length}，超过单批上限 ${maxSkc}`,
    });
  }

  const blockingIssues = issues.filter(
    (issue) => issue.message !== "重复 SKC ID，已自动忽略",
  );
  const ready =
    validRows.length > 0 &&
    blockingIssues.length === 0 &&
    validRows.length <= maxSkc &&
    (!requireSingleProduct || productCodes.size <= 1);
  const batches = ready ? createSkcBatches(validRows, batchSize) : [];

  return {
    ready,
    rows: ready ? validRows : [],
    batches,
    productCode: productCodes.size === 1 ? [...productCodes][0] : null,
    productCodes: [...productCodes],
    stats: {
      imported: inputRows.length,
      valid: validRows.length,
      duplicates: issues.filter((issue) => issue.message.startsWith("重复")).length,
      invalid: issues.filter(
        (issue) =>
          issue.rowNumber !== null && !issue.message.startsWith("重复"),
      ).length,
      batches: batches.length,
    },
    issues,
  };
}

export function createSkcBatches(rows, batchSize = 50) {
  if (!Array.isArray(rows)) {
    throw new TypeError("rows 必须是数组");
  }
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new RangeError("batchSize 必须是正整数");
  }

  const batches = [];
  for (let index = 0; index < rows.length; index += batchSize) {
    const batchRows = rows.slice(index, index + batchSize);
    batches.push({
      batchNumber: batches.length + 1,
      startRow: index + 1,
      endRow: Math.min(index + batchSize, rows.length),
      rows: batchRows,
      skcIds: batchRows.map((row) => row.skcId),
    });
  }
  return batches;
}

export function differenceSkcIds(requestedIds, returnedIds) {
  const returned = new Set(
    (returnedIds || []).map((value) => normalizeSkcId(value)),
  );
  return [
    ...new Set((requestedIds || []).map((value) => normalizeSkcId(value))),
  ]
    .filter(Boolean)
    .filter((skcId) => !returned.has(skcId));
}

export function createSkcRetryGroups(missingIds, batchSize = 10) {
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new RangeError("batchSize 必须是正整数");
  }
  const ids = [
    ...new Set((missingIds || []).map(normalizeSkcId).filter(Boolean)),
  ];
  const groups = [];
  for (let index = 0; index < ids.length; index += batchSize) {
    groups.push(ids.slice(index, index + batchSize));
  }
  return groups;
}

export function summarizeSkcCompleteness({
  requestedIds,
  returnedIds,
  noPendingIds,
}) {
  const requested = new Set(
    (requestedIds || []).map(normalizeSkcId).filter(Boolean),
  );
  const returned = new Set(
    (returnedIds || []).map(normalizeSkcId).filter(Boolean),
  );
  const noPending = new Set(
    (noPendingIds || []).map(normalizeSkcId).filter(Boolean),
  );
  const unaccounted = [...requested].filter(
    (skcId) => !returned.has(skcId) && !noPending.has(skcId),
  );
  return {
    requested: requested.size,
    returned: returned.size,
    noPending: noPending.size,
    unaccounted,
    complete: unaccounted.length === 0,
  };
}

export function splitIdList(text) {
  return String(text ?? "")
    .split(/[\s,，;；]+/)
    .map(normalizeSkcId)
    .filter(Boolean);
}
