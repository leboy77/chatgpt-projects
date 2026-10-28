import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = path.resolve(
  "outputs",
  "01a162b3-08c8-7590-b359-1c4c46f2e054",
);
const templatePath = path.join(
  outputDir,
  "Temu全球核价助手_导入模板_v2.xlsx",
);
const sourcePath =
  "C:\\Users\\QZJLKJ\\Downloads\\7414\\Temu全局核价_SKC导入模板_1000条 (1).xlsx";
const outputPath = path.join(outputDir, "import-smoke-filled.xlsx");

const source = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const sourceSheet = source.worksheets.getItemAt(0);
const sourceRows = sourceSheet.getRange("A5:D104").values;

const workbook = await SpreadsheetFile.importXlsx(
  await FileBlob.load(templatePath),
);
const skcSheet = workbook.worksheets.getItem("SKC导入");
skcSheet.getRange("A5:D104").values = sourceRows;

const countrySheet = workbook.worksheets.getItem("国家价格");
countrySheet.getRange("D6").values = [["是"]];
countrySheet.getRange("D8").values = [["是"]];
countrySheet.getRange("E6").values = [[120]];
countrySheet.getRange("E8").values = [[130]];
countrySheet.getRange("F6").values = [[118]];
countrySheet.getRange("F8").values = [[128]];

workbook.recalculate();
const output = await SpreadsheetFile.exportXlsx(workbook);
await fs.mkdir(outputDir, { recursive: true });
await output.save(outputPath);
console.log(JSON.stringify({ outputPath }));
