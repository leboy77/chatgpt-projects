import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve(
  "outputs",
  "01a162b3-08c8-7590-b359-1c4c46f2e054",
);
const outputPath = path.join(outputDir, "Temu全局核价_SKC导入模板.xlsx");
const previewPath = path.join(outputDir, "Temu全局核价_SKC导入模板_preview.png");
const extensionAssetPath = path.resolve(
  "extension-src",
  "assets",
  "skc-template-1000.xlsx",
);
const fontFamily = "Arial";

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(path.dirname(extensionAssetPath), { recursive: true });

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("核价模板");
sheet.showGridLines = false;
sheet.tabColor = "#17324D";

sheet.getRange("A1").values = [["Temu 全球价格申报 · SKC 导入模板"]];
sheet.getRange("A1:D1").format = {
  fill: "#17324D",
  font: { name: fontFamily, size: 14, bold: true, color: "#FFFFFF" },
  verticalAlignment: "center",
};
sheet.getRange("A1:D1").format.rowHeightPx = 34;

sheet.getRange("A2:D2").values = [[
  "填写规则：同一文件只填一个货号；有效 SKC 最多 1000 条；程序自动按每 50 条分批。",
  null,
  null,
  null,
]];
sheet.getRange("A2:D2").format = {
  fill: "#EAF2F8",
  font: { name: fontFamily, size: 10, color: "#17324D" },
  verticalAlignment: "center",
  wrapText: false,
};
sheet.getRange("A2:D2").format.rowHeightPx = 24;

sheet.getRange("A3:D3").values = [[
  "如 SKC ID 显示为科学计数法，请先把 B 列单元格格式改为“文本”，再重新粘贴。",
  null,
  null,
  null,
]];
sheet.getRange("A3:D3").format = {
  fill: "#FFF8E1",
  font: { name: fontFamily, size: 10, color: "#7A4F00" },
  verticalAlignment: "center",
};
sheet.getRange("A3:D3").format.rowHeightPx = 24;

sheet.getRange("A4:D4").values = [["货号", "SKC ID", "启用(是/否)", "备注"]];
sheet.getRange("A4:D4").format = {
  fill: "#275A7F",
  font: { name: fontFamily, size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
sheet.getRange("A4:D4").format.rowHeightPx = 28;

const inputRows = Array.from({ length: 1000 }, () => ["", "", "是", ""]);
sheet.getRange("A5:D1004").values = inputRows;
sheet.getRange("A5:D1004").format = {
  fill: "#FFFBEA",
  font: { name: fontFamily, size: 10, color: "#202124" },
  verticalAlignment: "center",
  borders: {
    preset: "all",
    style: "thin",
    color: "#DDD6B5",
  },
};
sheet.getRange("A5:B1004").format.numberFormat = "@";
sheet.getRange("C5:C1004").format = {
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
sheet.getRange("A5:D1004").format.rowHeightPx = 23;

sheet.getRange("A1:A1004").format.columnWidthPx = 130;
sheet.getRange("B1:B1004").format.columnWidthPx = 205;
sheet.getRange("C1:C1004").format.columnWidthPx = 105;
sheet.getRange("D1:D1004").format.columnWidthPx = 240;
sheet.freezePanes.freezeRows(4);

workbook.recalculate();

const check = await workbook.inspect({
  kind: "table",
  range: "核价模板!A1:D7",
  include: "values,formulas",
  tableMaxRows: 7,
  tableMaxCols: 4,
});
console.log(check.ndjson);

const bottomCheck = await workbook.inspect({
  kind: "table",
  range: "核价模板!A997:D1004",
  include: "values",
  tableMaxRows: 8,
  tableMaxCols: 4,
});
console.log(bottomCheck.ndjson);

const preview = await workbook.render({
  sheetName: "核价模板",
  range: "A1:D20",
  scale: 2,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
await fs.copyFile(outputPath, extensionAssetPath);
console.log(
  JSON.stringify({
    outputPath,
    previewPath,
    extensionAssetPath,
    inputRows: inputRows.length,
    batchesAt50: Math.ceil(inputRows.length / 50),
  }),
);
