const decoder = new TextDecoder("utf-8");

const COLUMN_ALIASES = {
  productCode: ["货号", "商品货号", "货品编号", "productcode", "product_code", "spu"],
  skcId: ["skcid", "skc id", "skc编号", "商品id", "商品 id", "productid", "product id"],
  enabled: ["启用", "是否启用", "启用(是/否)", "enabled", "enable", "active"],
  remark: ["备注", "remark", "note", "notes"],
};

function normalizeHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[()（）]/g, "");
}

function normalizedAliasSet(values) {
  return new Set(values.map(normalizeHeader));
}

const NORMALIZED_ALIASES = Object.fromEntries(
  Object.entries(COLUMN_ALIASES).map(([key, values]) => [
    key,
    normalizedAliasSet(values),
  ]),
);

function toUint8Array(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError("Excel 内容必须是 ArrayBuffer 或 Uint8Array");
}

function readU16(view, offset) {
  return view.getUint16(offset, true);
}

function readU32(view, offset) {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (readU32(view, offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("不是有效的 XLSX/ZIP 文件");
}

async function inflateDeflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("当前 Chromium 不支持 XLSX 解压，请升级浏览器");
  }
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const entryCount = readU16(view, eocdOffset + 10);
  let cursor = readU32(view, eocdOffset + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (readU32(view, cursor) !== 0x02014b50) {
      throw new Error("XLSX ZIP 目录损坏");
    }

    const method = readU16(view, cursor + 10);
    const compressedSize = readU32(view, cursor + 20);
    const uncompressedSize = readU32(view, cursor + 24);
    const nameLength = readU16(view, cursor + 28);
    const extraLength = readU16(view, cursor + 30);
    const commentLength = readU16(view, cursor + 32);
    const localHeaderOffset = readU32(view, cursor + 42);
    const nameStart = cursor + 46;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));

    entries.set(name, {
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function readZipEntry(bytes, entries, name) {
  const entry = entries.get(name);
  if (!entry) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerOffset = entry.localHeaderOffset;
  if (readU32(view, headerOffset) !== 0x04034b50) {
    throw new Error(`XLSX 文件项损坏：${name}`);
  }

  const nameLength = readU16(view, headerOffset + 26);
  const extraLength = readU16(view, headerOffset + 28);
  const dataStart = headerOffset + 30 + nameLength + extraLength;
  const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) {
    return compressed;
  }
  if (entry.method === 8) {
    return inflateDeflateRaw(compressed);
  }
  throw new Error(`不支持的 XLSX 压缩方式：${entry.method}`);
}

async function readZipText(bytes, entries, name) {
  const content = await readZipEntry(bytes, entries, name);
  return content ? decoder.decode(content) : null;
}

function unescapeXml(value) {
  return String(value ?? "").replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|amp|lt|gt|quot|apos);/gi,
    (match, hex, decimal) => {
      if (hex) {
        return String.fromCodePoint(Number.parseInt(hex, 16));
      }
      if (decimal) {
        return String.fromCodePoint(Number.parseInt(decimal, 10));
      }
      return {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&apos;": "'",
      }[match.toLowerCase()];
    },
  );
}

function readAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([:\w]+)="([^"]*)"/g)) {
    attributes[match[1]] = unescapeXml(match[2]);
  }
  return attributes;
}

function textFromTags(xml, localName) {
  const values = [];
  const expression = new RegExp(
    `<(?:\\w+:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${localName}>`,
    "gi",
  );
  for (const match of xml.matchAll(expression)) {
    values.push(unescapeXml(match[1]));
  }
  return values;
}

function parseSharedStrings(xml) {
  if (!xml) {
    return [];
  }
  const values = [];
  for (const match of xml.matchAll(
    /<(?:x:)?si\b[^>]*>([\s\S]*?)<\/(?:x:)?si>/gi,
  )) {
    values.push(textFromTags(match[1], "t").join(""));
  }
  return values;
}

function columnIndex(reference) {
  const letters = String(reference ?? "").match(/[A-Z]+/i)?.[0]?.toUpperCase();
  if (!letters) {
    return 0;
  }
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return index - 1;
}

function parseCell(attributes, innerXml, sharedStrings) {
  const type = attributes.t;
  const value = textFromTags(innerXml, "v")[0] ?? "";

  if (type === "s") {
    return sharedStrings[Number(value)] ?? "";
  }
  if (type === "inlineStr") {
    return textFromTags(innerXml, "t").join("");
  }
  if (type === "b") {
    return value === "1" ? "TRUE" : "FALSE";
  }
  if (type === "e") {
    return "";
  }
  return value;
}

