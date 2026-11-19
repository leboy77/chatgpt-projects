import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { readWorkbook, readZipEntries, unzipEntry } = require("../sidepanel/xlsx-reader.js");
const buffer = await readFile(
  "C:\\Users\\QZJLKJ\\Downloads\\7414\\Temu全球核价助手_导入模板_v2 (2).xlsx",
);
const standardBuffer = await readFile(
  "assets/templates/standard-traffic-template.xlsx",
);
const workbook = await readWorkbook(buffer);
const standardWorkbook = await readWorkbook(standardBuffer);
const zip = readZipEntries(buffer);
const workbookXml = await unzipEntry(
  zip,
  zip.entries.find((entry) => entry.name === "xl/workbook.xml"),
);
const relationshipsXml = await unzipEntry(
  zip,
  zip.entries.find((entry) => entry.name === "xl/_rels/workbook.xml.rels"),
);
if (
  standardWorkbook.countries.length !== 59 ||
  standardWorkbook.countries.filter((row) => row.enabled).length !== 0 ||
  standardWorkbook.countries.some(
    (row) => row.targetPrice !== null || row.otherPrice !== null,
  ) ||
  !standardWorkbook.countries.every(
    (row) => row.submitMode === "指定规格批量加速",
  ) ||
  standardWorkbook.productIdRows.length !== 0 ||
  !standardWorkbook.sheets.includes("商品ID导入")
) {
  throw new Error(
    `Unexpected standard template result: ${JSON.stringify(standardWorkbook)}`,
  );
}
console.log(
  JSON.stringify(
    {
      sheets: workbook.sheets,
      entries: zip.entries.map((entry) => entry.name),
      workbookXml: workbookXml.slice(0, 2000),
      relationshipsXml: relationshipsXml.slice(0, 2000),
      countries: workbook.countries.length,
      enabledCountries: workbook.countries.filter((row) => row.enabled).length,
      skcRows: workbook.skcRows.length,
      firstCountry: workbook.countries[0],
      firstSkc: workbook.skcRows[0],
      standardTemplate: {
        sheets: standardWorkbook.sheets,
        countries: standardWorkbook.countries.length,
        enabledCountries: standardWorkbook.countries.filter(
          (row) => row.enabled,
        ).length,
        skcRows: standardWorkbook.skcRows.length,
        productIdRows: standardWorkbook.productIdRows.length,
        bytes: standardBuffer.length,
      },
    },
    null,
    2,
  ),
);
