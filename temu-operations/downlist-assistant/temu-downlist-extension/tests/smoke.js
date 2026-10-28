const assert = require("assert");
const fs = require("fs");
const path = require("path");
const XLSX = require("../vendor/xlsx.full.min.js");

require("../shared.js");

assert.strictEqual(TemuCommon.deriveCategoryCode("CXTX9"), "CXTX");
assert.strictEqual(TemuCommon.deriveCategoryCode("CXTX9", "CUSTOM"), "CUSTOM");
assert.strictEqual(TemuCommon.normalizeHeader("skc ID"), "skcid");
assert.strictEqual(TemuCommon.stripImageQuery("https://img.kwcdn.com/a.jpeg?x=1"), "https://img.kwcdn.com/a.jpeg");
assert.strictEqual(TemuCommon.statusIsSuccessful("下架成功"), true);

const workbookPath = path.join(__dirname, "sample-spu.xlsx");
const workbook = XLSX.read(fs.readFileSync(workbookPath), { type: "buffer" });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

assert.deepStrictEqual(rows[0], ["序号", "SPU ID", "状态"]);
assert.strictEqual(String(rows[1][1]), "9653883371");
assert.strictEqual(rows.length, 4);

const templatePath = path.join(__dirname, "..", "templates", "下架SPU模板.xlsx");
const templateWorkbook = XLSX.read(fs.readFileSync(templatePath), { type: "buffer" });
const templateSheet = templateWorkbook.Sheets[templateWorkbook.SheetNames[0]];
const templateRows = XLSX.utils.sheet_to_json(templateSheet, {
  header: 1,
  defval: "",
  raw: false
});

assert.deepStrictEqual(templateRows[0].slice(0, 3), ["序号", "SPU ID", "状态"]);
assert.strictEqual(templateRows.length, 101);
assert.strictEqual(templateRows[1][0], "1");
assert.strictEqual(templateRows[1][1], "");
assert.strictEqual(templateSheet["B2"].t, "s");

console.log("Smoke tests passed.");
