import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";

import {
  classifySku,
  groupTasksBySkc,
  normalizeSiteName,
  parseTaskWorkbook,
  summarizeTasks,
} from "../lib/workbook.js";

function workbookBytes(rowsBySheet) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(rowsBySheet)) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      name,
    );
  }
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

test("parses the canonical one-sheet format", () => {
  const data = workbookBytes({
    Tasks: [
      ["SKC ID", "站点", "指定颜色组", "指定规格价格 Y", "通用规格价格 X"],
      ["111111111111", "德国站", "Mixed Color2", 114.25, 118.38],
      ["111111111111", "法国站", "Mixed Color2", 110, 115],
    ],
  });

  const parsed = parseTaskWorkbook(XLSX, data, { region: "EU" });
  assert.equal(parsed.sourceType, "canonical");
  assert.equal(parsed.tasks.length, 2);
  assert.equal(parsed.tasks[0].targetPriceCents, 11425);
  assert.equal(parsed.tasks[0].genericPriceCents, 11838);
  assert.deepEqual(
    parsed.tasks.map((task) => task.siteName),
    ["德国站", "法国站"],
  );
  assert.equal(parsed.tasks[0].skcOrder, 0);
  assert.equal(parsed.tasks[1].skcOrder, 0);
});

test("expands the legacy two-sheet format by SKC and all price sites", () => {
  const data = workbookBytes({
    Sheet1: [
      ["站点", "指定规格价格", "通用规格价格"],
      ["德国", 115, 125],
      ["法国 ", 120, 125],
    ],
    Sheet2: [
      ["序号", "SKC ID"],
      [1, 222222222222],
      [2, 333333333333],
      [3, 111111111111],
    ],
  });

  const parsed = parseTaskWorkbook(XLSX, data, { region: "EU" });
  assert.equal(parsed.sourceType, "legacy-two-sheet");
  assert.equal(parsed.tasks.length, 6);
  assert.deepEqual(parsed.groups.map((group) => group.skcId), [
    "222222222222",
    "333333333333",
    "111111111111",
  ]);
  assert.equal(
    parsed.groups[0].siteTasks
      .map((task) => task.siteName)
      .join(","),
    "德国站,法国站",
  );
});

test("applies the user supplied target color group to imported tasks", () => {
  const data = workbookBytes({
    Tasks: [
      ["SKC ID", "站点", "指定规格价格 Y", "通用规格价格 X"],
      ["111111111111", "德国站", 140, 145],
    ],
  });

  const parsed = parseTaskWorkbook(XLSX, data, {
    region: "EU",
    targetColorGroup: "混合色",
  });
  assert.equal(parsed.tasks[0].targetColorGroup, "混合色");
});

test("normalizes supplier site labels to platform site labels", () => {
  assert.equal(normalizeSiteName("德国"), "德国站");
  assert.equal(normalizeSiteName("  德国站  "), "德国站");
  assert.equal(normalizeSiteName("瑞典 （无偏远）"), "瑞典站");
  assert.equal(normalizeSiteName("捷克"), "捷克站");
});

test("keeps SKC order and processes every site before moving to the next SKC", () => {
  const tasks = [
    { skcId: "B", skcOrder: 1, siteOrder: 1, taskId: "b2", siteName: "法国站" },
    { skcId: "A", skcOrder: 0, siteOrder: 1, taskId: "a2", siteName: "法国站" },
    { skcId: "B", skcOrder: 1, siteOrder: 0, taskId: "b1", siteName: "德国站" },
    { skcId: "A", skcOrder: 0, siteOrder: 0, taskId: "a1", siteName: "德国站" },
  ];

  const groups = groupTasksBySkc(tasks);
  assert.deepEqual(
    groups.flatMap((group) =>
      group.siteTasks.map((task) => `${group.skcId}-${task.siteName}`),
    ),
    ["A-德国站", "A-法国站", "B-德国站", "B-法国站"],
  );
});

test("rejects conflicting duplicate task prices", () => {
  const data = workbookBytes({
    Tasks: [
      ["SKC ID", "站点", "指定颜色组", "指定规格价格 Y", "通用规格价格 X"],
      ["111111111111", "德国站", "Mixed Color2", 115, 125],
      ["111111111111", "德国站", "Mixed Color2", 114.25, 118.38],
    ],
  });

  const parsed = parseTaskWorkbook(XLSX, data, { region: "EU" });
  assert.equal(parsed.tasks.length, 1);
  assert.equal(parsed.conflictRows, 1);
  assert.equal(parsed.tasks[0].status, "INVALID_INPUT");
});

test("identifies every size in the target color group", () => {
  for (const size of ["S", "M", "L", "XL", "XXL", "XXXL"]) {
    assert.equal(
      classifySku({ skuLabel: `${size}-Mixed Color2` }, "Mixed Color2"),
      true,
    );
  }
  assert.equal(
    classifySku({ skuLabel: "M-Mixed Color3" }, "Mixed Color2"),
    false,
  );
  for (const size of ["S", "M", "L", "XL", "XXL", "XXXL"]) {
    assert.equal(
      classifySku({ skuLabel: `混合色-${size}` }, "混合色"),
      true,
    );
  }
  assert.equal(
    classifySku({ skuLabel: "黑色-M" }, "混合色"),
    false,
  );
});

test("counts a missing submit button as skipped progress", () => {
  const summary = summarizeTasks([
    { status: "SKIPPED_SUBMIT_BUTTON_NOT_FOUND" },
    { status: "ACTIVE" },
  ]);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.failed, 0);
  assert.equal(summary.active, 1);
});
