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
assert.deepStrictEqual(
  TemuCommon.parseSpuIdText(
    "SPU: 50802424143\n49410635889, 50802424143; 1\n58537102830"
  ),
  {
    values: ["50802424143", "49410635889", "58537102830"],
    duplicates: 1,
    ignored: 1
  }
);
assert.strictEqual(
  TemuCommon.clampTimeoutMs(45000, 15, 120, 22000),
  45000
);
assert.strictEqual(
  TemuCommon.clampTimeoutMs(15, 15, 120, 22000),
  15000
);
assert.strictEqual(
  TemuCommon.clampTimeoutMs("invalid", 15, 120, 22000),
  22000
);

const directAoa = [
  ["序号", "SPU ID", "状态"],
  [1, "50802424143", ""],
  [2, "49410635889", ""],
  [3, "50802424143", ""],
  [4, "123", ""],
  [5, "", ""]
];
const directRows = TemuCommon.buildTaskRowsFromAoa(
  directAoa,
  { serial: 0, input: 1, status: 2 },
  "SPU"
);
assert.strictEqual(directRows.filter((row) => !row.skip).length, 2);
assert.strictEqual(directRows[0].inputId, "50802424143");
assert.strictEqual(directRows[1].inputId, "49410635889");
assert.strictEqual(directRows[2].status, "重复，已跳过");
assert.strictEqual(directRows[3].status, "SPU格式异常");
assert.strictEqual(directRows.length, 4);

const workbookPath = path.join(__dirname, "sample-spu.xlsx");
const workbook = XLSX.read(fs.readFileSync(workbookPath), { type: "buffer" });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

assert.deepStrictEqual(rows[0], ["序号", "SPU ID", "状态"]);
assert.strictEqual(String(rows[1][1]), "9653883371");
assert.strictEqual(rows.length, 4);
const sampleTaskRows = TemuCommon.buildTaskRowsFromAoa(
  rows,
  { serial: 0, input: 1, status: 2 },
  "SPU"
);
assert.strictEqual(sampleTaskRows[0].inputId, "9653883371");
assert.ok(sampleTaskRows.filter((row) => !row.skip).length >= 1);

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
