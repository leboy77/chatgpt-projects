export const REGION_LABELS = Object.freeze({
  EU: "欧区",
  US: "美国",
  GLOBAL: "全球",
});

export const DEFAULT_TARGET_GROUP = "Mixed Color2";

const HEADER_ALIASES = Object.freeze({
  skc: ["skcid", "skc"],
  site: ["站点", "经营站点", "国家站点"],
  targetGroup: ["指定颜色组", "指定规格", "指定颜色组名称"],
  targetPrice: [
    "指定规格价格y",
    "指定规格价格",
    "指定颜色组价格y",
    "指定颜色组价格",
  ],
  genericPrice: [
    "通用规格价格x",
    "通用规格价格",
    "其他规格价格x",
    "其他规格价格",
  ],
});

export function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[（(].*?[）)]/g, "")
    .toLowerCase();
}

export function normalizeText(value) {
  return String(value ?? "")
    .replace(/[\u00ad\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSku(value) {
  return normalizeText(value).toLowerCase();
}

export function parsePriceToCents(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
  }

  const cleaned = String(value ?? "")
    .replace(/[¥￥,\s]/g, "")
    .replace(/[^\d.-]/g, "");
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
}

export function centsToPrice(cents) {
  return Number((Number(cents) / 100).toFixed(2));
}

export function centsToInput(cents) {
  return (Number(cents) / 100).toFixed(2);
}

function findColumn(headerMap, aliases) {
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    if (headerMap.has(normalized)) return headerMap.get(normalized);
  }
  return -1;
}

function buildHeaderMap(row) {
  const map = new Map();
  row.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

function findHeader(rows, requiredKeys) {
  const maxRows = Math.min(rows.length, 30);
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const headerMap = buildHeaderMap(rows[rowIndex] ?? []);
    const columns = {};
    let matches = true;

    for (const key of requiredKeys) {
      const index = findColumn(headerMap, HEADER_ALIASES[key]);
      if (index < 0) {
        matches = false;
        break;
      }
      columns[key] = index;
    }

    if (matches) return { rowIndex, columns };
  }
  return null;
}

function getCell(row, index) {
  return index >= 0 && index < row.length ? row[index] : null;
}

function isBlankRow(row) {
  return !row.some((cell) => String(cell ?? "").trim() !== "");
}

function normalizeSkc(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) return String(value).trim();
    return String(value);
  }
  return String(value).trim();
}

export function normalizeSiteName(value) {
  let siteName = normalizeText(value);
  if (!siteName) return "";

  // Platform site labels use the "站" suffix, while supplier sheets often omit it.
  siteName = siteName.replace(/\s*[（(][^）)]*[）)]\s*$/g, "").trim();
  if (!siteName.endsWith("站")) siteName += "站";
  return siteName;
}

function normalizeColorGroup(value) {
  return normalizeText(value || DEFAULT_TARGET_GROUP);
}

function makeTask({
  region,
  skcId,
  siteName,
  targetColorGroup,
  targetPriceRaw,
  genericPriceRaw,
  skcOrder,
  siteOrder,
  sourceRow,
}) {
  const targetPriceCents = parsePriceToCents(targetPriceRaw);
  const genericPriceCents = parsePriceToCents(genericPriceRaw);
  const errors = [];

  if (!skcId) errors.push("SKC ID 为空");
  if (!siteName) errors.push("站点为空");
  if (targetPriceCents === null) errors.push("指定规格价格 Y 必须大于 0");
  if (genericPriceCents === null) errors.push("通用规格价格 X 必须大于 0");

  const taskId = [
    region,
    skcId || "NO_SKC",
    siteName || "NO_SITE",
    targetColorGroup,
    skcOrder,
    siteOrder,
  ].join("|");

  return {
    taskId,
    region,
    skcId,
    siteName,
    targetColorGroup,
    targetPriceCents: targetPriceCents ?? 0,
    genericPriceCents: genericPriceCents ?? 0,
    skcOrder,
    siteOrder,
    status: errors.length ? "INVALID_INPUT" : "IMPORTED",
    reason: errors.join("；"),
    validationErrors: errors,
    sourceRow,
    spuId: "",
  };
}

function readSheetRows(XLSX, worksheet) {
  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
}

function detectCanonicalSheet(rows) {
  const header = findHeader(rows, [
    "skc",
    "site",
    "targetPrice",
    "genericPrice",
  ]);
  if (!header) return null;

  const headerMap = buildHeaderMap(rows[header.rowIndex] ?? []);
  header.columns.targetGroup = findColumn(headerMap, HEADER_ALIASES.targetGroup);
  return header;
}

