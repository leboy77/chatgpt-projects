import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourcePath =
  "C:\\Users\\QZJLKJ\\Downloads\\7414\\Temu全球核价助手_导入模板_v2 (2).xlsx";
const outputDirectory = path.join(
  projectRoot,
  "outputs",
  "standard-import-template",
);
const outputPath = path.join(
  outputDirectory,
  "指定规格流量加速_标准导入模板.xlsx",
);

const require = createRequire(import.meta.url);
const { readWorkbook } = require(path.join(
  projectRoot,
  "sidepanel",
  "xlsx-reader.js",
));

const sourceBuffer = await fs.readFile(sourcePath);
const sourceArrayBuffer = sourceBuffer.buffer.slice(
  sourceBuffer.byteOffset,
  sourceBuffer.byteOffset + sourceBuffer.byteLength,
);
const parsed = await readWorkbook(sourceArrayBuffer);
const countries = parsed.countries.filter((item) => item.code && item.name);
if (countries.length !== 59) {
  throw new Error(`Expected 59 countries, found ${countries.length}`);
}

const fontFamily = "Arial";
const titleFill = "#DCE7F5";
const headerFill = "#24364B";
const headerText = "#FFFFFF";
const inputFill = "#FFF7D6";
const borderColor = "#D8E1EB";
const bodyText = "#253548";
const mutedText = "#5C6B7A";

const workbook = Workbook.create();
const productSheet = workbook.worksheets.add("商品ID导入");
const stationSheet = workbook.worksheets.add("国家价格");

function styleTitle(sheet, lastColumn) {
  sheet.getRange(`A1:${lastColumn}1`).merge();
  sheet.getRange(`A1:${lastColumn}1`).format = {
    fill: titleFill,
    font: { name: fontFamily, size: 14, bold: true, color: bodyText },
    verticalAlignment: "center",
    rowHeight: 30,
  };
}

function styleInstructions(sheet, lastColumn) {
  sheet.getRange(`A2:${lastColumn}2`).merge();
  sheet.getRange(`A2:${lastColumn}2`).format = {
    font: { name: fontFamily, size: 10, italic: true, color: mutedText },
    verticalAlignment: "center",
    wrapText: true,
    rowHeight: 28,
  };
}

function styleHeader(sheet, range) {
  sheet.getRange(range).format = {
    fill: headerFill,
    font: { name: fontFamily, size: 10, bold: true, color: headerText },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    rowHeight: 30,
    borders: {
      preset: "all",
      style: "thin",
      color: headerFill,
    },
  };
}

productSheet.showGridLines = false;
productSheet.tabColor = "#5E7085";
styleTitle(productSheet, "E");
styleInstructions(productSheet, "E");
productSheet.getRange("A1").values = [["商品 ID 导入表"]];
productSheet.getRange("A2").values = [[
  "SPU ID 和 SKC ID 分列填写，同一行至少填写一个；长数字请保持文本格式；启用列留空默认启用，填写“否”则排除。",
]];
productSheet.getRange("A4:E4").values = [[
  "货号",
  "SPU ID",
  "SKC ID",
  "启用(是/否)",
  "备注",
]];
styleHeader(productSheet, "A4:E4");
productSheet.freezePanes.freezeRows(4);
productSheet.getRange("A5:E1004").format.font = {
  name: fontFamily,
  size: 10,
  color: bodyText,
};
productSheet.getRange("A5:C1004").format.numberFormat = "@";
productSheet.getRange("B5:C1004").format.fill = inputFill;
productSheet.getRange("D5:D1004").format = {
  horizontalAlignment: "center",
  fill: inputFill,
};
productSheet.getRange("A5:E1004").format.borders = {
  preset: "inside",
  style: "thin",
  color: borderColor,
};
productSheet.dataValidations.add({
  range: "D5:D1004",
  rule: { type: "list", values: ["是", "否"] },
});
productSheet.getRange("A:A").format.columnWidth = 20;
productSheet.getRange("B:B").format.columnWidth = 22;
productSheet.getRange("C:C").format.columnWidth = 22;
productSheet.getRange("D:D").format.columnWidth = 15;
productSheet.getRange("E:E").format.columnWidth = 34;

