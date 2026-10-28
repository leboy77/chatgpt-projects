import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import { COUNTRIES } from "../src/core/countries.mjs";

const outputDir = path.resolve(
  "outputs",
  "01a162b3-08c8-7590-b359-1c4c46f2e054",
);
const outputPath = path.join(
  outputDir,
  "Temu全球核价助手_导入模板_v2.xlsx",
);
const extensionAssetPath = path.resolve(
  "extension-src",
  "assets",
  "import-template-v2.xlsx",
);
const skcPreviewPath = path.join(outputDir, "import-template-v2-skc.png");
const countryPreviewPath = path.join(
  outputDir,
  "import-template-v2-countries.png",
);
const fontFamily = "Arial";

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(path.dirname(extensionAssetPath), { recursive: true });

const workbook = Workbook.create();
const skcSheet = workbook.worksheets.add("SKC导入");
skcSheet.showGridLines = false;
skcSheet.tabColor = "#17324D";

skcSheet.getRange("A1").values = [
  ["Temu 全球核价助手 · SKC 导入"],
];
skcSheet.getRange("A1:D1").format = {
  fill: "#17324D",
  font: { name: fontFamily, size: 14, bold: true, color: "#FFFFFF" },
  verticalAlignment: "center",
};
skcSheet.getRange("A1:D1").format.rowHeightPx = 34;
skcSheet.getRange("A2:D2").values = [[
  "同一文件只填一个货号，有效 SKC 最多 1000 条；程序自动按每 50 条分批执行。",
  null,
  null,
  null,
]];
skcSheet.getRange("A2:D2").format = {
  fill: "#EAF2F8",
  font: { name: fontFamily, size: 10, color: "#17324D" },
  verticalAlignment: "center",
};
skcSheet.getRange("A3:D3").values = [[
  "SKC ID 必须保持文本格式。国家价格请到“国家价格”工作表填写，单位统一为 RMB。",
  null,
  null,
  null,
]];
skcSheet.getRange("A3:D3").format = {
  fill: "#FFF8E1",
  font: { name: fontFamily, size: 10, color: "#7A4F00" },
  verticalAlignment: "center",
};
skcSheet.getRange("A4:D4").values = [["货号", "SKC ID", "启用(是/否)", "备注"]];
skcSheet.getRange("A4:D4").format = {
  fill: "#275A7F",
  font: { name: fontFamily, size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
skcSheet.getRange("A4:D4").format.rowHeightPx = 28;
skcSheet.getRange("A5:D1004").values = Array.from(
  { length: 1000 },
  () => ["", "", "是", ""],
);
skcSheet.getRange("A5:D1004").format = {
  fill: "#FFFBEA",
  font: { name: fontFamily, size: 10, color: "#202124" },
  verticalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#DDD6B5" },
};
skcSheet.getRange("A5:B1004").format.numberFormat = "@";
skcSheet.getRange("C5:C1004").format.horizontalAlignment = "center";
skcSheet.getRange("A5:D1004").format.rowHeightPx = 23;
skcSheet.getRange("A1:A1004").format.columnWidthPx = 130;
skcSheet.getRange("B1:B1004").format.columnWidthPx = 205;
skcSheet.getRange("C1:C1004").format.columnWidthPx = 105;
skcSheet.getRange("D1:D1004").format.columnWidthPx = 240;
skcSheet.freezePanes.freezeRows(4);

const countrySheet = workbook.worksheets.add("国家价格");
countrySheet.showGridLines = false;
countrySheet.tabColor = "#3F7D5A";
countrySheet.getRange("A1").values = [
  ["Temu 全球核价助手 · 国家价格"],
];
countrySheet.getRange("A1:H1").format = {
  fill: "#214F3A",
  font: { name: fontFamily, size: 14, bold: true, color: "#FFFFFF" },
  verticalAlignment: "center",
};
countrySheet.getRange("A1:H1").format.rowHeightPx = 34;
countrySheet.getRange("A2:H2").values = [[
  "只处理“启用=是”的国家；空白行忽略。所有价格单位均为 RMB，保留两位小数。",
  null,
  null,
  null,
  null,
  null,
  null,
  null,
]];
countrySheet.getRange("A2:H2").format = {
  fill: "#EAF5EF",
  font: { name: fontFamily, size: 10, color: "#214F3A" },
  verticalAlignment: "center",
};
countrySheet.getRange("A3:H3").values = [[
  "提交价格留空时默认使用最低接受价。提交方式可填：填写方案提交价并提交 / 直接接受平台申报价。",
  null,
  null,
  null,
  null,
  null,
  null,
  null,
]];
countrySheet.getRange("A3:H3").format = {
  fill: "#FFF8E1",
  font: { name: fontFamily, size: 10, color: "#7A4F00" },
  verticalAlignment: "center",
};
countrySheet.getRange("A4:H4").values = [[
  "国家代码",
  "国家名称",
  "分组",
  "启用(是/否)",
  "最低接受价(RMB)",
  "提交价格(RMB)",
  "提交方式",
  "备注",
]];
countrySheet.getRange("A4:H4").format = {
  fill: "#327052",
  font: { name: fontFamily, size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
countrySheet.getRange("A4:H4").format.rowHeightPx = 28;

const countryRows = COUNTRIES.map((country) => [
  country.code,
  country.name,
  country.group,
  "否",
  null,
  null,
  "填写方案提交价并提交",
  null,
]);
countrySheet.getRange("A5:H63").values = countryRows;
countrySheet.getRange("A5:H63").format = {
  fill: "#F1F8F3",
  font: { name: fontFamily, size: 10, color: "#202124" },
  verticalAlignment: "center",
  borders: { preset: "all", style: "thin", color: "#C9DDD1" },
};
countrySheet.getRange("A5:A63").format.numberFormat = "@";
countrySheet.getRange("D5:D63").format.horizontalAlignment = "center";
countrySheet.getRange("E5:F63").format.numberFormat = "#,##0.00";
countrySheet.getRange("E5:F63").format.fill = "#FFF4CE";
countrySheet.getRange("A5:H63").format.rowHeightPx = 24;
countrySheet.getRange("A1:A63").format.columnWidthPx = 95;
countrySheet.getRange("B1:B63").format.columnWidthPx = 120;
countrySheet.getRange("C1:C63").format.columnWidthPx = 100;
countrySheet.getRange("D1:D63").format.columnWidthPx = 105;
countrySheet.getRange("E1:F63").format.columnWidthPx = 145;
countrySheet.getRange("G1:G63").format.columnWidthPx = 220;
countrySheet.getRange("H1:H63").format.columnWidthPx = 200;
countrySheet.freezePanes.freezeRows(4);

workbook.recalculate();

const skcCheck = await workbook.inspect({
  kind: "table",
  range: "SKC导入!A1:D8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 4,
});
console.log(skcCheck.ndjson);

const countryCheck = await workbook.inspect({
  kind: "table",
  range: "国家价格!A1:H63",
  include: "values",
  tableMaxRows: 63,
  tableMaxCols: 8,
  maxChars: 15000,
});
console.log(
  JSON.stringify({
    countryRows: countryRows.length,
    first: countryRows.slice(0, 3),
    last: countryRows.slice(-3),
  }),
);

const skcPreview = await workbook.render({
  sheetName: "SKC导入",
  range: "A1:D20",
  scale: 2,
  format: "png",
});
await fs.writeFile(
  skcPreviewPath,
  new Uint8Array(await skcPreview.arrayBuffer()),
);

const countryPreview = await workbook.render({
  sheetName: "国家价格",
  range: "A1:H20",
  scale: 2,
  format: "png",
});
await fs.writeFile(
  countryPreviewPath,
  new Uint8Array(await countryPreview.arrayBuffer()),
);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
await fs.copyFile(outputPath, extensionAssetPath);
console.log(
  JSON.stringify({
    outputPath,
    extensionAssetPath,
    countryRows: countryRows.length,
    skcInputRows: 1000,
  }),
);