function parseCanonicalSheet(rows, header, region, targetGroupOverride) {
  const rawTasks = [];
  const siteOrderMap = new Map();
  const skcOrderMap = new Map();

  for (let index = header.rowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || isBlankRow(row)) continue;

    const skcId = normalizeSkc(getCell(row, header.columns.skc));
    const siteName = normalizeSiteName(getCell(row, header.columns.site));
    const targetColorGroup = normalizeColorGroup(
      targetGroupOverride || getCell(row, header.columns.targetGroup),
    );
    const targetPriceRaw = getCell(row, header.columns.targetPrice);
    const genericPriceRaw = getCell(row, header.columns.genericPrice);
    if (skcId && !skcOrderMap.has(skcId)) {
      skcOrderMap.set(skcId, skcOrderMap.size);
    }
    const skcOrder = skcOrderMap.get(skcId) ?? skcOrderMap.size;

    if (siteName && !siteOrderMap.has(siteName)) {
      siteOrderMap.set(siteName, siteOrderMap.size);
    }

    rawTasks.push(
      makeTask({
        region,
        skcId,
        siteName,
        targetColorGroup,
        targetPriceRaw,
        genericPriceRaw,
        skcOrder,
        siteOrder: siteOrderMap.get(siteName) ?? siteOrderMap.size,
        sourceRow: index + 1,
      }),
    );
  }

  return { rawTasks, siteOrderMap };
}

function detectPricingSheet(rows) {
  return findHeader(rows, ["site", "targetPrice", "genericPrice"]);
}

function detectSkcSheet(rows) {
  return findHeader(rows, ["skc"]);
}

function parsePricingRows(rows, header) {
  const pricingRows = [];
  const siteOrderMap = new Map();

  for (let index = header.rowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || isBlankRow(row)) continue;

    const siteName = normalizeSiteName(getCell(row, header.columns.site));
    if (!siteName) continue;
    if (!siteOrderMap.has(siteName)) {
      siteOrderMap.set(siteName, siteOrderMap.size);
    }

    pricingRows.push({
      siteName,
      siteOrder: siteOrderMap.get(siteName),
      targetPriceRaw: getCell(row, header.columns.targetPrice),
      genericPriceRaw: getCell(row, header.columns.genericPrice),
      sourceRow: index + 1,
    });
  }

  return { pricingRows, siteOrderMap };
}

function parseSkcRows(rows, header) {
  const skcRows = [];
  for (let index = header.rowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || isBlankRow(row)) continue;
    const skcId = normalizeSkc(getCell(row, header.columns.skc));
    if (!skcId) continue;
    skcRows.push({ skcId, sourceRow: index + 1, skcOrder: skcRows.length });
  }
  return skcRows;
}

function deduplicateTasks(tasks) {
  const result = [];
  const taskMap = new Map();
  let duplicateRows = 0;
  let conflictRows = 0;

  for (const task of tasks) {
    const key = [
      task.region,
      task.skcId,
      task.siteName,
      normalizeSku(task.targetColorGroup),
    ].join("|");
    const existing = taskMap.get(key);

    if (!existing) {
      taskMap.set(key, task);
      result.push(task);
      continue;
    }

    duplicateRows += 1;
    if (
      existing.targetPriceCents !== task.targetPriceCents ||
      existing.genericPriceCents !== task.genericPriceCents
    ) {
      conflictRows += 1;
      existing.status = "INVALID_INPUT";
      const conflict = `同一 SKC、站点和指定颜色组存在冲突价格，另见源表第 ${task.sourceRow} 行`;
      existing.validationErrors = [...existing.validationErrors, conflict];
      existing.reason = existing.validationErrors.join("；");
    }
  }

  return { tasks: result, duplicateRows, conflictRows };
}

export function groupTasksBySkc(tasks) {
  const groups = new Map();
  const ordered = [...tasks].sort(
    (a, b) => a.skcOrder - b.skcOrder || a.siteOrder - b.siteOrder,
  );

  for (const task of ordered) {
    if (!groups.has(task.skcId)) {
      groups.set(task.skcId, {
        skcId: task.skcId,
        skcOrder: task.skcOrder,
        siteTasks: [],
      });
    }
    groups.get(task.skcId).siteTasks.push(task);
  }

  return [...groups.values()].sort((a, b) => a.skcOrder - b.skcOrder);
}

