(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.TemuXlsxReader = api;
  }
})(globalThis, function () {
  function decodeXml(value) {
    return String(value || "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
        String.fromCodePoint(parseInt(code, 16))
      );
  }

  function stripNamespacePrefixes(xml) {
    return String(xml || "").replace(
      /<(\/?)([A-Za-z_][\w.-]*):/g,
      "<$1"
    );
  }

  function readZipEntries(buffer) {
    const arrayBuffer =
      buffer instanceof ArrayBuffer
        ? buffer
        : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    let eocd = -1;
    for (let offset = bytes.length - 22; offset >= 0; offset--) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        eocd = offset;
        break;
      }
    }
    if (eocd < 0) throw new Error("不是有效的 XLSX 文件");

    const count = view.getUint16(eocd + 10, true);
    let cursor = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder("utf-8");
    const entries = [];

    for (let index = 0; index < count; index++) {
      if (view.getUint32(cursor, true) !== 0x02014b50) {
        throw new Error("XLSX 中央目录损坏");
      }
      const compression = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const fileNameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = decoder.decode(
        bytes.subarray(cursor + 46, cursor + 46 + fileNameLength)
      );
      entries.push({ name, compression, compressedSize, localOffset });
      cursor += 46 + fileNameLength + extraLength + commentLength;
    }
    return { bytes, view, entries };
  }

  async function unzipEntry(zip, entry) {
    const { bytes, view } = zip;
    if (view.getUint32(entry.localOffset, true) !== 0x04034b50) {
      throw new Error(`ZIP 条目损坏：${entry.name}`);
    }
    const nameLength = view.getUint16(entry.localOffset + 26, true);
    const extraLength = view.getUint16(entry.localOffset + 28, true);
    const dataStart = entry.localOffset + 30 + nameLength + extraLength;
    const data = bytes.slice(dataStart, dataStart + entry.compressedSize);
    if (entry.compression === 0) return new TextDecoder("utf-8").decode(data);
    if (entry.compression !== 8) {
      throw new Error(`不支持的 XLSX 压缩格式：${entry.compression}`);
    }
    const stream = new Blob([data])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  }

  function columnIndex(reference) {
    const letters = String(reference).match(/[A-Z]+/i)?.[0]?.toUpperCase() || "";
    let index = 0;
    for (const letter of letters) {
      index = index * 26 + letter.charCodeAt(0) - 64;
    }
    return Math.max(0, index - 1);
  }

  function parseSharedStrings(xml) {
    if (!xml) return [];
    xml = stripNamespacePrefixes(xml);
    const values = [];
    for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      const texts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(
        (item) => decodeXml(item[1])
      );
      values.push(texts.join(""));
    }
    return values;
  }

  function parseWorksheet(xml, sharedStrings) {
    xml = stripNamespacePrefixes(xml);
    const rows = [];
    for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowNumber = Number(rowMatch[1].match(/\br="(\d+)"/)?.[1] || 0);
      const cells = [];
      for (const cellMatch of rowMatch[2].matchAll(
        /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
      )) {
        const attrs = cellMatch[1];
        const body = cellMatch[2] || "";
        const reference = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1] || "";
        const type = attrs.match(/\bt="([^"]+)"/)?.[1] || "";
        const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
        const inline = body.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1];
        let value = "";
        if (type === "s" && raw != null) {
          value = sharedStrings[Number(raw)] || "";
        } else if (type === "inlineStr" && inline) {
          value = [...inline.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
            .map((item) => decodeXml(item[1]))
            .join("");
        } else if (raw != null) {
          value = decodeXml(raw);
        }
        if (value !== "") cells[columnIndex(reference)] = value;
      }
      if (cells.length) rows.push({ rowNumber, cells });
    }
    return rows;
  }

  function sheetPaths(workbookXml, relationshipsXml) {
    workbookXml = stripNamespacePrefixes(workbookXml);
    relationshipsXml = stripNamespacePrefixes(relationshipsXml);
    const relationships = new Map();
    for (const match of (relationshipsXml || "").matchAll(
      /<Relationship\b([^>]*)\/?>/g
    )) {
      const id = match[1].match(/\bId="([^"]+)"/)?.[1];
      const target = match[1].match(/\bTarget="([^"]+)"/)?.[1];
      if (id && target) relationships.set(id, target.replace(/^\.\//, ""));
    }
    const result = new Map();
    for (const match of (workbookXml || "").matchAll(/<sheet\b([^>]*)\/?>/g)) {
      const name = decodeXml(match[1].match(/\bname="([^"]+)"/)?.[1] || "");
      const relationId = match[1].match(/\b(?:\w+:)?id="([^"]+)"/)?.[1];
      const target = relationships.get(relationId);
      if (name && target) {
        const normalizedTarget = target.replace(/^\/+/, "");
        result.set(
          name,
          normalizedTarget.startsWith("xl/")
            ? normalizedTarget
            : `xl/${normalizedTarget}`
        );
      }
    }
    return result;
  }

  function objectRows(rows, requiredHeader) {
    const requiredHeaders = Array.isArray(requiredHeader)
      ? requiredHeader
      : [requiredHeader];
    const headerIndex = rows.findIndex((row) =>
      row.cells.some((value) =>
        requiredHeaders.includes(String(value).trim())
      )
    );
    if (headerIndex < 0) return [];
    const headers = rows[headerIndex].cells.map((value) =>
      String(value || "").trim()
    );
    return rows
      .slice(headerIndex + 1)
      .map((row) => {
        const result = {};
        headers.forEach((header, index) => {
          if (header) result[header] = row.cells[index] ?? "";
        });
        return result;
      })
      .filter((row) => Object.values(row).some((value) => value !== ""));
  }

  function firstValue(row, names) {
    for (const name of names) {
      if (row[name] !== undefined && row[name] !== "") return row[name];
    }
    return "";
  }

  function numberOrNull(value) {
    const normalized = String(value ?? "")
      .replace(/rmb|cny|元/gi, "")
      .replace(/[,\s¥￥]/g, "");
    if (normalized === "") return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  async function readWorkbook(buffer) {
    const zip = readZipEntries(buffer);
    const byName = new Map(zip.entries.map((entry) => [entry.name, entry]));
    const read = async (name) =>
      byName.has(name) ? unzipEntry(zip, byName.get(name)) : "";

    const workbookXml = await read("xl/workbook.xml");
    const relationshipsXml = await read("xl/_rels/workbook.xml.rels");
    const sharedStrings = parseSharedStrings(
      await read("xl/sharedStrings.xml")
    );
    const paths = sheetPaths(workbookXml, relationshipsXml);

    const sheetRows = new Map();
    for (const [name, path] of paths) {
      const xml = await read(path);
      if (xml) sheetRows.set(name, parseWorksheet(xml, sharedStrings));
    }

    const countryRows =
      objectRows(sheetRows.get("国家价格") || [], "国家代码").map((row) => {
        const code = String(firstValue(row, ["国家代码"])).trim();
        const name = String(firstValue(row, ["国家名称"])).trim();
        const group = String(firstValue(row, ["分组"])).trim();
        const enabled = /^是$/i.test(String(firstValue(row, ["启用(是/否)", "启用"])).trim());
        const targetPriceRaw = String(
          firstValue(row, [
            "指定规格价格(RMB)",
            "指定规格价格",
            "指定规格价",
            "提交价格(RMB)",
            "提交价格"
          ])
        ).trim();
        const otherPriceRaw = String(
          firstValue(row, [
            "其他规格价格(RMB)",
            "其他规格价格",
            "其他规格价",
            "最低接受价(RMB)",
            "最低接受价"
          ])
        ).trim();
        const tierPriceRaw = String(
          firstValue(row, [
            "档位匹配价格(RMB)",
            "档位匹配价格",
            "加速档位目标价(RMB)",
            "加速档位目标价"
          ])
        ).trim();
        return {
          code,
          name,
          station: name ? (name.endsWith("站") ? name : `${name}站`) : code,
          group,
          region: /美国/.test(group) ? "us" : /欧盟|欧洲/.test(group) ? "eu" : "global",
          enabled,
          targetPriceRaw,
          targetPrice: numberOrNull(targetPriceRaw),
          otherPriceRaw,
          otherPrice: numberOrNull(otherPriceRaw),
          tierPriceRaw,
          tierPrice: numberOrNull(tierPriceRaw),
          submitMode: String(firstValue(row, ["提交方式"])).trim(),
          note: String(firstValue(row, ["备注"])).trim()
        };
      });

    const productSheetRows =
      sheetRows.get("商品ID导入") ||
      sheetRows.get("SKC导入") ||
      [];
    const legacySkcSheet =
      !sheetRows.has("商品ID导入") && sheetRows.has("SKC导入");
    const productIdRows =
      objectRows(productSheetRows, ["商品ID", "SPU ID", "SKC ID"])
        .map((row) => {
          const goodsCode = String(firstValue(row, ["货号"])).trim();
          let spu = String(firstValue(row, ["SPU ID", "SPU"])).trim();
          let skc = String(firstValue(row, ["SKC ID", "SKC"])).trim();
          const genericId = String(firstValue(row, ["商品ID", "商品 ID"])).trim();
          const typeRaw = String(
            firstValue(row, ["商品ID类型", "ID类型", "商品ID类型(SPU/SKC)"])
          ).trim();
          let idType = /SPU/i.test(typeRaw)
            ? "SPU"
            : /SKC/i.test(typeRaw)
              ? "SKC"
              : spu
                ? "SPU"
                : "SKC";
          let id = idType === "SPU" ? spu : skc;
          if (legacySkcSheet && skc && !spu && skc.length <= 11) {
            idType = "SPU";
            spu = skc;
            skc = "";
            id = spu;
          }
          if (!id && genericId) {
            id = genericId;
          } else if (idType === "SPU" && !spu && skc) {
            idType = "SKC";
            id = skc;
          } else if (idType === "SKC" && !skc && spu) {
            idType = "SPU";
            id = spu;
          }
          const enabledRaw = String(
            firstValue(row, ["启用(是/否)", "启用"])
          ).trim();
          return {
            goodsCode,
            idType,
            id,
            spu: idType === "SPU" ? id : spu,
            skc: idType === "SKC" ? id : skc,
            enabled:
              /^是$/i.test(enabledRaw) ||
              (!enabledRaw && /^\d{6,}$/.test(id)),
            note: String(firstValue(row, ["备注"])).trim()
          };
        })
        .filter((row) => /^\d{6,}$/.test(row.id));

    const skcRows = productIdRows
      .filter((row) => row.idType === "SKC")
      .map((row) => ({
        goodsCode: row.goodsCode,
        skc: row.id,
        enabled: row.enabled,
        note: row.note
      }));

    return {
      sheets: [...sheetRows.keys()],
      countries: countryRows,
      productIdRows,
      skcRows
    };
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === '"') {
        if (quoted && text[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = !quoted;
        }
      } else if (char === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index++;
        row.push(cell);
        if (row.some((value) => value !== "")) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
    return rows;
  }

  return { readWorkbook, parseCsv, readZipEntries, unzipEntry };
});
