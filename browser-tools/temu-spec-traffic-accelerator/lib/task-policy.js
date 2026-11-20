import { normalizeSiteName } from "./workbook.js";

export const TERMINAL_STATUSES = new Set([
  "ACTIVE",
  "ALREADY_ACTIVE",
  "NOT_ELIGIBLE",
  "NO_PRODUCT",
  "NO_SITE",
  "SKIPPED_PRICE_LIMIT",
  "SKIPPED_SUBMIT_BUTTON_NOT_FOUND",
  "SUBMITTED_UNVERIFIED",
  "SUBMIT_UNCERTAIN",
  "FAILED",
  "INVALID_INPUT",
]);

export const RESUMABLE_STATUSES = new Set([
  "IMPORTED",
  "LOOKUPING",
  "PROCESSING",
  "CHECKING",
  "FAILED",
  "SUBMIT_UNCERTAIN",
]);

export const LOOKUP_RETRYABLE_CODES = new Set([
  "COMMAND_TIMEOUT",
  "RATE_LIMITED",
  "RESULT_PAGINATION_FAILED",
  "UI_TIMEOUT",
]);

export const SKIPPABLE_PROCESS_ERROR_CODES = new Set([
  "SUBMIT_BUTTON_NOT_FOUND",
]);

export function isSkippableProcessError(error) {
  return SKIPPABLE_PROCESS_ERROR_CODES.has(
    error?.code || error?.details?.causeCode,
  );
}

export function isResumableTask(task) {
  return (
    task.status !== "INVALID_INPUT" &&
    RESUMABLE_STATUSES.has(task.status)
  );
}

export function normalizeStoredTaskSites(tasks) {
  let changed = 0;
  for (const task of tasks) {
    const normalizedSite = normalizeSiteName(task.siteName);
    if (!normalizedSite || normalizedSite === task.siteName) continue;

    task.siteName = normalizedSite;
    changed += 1;
    if (task.status === "NO_SITE") {
      task.status = "IMPORTED";
      task.reason = "站点名称已标准化，等待重新查询";
      task.details = null;
      task.spuId = "";
    }
  }
  return changed;
}

export function normalizeStoredTaskStates(tasks) {
  let changed = 0;
  for (const task of tasks) {
    if (
      task.status === "FAILED" &&
      /^SUBMIT_BUTTON_NOT_FOUND\s*[：:]/.test(task.reason || "")
    ) {
      task.status = "SKIPPED_SUBMIT_BUTTON_NOT_FOUND";
      task.reason = "未找到立即加速按钮，已跳过该站点";
      changed += 1;
    }
  }
  return changed;
}

export function shouldRetryLookupError(error, attempt, maxAttempts) {
  return (
    attempt < maxAttempts &&
    LOOKUP_RETRYABLE_CODES.has(error?.code || error?.details?.causeCode)
  );
}
