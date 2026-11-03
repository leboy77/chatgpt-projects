(() => {
  "use strict";

  const XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function textCell(reference, value, styleId) {
    const text = String(value ?? "");
    const preserveSpace = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : "";
    return `<c r="${reference}" t="inlineStr" s="${styleId}"><is><t${preserveSpace}>${escapeXml(
      text,
    )}</t></is></c>`;
  }

  function numberCell(reference, value, styleId) {
    return `<c r="${reference}" s="${styleId}"><v>${Number(value)}</v></c>`;
  }

  function buildSheetXml(rows) {
    const dataRows = rows
      .map((row) => ({
        title: String(
          typeof row === "string" ? row : row?.title || "",
        ).trim(),
      }))
      .filter((row) => row.title);

    const sheetRows = [
      `<row r="1">${textCell("A1", "序号", 2)}${textCell(
        "B1",
        "标题",
        2,
      )}</row>`,
      ...dataRows.map(
        (row, index) =>
          `<row r="${index + 2}">${numberCell(
            `A${index + 2}`,
            index + 1,
            0,
          )}${textCell(`B${index + 2}`, row.title, 1)}</row>`,
      ),
    ];

    return {
      count: dataRows.length,
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:B${Math.max(1, dataRows.length + 1)}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols><col min="2" max="2" width="122.875" customWidth="1"/></cols>
  <sheetData>${sheetRows.join("")}</sheetData>
</worksheet>`,
    };
  }

  function buildStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="等线"/><family val="2"/><charset val="134"/></font>
    <font><sz val="11"/><name val="宋体"/><family val="3"/><charset val="134"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
  }

  function getJSZip() {
    if (globalThis.JSZip) return globalThis.JSZip;
    if (typeof require === "function") return require("../lib/jszip.min.js");
    throw new Error("JSZip 未加载");
  }

  async function createBlob(rows, options = {}) {
    const JSZipClass = getJSZip();
    const workbookZip = new JSZipClass();
    const sheet = buildSheetXml(Array.isArray(rows) ? rows : []);
    const createdAt = options.createdAt
      ? new Date(options.createdAt)
      : new Date();
    const createdIso = Number.isNaN(createdAt.getTime())
      ? new Date().toISOString()
      : createdAt.toISOString();

    workbookZip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    );
    workbookZip.file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    );
    workbookZip.file(
      "docProps/core.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Temu 商品首图采集器</dc:creator>
  <cp:lastModifiedBy>Temu 商品首图采集器</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdIso}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdIso}</dcterms:modified>
</cp:coreProperties>`,
    );
    workbookZip.file(
      "docProps/app.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Temu 商品首图采集器</Application>
</Properties>`,
    );
    workbookZip.file(
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    );
    workbookZip.file(
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    );
    workbookZip.file("xl/styles.xml", buildStylesXml());
    workbookZip.file("xl/worksheets/sheet1.xml", sheet.xml);

    return workbookZip.generateAsync({
      type: options.outputType || "blob",
      mimeType: XLSX_MIME,
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  }

  const api = { createBlob };
  globalThis.TecTitleWorkbook = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
