"use strict";

const parser = window.MuseBridgeCommands;
const state = {
  files: [],
  maskFile: null,
  busy: false,
  activeTab: "product",
  lastCommand: { text: "", at: 0 },
  failedProductColors: [],
  colorState: {},
  recentColors: [],
  pickerBitmap: null,
  pickedColor: "",
  patternBase: null,
  patternRefs: [],
  patternBatches: [],
  paused: false,
  pauseWaiters: [],
  failedPatternRefs: [],
  sharedPreviewUrl: "",
  patternPreviewUrl: "",
  archiveStatus: null,
  jobObjectUrls: [],
};

const panels = [...document.querySelectorAll("[data-panel]")];
const tabs = [...document.querySelectorAll("[data-tab]")];
const fileInput = document.querySelector("#vfFileInput");
const filesBox = document.querySelector("#vfFiles");
const uploadTitle = document.querySelector("#vfUploadTitle");
const uploadZone = document.querySelector("#vfUploadZone");
const maskInput = document.querySelector("#vfMaskInput");
const maskName = document.querySelector("#vfMaskName");
const progressNote = document.querySelector("#vfMuseProgress");
const jobsBox = document.querySelector("#vfJobs");
const toast = document.querySelector("#vfToast");
const contextTitle = document.querySelector("#vfContextTitle");
const connection = document.querySelector("#vfConnection");
const museConnection = document.querySelector("#vfMuseConnection");
const colorChips = document.querySelector("#vfColorChips");
const colorPicker = document.querySelector("#vfColorPicker");
const recentColors = document.querySelector("#vfRecentColors");
const recentColorList = document.querySelector("#vfRecentColorList");
const colorQueue = document.querySelector("#vfColorQueue");
const retryFailedColors = document.querySelector("#vfRetryFailedColors");
const colorRegion = document.querySelector("#vfColorRegion");
const exportPath = document.querySelector("#vfExportPath");
const pauseTask = document.querySelector("#vfPauseTask");
const taskState = document.querySelector("#vfTaskState");
const mainPreview = document.querySelector("#vfMainPreview");
const mainPreviewImage = document.querySelector("#vfMainPreviewImage");
const mainPreviewName = document.querySelector("#vfMainPreviewName");
const patternPreview = document.querySelector("#vfPatternPreview");
const patternPreviewImage = document.querySelector("#vfPatternPreviewImage");
const patternPreviewName = document.querySelector("#vfPatternPreviewName");
const retryPatternFailed = document.querySelector("#vfRetryPatternFailed");
const patternBaseInput = document.querySelector("#vfPatternBase");
const patternFolderInput = document.querySelector("#vfPatternFolder");
const patternBaseName = document.querySelector("#vfPatternBaseName");
const patternFolderName = document.querySelector("#vfPatternFolderName");
const patternBatchSummary = document.querySelector("#vfPatternBatchSummary");
const patternProgress = document.querySelector("#vfPatternProgress");
const imagePicker = document.querySelector("#vfImagePicker");
const pickerCanvas = document.querySelector("#vfPickerCanvas");
const pickerSwatch = document.querySelector("#vfPickerSwatch");
const pickerHex = document.querySelector("#vfPickerHex");
const usePickedColor = document.querySelector("#vfUsePickedColor");
const embedded = new URLSearchParams(location.search).get("embedded") === "1";

const tabLabels = {
  product: "商品配色",
  recolor: "Logo 多色",
  batch: "多 Logo 同色",
  generate: "产品裂变",
};

const uploadLabels = {
  product: "添加商品主图",
  recolor: "添加一个 Logo",
  batch: "添加多个 Logo",
  generate: "产品裂变不需要上传素材",
};

const kindLabels = {
  logo_recolor: "Logo 多色",
  logo_color_batch: "多 Logo 同色",
  product_generate: "产品视觉裂变",
  product_color_finalize: "Muse 商品配色",
  pattern_batch_finalize: "印花套图",
};

const statusLabels = {
  queued: "排队中",
  running: "生成中",
  succeeded: "已完成",
  failed: "失败",
  pass: "通过",
  review: "复核",
  retry: "需重试",
};

let toastTimer = 0;

function installEmbeddedControls() {
  if (!embedded) return;
  document.documentElement.classList.add("vf-embedded");
  const topbar = document.querySelector(".vf-topbar");
  const settings = document.querySelector("#vfSettings");
  const grip = document.createElement("span");
  grip.className = "vf-drag-grip";
  grip.textContent = "•••";
  grip.title = "拖动窗口";
  const hide = document.createElement("button");
  hide.className = "vf-round-button";
  hide.type = "button";
  hide.title = "收起 Visual Forge";
  hide.setAttribute("aria-label", "收起 Visual Forge");
  hide.textContent = "−";
  settings.before(grip, hide);

  hide.addEventListener("click", () => {
    parent.postMessage({ type: "VF_WIDGET_HIDE" }, "*");
  });

  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  topbar.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    dragging = true;
    dragStartX = event.screenX;
    dragStartY = event.screenY;
    try {
      topbar.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic test events may not own an active pointer.
    }
    parent.postMessage({ type: "VF_WIDGET_DRAG_START" }, "*");
  });
  topbar.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    parent.postMessage(
      {
        type: "VF_WIDGET_DRAG_MOVE",
        dx: event.screenX - dragStartX,
        dy: event.screenY - dragStartY,
      },
      "*",
    );
  });
  const finishDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    try {
      if (topbar.hasPointerCapture(event.pointerId)) {
        topbar.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Capture is best-effort.
    }
    parent.postMessage({ type: "VF_WIDGET_DRAG_END" }, "*");
  };
  topbar.addEventListener("pointerup", finishDrag);
  topbar.addEventListener("pointercancel", finishDrag);
  parent.postMessage({ type: "VF_WIDGET_READY" }, "*");
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 5000);
}

function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "请求失败"));
        return;
      }
      resolve(response.data);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error("Muse 页面连接未加载，请刷新 Muse 页面"));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Muse 页面操作失败"));
        return;
      }
      resolve(response.data);
    });
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)),
    );
  }
  return btoa(chunks.join(""));
}

async function serializeFile(file, name = file.name) {
  return {
    name,
    type: file.type,
    data: arrayBufferToBase64(await file.arrayBuffer()),
  };
}

function setBusy(value, message = "", pauseAvailable = false) {
  state.busy = value;
  document.querySelectorAll(
    "[data-run], #vfTryFirstColor, #vfRetryFailedColors, #vfRunPattern, #vfRetryPatternFailed",
  ).forEach((button) => {
    button.disabled = value;
  });
  pauseTask.disabled = !value || !pauseAvailable;
  taskState.textContent = value
    ? message || "任务执行中"
    : "当前没有运行中的任务";
  if (!value) {
    retryFailedColors.disabled = state.failedProductColors.length === 0;
    retryPatternFailed.disabled = state.failedPatternRefs.length === 0;
    state.paused = false;
    pauseTask.classList.remove("is-paused");
    pauseTask.textContent = "Ⅱ";
    pauseTask.title = "当前图完成后暂停";
    const waiters = state.pauseWaiters.splice(0);
    waiters.forEach((resolve) => resolve());
  }
  if (message) showToast(message);
}