stationSheet.showGridLines = false;
stationSheet.tabColor = "#6B5CE7";
styleTitle(stationSheet, "I");
styleInstructions(stationSheet, "I");
stationSheet.getRange("A1").values = [["国家价格表"]];
stationSheet.getRange("A2").values = [[
  "指定规格价格用于模式 A；档位匹配价格用于模式 B。填写任一有效价格会自动启用站点；自动档位模式只读取平台档位，不修改日常申报价。",
]];
stationSheet.getRange("A4:I4").values = [[
  "国家代码",
  "国家名称",
  "分组",
  "启用(是/否)",
  "其他规格价格(RMB)",
  "指定规格价格(RMB)",
  "档位匹配价格(RMB)",
  "提交方式",
  "备注",
]];
styleHeader(stationSheet, "A4:I4");

stationSheet.getRange(`A5:I${4 + countries.length}`).values = countries.map(
  (country) => [
    country.code,
    country.name,
    country.group,
    "否",
    null,
    null,
    null,
    "指定规格批量加速",
    "",
  ],
);
stationSheet.freezePanes.freezeRows(4);
stationSheet.getRange(`A5:I${4 + countries.length}`).format.font = {
  name: fontFamily,
  size: 10,
  color: bodyText,
};
stationSheet.getRange(`A5:C${4 + countries.length}`).format.numberFormat = "@";
stationSheet.getRange(`D5:D${4 + countries.length}`).format = {
  fill: inputFill,
  horizontalAlignment: "center",
};
stationSheet.getRange(`E5:G${4 + countries.length}`).format = {
  fill: inputFill,
  numberFormat: "¥#,##0.00",
  horizontalAlignment: "right",
};
stationSheet.getRange(`A5:I${4 + countries.length}`).format.borders = {
  preset: "inside",
  style: "thin",
  color: borderColor,
};
stationSheet.dataValidations.add({
  range: `D5:D${4 + countries.length}`,
  rule: { type: "list", values: ["是", "否"] },
});
stationSheet.getRange("A:A").format.columnWidth = 13;
stationSheet.getRange("B:B").format.columnWidth = 16;
stationSheet.getRange("C:C").format.columnWidth = 15;
stationSheet.getRange("D:D").format.columnWidth = 15;
stationSheet.getRange("E:E").format.columnWidth = 20;
stationSheet.getRange("F:F").format.columnWidth = 20;
stationSheet.getRange("G:G").format.columnWidth = 22;
stationSheet.getRange("H:H").format.columnWidth = 24;
stationSheet.getRange("I:I").format.columnWidth = 32;

workbook.recalculate();

const skcPreview = await workbook.render({
  sheetName: "商品ID导入",
  range: "A1:E20",
  scale: 1.5,
  format: "png",
});
const stationPreview = await workbook.render({
  sheetName: "国家价格",
  range: "A1:I24",
  scale: 1.4,
  format: "png",
});

await fs.mkdir(outputDirectory, { recursive: true });
await fs.writeFile(
  path.join(outputDirectory, "product-id-preview.png"),
  new Uint8Array(await skcPreview.arrayBuffer()),
);
await fs.writeFile(
  path.join(outputDirectory, "country-preview.png"),
  new Uint8Array(await stationPreview.arrayBuffer()),
);

const check = await workbook.inspect({
  kind: "table",
  range: "国家价格!A4:I14",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 9,
});
console.log(check.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm:
    "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "standard template formula error scan",
});
const formulaErrorRecords = String(formulaErrors.ndjson || "")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((record) => record.kind !== "notice");
if (formulaErrorRecords.length) {
  throw new Error(
    `Standard template contains formula errors: ${JSON.stringify(
      formulaErrorRecords,
    )}`,
  );
}

const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(outputPath);
console.log(outputPath);
