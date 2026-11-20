import {
  DEFAULT_TARGET_GROUP,
  REGION_LABELS,
  centsToPrice,
  groupTasksBySkc,
  parseTaskWorkbook,
  summarizeTasks,
} from "../lib/workbook.js";
import {
  LOOKUP_RETRYABLE_CODES,
  TERMINAL_STATUSES,
  isSkippableProcessError,
  isResumableTask,
  normalizeStoredTaskSites as normalizeTaskSites,
  normalizeStoredTaskStates,
  shouldRetryLookupError,
} from "../lib/task-policy.js";
import {
  buildFinalPriceRows,
  formatFinalPriceDetails,
} from "../lib/result-export.js";

const CHANNEL = "temu-spec-accelerator-v1";
const STORAGE_KEY = "temuSpecAcceleratorState";

const STATUS_LABELS = {
  IMPORTED: "待执行",
  INVALID_INPUT: "输入无效",
  LOOKUPING: "查询中",
  ELIGIBLE: "可开启",
  PROCESSING: "执行中",
  CHECKING: "回查中",
  ACTIVE: "已加速",
  ALREADY_ACTIVE: "已加速",
  NOT_ELIGIBLE: "未获取资格",
  NO_PRODUCT: "未找到 SKC",
  NO_SITE: "未进入站点",
  SKIPPED_PRICE_LIMIT: "已跳过·价格超限",
  SKIPPED_SUBMIT_BUTTON_NOT_FOUND: "已跳过·无立即加速按钮",
  SUBMITTED: "已提交待验证",
  SUBMITTED_UNVERIFIED: "已提交待复核",
  SUBMIT_UNCERTAIN: "提交结果未知",
  FAILED: "失败",
};

const LOOKUP_MAX_ATTEMPTS = 3;
const LOOKUP_TIMEOUT_MS = 130000;
const MAX_VISIBLE_TASK_ROWS = 240;
const RENDER_DELAY_MS = 180;
const PERSIST_DELAY_MS = 1000;

const FATAL_ERROR_CODES = new Set([
  "WRONG_PAGE",
  "REGION_NOT_FOUND",
  "SEARCH_INPUT_NOT_FOUND",
  "QUERY_BUTTON_NOT_FOUND",
  "RESULT_PAGINATION_FAILED",
  "UI_TIMEOUT",
  "UI_VERSION_CHANGED",
  "ACCELERATION_MODAL_NOT_FOUND",
  "PRICE_ROWS_NOT_FOUND",
  "PRICE_CONFIRM_NOT_FOUND",
  "SUBMIT_CONFIRM_NOT_FOUND",
]);