async function waitWhilePaused() {
  if (!state.paused) return;
  await new Promise((resolve) => state.pauseWaiters.push(resolve));
}

function togglePause() {
  if (!state.busy || pauseTask.disabled) return;
  state.paused = !state.paused;
  pauseTask.classList.toggle("is-paused", state.paused);
  pauseTask.textContent = state.paused ? "▶" : "Ⅱ";
  pauseTask.title = state.paused ? "继续任务" : "当前图完成后暂停";
  if (state.paused) {
    showToast("已暂停：当前正在生成的图完成后停止");
  } else {
    const waiters = state.pauseWaiters.splice(0);
    waiters.forEach((resolve) => resolve());
    showToast("继续处理下一张");
  }
}

function renderMainPreview() {
  if (state.sharedPreviewUrl) URL.revokeObjectURL(state.sharedPreviewUrl);
  state.sharedPreviewUrl = "";
  const file = state.files[0];
  if (!file || state.activeTab === "generate") {
    mainPreview.hidden = true;
    mainPreviewImage.removeAttribute("src");
    return;
  }
  state.sharedPreviewUrl = URL.createObjectURL(file);
  mainPreviewImage.src = state.sharedPreviewUrl;
  mainPreviewName.textContent = file.name;
  mainPreview.hidden = false;
}

function renderPatternPreview() {
  if (state.patternPreviewUrl) URL.revokeObjectURL(state.patternPreviewUrl);
  state.patternPreviewUrl = "";
  if (!state.patternBase) {
    patternPreview.hidden = true;
    patternPreviewImage.removeAttribute("src");
    return;
  }
  state.patternPreviewUrl = URL.createObjectURL(state.patternBase);
  patternPreviewImage.src = state.patternPreviewUrl;
  patternPreviewName.textContent = state.patternBase.name;
  patternPreview.hidden = false;
}

function switchTab(tabName) {
  state.activeTab = tabName;
  contextTitle.textContent = tabLabels[tabName] || "Visual Forge";
  uploadTitle.textContent = uploadLabels[tabName] || "添加图片";
  uploadZone.hidden = tabName === "generate";
  tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === tabName);
  });
  panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === tabName);
  });
  renderMainPreview();
}

function switchGenerateMode(mode) {
  document.querySelectorAll("[data-generate-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.generateMode === mode);
  });
  document.querySelectorAll("[data-generate-pane]").forEach((pane) => {
    pane.classList.toggle("is-active", pane.dataset.generatePane === mode);
  });
}

function totalFileBytes() {
  return state.files.reduce((total, file) => total + file.size, 0);
}

function addFiles(files) {
  const next = [...state.files];
  for (const file of files) {
    if (
      !next.some(
        (item) =>
          item.name === file.name &&
          item.size === file.size &&
          item.lastModified === file.lastModified,
      )
    ) {
      next.push(file);
    }
  }
  if (next.length > 100) {
    showToast("单次最多选择 100 个文件", true);
    return;
  }
  if (next.reduce((sum, file) => sum + file.size, 0) > 24 * 1024 * 1024) {
    showToast("单次素材总量不能超过 24MB", true);
    return;
  }
  state.files = next;
  renderFiles();
  renderMainPreview();
}

function renderFiles() {
  filesBox.replaceChildren();
  state.files.forEach((file, index) => {
    const row = document.createElement("div");
    row.className = "vf-file";
    const name = document.createElement("span");
    name.textContent = file.name;
    name.title = file.name;
    const size = document.createElement("small");
    size.textContent = `${Math.max(1, Math.round(file.size / 1024))} KB`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "移除";
    remove.addEventListener("click", () => {
      state.files.splice(index, 1);
      renderFiles();
      renderMainPreview();
    });
    row.append(name, size, remove);
    filesBox.append(row);
  });
}

function showProgress(message, current = 0, total = 0, isError = false) {
  progressNote.hidden = false;
  progressNote.classList.toggle("is-error", isError);
  progressNote.replaceChildren();
  const text = document.createElement("span");
  text.textContent = message;
  progressNote.append(text);
  if (total > 0) {
    const bar = document.createElement("i");
    bar.style.width = `${Math.min(100, (current / total) * 100)}%`;
    progressNote.append(bar);
  }
}

async function checkHealth() {
  try {
    const config = await VisualForgeModel.loadConfig();
    connection.className = "vf-connection is-online";
    connection.querySelector("span").textContent =
      config.provider === "mock" ? "扩展演示模型" : config.model;
    connection.title =
      config.provider === "mock"
        ? "产品文生图使用扩展内置演示模型"
        : `产品文生图使用 ${config.baseUrl}`;
    await refreshArchiveStatus();
  } catch (error) {
    connection.className = "vf-connection is-offline";
    connection.querySelector("span").textContent = "配置错误";
    connection.title = error.message;
  }
}

async function refreshArchiveStatus() {
  const current = await VisualForgeArchive.status();
  state.archiveStatus = current;
  if (!current.name) {
    exportPath.textContent = "尚未选择归档目录";
    exportPath.title = "点击右侧“选择”授权目录";
    return current;
  }
  const permissionLabel =
    current.permission === "granted"
      ? "已授权"
      : current.permission === "prompt"
        ? "需要重新授权"
        : "权限已失效";
  exportPath.textContent = `${current.name} · ${permissionLabel}`;
  exportPath.title = exportPath.textContent;
  return current;
}

async function ensureArchiveDirectory(interactive = false) {
  const current = await refreshArchiveStatus();
  if (current.permission === "granted") return;
  if (!interactive) {
    throw new Error("请先在顶部选择或重新授权归档目录");
  }
  if (embedded) {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("directory.html"),
    });
    throw new Error("已打开目录授权页，请授权后返回挂件重新开始");
  }
  await VisualForgeArchive.chooseDirectory();
  await refreshArchiveStatus();
}

function validateLocalJob(kind) {
  if (kind === "logo_recolor" && state.files.length !== 1) {
    throw new Error("Logo 多色需要且只能添加 1 个 Logo");
  }
  if (kind === "logo_color_batch" && state.files.length < 1) {
    throw new Error("请先添加至少 1 个 Logo");
  }
}

async function createLocalJob(kind, options, files) {
  return VisualForgeJobs.create(
    kind,
    options,
    files,
    {
      waitIfPaused: waitWhilePaused,
      onUpdate: (job) => upsertJobCard(job),
    },
  );
}

