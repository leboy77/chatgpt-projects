import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/QZJLKJ/Desktop/DWRG标题.xlsx";
const workDir = "C:/Users/QZJLKJ/Documents/ChatGPT/下架保存/_spreadsheet_edit_dwrg";
const outputPath = `${workDir}/DWRG标题_已清理.xlsx`;

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheet = workbook.worksheets.getItem("Sheet1");
const usedRange = sheet.getUsedRange();
const usedValues = usedRange.values;
const lastRow = usedValues.length;
const titleRange = sheet.getRange(`B2:B${lastRow}`);
const originalTitles = titleRange.values.map(([value]) => String(value ?? ""));

const prefixPattern = /^\s*(\d+)\.\s*(.*)$/s;
let cleanedCount = 0;
const cleanedTitles = originalTitles.map((title, index) => {
  const match = title.match(prefixPattern);
  if (!match) {
    return title;
  }
  if (!match[2]) {
    throw new Error(`Title text would be empty at B${index + 2}`);
  }
  cleanedCount += 1;
  return match[2];
});

titleRange.values = cleanedTitles.map((title) => [title]);
workbook.recalculate();

const inspection = await workbook.inspect({
  kind: "table",
  range: `Sheet1!A1:B${lastRow}`,
  include: "values",
  tableMaxRows: lastRow,
  tableMaxCols: 2,
  tableMaxCellChars: 240,
});
console.log(inspection.ndjson);

const preview = await workbook.render({
  sheetName: "Sheet1",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  `${workDir}/after_Sheet1.png`,
  new Uint8Array(await preview.arrayBuffer()),
);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`Cleaned title prefixes: ${cleanedCount}`);
console.log(`Saved: ${outputPath}`);