const elements = {
  connectionBadge: document.querySelector("#connectionBadge"),
  regionSelect: document.querySelector("#regionSelect"),
  targetGroupInput: document.querySelector("#targetGroupInput"),
  fileInput: document.querySelector("#fileInput"),
  startButton: document.querySelector("#startButton"),
  pauseButton: document.querySelector("#pauseButton"),
  stopButton: document.querySelector("#stopButton"),
  exportButton: document.querySelector("#exportButton"),
  sourceSummary: document.querySelector("#sourceSummary"),
  runState: document.querySelector("#runState"),
  stats: document.querySelector("#stats"),
  currentGroup: document.querySelector("#currentGroup"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  taskRows: document.querySelector("#taskRows"),
  taskCount: document.querySelector("#taskCount"),
  notice: document.querySelector("#notice"),
};

const state = {
  region: "EU",
  targetColorGroup: DEFAULT_TARGET_GROUP,
  tasks: [],
  fileMeta: null,
  connected: false,
  running: false,
  paused: false,
  stopRequested: false,
  currentGroupIndex: 0,
  currentTask: null,
  runLabel: "空闲",
};

const pendingCommands = new Map();
let commandCounter = 0;
let noticeTimer = null;
let renderTimer = null;
let persistTimer = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTargetColorGroup(value) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sendCommand(name, payload = {}, timeoutMs = 45000) {
  const requestId = `req-${Date.now()}-${++commandCounter}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCommands.delete(requestId);
      reject(
        Object.assign(new Error(`页面命令超时：${name}`), {
          code: "COMMAND_TIMEOUT",
        }),
      );
    }, timeoutMs);

    pendingCommands.set(requestId, { resolve, reject, timeout });
    window.parent.postMessage(
      {
        channel: CHANNEL,
        type: "command",
        requestId,
        name,
        payload,
      },
      "*",
    );
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  if (event.data?.channel !== CHANNEL) return;
  if (event.data?.type !== "response") return;

  const pending = pendingCommands.get(event.data.requestId);
  if (!pending) return;
  pendingCommands.delete(event.data.requestId);
  clearTimeout(pending.timeout);

  if (event.data.ok) {
    pending.resolve(event.data.result);
    return;
  }

  const error = Object.assign(
    new Error(event.data.error?.message || "页面操作失败"),
    {
      code: event.data.error?.code || "PAGE_ERROR",
      details: event.data.error?.details || null,
    },
  );
  pending.reject(error);
});

function showNotice(message, type = "info") {
  clearTimeout(noticeTimer);
  elements.notice.className = `notice visible notice-${type}`;
  elements.notice.textContent = message;
  if (type !== "error") {
    noticeTimer = setTimeout(() => {
      elements.notice.className = "notice";
      elements.notice.textContent = "";
    }, 7000);
  }
}

function setConnection(connected, text) {
  state.connected = connected;
  elements.connectionBadge.textContent = text;
  elements.connectionBadge.className = `badge ${
    connected ? "badge-ready" : "badge-error"
  }`;
}

function getStatusClass(status) {
  if (["ACTIVE", "ALREADY_ACTIVE"].includes(status)) return "status-success";
  if (
    [
      "LOOKUPING",
      "ELIGIBLE",
      "PROCESSING",
      "CHECKING",
      "SUBMITTED",
    ].includes(status)
  ) {
    return "status-running";
  }
  if (
    [
      "SKIPPED_PRICE_LIMIT",
      "SKIPPED_SUBMIT_BUTTON_NOT_FOUND",
      "NO_SITE",
      "NOT_ELIGIBLE",
      "NO_PRODUCT",
    ].includes(status)
  ) {
    return "status-skip";
  }
  if (
    [
      "FAILED",
      "SUBMITTED_UNVERIFIED",
      "SUBMIT_UNCERTAIN",
      "INVALID_INPUT",
    ].includes(status)
  ) {
    return "status-error";
  }
  return "status-pending";
}

function getTaskReason(task) {
  if (task.reason) return task.reason;
  if (task.validationErrors?.length) return task.validationErrors.join("；");
  return "";
}

function formatFinalPrices(task) {
  return formatFinalPriceDetails(task.details?.finalPrices);
}

function completedCount() {
  return state.tasks.filter((task) => TERMINAL_STATUSES.has(task.status)).length;
}

function normalizeStoredTaskSites() {
  const changed = normalizeTaskSites(state.tasks);

  if (changed && state.fileMeta) {
    state.fileMeta.siteOrder = [
      ...new Set(state.tasks.map((task) => task.siteName)),
    ];
  }
  return changed;
}

function renderTaskRows() {
  const total = state.tasks.length;
  if (!state.tasks.length) {
    elements.taskCount.textContent = "0 条";
    elements.taskRows.innerHTML =
      '<tr><td colspan="5" class="empty">导入 Excel 后显示任务</td></tr>';
    return;
  }

  const currentIndex = state.currentTask
    ? state.tasks.indexOf(state.currentTask)
    : 0;
  const start = Math.max(
    0,
    Math.min(
      Math.max(0, currentIndex - Math.floor(MAX_VISIBLE_TASK_ROWS / 3)),
      total - MAX_VISIBLE_TASK_ROWS,
    ),
  );
  const visibleTasks = state.tasks.slice(
    start,
    start + MAX_VISIBLE_TASK_ROWS,
  );
  elements.taskCount.textContent =
    visibleTasks.length === total
      ? `${total} 条`
      : `${total} 条 · 当前显示 ${start + 1}-${start + visibleTasks.length}`;

  const html = visibleTasks
    .map((task) => {
      const statusLabel = STATUS_LABELS[task.status] || task.status;
      const reason = getTaskReason(task);
      return `
        <tr>
          <td>${escapeHtml(task.skcId)}</td>
          <td>${escapeHtml(task.siteName)}</td>
          <td>${escapeHtml(centsToPrice(task.targetPriceCents))} / ${escapeHtml(
            centsToPrice(task.genericPriceCents),
          )}</td>
          <td><span class="status ${getStatusClass(task.status)}">${escapeHtml(
            statusLabel,
          )}</span></td>
          <td title="${escapeHtml(reason)}">${escapeHtml(reason || "—")}</td>
        </tr>
      `;
    })
    .join("");
  elements.taskRows.innerHTML = html;
}

function renderStats() {
  const summary = summarizeTasks(state.tasks);
  const items = [
    ["总数", summary.total],
    ["已加速", summary.active],
    ["跳过", summary.skipped],
    ["失败", summary.failed],
  ];
  elements.stats.innerHTML = items
    .map(
      ([label, value]) =>
        `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`,
    )
    .join("");
}

function renderControls() {
  const resumableCount = state.tasks.filter(isResumableTask).length;
  const hasRunnableTasks = resumableCount > 0;
  elements.startButton.disabled = state.running || !hasRunnableTasks;
  elements.startButton.textContent =
    resumableCount > 0 &&
    state.tasks.some((task) => TERMINAL_STATUSES.has(task.status))
      ? `继续执行 (${resumableCount})`
      : "开始执行";
  elements.pauseButton.hidden = !state.running;
  elements.stopButton.hidden = !state.running;
  elements.exportButton.disabled = !state.tasks.length;
  elements.fileInput.disabled = state.running;
  elements.regionSelect.disabled = state.running;
  elements.targetGroupInput.disabled = state.running;
  elements.pauseButton.textContent = state.paused ? "继续" : "暂停";
  elements.stopButton.textContent = state.stopRequested ? "停止中" : "停止";
  elements.startButton.disabled =
    state.running || !hasRunnableTasks || !state.connected;

  elements.runState.textContent = state.runLabel;
  elements.runState.className = `badge ${
    state.running ? "badge-running" : state.tasks.length ? "badge-ready" : "badge-muted"
  }`;
}

function renderProgress() {
  const total = state.tasks.length;
  const completed = completedCount();
  const percent = total ? Math.round((completed / total) * 100) : 0;
  elements.progressBar.style.width = `${percent}%`;
  elements.progressText.textContent = `${completed} / ${total} 站点`;
  elements.currentGroup.textContent = state.currentTask
    ? `${state.currentTask.skcId} · ${state.currentTask.siteName}`
    : "等待任务";
}

function render() {
  renderControls();
  renderStats();
  renderProgress();
  renderTaskRows();
}

async function persistState() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        region: state.region,
        targetColorGroup: state.targetColorGroup,
        tasks: state.tasks,
        fileMeta: state.fileMeta,
        updatedAt: Date.now(),
      },
    });
  } catch (error) {
    console.warn("[流量加速器] 保存状态失败", error);
  }
}

function scheduleRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(() => {
    renderTimer = null;
    render();
  }, RENDER_DELAY_MS);
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistState();
  }, PERSIST_DELAY_MS);
}

async function flushStateUpdates() {
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  render();
  await persistState();
}

async function restoreState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const snapshot = stored[STORAGE_KEY];
  if (!snapshot) return;
  if (snapshot.region && REGION_LABELS[snapshot.region]) {
    state.region = snapshot.region;
    elements.regionSelect.value = state.region;
  }
  if (Array.isArray(snapshot.tasks)) state.tasks = snapshot.tasks;
  if (snapshot.fileMeta) state.fileMeta = snapshot.fileMeta;
  state.targetColorGroup =
    normalizeTargetColorGroup(
      snapshot.targetColorGroup || state.tasks[0]?.targetColorGroup,
    ) || DEFAULT_TARGET_GROUP;
  elements.targetGroupInput.value = state.targetColorGroup;

  const normalizedSites = normalizeStoredTaskSites();
  const normalizedStates = normalizeStoredTaskStates(state.tasks);
  for (const task of state.tasks) {
    if (
      ["LOOKUPING", "PROCESSING", "CHECKING", "SUBMITTED"].includes(
        task.status,
      )
    ) {
      task.status = "IMPORTED";
      task.reason = "上次运行中断，等待重新执行";
    }
  }

  if (state.tasks.length) {
    elements.sourceSummary.textContent = `${state.fileMeta?.name || "已保存任务"} · 已恢复 ${
      state.tasks.length
    } 条任务 · ${state.tasks.filter(isResumableTask).length} 条可继续`;
    state.runLabel = "已恢复";
  }
  if (normalizedSites > 0 || normalizedStates > 0) {
    showNotice(
      normalizedSites > 0
        ? `已统一 ${normalizedSites} 条任务的站点名称，因旧名称未匹配的站点会自动重新查询。`
        : `已将 ${normalizedStates} 条“无立即加速按钮”旧失败任务改为跳过。`,
      "info",
    );
    await persistState();
  }
  render();
}

function updateTask(taskId, patch) {
  const task = state.tasks.find((item) => item.taskId === taskId);
  if (!task) return;
  Object.assign(task, patch);
  state.currentTask = task;
  scheduleRender();
  schedulePersist();
}

async function handleFile(file) {
  if (state.running) return;
  if (!file) return;
  if (!window.XLSX) {
    throw new Error("Excel 解析库未加载");
  }

  const targetColorGroup = normalizeTargetColorGroup(
    elements.targetGroupInput.value,
  );
  if (!targetColorGroup) {
    throw new Error("请先填写指定规格 / 颜色组");
  }
  state.targetColorGroup = targetColorGroup;

  const data = await file.arrayBuffer();
  const parsed = parseTaskWorkbook(window.XLSX, data, {
    region: state.region,
    targetColorGroup: state.targetColorGroup,
  });

  state.tasks = parsed.tasks;
  state.fileMeta = {
    name: file.name,
    importedAt: Date.now(),
    sourceType: parsed.sourceType,
    sourceSheets: parsed.sourceSheets,
    siteOrder: parsed.siteOrder,
    duplicateRows: parsed.duplicateRows,
    conflictRows: parsed.conflictRows,
  };
  state.runLabel = "待执行";
  state.currentTask = null;

  const mode =
    parsed.sourceType === "legacy-two-sheet" ? "双表自动展开" : "逐行任务";
  elements.sourceSummary.textContent = `${file.name} · ${mode} · 指定规格 ${state.targetColorGroup} · ${parsed.siteOrder.join(
    "、",
  )} · ${state.tasks.length} 条任务`;
  render();
  await persistState();

  const issueText =
    parsed.conflictRows > 0
      ? `，发现 ${parsed.conflictRows} 条冲突任务，已标记为输入无效`
      : parsed.duplicateRows > 0
        ? `，合并 ${parsed.duplicateRows} 条重复任务`
        : "";
  showNotice(
    `已导入 ${state.tasks.length} 条任务${issueText}。点击“开始执行”后将自动运行。`,
    parsed.conflictRows > 0 ? "error" : "success",
  );
}

async function waitWhilePaused() {
  while (state.paused && !state.stopRequested) {
    await sleep(300);
  }
  return !state.stopRequested;
}

function errorCode(error) {
  return error?.code || "UNEXPECTED_ERROR";
}

function errorText(error) {
  const code = errorCode(error);
  return `${code}：${error?.message || String(error)}`;
}

async function markGroupFailed(group, error) {
  for (const task of group.siteTasks) {
    if (task.status === "INVALID_INPUT") continue;
    updateTask(task.taskId, {
      status: "FAILED",
      reason: errorText(error),
    });
  }
}

async function lookupSkcWithRetry(group) {
  let lastError = null;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= LOOKUP_MAX_ATTEMPTS; attempt += 1) {
    attemptsMade = attempt;
    for (const task of group.siteTasks) {
      if (task.status === "INVALID_INPUT") continue;
      updateTask(task.taskId, {
        status: "LOOKUPING",
        reason:
          attempt === 1
            ? "查询当前 SKC 的站点结果"
            : `查询超时，正在第 ${attempt}/${LOOKUP_MAX_ATTEMPTS} 次重试`,
      });
    }

    try {
      return await sendCommand(
        "LOOKUP_SKC",
        { region: state.region, skcId: group.skcId },
        LOOKUP_TIMEOUT_MS,
      );
    } catch (error) {
      lastError = error;
      if (!shouldRetryLookupError(error, attempt, LOOKUP_MAX_ATTEMPTS)) break;
      await sleep(attempt === 1 ? 2000 : 5000);
    }
  }

  throw Object.assign(
    new Error(
      `查询 SKC ${group.skcId} 失败，连续尝试 ${attemptsMade} 次后仍无结果：${
        lastError?.message || "未知错误"
      }`,
    ),
    {
      code: "LOOKUP_RETRY_EXHAUSTED",
      details: {
        skcId: group.skcId,
        causeCode: errorCode(lastError),
        attemptsMade,
      },
    },
  );
}

async function processGroup(group, groupIndex, totalGroups) {
  state.currentGroupIndex = groupIndex;
  const runnableTasks = group.siteTasks.filter(
    (task) => task.status !== "INVALID_INPUT",
  );
  if (!runnableTasks.length) return { fatal: false };

  let lookup;
  try {
    lookup = await lookupSkcWithRetry(group);
  } catch (error) {
    await markGroupFailed(group, error);
    await flushStateUpdates();
    const causeCode = error?.details?.causeCode || errorCode(error);
    return {
      fatal:
        FATAL_ERROR_CODES.has(causeCode) &&
        !LOOKUP_RETRYABLE_CODES.has(causeCode),
      error,
    };
  }

  if (!lookup.total || !Object.keys(lookup.sites || {}).length) {
    for (const task of runnableTasks) {
      updateTask(task.taskId, {
        status: "NO_PRODUCT",
        reason: "当前区域未找到该 SKC",
      });
    }
    await flushStateUpdates();
    return { fatal: false };
  }

  let fatalError = null;
  for (const task of group.siteTasks) {
    if (task.status === "INVALID_INPUT") continue;
    state.currentTask = task;
    render();

    if (!(await waitWhilePaused())) break;
    const site = lookup.sites?.[task.siteName];

    if (!site) {
      updateTask(task.taskId, {
        status: "NO_SITE",
        reason: "当前 SKC 未进入该站点",
      });
      continue;
    }

    updateTask(task.taskId, {
      spuId: site.spuId || "",
      status:
        site.status === "ACTIVE"
          ? "ALREADY_ACTIVE"
          : site.status === "ELIGIBLE"
            ? "PROCESSING"
            : "NOT_ELIGIBLE",
      reason:
        site.status === "ACTIVE"
          ? "该站点已加速"
          : site.status === "ELIGIBLE"
            ? "自动开启并填写价格"
            : "没有获取加速资格",
    });

    if (site.status !== "ELIGIBLE") continue;

    try {
      const result = await sendCommand(
        "PROCESS_SITE",
        {
          skcId: group.skcId,
          siteName: task.siteName,
          targetColorGroup: task.targetColorGroup,
          targetPriceCents: task.targetPriceCents,
          genericPriceCents: task.genericPriceCents,
        },
        180000,
      );

      if (result.status === "SKIPPED_PRICE_LIMIT") {
        updateTask(task.taskId, {
          status: "SKIPPED_PRICE_LIMIT",
          reason: `${result.reason}，超限 ${result.overLimitSkus?.length || 0} 个 SKU`,
          details: result,
        });
      } else if (result.status === "SUBMITTED") {
        updateTask(task.taskId, {
          status: "SUBMITTED",
          reason: "已自动提交，等待结果回查",
          details: result,
        });
      } else {
        updateTask(task.taskId, {
          status: result.status || "FAILED",
          reason: result.reason || "站点处理结束",
          details: result,
        });
      }
    } catch (error) {
      const skipCurrentSite = isSkippableProcessError(error);
      updateTask(task.taskId, {
        status: skipCurrentSite
          ? "SKIPPED_SUBMIT_BUTTON_NOT_FOUND"
          : "FAILED",
        reason: skipCurrentSite
          ? "未找到立即加速按钮，已跳过该站点"
          : errorText(error),
        details: error.details || null,
      });
      if (!skipCurrentSite && FATAL_ERROR_CODES.has(errorCode(error))) {
        fatalError = error;
        break;
      }
    }
  }

  if (
    fatalError ||
    state.stopRequested ||
    !group.siteTasks.some((task) => task.status === "SUBMITTED")
  ) {
    await flushStateUpdates();
    return { fatal: Boolean(fatalError), error: fatalError };
  }

  for (const task of group.siteTasks.filter(
    (item) => item.status === "SUBMITTED",
  )) {
    updateTask(task.taskId, {
      status: "CHECKING",
      reason: "提交完成，正在回查页面状态",
    });
  }

  try {
    const verify = await sendCommand(
      "LOOKUP_SKC",
      {
        region: state.region,
        skcId: group.skcId,
        allowSameResult: true,
      },
      LOOKUP_TIMEOUT_MS,
    );
    for (const task of group.siteTasks) {
      if (task.status !== "CHECKING") continue;
      const site = verify.sites?.[task.siteName];
      if (site?.status === "ACTIVE") {
        updateTask(task.taskId, {
          status: "ACTIVE",
          reason: "提交后回查已加速",
        });
      } else {
        updateTask(task.taskId, {
          status: "SUBMITTED_UNVERIFIED",
          reason: "已提交，但回查结果尚未显示已加速",
        });
      }
    }
  } catch (error) {
    for (const task of group.siteTasks) {
      if (task.status !== "CHECKING") continue;
      updateTask(task.taskId, {
        status: "SUBMITTED_UNVERIFIED",
        reason: `已提交，但回查失败：${errorText(error)}`,
      });
    }
  }

  await flushStateUpdates();
  return { fatal: false };
}

async function startRun() {
  if (state.running || !state.tasks.length) return;

  const targetColorGroup = normalizeTargetColorGroup(
    elements.targetGroupInput.value,
  );
  if (!targetColorGroup) {
    showNotice("请先填写指定规格 / 颜色组。", "error");
    return;
  }
  state.targetColorGroup = targetColorGroup;

  normalizeStoredTaskSites();
  normalizeStoredTaskStates(state.tasks);
  const resumableTasks = state.tasks.filter(isResumableTask);
  if (!resumableTasks.length) {
    showNotice("没有待执行或可重试的任务。", "info");
    render();
    return;
  }

  for (const task of resumableTasks) {
    task.targetColorGroup = state.targetColorGroup;
    task.status = "IMPORTED";
    task.reason = "";
    task.details = null;
  }

  state.running = true;
  state.paused = false;
  state.stopRequested = false;
  state.runLabel = "执行中";
  state.currentTask = null;
  render();
  await persistState();

  let fatalError = null;
  try {
    await sendCommand("PING", {}, 15000);
    await sendCommand("SWITCH_REGION", { region: state.region }, 60000);

    const groups = groupTasksBySkc(resumableTasks);
    for (let index = 0; index < groups.length; index += 1) {
      if (!(await waitWhilePaused())) break;
      const result = await processGroup(groups[index], index, groups.length);
      if (result.fatal) {
        fatalError = result.error;
        break;
      }
    }

    if (fatalError) {
      state.runLabel = "已停止";
      showNotice(`批次已停止：${errorText(fatalError)}`, "error");
    } else if (state.stopRequested) {
      state.runLabel = "已停止";
      showNotice("批次已停止，可在当前结果基础上重新执行。", "info");
    } else {
      const summary = summarizeTasks(state.tasks);
      state.runLabel = summary.failed > 0 ? "已完成·部分失败" : "已完成";
      showNotice(
        summary.failed > 0
          ? `批次已执行完当前可处理任务，仍有 ${summary.failed} 条失败任务，可再次点击“继续执行”。`
          : "批次执行完成。价格超限站点已保留在结果中。",
        summary.failed > 0 ? "info" : "success",
      );
    }
  } catch (error) {
    state.runLabel = "已停止";
    showNotice(`批次已停止：${errorText(error)}`, "error");
  } finally {
    state.running = false;
    state.paused = false;
    state.stopRequested = false;
    state.currentTask = null;
    await flushStateUpdates();
  }
}

function exportResults() {
  if (!state.tasks.length || !window.XLSX) return;
  const header = [
    "SKC顺序",
    "站点顺序",
    "SKC ID",
    "SPU ID",
    "站点",
    "指定颜色组",
    "指定规格价格 Y",
    "通用规格价格 X",
    "最终加速提价明细",
    "状态",
    "说明",
    "平台上限明细",
    "执行时间",
  ];
  const rows = state.tasks.map((task) => [
    task.skcOrder + 1,
    task.siteOrder + 1,
    task.skcId,
    task.spuId || "",
    task.siteName,
    task.targetColorGroup,
    centsToPrice(task.targetPriceCents),
    centsToPrice(task.genericPriceCents),
    formatFinalPrices(task),
    STATUS_LABELS[task.status] || task.status,
    getTaskReason(task),
    task.details?.overLimitSkus?.length
      ? JSON.stringify(task.details.overLimitSkus)
      : "",
    new Date().toISOString(),
  ]);

  const workbook = window.XLSX.utils.book_new();
  const worksheet = window.XLSX.utils.aoa_to_sheet([header, ...rows]);
  window.XLSX.utils.book_append_sheet(workbook, worksheet, "执行结果");

  const finalPriceHeader = [
    "SKC ID",
    "SPU ID",
    "站点",
    "SKU",
    "价格类型",
    "最终加速提价",
    "参考申报价",
    "任务状态",
    "执行时间",
  ];
  const exportedAt = new Date().toISOString();
  const finalPriceRows = buildFinalPriceRows(
    state.tasks,
    exportedAt,
    (status) => STATUS_LABELS[status] || status,
  );
  const priceWorksheet = window.XLSX.utils.aoa_to_sheet([
    finalPriceHeader,
    ...finalPriceRows,
  ]);
  window.XLSX.utils.book_append_sheet(
    workbook,
    priceWorksheet,
    "最终价格明细",
  );

  const output = window.XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  const blob = new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `流量加速结果_${exportedAt
    .replaceAll(":", "-")
    .replace(/\..+/, "")}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

elements.regionSelect.addEventListener("change", async () => {
  state.region = elements.regionSelect.value;
  if (state.tasks.length) {
    state.tasks = state.tasks.map((task) => ({
      ...task,
      region: state.region,
      status: task.status === "INVALID_INPUT" ? task.status : "IMPORTED",
      reason:
        task.status === "INVALID_INPUT"
          ? task.reason
          : "区域已切换，等待重新执行",
      details: null,
    }));
    state.runLabel = "待执行";
    state.currentTask = null;
  }
  render();
  await persistState();
  showNotice(
    `区域已设为${REGION_LABELS[state.region]}。${
      state.tasks.length ? "任务状态已重置，等待重新执行。" : "新导入任务将使用该区域。"
    }`,
  );
});

elements.targetGroupInput.addEventListener("change", async () => {
  if (state.running) return;
  const targetColorGroup = normalizeTargetColorGroup(
    elements.targetGroupInput.value,
  );
  if (!targetColorGroup) {
    elements.targetGroupInput.value = state.targetColorGroup;
    showNotice("指定规格 / 颜色组不能为空。", "error");
    return;
  }

  state.targetColorGroup = targetColorGroup;
  for (const task of state.tasks) {
    if (!isResumableTask(task) && task.status !== "SKIPPED_PRICE_LIMIT") {
      continue;
    }
    task.targetColorGroup = targetColorGroup;
    if (task.status === "SKIPPED_PRICE_LIMIT") {
      task.status = "IMPORTED";
      task.reason = "指定规格已变更，等待重新执行";
      task.details = null;
    }
  }
  render();
  await persistState();
  showNotice(`指定规格已设为：${targetColorGroup}`, "success");
});

elements.fileInput.addEventListener("change", async () => {
  try {
    await handleFile(elements.fileInput.files?.[0]);
  } catch (error) {
    showNotice(`导入失败：${error.message || String(error)}`, "error");
  } finally {
    elements.fileInput.value = "";
  }
});

elements.startButton.addEventListener("click", () => {
  void startRun();
});

elements.pauseButton.addEventListener("click", () => {
  if (!state.running) return;
  state.paused = !state.paused;
  showNotice(
    state.paused
      ? "将在当前站点动作完成后暂停。"
      : "已继续执行。",
    "info",
  );
  renderControls();
});

elements.stopButton.addEventListener("click", () => {
  if (!state.running) return;
  state.stopRequested = true;
  state.paused = false;
  showNotice("将在当前站点动作完成后停止。", "info");
  renderControls();
});

elements.exportButton.addEventListener("click", exportResults);

async function initialize() {
  render();
  elements.regionSelect.value = state.region;
  elements.targetGroupInput.value = state.targetColorGroup;
  await restoreState();
  try {
    await sendCommand("PING", {}, 8000);
    setConnection(true, "已连接");
    renderControls();
  } catch (error) {
    setConnection(false, "未连接");
    showNotice(
      `未连接到商品流量页：${error.message || String(error)}。请确认当前页面为经营分析-商品流量。`,
      "error",
    );
  }
}

void initialize();