function payloadToFile(payload, fallbackName = "generated.png") {
  const binary = atob(payload?.data || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File(
    [bytes],
    payload?.name || fallbackName,
    { type: payload?.type || "image/png" },
  );
}

function createJobCard(job) {
  const card = document.createElement("article");
  card.className = "vf-job";
  card.dataset.jobId = job.id;

  const head = document.createElement("div");
  head.className = "vf-job-head";
  const titleWrap = document.createElement("div");
  const kind = document.createElement("small");
  kind.textContent = kindLabels[job.kind] || job.kind;
  const title = document.createElement("strong");
  const colorLabel = Array.isArray(job.options?.colors)
    ? job.options.colors
        .map((color) => (typeof color === "string" ? color : color.hex))
        .filter(Boolean)
        .join(", ")
    : job.options?.colors;
  title.textContent =
    job.options?.prompt?.slice(0, 38) ||
    colorLabel ||
    (Array.isArray(job.options?.references)
      ? job.options.references
          .slice(0, 3)
          .map((item) => item.name)
          .join(", ")
      : null) ||
    job.options?.color ||
    job.id.slice(0, 8);
  titleWrap.append(kind, title);
  const status = document.createElement("span");
  status.className = `vf-status is-${job.status}`;
  status.textContent = statusLabels[job.status] || job.status;
  head.append(titleWrap, status);

  const progress = document.createElement("div");
  progress.className = "vf-job-progress";
  const bar = document.createElement("i");
  bar.style.width = `${job.progress || 0}%`;
  progress.append(bar);

  const message = document.createElement("p");
  message.className = "vf-job-message";
  message.textContent =
    job.status === "failed"
      ? job.error || "处理失败"
      : job.archive_error
        ? `${job.message || statusLabels[job.status]}；${job.archive_error}`
        : job.message || statusLabels[job.status];

  const outputs = document.createElement("div");
  outputs.className = "vf-outputs";
  for (const asset of (job.outputs || []).slice(0, 9)) {
    if (asset.display === false) continue;
    const preview = asset.thumbnail || asset.url;
    if (!preview) continue;
    const link = document.createElement("a");
    link.href = preview;
    link.target = "_blank";
    link.rel = "noopener";
    link.title = asset.name;
    link.addEventListener("click", (event) => {
      if (!asset.id) return;
      event.preventDefault();
      void openStoredAsset(asset.id);
    });
    const image = document.createElement("img");
    image.src = preview;
    image.alt = asset.name;
    const labelText = {
      muse_raw: "Muse 原图",
      corrected: "目标色",
      contact_sheet: "对比图",
      pattern_transfer: "印花套图",
    }[asset.variant_type];
    if (labelText) {
      link.classList.add("has-label");
      link.dataset.label = labelText;
    }
    link.append(image);
    outputs.append(link);
  }

  const actions = document.createElement("div");
  actions.className = "vf-job-actions";
  if (job.status === "succeeded") {
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = job.export_path
      ? "已保存到授权目录"
      : job.archive_error
        ? "重新授权并保存"
        : "保存到授权目录";
    exportButton.title = job.export_path || job.archive_error || "导出全部图片";
    exportButton.disabled = Boolean(job.export_path);
    exportButton.addEventListener("click", async () => {
      exportButton.disabled = true;
      exportButton.textContent = "导出中…";
      try {
        const updated = await VisualForgeJobs.exportJob(job.id, true);
        await refreshArchiveStatus();
        upsertJobCard(updated);
        showToast(`已保存到 ${updated.export_path}`);
      } catch (error) {
        exportButton.disabled = false;
        exportButton.textContent = "重新授权并保存";
        showToast(error.message, true);
      }
    });
    const backfill = document.createElement("button");
    backfill.type = "button";
    backfill.textContent = "回填 Muse";
    backfill.addEventListener("click", () => {
      void insertSummary(job);
    });
    actions.append(exportButton, backfill);
    const download = document.createElement("button");
    download.type = "button";
    download.textContent = "下载 ZIP";
    download.addEventListener("click", () => {
      void downloadJobZip(job);
    });
    actions.append(download);
  }

  card.append(head, progress, message);
  if (outputs.childElementCount) card.append(outputs);
  const qaOutputs = (job.outputs || []).filter(
    (asset) => asset.delta_e !== undefined && asset.qa_status,
  );
  if (qaOutputs.length) {
    const qaList = document.createElement("div");
    qaList.className = "vf-qa-list";
    qaOutputs.forEach((asset) => {
      const line = document.createElement("div");
      line.className = "vf-qa-line";
      const color = document.createElement("strong");
      color.textContent = asset.color || asset.name;
      const qa = document.createElement("span");
      qa.className = `is-${asset.qa_status}`;
      qa.textContent =
        `Muse ΔE ${asset.muse_delta_e ?? "—"} → ` +
        `${statusLabels[asset.qa_status] || asset.qa_status} ΔE ${asset.delta_e}`;
      line.append(color, qa);
      qaList.append(line);
    });
    card.append(qaList);
  }
  if (actions.childElementCount) card.append(actions);
  return card;
}

function upsertJobCard(job) {
  const old = jobsBox.querySelector(`[data-job-id="${job.id}"]`);
  const card = createJobCard(job);
  if (old) old.replaceWith(card);
  else {
    jobsBox.querySelector(".vf-empty")?.remove();
    jobsBox.prepend(card);
  }
}

async function monitorJob(job) {
  upsertJobCard(job);
  const deadline = Date.now() + 30 * 60 * 1000;
  let current = job;
  while (
    ["queued", "running"].includes(current.status) &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1400));
    current = await VisualForgeJobs.get(job.id);
    upsertJobCard(current);
  }
  if (current.status !== "succeeded") {
    throw new Error(
      current.error ||
        (Date.now() >= deadline ? "任务等待超过 30 分钟" : "任务处理失败"),
    );
  }
  return current;
}

async function loadJobs() {
  try {
    const jobs = await VisualForgeJobs.list(12);
    jobsBox.replaceChildren();
    if (!jobs.length) {
      const empty = document.createElement("div");
      empty.className = "vf-empty";
      empty.textContent = "这里会显示最近的 Visual Forge 任务";
      jobsBox.append(empty);
      return;
    }
    jobs.forEach((job) => jobsBox.append(createJobCard(job)));
  } catch (error) {
    showToast(error.message, true);
  }
}

