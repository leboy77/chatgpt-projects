import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isSkippableProcessError,
  isResumableTask,
  normalizeStoredTaskSites,
  normalizeStoredTaskStates,
  shouldRetryLookupError,
} from "../lib/task-policy.js";

test("normalizes persisted site names and reopens stale no-site tasks", () => {
  const tasks = [
    {
      taskId: "de",
      siteName: "德国",
      status: "NO_SITE",
      reason: "当前 SKC 未进入该站点",
    },
    {
      taskId: "se",
      siteName: "瑞典 （无偏远）",
      status: "FAILED",
      reason: "COMMAND_TIMEOUT",
    },
  ];

  assert.equal(normalizeStoredTaskSites(tasks), 2);
  assert.equal(tasks[0].siteName, "德国站");
  assert.equal(tasks[0].status, "IMPORTED");
  assert.equal(tasks[1].siteName, "瑞典站");
  assert.equal(tasks[1].status, "FAILED");
});

test("resume keeps completed tasks and selects pending or retryable tasks", () => {
  assert.equal(isResumableTask({ status: "IMPORTED" }), true);
  assert.equal(isResumableTask({ status: "FAILED" }), true);
  assert.equal(isResumableTask({ status: "SUBMIT_UNCERTAIN" }), true);
  assert.equal(isResumableTask({ status: "ACTIVE" }), false);
  assert.equal(isResumableTask({ status: "SKIPPED_PRICE_LIMIT" }), false);
  assert.equal(
    isResumableTask({ status: "SKIPPED_SUBMIT_BUTTON_NOT_FOUND" }),
    false,
  );
  assert.equal(isResumableTask({ status: "NO_SITE" }), false);
});

test("treats a missing final submit button as a skippable site error", () => {
  assert.equal(
    isSkippableProcessError({ code: "SUBMIT_BUTTON_NOT_FOUND" }),
    true,
  );
  assert.equal(
    isSkippableProcessError({ code: "SUBMIT_CONFIRM_NOT_FOUND" }),
    false,
  );
});

test("migrates old missing-button failures to terminal skipped tasks", () => {
  const tasks = [
    {
      status: "FAILED",
      reason: "SUBMIT_BUTTON_NOT_FOUND：未找到立即加速按钮",
    },
    {
      status: "FAILED",
      reason: "TARGET_SKU_NOT_FOUND：未找到指定颜色组",
    },
  ];

  assert.equal(normalizeStoredTaskStates(tasks), 1);
  assert.equal(tasks[0].status, "SKIPPED_SUBMIT_BUTTON_NOT_FOUND");
  assert.equal(tasks[0].reason, "未找到立即加速按钮，已跳过该站点");
  assert.equal(tasks[1].status, "FAILED");
});

test("retries only transient lookup failures and stops at the attempt limit", () => {
  assert.equal(
    shouldRetryLookupError({ code: "COMMAND_TIMEOUT" }, 1, 2),
    true,
  );
  assert.equal(
    shouldRetryLookupError({ code: "COMMAND_TIMEOUT" }, 2, 3),
    true,
  );
  assert.equal(
    shouldRetryLookupError({ code: "COMMAND_TIMEOUT" }, 3, 3),
    false,
  );
  assert.equal(
    shouldRetryLookupError({ code: "SEARCH_INPUT_NOT_FOUND" }, 1, 2),
    false,
  );
  assert.equal(
    shouldRetryLookupError({ code: "RESULT_PAGINATION_FAILED" }, 1, 3),
    true,
  );
});

test("panel imports the retryable lookup policy it uses", () => {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const panelSource = fs.readFileSync(
    path.join(root, "panel", "panel.js"),
    "utf8",
  );

  assert.match(panelSource, /\bLOOKUP_RETRYABLE_CODES\b/);
  assert.match(
    panelSource,
    /import\s*\{[\s\S]*?\bLOOKUP_RETRYABLE_CODES\b[\s\S]*?\}\s*from\s*"\.\.\/lib\/task-policy\.js"/,
  );
});
