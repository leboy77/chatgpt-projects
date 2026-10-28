import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath =
  "C:/Users/QZJLKJ/Documents/ChatGPT/下架保存/_spreadsheet_edit_dwrg/script_test_input_backup_20261022_144747.xlsx";
const outputPath =
  "C:/Users/QZJLKJ/Documents/ChatGPT/下架保存/_spreadsheet_edit_dwrg/script_final_test.xlsx";
const workDir = "C:/Users/QZJLKJ/Documents/ChatGPT/下架保存/_spreadsheet_edit_dwrg";

const [sourceBlob, outputBlob] = await Promise.all([
  FileBlob.load(sourcePath),
  FileBlob.load(outputPath),
]);
const [sourceWorkbook, outputWorkbook] = await Promise.all([
  SpreadsheetFile.importXlsx(sourceBlob),
  SpreadsheetFile.importXlsx(outputBlob),
]);

const sourceSheet = sourceWorkbook.worksheets.getItem("Sheet1");
const outputSheet = outputWorkbook.worksheets.getItem("Sheet1");
const sourceRange = sourceSheet.getUsedRange();
const outputRange = outputSheet.getUsedRange();
const sourceValues = sourceRange.values;
const outputValues = outputRange.values;
const sourceFormulas = sourceRange.formulas;
const outputFormulas = outputRange.formulas;

function parseNdjson(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const [sourceMeta, outputMeta] = await Promise.all([
  sourceWorkbook.inspect({ kind: "sheet,table", tableMaxRows: 1, tableMaxCols: 2 }),
  outputWorkbook.inspect({ kind: "sheet,table", tableMaxRows: 1, tableMaxCols: 2 }),
]);
const sourceMetaRecords = parseNdjson(sourceMeta.ndjson);
const outputMetaRecords = parseNdjson(outputMeta.ndjson);
const sourceTables = sourceMetaRecords.filter((record) => record.kind === "table");
const outputTables = outputMetaRecords.filter((record) => record.kind === "table");
console.log(JSON.stringify({ sourceTables, outputTables }));

if (sourceWorkbook.worksheets.items.length !== 1 || outputWorkbook.worksheets.items.length !== 1) {
  throw new Error("Worksheet count changed.");
}
if (sourceTables.length !== 1 || outputTables.length !== 1) {
  throw new Error("Table count changed.");
}
if (
  sourceTables[0].address !== outputTables[0].address ||
  sourceTables[0].rows !== outputTables[0].rows ||
  sourceTables[0].cols !== outputTables[0].cols
) {
  throw new Error("Table range changed.");
}
if (JSON.stringify(sourceValues.map((row) => row[0])) !== JSON.stringify(outputValues.map((row) => row[0]))) {
  throw new Error("The sequence column changed.");
}
if (sourceValues[0][1] !== outputValues[0][1]) {
  throw new Error("The title header changed.");
}
if (JSON.stringify(sourceFormulas) !== JSON.stringify(outputFormulas)) {
  throw new Error("Formula cells changed unexpectedly.");
}

for (let index = 1; index < sourceValues.length; index += 1) {
  const sourceTitle = String(sourceValues[index][1] ?? "");
  const outputTitle = String(outputValues[index][1] ?? "");
  const match = sourceTitle.match(/^\s*\d+\.\s*(.*)$/s);
  const expectedTitle = match ? match[1] : sourceTitle;
  if (outputTitle !== expectedTitle || /^\s*\d+\.\s/.test(outputTitle)) {
    throw new Error(`Title cleanup mismatch at B${index + 1}.`);
  }
}

const formulaErrors = await outputWorkbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
});
console.log(formulaErrors.ndjson);

const [sourceStyles, outputStyles] = await Promise.all([
  sourceWorkbook.inspect({
    kind: "computedStyle",
    sheetId: "Sheet1",
    range: sourceRange.address,
    maxChars: 50000,
  }),
  outputWorkbook.inspect({
    kind: "computedStyle",
    sheetId: "Sheet1",
    range: outputRange.address,
    maxChars: 50000,
  }),
]);
const styleMap = (inspection) =>
  new Map(
    parseNdjson(inspection.ndjson)
      .filter((record) => record.kind === "computedStyle")
      .map((record) => {
        const { styleId, ...style } = record.style;
        return [record.for, JSON.stringify(style)];
      }),
  );
const sourceStyleMap = styleMap(sourceStyles);
const outputStyleMap = styleMap(outputStyles);
if (sourceStyleMap.size !== outputStyleMap.size) {
  throw new Error("Styled-cell coverage changed.");
}
for (const [cell, style] of sourceStyleMap) {
  if (outputStyleMap.get(cell) !== style) {
    throw new Error(`Cell style changed at ${cell}.`);
  }
}
console.log(`Cell styles checked: ${sourceStyleMap.size}`);

const preview = await outputWorkbook.render({
  sheetName: "Sheet1",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  `${workDir}/saved_verified_Sheet1.png`,
  new Uint8Array(await preview.arrayBuffer()),
);

console.log(
  JSON.stringify({
    sheets: outputWorkbook.worksheets.items.map((sheet) => sheet.name),
    range: outputSheet.getUsedRange().address,
    table: outputTables[0].address,
    titlesChecked: sourceValues.length - 1,
    numberedTitlesRemaining: outputValues
      .slice(1)
      .filter(([, title]) => /^\s*\d+\.\s/.test(String(title ?? ""))).length,
  }),
);