function parseWorksheet(xml, sharedStrings) {
  const rows = [];
  for (const rowMatch of xml.matchAll(
    /<(?:x:)?row\b([^>]*)>([\s\S]*?)<\/(?:x:)?row>/gi,
  )) {
    const rowAttributes = readAttributes(rowMatch[1]);
    const rowIndex = Number(rowAttributes.r || rows.length + 1) - 1;
    const cells = [];

    for (const cellMatch of rowMatch[2].matchAll(
      /<(?:x:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:x:)?c>)/gi,
    )) {
      const attributes = readAttributes(cellMatch[1]);
      const index = columnIndex(attributes.r);
      cells[index] = parseCell(attributes, cellMatch[2] ?? "", sharedStrings);
    }

    rows[rowIndex] = Array.from(cells, (value) => value ?? "");
  }
  return rows.filter(Boolean);
}

function findFirstWorksheetPath(workbookXml, relationshipsXml, entryNames) {
  const firstSheet = workbookXml?.match(/<(?:x:)?sheet\b([^>]*?)\/?>/i);
  const sheetAttributes = firstSheet ? readAttributes(firstSheet[1]) : {};
  const relationshipId = sheetAttributes["r:id"] || sheetAttributes.id;

  if (relationshipId && relationshipsXml) {
    for (const match of relationshipsXml.matchAll(
      /<(?:x:)?Relationship\b([^>]*?)\/?>/gi,
    )) {
      const attributes = readAttributes(match[1]);
      if (attributes.Id === relationshipId && attributes.Target) {
        const target = attributes.Target.replace(/^\/+/, "").replace(/^xl\//, "");
        return `xl/${target}`.replace(/\/\.\//g, "/");
      }
    }
  }

  return [...entryNames]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort()[0];
}

function workbookSheets(workbookXml, relationshipsXml, entryNames) {
  const relationships = new Map();
  if (relationshipsXml) {
    for (const match of relationshipsXml.matchAll(
      /<(?:x:)?Relationship\b([^>]*?)\/?>/gi,
    )) {
      const attributes = readAttributes(match[1]);
      if (attributes.Id && attributes.Target) {
        const target = attributes.Target.replace(/^\/+/, "").replace(/^xl\//, "");
        relationships.set(attributes.Id, `xl/${target}`.replace(/\/\.\//g, "/"));
      }
    }
  }

  const sheets = [];
  for (const match of workbookXml?.matchAll(/<(?:x:)?sheet\b([^>]*?)\/?>/gi) || []) {
    const attributes = readAttributes(match[1]);
    const relationshipId = attributes["r:id"] || attributes.id;
    const path =
      relationships.get(relationshipId) ||
      [...entryNames]
        .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
        .sort()[sheets.length];
    if (path) {
      sheets.push({
        name: attributes.name || `Sheet${sheets.length + 1}`,
        path,
      });
    }
  }
  return sheets;
}

function findColumnIndex(headerValues, aliases) {
  return headerValues.findIndex((value) => aliases.has(normalizeHeader(value)));
}

function tableToRows(table) {
  let headerIndex = -1;
  let skcIndex = -1;
  for (let index = 0; index < Math.min(table.length, 30); index += 1) {
    const candidate = findColumnIndex(table[index], NORMALIZED_ALIASES.skcId);
    if (candidate >= 0) {
      headerIndex = index;
      skcIndex = candidate;
      break;
    }
  }

  if (headerIndex < 0) {
    throw new Error("Excel 中未找到「SKC ID」列");
  }

  const headers = table[headerIndex];
  const productCodeIndex = findColumnIndex(headers, NORMALIZED_ALIASES.productCode);
  const enabledIndex = findColumnIndex(headers, NORMALIZED_ALIASES.enabled);
  const remarkIndex = findColumnIndex(headers, NORMALIZED_ALIASES.remark);
  const rows = [];

  for (const values of table.slice(headerIndex + 1)) {
    const skcId = String(values[skcIndex] ?? "").trim();
    const productCode =
      productCodeIndex >= 0 ? String(values[productCodeIndex] ?? "").trim() : "";
    const enabled =
      enabledIndex >= 0 ? String(values[enabledIndex] ?? "").trim() : "";
    const remark =
      remarkIndex >= 0 ? String(values[remarkIndex] ?? "").trim() : "";
    if (!skcId && !productCode && !remark) {
      continue;
    }
    rows.push({
      货号: productCode,
      "SKC ID": skcId,
      "启用(是/否)": enabled,
      备注: remark,
    });
  }

  return rows;
}

function tableToCountryRows(table) {
  let headerIndex = -1;
  for (let index = 0; index < Math.min(table.length, 30); index += 1) {
    const normalized = table[index].map(normalizeHeader);
    if (
      normalized.some((value) =>
        ["国家代码", "sitecode", "countrycode"].includes(value),
      ) &&
      normalized.some((value) =>
        ["最低接受价rmb", "最低接受价", "floorrmb"].includes(value),
      )
    ) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0) {
    return [];
  }

  const headers = table[headerIndex].map(normalizeHeader);
  const find = (aliases) =>
    headers.findIndex((value) => aliases.includes(value));
  const indexes = {
    code: find(["国家代码", "sitecode", "countrycode"]),
    name: find(["国家名称", "国家", "sitename", "country"]),
    group: find(["分组", "group"]),
    enabled: find(["启用是/否", "启用", "enabled"]),
    floorRmb: find(["最低接受价rmb", "最低接受价", "floorrmb"]),
    submitRmb: find(["提交价格rmb", "提交价格", "submitrmb"]),
    submissionMode: find(["提交方式", "submissionmode"]),
    remark: find(["备注", "remark"]),
  };

  return table
    .slice(headerIndex + 1)
    .map((values) => ({
      国家代码: String(values[indexes.code] ?? "").trim().toUpperCase(),
      国家名称: String(values[indexes.name] ?? "").trim(),
      分组: String(values[indexes.group] ?? "").trim(),
      "启用(是/否)": String(values[indexes.enabled] ?? "").trim(),
      "最低接受价(RMB)": String(values[indexes.floorRmb] ?? "").trim(),
      "提交价格(RMB)": String(values[indexes.submitRmb] ?? "").trim(),
      提交方式: String(values[indexes.submissionMode] ?? "").trim(),
      备注: String(values[indexes.remark] ?? "").trim(),
    }))
    .filter(
      (row) =>
        row.国家代码 ||
        row.国家名称 ||
        row["最低接受价(RMB)"] ||
        row["提交价格(RMB)"],
    );
}

export async function parseXlsx(input) {
  const parsed = await parseXlsxAllSheets(input);
  const firstSheet = parsed.sheets[0];
  return {
    sheetName: firstSheet?.name || "Sheet1",
    rows: firstSheet ? tableToRows(firstSheet.table) : [],
    countryRows: parsed.countryRows,
    sheetNames: parsed.sheets.map((sheet) => sheet.name),
  };
}

export async function parseXlsxAllSheets(input) {
  const bytes = toUint8Array(input);
  const entries = readZipEntries(bytes);
  const [workbookXml, relationshipsXml, sharedStringsXml] = await Promise.all([
    readZipText(bytes, entries, "xl/workbook.xml"),
    readZipText(bytes, entries, "xl/_rels/workbook.xml.rels"),
    readZipText(bytes, entries, "xl/sharedStrings.xml"),
  ]);
  const sheetDefinitions = workbookSheets(
    workbookXml,
    relationshipsXml,
    entries.keys(),
  );
  const definitions = sheetDefinitions.length
    ? sheetDefinitions
    : [
        {
          name: "Sheet1",
          path: findFirstWorksheetPath(
            workbookXml,
            relationshipsXml,
            entries.keys(),
          ),
        },
      ];
  if (!definitions[0]?.path) {
    throw new Error("Excel 中没有可读取的工作表");
  }

  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const sheets = [];
  let countryRows = [];
  for (const definition of definitions) {
    const worksheetXml = await readZipText(bytes, entries, definition.path);
    const table = parseWorksheet(worksheetXml ?? "", sharedStrings);
    sheets.push({ name: definition.name, table });
    const parsedCountryRows = tableToCountryRows(table);
    if (parsedCountryRows.length) {
      countryRows = parsedCountryRows;
    }
  }

  return {
    sheets,
    countryRows,
  };
}

export function parseCsv(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === "," || character === "\t") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export async function parseWorkbookFile(file) {
  const name = String(file?.name ?? "").toLowerCase();
  if (name.endsWith(".xls") && !name.endsWith(".xlsx")) {
    throw new Error("暂不支持旧版 .xls，请在 Excel 中另存为 .xlsx");
  }
  if (name.endsWith(".xlsx")) {
    return parseXlsx(await file.arrayBuffer());
  }
  if (name.endsWith(".csv")) {
    const text = await file.text();
    return {
      sheetName: "CSV",
      rows: tableToRows(parseCsv(text)),
      countryRows: [],
      sheetNames: ["CSV"],
    };
  }
  throw new Error("请选择 .xlsx 或 .csv 文件");
}