async function openStoredAsset(assetId) {
  const popup = window.open("", "_blank");
  try {
    const asset = await VisualForgeStore.getAsset(assetId);
    if (!asset?.blob) throw new Error("图片文件不存在");
    const url = URL.createObjectURL(asset.blob);
    state.jobObjectUrls.push(url);
    if (popup) popup.location.href = url;
    else {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    popup?.close();
    showToast(error.message, true);
  }
}

async function downloadJobZip(job) {
  try {
    const blob = await VisualForgeJobs.makeZip(job.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `visualforge-${job.id.slice(0, 8)}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function getMuseTab() {
  const tabsInWindow = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const tab = tabsInWindow[0];
  if (!tab?.id || !/^https:\/\/muse\.ai\//.test(tab.url || "")) {
    throw new Error("请先打开并聚焦 Muse 对话页面");
  }
  return tab;
}

async function checkMuseConnection() {
  try {
    const tab = await getMuseTab();
    await sendTabMessage(tab.id, { type: "VF_PING" });
    museConnection.textContent = "MUSE READY";
    museConnection.className = "is-online";
  } catch {
    museConnection.textContent = "切换至 Muse";
    museConnection.className = "is-offline";
  }
}

async function insertSummary(job) {
  try {
    const tab = await getMuseTab();
    const summary =
      `Visual Forge 已完成 ${kindLabels[job.kind] || job.kind}。` +
      (job.export_path ? `归档：${job.export_path}` : "");
    await sendTabMessage(tab.id, {
      type: "VF_INSERT_SUMMARY",
      text: summary,
    });
    showToast("摘要已填入 Muse 输入框");
  } catch (error) {
    showToast(error.message, true);
  }
}

const PATTERN_BATCH_LIMIT = 24 * 1024 * 1024;
const MUSE_UPLOAD_LIMIT = 25 * 1024 * 1024;

function isImageFile(file) {
  return (
    /^image\//i.test(file.type || "") ||
    /\.(?:png|jpe?g|webp|bmp|gif|tiff?)$/i.test(file.name)
  );
}

function setPatternProgress(message, current = 0, total = 0, isError = false) {
  patternProgress.hidden = false;
  patternProgress.classList.toggle("is-error", isError);
  patternProgress.replaceChildren();
  const text = document.createElement("span");
  text.textContent = message;
  patternProgress.append(text);
  if (total) {
    const bar = document.createElement("i");
    bar.style.width = `${Math.min(100, (current / total) * 100)}%`;
    patternProgress.append(bar);
  }
}

async function zipBatch(files) {
  const namedFiles = files.map(
    (file) =>
      new File(
        [file],
        file.webkitRelativePath || file.name,
        { type: file.type || "application/octet-stream" },
      ),
  );
  return window.VisualForgeZip.createZip(namedFiles);
}

async function buildPatternBatches(sourceRefs = state.patternRefs) {
  const valid = sourceRefs
    .filter(isImageFile)
    .filter((file) => file.size <= PATTERN_BATCH_LIMIT)
    .sort((left, right) =>
      (left.webkitRelativePath || left.name).localeCompare(
        right.webkitRelativePath || right.name,
      ),
    )
    .slice(0, 200);
  const oversized = state.patternRefs.filter(
    (file) => isImageFile(file) && file.size > PATTERN_BATCH_LIMIT,
  );
  const groups = [];
  let current = [];
  let size = 0;
  for (const file of valid) {
    if (
      current.length &&
      (current.length >= 4 || size + file.size > PATTERN_BATCH_LIMIT)
    ) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += file.size;
  }
  if (current.length) groups.push(current);

  const batches = [];
  const pending = [...groups];
  while (pending.length) {
    const files = pending.shift();
    const blob = await zipBatch(files);
    if (blob.size <= MUSE_UPLOAD_LIMIT || files.length === 1) {
      if (blob.size > MUSE_UPLOAD_LIMIT) continue;
      batches.push({ files, blob });
    } else {
      const middle = Math.ceil(files.length / 2);
      pending.unshift(files.slice(0, middle), files.slice(middle));
    }
  }
  state.patternBatches = batches;
  return { batches, oversized, valid, limited: sourceRefs.length > 200 };
}

async function refreshPatternBatches() {
  if (!state.patternRefs.length) {
    state.patternBatches = [];
    patternBatchSummary.hidden = true;
    document.querySelector("#vfDownloadPatternBatches").hidden = true;
    return;
  }
  patternFolderName.textContent = "正在分批并生成 ZIP…";
  const result = await buildPatternBatches();
  const totalBytes = result.valid.reduce((sum, file) => sum + file.size, 0);
  const largest = Math.max(
    0,
    ...result.batches.map((batch) => batch.blob.size),
  );
  patternFolderName.textContent =
    `${result.valid.length} 张参考图 · ` +
    `${(totalBytes / 1024 / 1024).toFixed(1)}MB`;
  patternBatchSummary.hidden = false;
  patternBatchSummary.textContent =
    `已分为 ${result.batches.length} 批，每批最多 4 张，单批最大 ` +
    `${(largest / 1024 / 1024).toFixed(1)}MB（上限 25MB）。` +
    (result.oversized.length
      ? ` 已跳过 ${result.oversized.length} 张超过 24MB 的图片。`
      : "") +
    (result.limited ? " 单次最多处理前 200 张。" : "");
  document.querySelector("#vfDownloadPatternBatches").hidden =
    result.batches.length === 0;
}

async function runPatternTransfer(retryRefs = null, interactiveArchive = false) {
  if (state.busy) return;
  try {
    await ensureArchiveDirectory(interactiveArchive);
    if (!state.patternBase) {
      throw new Error("请选择一张白底商品图");
    }
    if (!state.patternRefs.length) {
      throw new Error("请选择印花参考图文件夹");
    }
    if (!retryRefs?.length && !state.patternBatches.length) {
      await refreshPatternBatches();
    }
    let batches = state.patternBatches;
    let sourceRefs = state.patternRefs;
    if (retryRefs?.length) {
      sourceRefs = retryRefs;
      batches = (await buildPatternBatches(retryRefs)).batches;
    }
    if (!batches.length) {
      throw new Error("没有符合大小限制的参考图");
    }
    const tab = await getMuseTab();
    await sendTabMessage(tab.id, { type: "VF_PING" });
    const sku = document.querySelector("#vfSkuPattern").value.trim();
    const startedAt = new Date().toISOString();
    const archiveGroupName = await VisualForgeArchive.reserveGroup(
      VisualForgeArchive.buildStem(
        "pattern_batch_finalize",
        { sku },
        startedAt,
      ),
    );
    setBusy(true, "", true);
    const basePayload = await serializeFile(
      state.patternBase,
      `__base__-${state.patternBase.name}`,
    );
    const backgroundMode = document.querySelector("#vfPatternBackground").value;
    const requestMode = document.querySelector("#vfPatternRequestMode").value;
    const allReferences = batches.flatMap((batch) => batch.files);
    let completed = 0;
    const failures = [];
    state.failedPatternRefs = [];
    retryPatternFailed.disabled = true;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      const generated = [];
      const references = [];
      if (requestMode === "batch4") {
        await waitWhilePaused();
        setPatternProgress(
          `批量生成第 ${batchIndex + 1}/${batches.length} 批 · ` +
            `${batch.files.length} 张独立输出`,
          completed,
          allReferences.length,
        );
        try {
          const archive = new File(
            [batch.blob],
            `visualforge-pattern-batch-${String(batchIndex + 1).padStart(2, "0")}.zip`,
            { type: "application/zip" },
          );
          const archivePayload = await serializeFile(archive);
          const result = await sendTabMessage(tab.id, {
            type: "VF_MUSE_GENERATE_PATTERN_BATCH",
            base: basePayload,
            archive: archivePayload,
            backgroundMode,
            references: batch.files.map((file) => ({
              name: file.name,
              relative_path: file.webkitRelativePath || file.name,
            })),
            index: batchIndex + 1,
            total: allReferences.length,
          });
          generated.push(...result.outputs);
          references.push(...result.references);
        } catch (error) {
          const shouldFallback =
            /Delivery not confirmed|未确认收到|预期|未获得完整/i.test(
              error.message,
            );
          if (shouldFallback) {
            for (let fileIndex = 0; fileIndex < batch.files.length; fileIndex += 1) {
              await waitWhilePaused();
              const reference = batch.files[fileIndex];
              const overallIndex =
                completed + generated.length + failures.length + 1;
              setPatternProgress(
                `批量提交失败，自动改为逐张 · ${reference.name}`,
                overallIndex - 1,
                allReferences.length,
                true,
              );
              try {
                const result = await generateSinglePatternReference(
                  tab,
                  basePayload,
                  reference,
                  backgroundMode,
                  overallIndex,
                  allReferences.length,
                );
                generated.push(result.output);
                references.push(result.reference);
              } catch (fallbackError) {
                failures.push({
                  file: reference,
                  name: reference.name,
                  error: fallbackError.message,
                });
              }
            }
          } else {
            batch.files.forEach((file) =>
              failures.push({
                file,
                name: file.name,
                error: error.message,
              }),
            );
          }
        }
      } else {
        for (let fileIndex = 0; fileIndex < batch.files.length; fileIndex += 1) {
          await waitWhilePaused();
          const reference = batch.files[fileIndex];
          const overallIndex =
            completed + generated.length + failures.length + 1;
          setPatternProgress(
            `批次 ${batchIndex + 1}/${batches.length} · ` +
              `${reference.name} · ${overallIndex}/${allReferences.length}`,
            overallIndex - 1,
            allReferences.length,
          );
          try {
            const result = await generateSinglePatternReference(
              tab,
              basePayload,
              reference,
              backgroundMode,
              overallIndex,
              allReferences.length,
            );
            generated.push(result.output);
            references.push(result.reference);
          } catch (error) {
            failures.push({
              file: reference,
              name: reference.name,
              error: error.message,
            });
          }
        }
      }
      completed += batch.files.length;
      if (generated.length) {
        setPatternProgress(
          `批次 ${batchIndex + 1} 已生成 ${generated.length} 张，正在归档`,
          completed,
          allReferences.length,
        );
        const created = await createLocalJob(
          "pattern_batch_finalize",
          {
            references,
            background_mode: backgroundMode,
            batch_limit_mb: 24,
            batch_index: batchIndex + 1,
            sku,
            archive_group_name: archiveGroupName,
          },
          [
            state.patternBase,
            ...generated.map((item, index) =>
              payloadToFile(
                item,
                `pattern-${String(batchIndex + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}.webp`,
              ),
            ),
          ],
        );
        await monitorJob(created);
      }
    }
    state.failedPatternRefs = failures.map((failure) => failure.file);
    retryPatternFailed.disabled = state.failedPatternRefs.length === 0;
    if (failures.length) {
      throw new Error(
        `已完成 ${completed - failures.length} 张，失败 ${failures.length} 张：` +
          failures.slice(0, 2).map((item) => item.name).join("、"),
      );
    }
    setPatternProgress(
      `完成，${completed} 张参考图已逐张生成并归档`,
      completed,
      completed,
    );
    showToast("印花套图全部完成");
  } catch (error) {
    setPatternProgress(error.message || "印花套图失败", 0, 0, true);
    showToast(error.message || "印花套图失败", true);
  } finally {
    setBusy(false);
  }
}

function downloadPatternBatchArchives() {
  if (!state.patternBatches.length) return;
  state.patternBatches.forEach((batch, index) => {
    const url = URL.createObjectURL(batch.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `visualforge-pattern-batch-${String(index + 1).padStart(2, "0")}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
}

async function generateSinglePatternReference(
  tab,
  basePayload,
  reference,
  backgroundMode,
  overallIndex,
  total,
) {
  const referencePayload = await serializeFile(
    reference,
    `reference-${overallIndex}-${reference.name}`,
  );
  const output = await sendTabMessage(tab.id, {
    type: "VF_MUSE_GENERATE_PATTERN",
    base: basePayload,
    reference: referencePayload,
    backgroundMode,
    index: overallIndex,
    total,
  });
  return {
    output,
    reference: {
      name: reference.name,
      relative_path: reference.webkitRelativePath || reference.name,
    },
  };
}

async function runLogoJob(runType, interactiveArchive = false) {
  if (state.busy) return;
  try {
    await ensureArchiveDirectory(interactiveArchive);
    setBusy(true, "", runType !== "recolor");
    if (runType === "recolor") {
      validateLocalJob("logo_recolor");
      const created = await createLocalJob(
        "logo_recolor",
        {
          colors: document.querySelector("#vfColors").value,
          remove_background: document.querySelector("#vfRecolorBackground").value,
          trim: true,
          sku: document.querySelector("#vfSkuRecolor").value.trim(),
        },
        state.files,
      );
      await monitorJob(created);
    } else if (runType === "batch") {
      validateLocalJob("logo_color_batch");
      const created = await createLocalJob(
        "logo_color_batch",
        {
          color: document.querySelector("#vfBatchColor").value.trim(),
          remove_background: document.querySelector("#vfBatchBackground").value,
          trim: true,
          sku: document.querySelector("#vfSkuBatch").value.trim(),
        },
        state.files,
      );
      await monitorJob(created);
    } else {
      const prompt = document.querySelector("#vfPrompt").value.trim();
      if (!prompt) throw new Error("请输入产品描述");
      const created = await createLocalJob(
        "product_generate",
        {
          prompt,
          count: Number(document.querySelector("#vfCount").value),
          size: document.querySelector("#vfSize").value,
          quality: "high",
          sku: document.querySelector("#vfSkuGenerate").value.trim(),
        },
        [],
      );
      await monitorJob(created);
    }
    showToast("任务处理完成");
  } catch (error) {
    showToast(error.message || "任务提交失败", true);
  } finally {
    setBusy(false);
  }
}

function parseProductColors(text) {
  const parsed = parser.parse(`/vf product-colors ${text}`);
  if (!parsed || parsed.error) {
    throw new Error(parsed?.error || "商品色号格式无效");
  }
  return parsed.options.colors;
}

function colorEntriesForPreview(text) {
  return text
    .split(/[\s,，;；]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      let hex = value.startsWith("#") ? value : `#${value}`;
      if (/^#[0-9a-f]{3}$/i.test(hex)) {
        hex = `#${hex.slice(1).split("").map((char) => char + char).join("")}`;
      }
      return {
        raw: value,
        hex: hex.toUpperCase(),
        valid: /^#(?:[0-9A-F]{6}|[0-9A-F]{3})$/.test(hex.toUpperCase()),
      };
    });
}

function renderColorChips() {
  colorChips.replaceChildren();
  const entries = colorEntriesForPreview(
    document.querySelector("#vfProductColors").value,
  );
  entries.slice(0, 30).forEach((entry) => {
    const chip = document.createElement("span");
    chip.className = `vf-color-chip${entry.valid ? "" : " is-invalid"}`;
    if (entry.valid) {
      chip.style.setProperty("--chip-color", entry.hex);
      const dot = document.createElement("i");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.title = `移除 ${entry.hex}`;
      remove.addEventListener("click", () => {
        const colors = colorEntriesForPreview(
          document.querySelector("#vfProductColors").value,
        )
          .filter((item) => item.valid && item.hex !== entry.hex)
          .map((item) => item.hex);
        setProductColors(colors);
      });
      chip.append(dot, document.createTextNode(entry.hex), remove);
    } else {
      chip.append(document.createTextNode(entry.raw));
    }
    colorChips.append(chip);
  });
}

function setProductColors(colors) {
  const normalized = [];
  colors.forEach((value) => {
    let hex = String(value || "").trim().toUpperCase();
    if (!hex) return;
    if (!hex.startsWith("#")) hex = `#${hex}`;
    if (/^#[0-9A-F]{3}$/.test(hex)) {
      hex = `#${hex.slice(1).split("").map((char) => char + char).join("")}`;
    }
    if (/^#[0-9A-F]{6}$/.test(hex) && !normalized.includes(hex)) {
      normalized.push(hex);
    }
  });
  document.querySelector("#vfProductColors").value = normalized.join(", ");
  renderColorChips();
}

function addProductColor(value, remember = true) {
  const colors = colorEntriesForPreview(
    document.querySelector("#vfProductColors").value,
  )
    .filter((item) => item.valid)
    .map((item) => item.hex);
  setProductColors([...colors, value]);
  if (remember) {
    let normalized = String(value || "").trim().toUpperCase();
    if (!normalized.startsWith("#")) normalized = `#${normalized}`;
    if (/^#[0-9A-F]{3}$/.test(normalized)) {
      normalized = `#${normalized
        .slice(1)
        .split("")
        .map((char) => char + char)
        .join("")}`;
    }
    if (normalized) void rememberColor(normalized);
  }
}

function renderRecentColors() {
  recentColorList.replaceChildren();
  recentColors.hidden = state.recentColors.length === 0;
  state.recentColors.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "vf-recent-color";
    swatch.style.setProperty("--recent-color", color);
    swatch.title = color;
    swatch.addEventListener("click", () => addProductColor(color, false));
    recentColorList.append(swatch);
  });
}

async function rememberColor(color) {
  const normalized = String(color).toUpperCase();
  state.recentColors = [
    normalized,
    ...state.recentColors.filter((item) => item !== normalized),
  ].slice(0, 18);
  renderRecentColors();
  await chrome.storage.local.set({ recentColors: state.recentColors });
}

async function rememberColors(colors) {
  for (const color of [...colors].reverse()) {
    await rememberColor(color.hex);
  }
}

async function loadRecentColors() {
  const stored = await chrome.storage.local.get({ recentColors: [] });
  state.recentColors = (stored.recentColors || [])
    .filter((color) => /^#[0-9A-F]{6}$/i.test(color))
    .slice(0, 18);
  renderRecentColors();
}

function drawPickerSelection(x = -1, y = -1) {
  if (!state.pickerBitmap) return;
  const context = pickerCanvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, pickerCanvas.width, pickerCanvas.height);
  context.drawImage(state.pickerBitmap, 0, 0, pickerCanvas.width, pickerCanvas.height);
  if (x >= 0 && y >= 0) {
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.strokeStyle = "rgba(255,255,255,.95)";
    context.lineWidth = 3;
    context.stroke();
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.strokeStyle = "rgba(11,13,18,.75)";
    context.lineWidth = 1;
    context.stroke();
  }
}

async function openImageColorPicker() {
  if (!state.files[0]) {
    showToast("请先添加商品主图，或使用屏幕吸色", true);
    return;
  }
  try {
    if (state.pickerBitmap) state.pickerBitmap.close();
    state.pickerBitmap = await createImageBitmap(state.files[0]);
    const maxWidth = 360;
    const maxHeight = Math.max(220, window.innerHeight - 190);
    const scale = Math.min(
      1,
      maxWidth / state.pickerBitmap.width,
      maxHeight / state.pickerBitmap.height,
    );
    pickerCanvas.width = Math.max(1, Math.round(state.pickerBitmap.width * scale));
    pickerCanvas.height = Math.max(1, Math.round(state.pickerBitmap.height * scale));
    drawPickerSelection();
    state.pickedColor = "";
    pickerSwatch.style.background = "#ffffff";
    pickerHex.textContent = "移动光标预览颜色";
    usePickedColor.disabled = true;
    imagePicker.hidden = false;
  } catch (error) {
    showToast(`无法读取商品主图：${error.message}`, true);
  }
}

function closeImageColorPicker() {
  imagePicker.hidden = true;
  state.pickedColor = "";
  if (state.pickerBitmap) {
    state.pickerBitmap.close();
    state.pickerBitmap = null;
  }
}

function samplePicker(event, select = false) {
  if (!state.pickerBitmap) return;
  const rect = pickerCanvas.getBoundingClientRect();
  const x = Math.max(
    0,
    Math.min(
      pickerCanvas.width - 1,
      Math.floor((event.clientX - rect.left) * (pickerCanvas.width / rect.width)),
    ),
  );
  const y = Math.max(
    0,
    Math.min(
      pickerCanvas.height - 1,
      Math.floor((event.clientY - rect.top) * (pickerCanvas.height / rect.height)),
    ),
  );
  const pixel = pickerCanvas
    .getContext("2d", { willReadFrequently: true })
    .getImageData(x, y, 1, 1).data;
  const hex = `#${[pixel[0], pixel[1], pixel[2]]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
  pickerSwatch.style.background = hex;
  pickerHex.textContent = hex;
  if (select) {
    state.pickedColor = hex;
    usePickedColor.disabled = false;
  }
  drawPickerSelection(x, y);
}

async function pickScreenColor() {
  if (!window.EyeDropper) {
    showToast("当前浏览器不支持屏幕吸色，已打开主图吸色");
    await openImageColorPicker();
    return;
  }
  try {
    const result = await new window.EyeDropper().open();
    addProductColor(result.sRGBHex);
    showToast(`已添加 ${result.sRGBHex.toUpperCase()}`);
  } catch (error) {
    if (error.name !== "AbortError") {
      showToast(`吸色失败：${error.message}`, true);
    }
  }
}

function renderColorQueue(colors, states = state.colorState) {
  colorQueue.replaceChildren();
  colorQueue.hidden = colors.length === 0;
  colors.forEach((color) => {
    const current = states[color.hex] || { status: "queued" };
    const row = document.createElement("div");
    row.className = `vf-color-row ${
      current.status === "generating"
        ? "is-generating"
        : current.status === "success" || current.status === "pass"
          ? "is-success"
          : current.status === "failed" || current.status === "retry"
            ? "is-error"
            : ""
    }`;
    const dot = document.createElement("i");
    dot.style.setProperty("--chip-color", color.hex);
    const label = document.createElement("span");
    label.textContent = color.hex;
    const suffix = document.createElement("small");
    const labels = {
      queued: "等待",
      generating: "Muse 生成中",
      success: "已生成",
      pass: `通过${current.delta_e ? ` · ΔE ${current.delta_e}` : ""}`,
      review: `复核${current.delta_e ? ` · ΔE ${current.delta_e}` : ""}`,
      retry: `需重试${current.delta_e ? ` · ΔE ${current.delta_e}` : ""}`,
      failed: "生成失败",
    };
    suffix.textContent = labels[current.status] || current.status;
    if (current.error) row.title = current.error;
    row.append(dot, label, suffix);
    colorQueue.append(row);
  });
}

async function runProductColors(colors = null, interactiveArchive = false) {
  if (state.busy) return;
  try {
    await ensureArchiveDirectory(interactiveArchive);
    if (state.files.length !== 1) {
      throw new Error("商品配色需要且只能添加 1 张商品主图");
    }
    const targetColors =
      colors || parseProductColors(document.querySelector("#vfProductColors").value);
    void rememberColors(targetColors);
    const region = colorRegion.value;
    state.colorState = Object.fromEntries(
      targetColors.map((color) => [color.hex, { status: "queued" }]),
    );
    state.failedProductColors = [];
    retryFailedColors.disabled = true;
    renderColorQueue(targetColors);
    const master = state.files[0];
    const tab = await getMuseTab();
    await sendTabMessage(tab.id, { type: "VF_PING" });
    museConnection.textContent = "MUSE READY";
    museConnection.className = "is-online";
    setBusy(true, "", true);
    const masterPayload = await serializeFile(
      master,
      `__master__-${master.name}`,
    );
    const generated = [];
    const failures = [];
    for (let index = 0; index < targetColors.length; index += 1) {
      await waitWhilePaused();
      const color = targetColors[index];
      showProgress(
        `Muse 正在生成 ${color.hex} · ${index + 1}/${targetColors.length}`,
        index,
        targetColors.length,
      );
      try {
        state.colorState[color.hex] = { status: "generating" };
        renderColorQueue(targetColors);
        const output = await sendTabMessage(tab.id, {
          type: "VF_MUSE_GENERATE_COLOR",
          master: masterPayload,
          color,
          index: index + 1,
          total: targetColors.length,
          region,
        });
        generated.push({ file: output, color });
        state.colorState[color.hex] = { status: "success" };
        renderColorQueue(targetColors);
      } catch (error) {
        failures.push({ color: color.hex, error: error.message });
        state.colorState[color.hex] = {
          status: "failed",
          error: error.message,
        };
        renderColorQueue(targetColors);
      }
    }
    if (!generated.length) {
      state.failedProductColors = failures.map((failure) => {
        const color = targetColors.find((item) => item.hex === failure.color);
        return color ? { ...color } : { hex: failure.color, name: "" };
      });
      retryFailedColors.disabled = state.failedProductColors.length === 0;
      throw new Error(failures[0]?.error || "Muse 没有返回可用图片");
    }
    showProgress(
      `Muse 已生成 ${generated.length} 张，正在精确校色`,
      targetColors.length,
      targetColors.length,
    );
    const files = [master];
    if (state.maskFile) {
      files.push(
        new File([state.maskFile], `__mask__-${state.maskFile.name}`, {
          type: state.maskFile.type || "image/png",
        }),
      );
    }
    files.push(
      ...generated.map((item, index) =>
        payloadToFile(
          item.file,
          `variant-${String(index + 1).padStart(2, "0")}-${item.color.hex.slice(1)}.webp`,
        ),
      ),
    );
    const created = await createLocalJob(
      "product_color_finalize",
      {
        colors: generated.map((item) => item.color),
        pass_limit: 3,
        review_limit: 5,
        region,
        sheet_columns: 4,
        sku: document.querySelector("#vfProductSku").value.trim(),
      },
      files,
    );
    const finalJob = await monitorJob(created);
    (finalJob.outputs || []).forEach((asset) => {
      if (!asset.color || asset.qa_status === undefined) return;
      state.colorState[asset.color] = {
        status: asset.qa_status,
        delta_e: asset.delta_e,
      };
    });
    state.failedProductColors = failures.map((failure) => {
      const color = targetColors.find((item) => item.hex === failure.color);
      return color ? { ...color } : { hex: failure.color, name: "" };
    });
    (finalJob.outputs || []).forEach((asset) => {
      if (
        asset.qa_status === "retry" &&
        asset.color &&
        !state.failedProductColors.some((item) => item.hex === asset.color)
      ) {
        const color = targetColors.find((item) => item.hex === asset.color);
        if (color) state.failedProductColors.push({ ...color });
      }
    });
    retryFailedColors.disabled = state.failedProductColors.length === 0;
    renderColorQueue(targetColors);
    const issueCount = state.failedProductColors.length;
    showProgress(
      issueCount
        ? `完成，${issueCount} 个颜色需要重试`
        : "完成，已校色并通过质检",
      targetColors.length,
      targetColors.length,
      issueCount > 0,
    );
  } catch (error) {
    if (state.failedProductColors.length) {
      retryFailedColors.disabled = false;
    }
    showProgress(error.message || "商品配色失败", 0, 0, true);
    showToast(error.message || "商品配色失败", true);
  } finally {
    setBusy(false);
  }
}

function executeCommand(command) {
  if (!command) return;
  const now = Date.now();
  if (
    command === state.lastCommand.text &&
    now - state.lastCommand.at < 1800
  ) {
    return;
  }
  state.lastCommand = { text: command, at: now };
  const parsed = parser.parse(command);
  if (!parsed) return;
  if (parsed.error) {
    showToast(parsed.error, true);
    return;
  }
  void sendMessage("VF_CLEAR_PENDING_COMMAND").catch(() => {});
  if (parsed.kind === "product_color_muse") {
    switchTab("product");
    document.querySelector("#vfProductSku").value = parsed.options.sku || "";
    document.querySelector("#vfProductColors").value = parsed.options.colors
      .map((color) => color.hex)
      .join(", ");
    colorRegion.value = parsed.options.region || "whole";
    renderColorChips();
    void runProductColors(parsed.options.colors);
    return;
  }
  if (parsed.kind === "logo_recolor") {
    switchTab("recolor");
    document.querySelector("#vfSkuRecolor").value = parsed.options.sku || "";
    document.querySelector("#vfColors").value = parsed.options.colors.join(", ");
    void runLogoJob("recolor");
    return;
  }
  if (parsed.kind === "logo_color_batch") {
    switchTab("batch");
    document.querySelector("#vfSkuBatch").value = parsed.options.sku || "";
    document.querySelector("#vfBatchColor").value = parsed.options.color;
    void runLogoJob("batch");
    return;
  }
  if (parsed.kind === "product_generate") {
    switchTab("generate");
    document.querySelector("#vfSkuGenerate").value = parsed.options.sku || "";
    document.querySelector("#vfPrompt").value = parsed.options.prompt;
    document.querySelector("#vfCount").value = String(parsed.options.count);
    document.querySelector("#vfSize").value = parsed.options.size;
    void runLogoJob("generate");
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    switchTab(tab.dataset.tab);
    if (tab.dataset.tab === "product") void checkMuseConnection();
  });
});

document.querySelectorAll("[data-generate-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    switchGenerateMode(button.dataset.generateMode);
  });
});

document.querySelectorAll("[data-run]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.run === "product") void runProductColors(null, true);
    else void runLogoJob(button.dataset.run, true);
  });
});

document.querySelector("#vfTryFirstColor").addEventListener("click", () => {
  try {
    const colors = parseProductColors(
      document.querySelector("#vfProductColors").value,
    );
    void runProductColors(colors.slice(0, 1), true);
  } catch (error) {
    showToast(error.message, true);
  }
});

retryFailedColors.addEventListener("click", () => {
  if (!state.failedProductColors.length) return;
  void runProductColors(
    state.failedProductColors.map((item) => ({ ...item })),
    true,
  );
});

fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});
uploadZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  uploadZone.classList.add("is-dragging");
});
uploadZone.addEventListener("dragleave", () => {
  uploadZone.classList.remove("is-dragging");
});
uploadZone.addEventListener("drop", (event) => {
  event.preventDefault();
  uploadZone.classList.remove("is-dragging");
  addFiles(event.dataTransfer.files);
});
maskInput.addEventListener("change", () => {
  state.maskFile = maskInput.files[0] || null;
  maskName.textContent = state.maskFile
    ? state.maskFile.name
    : "可选 · 不选则由 Muse 改动差异自动识别";
});
patternBaseInput.addEventListener("change", () => {
  state.patternBase = patternBaseInput.files[0] || null;
  patternBaseName.textContent = state.patternBase
    ? state.patternBase.name
    : "选择一张需要套花的主图";
  renderPatternPreview();
});
patternFolderInput.addEventListener("change", async () => {
  state.patternRefs = [...patternFolderInput.files].filter(isImageFile);
  try {
    await refreshPatternBatches();
  } catch (error) {
    showToast(`参考图处理失败：${error.message}`, true);
  }
});
document.querySelector("#vfRunPattern").addEventListener("click", () => {
  void runPatternTransfer(null, true);
});
retryPatternFailed.addEventListener("click", () => {
  if (!state.failedPatternRefs.length) return;
  void runPatternTransfer([...state.failedPatternRefs], true);
});
document
  .querySelector("#vfDownloadPatternBatches")
  .addEventListener("click", downloadPatternBatchArchives);

document.querySelector("#vfRefresh").addEventListener("click", () => {
  void loadJobs();
});
document.querySelector("#vfSettings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
pauseTask.addEventListener("click", togglePause);
document.querySelector("#vfChooseExportFolder").addEventListener("click", async () => {
  try {
    if (embedded) {
      await chrome.tabs.create({
        url: chrome.runtime.getURL("directory.html"),
      });
      showToast("已打开目录授权页，授权后返回挂件即可");
      return;
    }
    await VisualForgeArchive.chooseDirectory();
    await refreshArchiveStatus();
    showToast("归档目录已授权");
  } catch (error) {
    showToast(error.message, true);
  }
});
document.querySelector("#vfProductColors").addEventListener("input", () => {
  renderColorChips();
});
colorPicker.addEventListener("change", () => {
  addProductColor(colorPicker.value);
});
document.querySelector("#vfScreenColor").addEventListener("click", () => {
  void pickScreenColor();
});
document.querySelector("#vfImageColor").addEventListener("click", () => {
  void openImageColorPicker();
});
pickerCanvas.addEventListener("pointermove", (event) => {
  samplePicker(event, false);
});
pickerCanvas.addEventListener("click", (event) => {
  samplePicker(event, true);
});
usePickedColor.addEventListener("click", () => {
  if (!state.pickedColor) return;
  addProductColor(state.pickedColor);
  closeImageColorPicker();
});
document
  .querySelector("#vfClosePicker")
  .addEventListener("click", closeImageColorPicker);
imagePicker.addEventListener("click", (event) => {
  if (event.target === imagePicker) closeImageColorPicker();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "VF_PANEL_COMMAND") {
    executeCommand(message.command);
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== parent) return;
  if (event.data?.type === "VF_WIDGET_COMMAND") {
    executeCommand(event.data.command);
  }
});

window.addEventListener("focus", () => {
  void refreshArchiveStatus().catch(() => {});
});

async function initialize() {
  installEmbeddedControls();
  switchTab("product");
  renderColorChips();
  await loadRecentColors();
  await VisualForgeStore.recoverInterrupted();
  await loadJobs();
  try {
    const pending = await sendMessage("VF_TAKE_PENDING_COMMAND");
    if (pending.command) executeCommand(pending.command);
  } catch {
    // The toolbar panel can still be used without a pending command.
  }
}

async function monitorServices() {
  await checkHealth();
  await checkMuseConnection();
  const delay = connection.classList.contains("is-online") ? 20000 : 4000;
  setTimeout(() => {
    if (document.visibilityState === "visible") void monitorServices();
    else setTimeout(monitorServices, 2000);
  }, delay);
}

void initialize();
void monitorServices();