export function summarizeTasks(tasks) {
  const summary = {
    total: tasks.length,
    pending: 0,
    active: 0,
    skipped: 0,
    notEligible: 0,
    failed: 0,
    invalid: 0,
  };

  for (const task of tasks) {
    switch (task.status) {
      case "ACTIVE":
      case "ALREADY_ACTIVE":
        summary.active += 1;
        break;
      case "SKIPPED_PRICE_LIMIT":
      case "SKIPPED_SUBMIT_BUTTON_NOT_FOUND":
      case "NO_SITE":
        summary.skipped += 1;
        break;
      case "NOT_ELIGIBLE":
      case "NO_PRODUCT":
        summary.notEligible += 1;
        break;
      case "FAILED":
      case "SUBMIT_UNCERTAIN":
      case "SUBMITTED_UNVERIFIED":
        summary.failed += 1;
        break;
      case "INVALID_INPUT":
        summary.invalid += 1;
        break;
      default:
        summary.pending += 1;
        break;
    }
  }

  return summary;
}

export function parseTaskWorkbook(XLSX, data, options = {}) {
  const region = REGION_LABELS[options.region] ? options.region : "EU";
  const targetColorGroup = normalizeColorGroup(options.targetColorGroup);
  const workbook = XLSX.read(data, {
    type: "array",
    cellDates: false,
    cellText: true,
  });

  const sheets = workbook.SheetNames.map((name) => ({
    name,
    worksheet: workbook.Sheets[name],
    rows: readSheetRows(XLSX, workbook.Sheets[name]),
  }));

  let sourceType = null;
  let sourceSheets = [];
  let rawTasks = [];
  let siteOrderMap = new Map();

  for (const sheet of sheets) {
    const header = detectCanonicalSheet(sheet.rows);
    if (!header) continue;
    const parsed = parseCanonicalSheet(
      sheet.rows,
      header,
      region,
      targetColorGroup,
    );
    rawTasks = parsed.rawTasks;
    siteOrderMap = parsed.siteOrderMap;
    sourceType = "canonical";
    sourceSheets = [sheet.name];
    break;
  }

  if (!sourceType) {
    const pricingSheet = sheets.find((sheet) => detectPricingSheet(sheet.rows));
    const skcSheet = sheets.find((sheet) => detectSkcSheet(sheet.rows));

    if (!pricingSheet || !skcSheet) {
      throw new Error(
        "未找到有效工作表。需要包含 SKC、站点、指定规格价格 Y、通用规格价格 X；或使用双表格式。",
      );
    }

    const pricingHeader = detectPricingSheet(pricingSheet.rows);
    const skcHeader = detectSkcSheet(skcSheet.rows);
    const pricingParsed = parsePricingRows(pricingSheet.rows, pricingHeader);
    const skcRows = parseSkcRows(skcSheet.rows, skcHeader);
    siteOrderMap = pricingParsed.siteOrderMap;
    sourceType = "legacy-two-sheet";
    sourceSheets = [skcSheet.name, pricingSheet.name];

    for (const skc of skcRows) {
      for (const pricing of pricingParsed.pricingRows) {
        rawTasks.push(
          makeTask({
            region,
            skcId: skc.skcId,
            siteName: pricing.siteName,
            targetColorGroup,
            targetPriceRaw: pricing.targetPriceRaw,
            genericPriceRaw: pricing.genericPriceRaw,
            skcOrder: skc.skcOrder,
            siteOrder: pricing.siteOrder,
            sourceRow: pricing.sourceRow,
          }),
        );
      }
    }
  }

  const deduplicated = deduplicateTasks(rawTasks);
  const tasks = deduplicated.tasks;
  const groups = groupTasksBySkc(tasks);
  const summary = summarizeTasks(tasks);

  return {
    region,
    sourceType,
    sourceSheets,
    siteOrder: [...siteOrderMap.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([siteName]) => siteName),
    duplicateRows: deduplicated.duplicateRows,
    conflictRows: deduplicated.conflictRows,
    groups,
    tasks,
    summary,
  };
}

export function isPriceWithinCap(desiredCents, capCents) {
  return (
    Number.isFinite(desiredCents) &&
    Number.isFinite(capCents) &&
    desiredCents > 0 &&
    capCents > 0 &&
    desiredCents <= capCents
  );
}

export function classifySku(row, targetColorGroup) {
  const normalizedTarget = normalizeSku(targetColorGroup);
  const sku = normalizeSku(row.skuLabel);
  if (!normalizedTarget) return false;
  if (sku.endsWith(`-${normalizedTarget}`)) return true;

  const sizeSuffix = sku.match(/-(xxxl|xxl|xl|l|m|s)$/i);
  if (!sizeSuffix) return false;
  return (
    sku.slice(0, -sizeSuffix[0].length) === normalizedTarget
  );
}
