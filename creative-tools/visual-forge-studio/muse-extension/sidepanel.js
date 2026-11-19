"use strict";

const parser = window.MuseBridgeCommands;
const museResponse = window.VisualForgeMuseResponse;
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
  generateMain: null,
  failedGeneratePrompts: [],
  generateChainRetry: null,
  copyTasks: [],
  copyTaskUrls: [],
  currentCopyTaskId: null,
  currentTaskIds: {},
  promptMemories: [],
  promptMemoryUrls: [],
  promptTemplates: {},
  paused: false,
  pauseWaiters: [],
  failedPatternRefs: [],
  sharedPreviewUrl: "",
  patternPreviewUrl: "",
  generatePreviewUrl: "",
  videoMain: null,
  videoPreviewUrl: "",
  videoPromptTemplate: "",
  failedVideoRequests: [],
  archiveStatus: null,
  jobObjectUrls: [],
  queueRunning: false,
  queuePaused: false,
  queueFailedTaskIds: [],
  queueSucceeded: 0,
  queueFailed: 0,
  queueSaved: 0,
  copyTemplateKey: "copy",
  museReturnedImages: [],
  museReturnedUrls: [],
  interfaceScale: 1.1,
  preferredMuseTabId: null,
  preferredMuseWindowId: null,
  capacityRecoveryCount: 0,
  capacityRecoveryStartedAt: 0,
  immediateDownloadCount: 0,
  immediateDownloadErrorShown: false,
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
const colorRequestMode = document.querySelector("#vfColorRequestMode");
const colorBatchSize = document.querySelector("#vfColorBatchSize");
const exportPath = document.querySelector("#vfExportPath");
const pauseTask = document.querySelector("#vfPauseTask");
const taskState = document.querySelector("#vfTaskState");
const mainPreview = document.querySelector("#vfMainPreview");
const mainPreviewImage = document.querySelector("#vfMainPreviewImage");
const mainPreviewName = document.querySelector("#vfMainPreviewName");
const patternPreview = document.querySelector("#vfPatternPreview");
const patternPreviewImage = document.querySelector("#vfPatternPreviewImage");
const patternPreviewName = document.querySelector("#vfPatternPreviewName");
const generateMainInput = document.querySelector("#vfGenerateMain");
const generateMainName = document.querySelector("#vfGenerateMainName");
const generatePreview = document.querySelector("#vfGeneratePreview");
const generatePreviewImage = document.querySelector("#vfGeneratePreviewImage");
const generatePreviewName = document.querySelector("#vfGeneratePreviewName");
const generateProgress = document.querySelector("#vfGenerateProgress");
const copyCategoryInput = document.querySelector("#vfCopyCategory");
const patternCategoryInput = document.querySelector("#vfPatternCategory");
const videoCategoryInput = document.querySelector("#vfVideoCategory");
const videoMainInput = document.querySelector("#vfVideoMain");
const videoMainName = document.querySelector("#vfVideoMainName");
const videoPreview = document.querySelector("#vfVideoPreview");
const videoPreviewImage = document.querySelector("#vfVideoPreviewImage");
const videoPreviewName = document.querySelector("#vfVideoPreviewName");
const videoProgress = document.querySelector("#vfVideoProgress");
const retryFailedVideo = document.querySelector("#vfRetryFailedVideo");
const requestCountInput = document.querySelector("#vfRequestCount");
const requestSummary = document.querySelector("#vfRequestSummary");
const generateBackground = document.querySelector("#vfGenerateBackground");
const autoContinueInput = document.querySelector("#vfAutoContinue");
const autoContinueTimeoutInput = document.querySelector(
  "#vfAutoContinueTimeout",
);
const autoRegenerateTextOnlyInput = document.querySelector(
  "#vfAutoRegenerateTextOnly",
);
const immediateDownloadInput = document.querySelector("#vfImmediateDownload");
const linksOnlyExportInput = document.querySelector("#vfLinksOnlyExport");
const stylePackInput = document.querySelector("#vfStylePack");
const retryFailedGenerate = document.querySelector("#vfRetryFailedGenerate");
const copyTaskList = document.querySelector("#vfCopyTaskList");
const copyTaskEmpty = document.querySelector("#vfCopyTaskEmpty");
const saveCopyTasks = document.querySelector("#vfSaveCopyTasks");
const addCopyTask = document.querySelector("#vfAddCopyTask");
const loadLastCopyTask = document.querySelector("#vfLoadLastCopyTask");
const detachCurrentTask = document.querySelector("#vfDetachCurrentTask");
const queueCopyTasks = document.querySelector("#vfQueueCopyTasks");
const queuePause = document.querySelector("#vfQueuePause");
const retryFailedQueue = document.querySelector("#vfRetryFailedQueue");
const queueSummary = document.querySelector("#vfQueueSummary");
const museReturnedSection = document.querySelector("#vfMuseReturnedSection");
const museReturnedGrid = document.querySelector("#vfMuseReturnedGrid");
const museReturnedMeta = document.querySelector("#vfMuseReturnedMeta");
const promptTemplateInput = document.querySelector("#vfPromptTemplate");
const promptTemplateState = document.querySelector("#vfTemplateState");
const rememberPrompt = document.querySelector("#vfRememberPrompt");
const promptMemoryList = document.querySelector("#vfPromptMemoryList");
const promptMemoryEmpty = document.querySelector("#vfPromptMemoryEmpty");
const directPromptInput = document.querySelector("#vfDirectPrompt");
const promptCatalog = document.querySelector("#vfPromptCatalog");
const promptCatalogStatus = document.querySelector("#vfPromptCatalogStatus");
const retryPatternFailed = document.querySelector("#vfRetryPatternFailed");
const logoRequestMode = document.querySelector("#vfLogoRequestMode");
const logoRequestCount = document.querySelector("#vfLogoRequestCount");
const logoOutputCount = document.querySelector("#vfLogoOutputCount");
const logoRequestSummary = document.querySelector("#vfLogoRequestSummary");
const patternRequestMode = document.querySelector("#vfPatternRequestMode");
const patternBatchSize = document.querySelector("#vfPatternBatchSize");
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
const logoDesignProgress = document.querySelector("#vfLogoDesignProgress");
const fontDecrease = document.querySelector("#vfFontDecrease");
const fontIncrease = document.querySelector("#vfFontIncrease");
const fontScaleValue = document.querySelector("#vfFontScaleValue");
const saveColorTask = document.querySelector("#vfSaveColorTask");
const saveRecolorTask = document.querySelector("#vfSaveRecolorTask");
const saveLogoImageTask = document.querySelector("#vfSaveLogoImageTask");
const newLogoImageTask = document.querySelector("#vfNewLogoImageTask");
const savePatternTask = document.querySelector("#vfSavePatternTask");
const embedded = new URLSearchParams(location.search).get("embedded") === "1";
let autoArchiveRunning = false;

const tabLabels = {
  product: "商品配色",
  recolor: "Logo 多色",
  batch: "Logo 重绘",
  generate: "产品裂变",
  video: "产品视频",
  tasks: "任务列表",
  prompts: "提示词模板",
};

const uploadLabels = {
  product: "添加商品主图",
  recolor: "添加一个 Logo",
  batch: "添加一张需要重绘 Logo 的商品主图",
  generate: "产品裂变不需要上传素材",
  video: "产品视频",
  tasks: "任务列表",
  prompts: "提示词模板",
};

const kindLabels = {
  logo_recolor: "Logo 多色",
  logo_color_batch: "多 Logo 同色（旧记录）",
  logo_image_recolor: "主图 Logo 同色",
  logo_image_generate: "Muse Logo 重绘",
  product_generate: "产品裂变",
  product_video_generate: "Muse 产品视频",
  product_color_finalize: "Muse 商品配色",
  pattern_batch_finalize: "印花套图",
};

const statusLabels = {
  pending: "待运行",
  queued: "排队中",
  running: "生成中",
  succeeded: "已完成",
  failed: "失败",
  pass: "通过",
  review: "复核",
  retry: "需重试",
};

const promptTemplateFeatures = [
  {
    key: "copy",
    label: "产品裂变 · 固定构图换印花",
    description:
      "变量：{{instruction}}、{{index}}、{{total}}、{{batch_count}}、{{direction}}、{{visual_instruction}}、{{background_instruction}}、{{category_name}}、{{category_print_area}}、{{category_base_surface}}。描述可留空，按商品类目随机更换印花与底布。",
  },
  {
    key: "product_color",
    label: "商品配色",
    description:
      "变量：{{region_name}}、{{color_description}}、{{color_hex}}、{{color_name}}、{{index}}、{{total}}。",
  },
  {
    key: "product_color_batch",
    label: "商品配色 · 多颜色批量",
    description:
      "变量：{{region_name}}、{{color_list}}、{{color_count}}、{{total}}。要求一张色卡对应一张独立输出。",
  },
  {
    key: "logo_design",
    label: "Logo 重绘",
    description: "变量：{{instruction}}。",
  },
  {
    key: "logo_design_batch",
    label: "Logo 重绘 · 单次多图",
    description:
      "变量：{{instruction}}、{{output_count}}、{{request_index}}。要求一次返回多张独立商品图。",
  },
  {
    key: "pattern_single",
    label: "印花套图 · 逐张模式",
    description:
      "变量：{{background_instruction}}、{{category_name}}、{{category_print_area}}、{{index}}、{{total}}。",
  },
  {
    key: "pattern_batch",
    label: "印花套图 · 批量模式",
    description:
      "变量：{{reference_list}}、{{batch_index}}、{{batch_count}}、{{background_instruction}}、{{category_name}}、{{category_print_area}}、{{total}}。",
  },
  {
    key: "video_showcase",
    label: "产品视频 · 商品展示",
    description:
      "变量：{{instruction}}、{{duration_seconds}}、{{aspect_ratio}}、{{presentation_instruction}}、{{category_name}}、{{category_model_region}}、{{request_index}}、{{request_count}}。内置真人上身不得露脸硬约束。",
  },
];

let toastTimer = 0;
const INTERFACE_SCALE_MIN = 0.85;
const INTERFACE_SCALE_MAX = 2;
const INTERFACE_SCALE_STEP = 0.05;

function boundedInterfaceScale(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 1.1;
  return Math.max(
    INTERFACE_SCALE_MIN,
    Math.min(INTERFACE_SCALE_MAX, Math.round(amount * 100) / 100),
  );
}

function applyInterfaceScale(
  value,
  { persist = true, notify = false } = {},
) {
  const scale = boundedInterfaceScale(value);
  state.interfaceScale = scale;
  document.documentElement.style.setProperty("--vf-ui-scale", String(scale));
  fontScaleValue.textContent = `${Math.round(scale * 100)}%`;
  fontScaleValue.title =
    "当前界面和字体缩放；点击恢复 110%，也可按 Ctrl + 鼠标滚轮调整";
  fontDecrease.disabled = scale <= INTERFACE_SCALE_MIN;
  fontIncrease.disabled = scale >= INTERFACE_SCALE_MAX;
  if (persist) {
    void chrome.storage.local.set({ interfaceScale: scale });
  }
  if (notify) {
    showToast(`界面与字体已调整为 ${Math.round(scale * 100)}%`);
  }
}

function changeInterfaceScale(delta, notify = false) {
  applyInterfaceScale(state.interfaceScale + delta, { notify });
}

function defaultPromptTemplates() {
  return {
    copy: VisualForgeCore.DEFAULT_COPY_PROMPT_TEMPLATE,
    ...window.VisualForgePromptTemplates.DEFAULTS,
  };
}

function renderPromptCatalog() {
  promptCatalog.replaceChildren();
  const defaults = defaultPromptTemplates();
  for (const feature of promptTemplateFeatures) {
    const card = document.createElement("article");
    card.className = "vf-prompt-card";
    const header = document.createElement("header");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = feature.label;
    const description = document.createElement("small");
    description.textContent = feature.description;
    copy.append(title, description);
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "恢复默认";
    reset.addEventListener("click", async () => {
      const textarea = promptCatalog.querySelector(
        `[data-prompt-key="${feature.key}"]`,
      );
      textarea.value = defaults[feature.key];
      await persistPromptCatalog(`${feature.label}已恢复默认`);
    });
    header.append(copy, reset);
    const textarea = document.createElement("textarea");
    textarea.dataset.promptKey = feature.key;
    textarea.spellcheck = false;
    textarea.value =
      state.promptTemplates[feature.key] || defaults[feature.key];
    card.append(header, textarea);
    promptCatalog.append(card);
  }
}

async function persistPromptCatalog(message = "全部提示词模板已保存") {
  const next = {};
  for (const feature of promptTemplateFeatures) {
    const textarea = promptCatalog.querySelector(
      `[data-prompt-key="${feature.key}"]`,
    );
    const value = textarea.value.trim();
    if (!value) throw new Error(`${feature.label}模板不能为空`);
    next[feature.key] = value;
  }
  state.promptTemplates = next;
  state.videoPromptTemplate = next.video_showcase;
  promptTemplateInput.value = next.copy;
  updatePromptTemplateState();
  await chrome.storage.local.set({
    promptTemplates: next,
    copyPromptTemplate: next.copy,
  });
  promptCatalogStatus.textContent = message;
}

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

function sendRawTabMessage(tabId, message) {
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

function resetCapacityRecoveryIfStale() {
  if (
    state.capacityRecoveryStartedAt &&
    Date.now() - state.capacityRecoveryStartedAt > 10 * 60 * 1000
  ) {
    state.capacityRecoveryCount = 0;
    state.capacityRecoveryStartedAt = 0;
    state.preferredMuseTabId = null;
    state.preferredMuseWindowId = null;
  }
}

function isCapacityError(error) {
  return String(error?.message || "").startsWith(
    museResponse?.CAPACITY_ERROR_PREFIX || "VF_MUSE_CAPACITY:",
  );
}

async function waitForMuseTabReady(tabId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await sendRawTabMessage(tabId, { type: "VF_PING" });
      return true;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError || new Error("新 Muse 窗口未加载扩展");
}

async function openFreshMuseWindow() {
  let createdWindow = null;
  let tab = null;
  if (chrome.windows?.create) {
    createdWindow = await chrome.windows.create({
      url: museResponse.MUSE_FRESH_THREAD_URL,
      type: "normal",
      focused: true,
    });
    tab = createdWindow.tabs?.[0] || null;
    if (!tab?.id && createdWindow.id !== undefined) {
      const tabs = await chrome.tabs.query({ windowId: createdWindow.id });
      tab = tabs.find((item) => /^https:\/\/muse\.ai\//.test(item.url || ""));
    }
  }
  if (!tab?.id) {
    tab = await chrome.tabs.create({
      url: museResponse.MUSE_FRESH_THREAD_URL,
      active: true,
    });
  }
  if (!tab?.id) throw new Error("无法创建新的 Muse 窗口");
  state.preferredMuseTabId = tab.id;
  state.preferredMuseWindowId = createdWindow?.id ?? tab.windowId ?? null;
  await waitForMuseTabReady(tab.id);
  return tab;
}

async function sendTabMessage(tabId, message) {
  resetCapacityRecoveryIfStale();
  const targetTabId = state.preferredMuseTabId || tabId;
  const enrichedMessage =
    message?.type === "VF_PING" || message?.type?.startsWith("VF_MUSE_")
      ? {
          ...message,
          autoRegenerateTextOnly: autoRegenerateTextOnlyInput.checked,
        }
      : message;
  try {
    return await sendRawTabMessage(targetTabId, enrichedMessage);
  } catch (error) {
    if (!isCapacityError(error)) throw error;
    if (state.capacityRecoveryCount >= 2) {
      throw new Error(
        `${museResponse.CAPACITY_ERROR_PREFIX}已打开新窗口但 Muse 仍无法继续：` +
          `${error.message.replace(museResponse.CAPACITY_ERROR_PREFIX, "")}`,
      );
    }
    state.capacityRecoveryCount += 1;
    state.capacityRecoveryStartedAt =
      state.capacityRecoveryStartedAt || Date.now();
    showToast(
      `Muse 当前对话容量不足，正在打开空白新对话（${state.capacityRecoveryCount}/2）`,
    );
    let freshTab;
    try {
      freshTab = await openFreshMuseWindow();
    } catch (openError) {
      throw new Error(
        `${museResponse.CAPACITY_ERROR_PREFIX}新 Muse 窗口打开失败：` +
          openError.message,
      );
    }
    try {
      const result = await sendRawTabMessage(freshTab.id, enrichedMessage);
      showToast("已切换到 Muse 空白新对话并重试当前请求");
      return result;
    } catch (retryError) {
      if (!isCapacityError(retryError)) throw retryError;
      throw new Error(
        `${museResponse.CAPACITY_ERROR_PREFIX}新窗口仍提示图片过多：` +
          retryError.message.replace(museResponse.CAPACITY_ERROR_PREFIX, ""),
      );
    }
  }
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
    "[data-run], #vfTryFirstColor, #vfRetryFailedColors, #vfRunPattern, #vfRetryPatternFailed, #vfRetryFailedGenerate, #vfRunVideo, #vfRetryFailedVideo",
  ).forEach((button) => {
    button.disabled = value;
  });
  pauseTask.disabled = (!value || !pauseAvailable) && !state.queueRunning;
  taskState.textContent = value
    ? message || "任务执行中"
    : "当前没有运行中的任务";
  if (!value) {
    retryFailedColors.disabled = state.failedProductColors.length === 0;
    retryPatternFailed.disabled = state.failedPatternRefs.length === 0;
    retryFailedGenerate.disabled = state.failedGeneratePrompts.length === 0;
    retryFailedVideo.disabled = state.failedVideoRequests.length === 0;
    state.paused = state.queueRunning ? state.queuePaused : false;
    pauseTask.classList.remove("is-paused");
    pauseTask.textContent = state.paused ? "▶" : "Ⅱ";
    pauseTask.title = state.paused ? "继续任务" : "当前图完成后暂停";
    const waiters = state.pauseWaiters.splice(0);
    waiters.forEach((resolve) => resolve());
  }
  queueCopyTasks.disabled =
    value || state.queueRunning || state.copyTasks.length === 0;
  updateQueueControls();
  if (message) showToast(message);
}

function updateQueueControls() {
  queuePause.disabled = !state.queueRunning;
  queuePause.textContent = state.queuePaused ? "继续队列" : "暂停队列";
  queuePause.classList.toggle("is-paused", state.queuePaused);
  retryFailedQueue.disabled =
    state.queueRunning || state.queueFailedTaskIds.length === 0;
}

function setQueuePaused(value) {
  if (!state.queueRunning) return;
  state.queuePaused = Boolean(value);
  state.paused = state.queuePaused;
  queuePause.textContent = state.queuePaused ? "继续队列" : "暂停队列";
  queuePause.classList.toggle("is-paused", state.queuePaused);
  pauseTask.classList.toggle("is-paused", state.queuePaused);
  pauseTask.textContent = state.queuePaused ? "▶" : "Ⅱ";
  pauseTask.title = state.queuePaused ? "继续任务队列" : "暂停任务队列";
  if (state.queuePaused) {
    showToast("队列已暂停，当前图片完成后停止");
  } else {
    const waiters = state.pauseWaiters.splice(0);
    waiters.forEach((resolve) => resolve());
    showToast("任务队列已继续");
  }
  updateQueueControls();
}

async function waitWhilePaused() {
  while (state.paused) {
    await new Promise((resolve) => state.pauseWaiters.push(resolve));
  }
}

function togglePause() {
  if (state.queueRunning) {
    setQueuePaused(!state.queuePaused);
    return;
  }
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
  if (!file || ["generate", "video"].includes(state.activeTab)) {
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

function renderGeneratePreview() {
  if (state.generatePreviewUrl) {
    URL.revokeObjectURL(state.generatePreviewUrl);
  }
  state.generatePreviewUrl = "";
  if (!state.generateMain) {
    generatePreview.hidden = true;
    generatePreviewImage.removeAttribute("src");
    generateMainName.textContent = "选择一张需要裂变的商品主图";
    return;
  }
  state.generatePreviewUrl = URL.createObjectURL(state.generateMain);
  generatePreviewImage.src = state.generatePreviewUrl;
  generatePreviewName.textContent = state.generateMain.name;
  generateMainName.textContent = state.generateMain.name;
  generatePreview.hidden = false;
}

function renderVideoPreview() {
  if (state.videoPreviewUrl) URL.revokeObjectURL(state.videoPreviewUrl);
  state.videoPreviewUrl = "";
  if (!state.videoMain) {
    videoPreview.hidden = true;
    videoPreviewImage.removeAttribute("src");
    videoMainName.textContent = "选择一张需要制作展示视频的商品图";
    return;
  }
  state.videoPreviewUrl = URL.createObjectURL(state.videoMain);
  videoPreviewImage.src = state.videoPreviewUrl;
  videoPreviewName.textContent = state.videoMain.name;
  videoMainName.textContent = state.videoMain.name;
  videoPreview.hidden = false;
}

function setVideoProgress(message, current = 0, total = 0, isError = false) {
  videoProgress.hidden = false;
  videoProgress.classList.toggle("is-error", isError);
  videoProgress.replaceChildren();
  const text = document.createElement("span");
  text.textContent = message;
  videoProgress.append(text);
  if (total) {
    const bar = document.createElement("i");
    bar.style.width = `${Math.min(100, (current / total) * 100)}%`;
    videoProgress.append(bar);
  }
}

function renderRequestSummary() {
  const requests = Number(requestCountInput.value || 1);
  const outputs = Number(document.querySelector("#vfCount").value || 1);
  requestSummary.textContent =
    `当前：${requests} 次对话 × 每次返回 ${outputs} 张 = ` +
    `共 ${requests * outputs} 张，共 ${requests} 次 Muse 请求。`;
}

function renderLogoRequestSummary() {
  const requests = safePositiveInteger(
    logoRequestCount.value || 1,
    "Logo 重绘请求次数",
  );
  const outputs = safePositiveInteger(
    logoOutputCount.value || 1,
    "Logo 重绘每批数量",
    4,
  );
  const mode =
    logoRequestMode.value === "batch" ? "批量返回" : "逐张稳定";
  logoRequestSummary.textContent =
    `当前：${requests} 次请求 × 每批 ${outputs} 张 = 共 ` +
    `${requests * outputs} 张，${mode}。`;
}

function showMuseReturnedImages(files, meta = {}) {
  state.museReturnedImages.push(
    ...files.map((file) => ({
      blob: file,
      name: file.name,
      batch: meta.batch || null,
      total: meta.total || null,
    })),
  );
  if (state.museReturnedImages.length > 24) {
    state.museReturnedImages.splice(
      0,
      state.museReturnedImages.length - 24,
    );
  }
  for (const url of state.museReturnedUrls) URL.revokeObjectURL(url);
  state.museReturnedUrls = [];
  museReturnedGrid.replaceChildren();
  for (const item of state.museReturnedImages) {
    const url = URL.createObjectURL(item.blob);
    state.museReturnedUrls.push(url);
    if (/^video\//i.test(item.blob.type || "")) {
      const tile = document.createElement("div");
      tile.className = "vf-muse-video-tile";
      tile.title = item.name;
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-label", item.name);
      tile.append(video);
      museReturnedGrid.append(tile);
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.title = item.name;
      const image = document.createElement("img");
      image.src = url;
      image.alt = item.name;
      link.append(image);
      museReturnedGrid.append(link);
    }
  }
  museReturnedSection.hidden = state.museReturnedImages.length === 0;
  const last = state.museReturnedImages.at(-1);
  museReturnedMeta.textContent =
    `${state.museReturnedImages.length} 项媒体` +
    (last?.batch && last?.total
      ? ` · 最近来自第 ${last.batch}/${last.total} 次对话`
      : "");
}

const taskModuleLabels = {
  product_color: "商品配色",
  logo_recolor: "Logo 多色",
  logo_image_generate: "Logo 重绘",
  pattern_transfer: "印花套图",
  product_generate: "产品裂变",
  product_video_generate: "产品视频",
};

function taskModule(task) {
  return task.module || "product_generate";
}

function taskModuleLabel(task) {
  return taskModuleLabels[taskModule(task)] || task.module || "任务";
}

function fileRecord(file) {
  if (!file) return null;
  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    last_modified: file.lastModified || 0,
    relative_path: file.webkitRelativePath || file.name,
    blob: file,
  };
}

function recordToFile(record, fallbackName = "task-image.png") {
  if (!record?.blob) throw new Error("任务缺少图片文件");
  const file = new File([record.blob], record.name || fallbackName, {
    type: record.type || "image/png",
    lastModified: record.last_modified || Date.now(),
  });
  if (record.relative_path) {
    Object.defineProperty(file, "webkitRelativePath", {
      value: record.relative_path,
      configurable: true,
    });
  }
  return file;
}

function taskToFile(task) {
  if (!task.main_image?.blob) throw new Error("任务缺少主图");
  return recordToFile(task.main_image);
}

function taskOptions(task) {
  return task.options || {};
}

function boundedBatchSize(value, fallback = 4) {
  const amount = Math.floor(Number(value) || fallback);
  return Math.max(1, Math.min(4, amount));
}

function safePositiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > maximum) {
    throw new Error(`${label}必须是大于 0 的整数`);
  }
  return amount;
}

function videoPresentationLabel(value) {
  return {
    product: "商品独立展示",
    worn_no_face: "模特上身 · 不露脸",
    mixed: "产品细节 + 模特上身 · 不露脸",
  }[value] || "商品独立展示";
}

function productCategoryLabel(value, instruction = "") {
  const category =
    window.VisualForgePromptTemplates.productCategoryValues(
      value,
      instruction,
    );
  return category.label || "自动识别 / 通用商品";
}

function renderProductCategoryOptions() {
  const options =
    window.VisualForgePromptTemplates.productCategoryOptions();
  for (const select of [
    copyCategoryInput,
    patternCategoryInput,
    videoCategoryInput,
  ]) {
    const current = select.value || "auto";
    select.replaceChildren();
    for (const item of options) {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      select.append(option);
    }
    select.value = options.some((item) => item.value === current)
      ? current
      : "auto";
  }
}

function taskDisplayName(task) {
  const options = taskOptions(task);
  const module = taskModule(task);
  if (module === "product_generate") {
    return task.base_prompt || options.base_prompt || "未命名产品裂变";
  }
  if (module === "product_color") {
    const count = Array.isArray(options.colors)
      ? options.colors.length
      : String(options.colors || "")
          .split(/[\s,，;；]+/)
          .filter(Boolean).length;
    return `商品配色 · ${count || 0} 个颜色`;
  }
  if (module === "logo_recolor") {
    return `Logo 多色 · ${String(options.colors || "").replace(/\s+/g, " ")}`;
  }
  if (module === "logo_image_generate") {
    return options.prompt || "未命名 Logo 重绘";
  }
  if (module === "pattern_transfer") {
    return `印花套图 · ${(task.files || []).length} 张参考图`;
  }
  if (module === "product_video_generate") {
    return options.prompt || options.sku
      ? `产品视频 · ${String(options.prompt || options.sku).slice(0, 42)}`
      : "产品视频 · 商品展示";
  }
  return task.id;
}

function taskRequestSummary(task) {
  const options = taskOptions(task);
  const module = taskModule(task);
  if (module === "product_color") {
    return options.request_mode === "batch"
      ? `多颜色批量 · 每批最多 ${boundedBatchSize(options.batch_size)} 张`
      : "逐色稳定 · 每次 1 张";
  }
  if (module === "logo_recolor") {
    return "本地处理 · 不调用 Muse";
  }
  if (module === "logo_image_generate") {
    const requestCount = Number(options.request_count || 1);
    const outputCount = Number(options.output_count || 1);
    return options.request_mode === "batch"
      ? `${requestCount} 次请求 × 每批 ${outputCount} 张 = ${requestCount * outputCount} 张`
      : `${requestCount} 次请求 × 每批 ${outputCount} 张（逐张发送）= ${requestCount * outputCount} 张`;
  }
  if (module === "pattern_transfer") {
    return options.request_mode === "batch"
      ? `参考图批量 · 每批最多 ${boundedBatchSize(options.batch_size)} 张`
      : "参考图逐张稳定";
  }
  if (module === "product_video_generate") {
    const requestCount = Number(options.request_count || 1);
    return `${requestCount} 次视频请求 · 每次 1 个视频 · ` +
      `${options.duration_seconds || 8} 秒 · ${options.aspect_ratio || "9:16"}`;
  }
  const requestCount = Number(task.request_count || options.request_count || 1);
  const outputCount = Number(task.output_count || options.output_count || 1);
  return `${requestCount} 次对话 × 每次 ${outputCount} 张 = ${requestCount * outputCount} 张`;
}

function taskDetail(task) {
  const module = taskModule(task);
  const options = taskOptions(task);
  if (module === "product_generate") {
    const template =
      task.prompt_template || VisualForgeCore.DEFAULT_COPY_PROMPT_TEMPLATE;
    const promptDetail = task.direct_prompt
      ? `直传提示词：${task.base_prompt || "未填写"}`
      : template === VisualForgeCore.DEFAULT_COPY_PROMPT_TEMPLATE
        ? "使用内置默认提示词模板"
        : `自定义模板：${String(template).replace(/\s+/g, " ").slice(0, 110)}`;
    return `${productCategoryLabel(
      options.category,
      task.base_prompt,
    )} · ${
      (task.background_mode || task.options?.background_mode) === "keep"
        ? "保持原背景"
        : "随印花改变背景"
    } · ${promptDetail}`;
  }
  if (module === "product_color") {
    return `色号：${(options.colors || [])
      .map((color) => color.hex || color)
      .join(", ")}`;
  }
  if (module === "logo_recolor") {
    return `目标颜色：${String(options.colors || "").replace(/\s+/g, " ")}`;
  }
  if (module === "logo_image_generate") {
    return `设计要求：${String(options.prompt || "").replace(/\s+/g, " ").slice(0, 130)}`;
  }
  if (module === "pattern_transfer") {
    return `${productCategoryLabel(options.category)} · 货号：${options.sku || "未填写"} · 背景：${
      options.background_mode === "match" ? "随印花变化" : "保持原白底"
    }`;
  }
  if (module === "product_video_generate") {
    const prompt = String(options.prompt || "").replace(/\s+/g, " ").slice(0, 110);
    return `${productCategoryLabel(options.category)} · ${videoPresentationLabel(options.presentation_mode)} · ` +
      `${options.duration_seconds || 8} 秒 · ${options.aspect_ratio || "9:16"} · ` +
      `${prompt || "使用内置视频展示提示词"}`;
  }
  return "";
}

function copyTaskFields() {
  if (!state.generateMain) throw new Error("请先选择产品裂变商品主图");
  const prompt = document.querySelector("#vfPrompt").value.trim();
  const count = Number(document.querySelector("#vfCount").value);
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    throw new Error("单次返回张数需在 1 到 4 之间");
  }
  const requestCount = Number(requestCountInput.value);
  if (!Number.isSafeInteger(requestCount) || requestCount < 1) {
    throw new Error("请求次数必须是大于 0 的整数");
  }
  const totalRequests = count * requestCount;
  if (!Number.isSafeInteger(totalRequests)) {
    throw new Error("请求次数过大，超出浏览器可处理范围");
  }
  const template =
    promptTemplateInput.value.trim() ||
    VisualForgeCore.DEFAULT_COPY_PROMPT_TEMPLATE;
  const directPrompt = directPromptInput.checked;
  const stylePack = stylePackInput.value || "auto";
  const templateKey = state.copyTemplateKey || "copy";
  const backgroundMode =
    generateBackground.value === "keep" ? "keep" : "match";
  const category = copyCategoryInput.value || "auto";
  if (directPrompt) {
    if (!prompt) throw new Error("直接发送模式下请填写完整提示词");
    VisualForgeCore.buildDirectCopyPrompts(prompt, totalRequests);
  } else {
    VisualForgeCore.buildCopyBatchPrompts(
      prompt,
      count,
      requestCount,
      template,
      stylePack,
      backgroundMode,
      category,
    );
  }
  return {
    prompt,
    count,
    requestCount,
    totalRequests,
    template,
    directPrompt,
    stylePack,
    templateKey,
    engine: document.querySelector("#vfGenerateEngine").value,
    chainMode: document.querySelector("#vfGenerateChainMode").value,
    backgroundMode,
    category,
    sku: document.querySelector("#vfSkuGenerate").value.trim(),
    size: document.querySelector("#vfSize").value,
  };
}

async function saveCurrentModeTask(
  module,
  { silent = false, forceNew = false } = {},
) {
  const options = {};
  let mainImage = null;
  let files = [];
  let legacy = {};
  if (module === "product_color") {
    if (state.files.length !== 1) {
      throw new Error("商品配色需要且只能添加 1 张商品主图");
    }
    options.colors = parseProductColors(
      document.querySelector("#vfProductColors").value,
    );
    options.region = colorRegion.value;
    options.sku = document.querySelector("#vfProductSku").value.trim();
    options.request_mode =
      colorRequestMode.value === "batch" ? "batch" : "stable";
    options.batch_size = boundedBatchSize(colorBatchSize.value);
    mainImage = fileRecord(state.files[0]);
    if (state.maskFile) options.mask_image = fileRecord(state.maskFile);
  } else if (module === "logo_recolor") {
    if (state.files.length !== 1) {
      throw new Error("Logo 多色需要且只能添加 1 个 Logo");
    }
    options.colors = document.querySelector("#vfColors").value.trim();
    if (!VisualForgeCore.normalizeColors(options.colors, 30).length) {
      throw new Error("请至少填写一个有效颜色");
    }
    options.remove_background =
      document.querySelector("#vfRecolorBackground").value;
    options.trim = true;
    options.sku = document.querySelector("#vfSkuRecolor").value.trim();
    mainImage = fileRecord(state.files[0]);
  } else if (module === "logo_image_generate") {
    if (state.files.length !== 1) {
      throw new Error("Logo 重绘需要且只能添加 1 张商品主图");
    }
    options.prompt = document.querySelector("#vfLogoPrompt").value.trim();
    if (!options.prompt) throw new Error("请填写新 Logo 的设计要求");
    options.sku = document.querySelector("#vfSkuBatch").value.trim();
    options.request_mode =
      logoRequestMode.value === "batch" ? "batch" : "stable";
    options.request_count = safePositiveInteger(
      logoRequestCount.value,
      "Logo 重绘请求次数",
    );
    options.output_count = safePositiveInteger(
      logoOutputCount.value,
      "Logo 重绘每批数量",
      4,
    );
    if (!Number.isSafeInteger(options.request_count * options.output_count)) {
      throw new Error("请求次数过大，超出浏览器可处理范围");
    }
    mainImage = fileRecord(state.files[0]);
  } else if (module === "pattern_transfer") {
    if (!state.patternBase) throw new Error("请选择一张白底商品图");
    if (!state.patternRefs.length) throw new Error("请选择印花参考图文件夹");
    options.sku = document.querySelector("#vfSkuPattern").value.trim();
    options.background_mode =
      document.querySelector("#vfPatternBackground").value;
    options.category = patternCategoryInput.value || "auto";
    options.request_mode =
      patternRequestMode.value === "batch" ? "batch" : "stable";
    options.batch_size = boundedBatchSize(patternBatchSize.value);
    mainImage = fileRecord(state.patternBase);
    files = state.patternRefs.map(fileRecord);
  } else if (module === "product_generate") {
    const fields = copyTaskFields();
    legacy = {
      base_prompt: fields.prompt,
      prompt_template: fields.template,
      direct_prompt: fields.directPrompt,
      style_pack: fields.stylePack,
      prompt_template_key: fields.templateKey,
      output_count: fields.count,
      request_count: fields.requestCount,
      sku: fields.sku,
      engine: fields.engine,
      chain_mode: fields.chainMode,
      background_mode: fields.backgroundMode,
      category: fields.category,
      size: fields.size,
      quality: "high",
    };
    options.base_prompt = fields.prompt;
    options.prompt_template = fields.template;
    options.direct_prompt = fields.directPrompt;
    options.style_pack = fields.stylePack;
    options.output_count = fields.count;
    options.request_count = fields.requestCount;
    options.sku = fields.sku;
    options.engine = fields.engine;
    options.chain_mode = fields.chainMode;
    options.background_mode = fields.backgroundMode;
    options.category = fields.category;
    options.size = fields.size;
    mainImage = fileRecord(state.generateMain);
  } else if (module === "product_video_generate") {
    if (!state.videoMain) {
      throw new Error("产品视频需要且只能添加 1 张商品主图");
    }
    options.prompt = document.querySelector("#vfVideoPrompt").value.trim();
    options.sku = document.querySelector("#vfSkuVideo").value.trim();
    options.presentation_mode =
      document.querySelector("#vfVideoPresentation").value;
    options.category = videoCategoryInput.value || "auto";
    options.duration_seconds = safePositiveInteger(
      document.querySelector("#vfVideoDuration").value,
      "视频时长",
      10,
    );
    options.aspect_ratio = document.querySelector("#vfVideoAspect").value;
    options.request_count = safePositiveInteger(
      document.querySelector("#vfVideoRequestCount").value,
      "视频请求次数",
    );
    if (!["product", "worn_no_face", "mixed"].includes(options.presentation_mode)) {
      throw new Error("产品视频展示方式无效");
    }
    if (!["5", "8", "10"].includes(String(options.duration_seconds))) {
      throw new Error("视频时长仅支持 5、8 或 10 秒");
    }
    if (!["9:16", "1:1", "16:9"].includes(options.aspect_ratio)) {
      throw new Error("产品视频画面比例无效");
    }
    options.prompt_template = state.promptTemplates.video_showcase;
    options.video_engine = "muse";
    legacy = {
      prompt_template: options.prompt_template,
      request_count: options.request_count,
      output_count: 1,
    };
    mainImage = fileRecord(state.videoMain);
  } else {
    throw new Error(`不支持保存任务类型：${module}`);
  }
  const existingId = forceNew ? null : state.currentTaskIds[module];
  let existing = null;
  if (existingId) {
    try {
      existing = await VisualForgeStore.getTask(existingId);
    } catch {
      existing = null;
    }
  }
  const now = new Date().toISOString();
  const task = {
    ...(existing || {}),
    ...legacy,
    id: existing?.id || crypto.randomUUID().replaceAll("-", ""),
    module,
    main_image: mainImage,
    files,
    options,
    request_mode: options.request_mode || "stable",
    batch_size: options.batch_size || 1,
    output_count: options.output_count || existing?.output_count || 1,
    request_count: options.request_count || existing?.request_count || 1,
    status: "pending",
    last_job_id: null,
    last_started_at: null,
    last_finished_at: null,
    error: null,
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  await VisualForgeStore.putTask(task);
  state.currentTaskIds[module] = task.id;
  if (module === "product_generate") state.currentCopyTaskId = task.id;
  if (module === "product_generate") await rememberPromptTask(task);
  await renderCopyTasks();
  if (!silent) {
    showToast(
      `已${forceNew ? "新增" : "保存"}${taskModuleLabel(task)}任务`,
    );
  }
  return task;
}

async function saveCurrentCopyTask({ silent = false } = {}) {
  return saveCurrentModeTask("product_generate", { silent });
}

async function setTaskStatus(taskId, values) {
  if (!taskId) return null;
  try {
    const task = await VisualForgeStore.getTask(taskId);
    const updated = {
      ...task,
      ...values,
      updated_at: new Date().toISOString(),
    };
    await VisualForgeStore.putTask(updated);
    await renderCopyTasks();
    return updated;
  } catch {
    return null;
  }
}

async function setCopyTaskStatus(taskId, values) {
  return setTaskStatus(taskId, values);
}

async function renderCopyTasks() {
  state.copyTasks = await VisualForgeStore.listTasks();
  for (const url of state.copyTaskUrls) URL.revokeObjectURL(url);
  state.copyTaskUrls = [];
  copyTaskList.replaceChildren();
  copyTaskEmpty.hidden = state.copyTasks.length > 0;
  queueCopyTasks.disabled =
    state.busy || state.queueRunning || state.copyTasks.length === 0;
  for (const task of state.copyTasks) {
    const card = document.createElement("article");
    card.className = "vf-copy-task";

    const head = document.createElement("div");
    head.className = "vf-copy-task-head";
    const thumb = document.createElement("img");
    thumb.className = "vf-copy-task-thumb";
    const thumbnailRecord = task.main_image || (task.files || [])[0];
    thumb.alt = thumbnailRecord?.name || "任务图片";
    if (thumbnailRecord?.blob) {
      const url = URL.createObjectURL(thumbnailRecord.blob);
      state.copyTaskUrls.push(url);
      thumb.src = url;
    }
    const title = document.createElement("div");
    title.className = "vf-copy-task-title";
    const strong = document.createElement("strong");
    strong.textContent = taskDisplayName(task);
    const meta = document.createElement("small");
    meta.textContent =
      `${taskModuleLabel(task)} · ${taskRequestSummary(task)} · ` +
      `${statusLabels[task.status] || task.status || "待运行"}`;
    title.append(strong, meta);
    head.append(thumb, title);

    const promptLine = document.createElement("p");
    promptLine.className = "vf-copy-task-prompt";
    promptLine.textContent = taskDetail(task);

    const actions = document.createElement("div");
    actions.className = "vf-copy-task-actions";
    const load = document.createElement("button");
    load.type = "button";
    load.textContent = "加载配置";
    load.addEventListener("click", () => void loadStoredTask(task));
    const run = document.createElement("button");
    run.type = "button";
    run.className = "is-primary";
    run.textContent = "运行此任务";
    run.addEventListener("click", () => void executeStoredTask(task));
    const duplicate = document.createElement("button");
    duplicate.type = "button";
    const copyCount = document.createElement("input");
    copyCount.type = "number";
    copyCount.className = "vf-copy-count";
    copyCount.min = "1";
    copyCount.step = "1";
    copyCount.value = "1";
    copyCount.title = "复制次数";
    copyCount.setAttribute("aria-label", "复制次数");
    const updateDuplicateLabel = () => {
      const amount = Math.max(1, Math.floor(Number(copyCount.value) || 1));
      duplicate.textContent = `复制 ${amount} 次`;
    };
    copyCount.addEventListener("input", updateDuplicateLabel);
    updateDuplicateLabel();
    duplicate.addEventListener("click", () => {
      const amount = Math.max(1, Math.floor(Number(copyCount.value) || 1));
      void duplicateTask(task, amount);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "删除";
    remove.addEventListener("click", () => deleteTask(task));
    actions.append(load, run, copyCount, duplicate, remove);

    card.append(head, promptLine, actions);
    copyTaskList.append(card);
  }
}

async function loadStoredTask(task, { notify = true } = {}) {
  const module = taskModule(task);
  const options = taskOptions(task);
  if (module === "product_generate") {
    loadStoredCopyTask(task, { notify });
    return;
  }
  if (module === "product_color") {
    switchTab("product");
    state.files = [taskToFile(task)];
    renderFiles();
    renderMainPreview();
    const colors = Array.isArray(options.colors) ? options.colors : [];
    document.querySelector("#vfProductColors").value = colors
      .map((color) => color.hex || color)
      .join(", ");
    document.querySelector("#vfProductSku").value = options.sku || "";
    colorRegion.value = options.region || "whole";
    colorRequestMode.value = options.request_mode === "batch" ? "batch" : "stable";
    colorBatchSize.value = String(boundedBatchSize(options.batch_size));
    state.maskFile = options.mask_image?.blob
      ? recordToFile(options.mask_image, "task-mask.png")
      : null;
    maskName.textContent = state.maskFile
      ? state.maskFile.name
      : "可选 · 不选则由 Muse 改动差异自动识别";
    renderColorChips();
  } else if (module === "logo_recolor") {
    switchTab("recolor");
    state.files = [taskToFile(task)];
    renderFiles();
    renderMainPreview();
    document.querySelector("#vfColors").value = options.colors || "";
    document.querySelector("#vfRecolorBackground").value =
      options.remove_background || "auto";
    document.querySelector("#vfSkuRecolor").value = options.sku || "";
  } else if (module === "logo_image_generate") {
    switchTab("batch");
    state.files = [taskToFile(task)];
    renderFiles();
    renderMainPreview();
    document.querySelector("#vfLogoPrompt").value = options.prompt || "";
    document.querySelector("#vfSkuBatch").value = options.sku || "";
    logoRequestMode.value = options.request_mode === "batch" ? "batch" : "stable";
    logoRequestCount.value = String(options.request_count || 1);
    logoOutputCount.value = String(options.output_count || 1);
    renderLogoRequestSummary();
  } else if (module === "pattern_transfer") {
    switchTab("generate");
    switchGenerateMode("pattern");
    state.patternBase = taskToFile(task);
    state.patternRefs = (task.files || []).map((record, index) =>
      recordToFile(record, `pattern-reference-${index + 1}.png`),
    );
    patternBaseName.textContent = state.patternBase.name;
    patternFolderName.textContent = `${state.patternRefs.length} 张参考图`;
    document.querySelector("#vfSkuPattern").value = options.sku || "";
    patternCategoryInput.value = options.category || "auto";
    document.querySelector("#vfPatternBackground").value =
      options.background_mode || "keep";
    patternRequestMode.value =
      options.request_mode === "batch" ? "batch" : "stable";
    patternBatchSize.value = String(boundedBatchSize(options.batch_size));
    renderPatternPreview();
    await refreshPatternBatches();
  } else if (module === "product_video_generate") {
    switchTab("video");
    state.videoMain = taskToFile(task);
    document.querySelector("#vfVideoPrompt").value = options.prompt || "";
    document.querySelector("#vfSkuVideo").value = options.sku || "";
    document.querySelector("#vfVideoPresentation").value =
      options.presentation_mode || "product";
    videoCategoryInput.value = options.category || "auto";
    document.querySelector("#vfVideoDuration").value = String(
      options.duration_seconds || 8,
    );
    document.querySelector("#vfVideoAspect").value =
      options.aspect_ratio || "9:16";
    document.querySelector("#vfVideoRequestCount").value = String(
      options.request_count || 1,
    );
    state.videoPromptTemplate =
      options.prompt_template ||
      state.promptTemplates.video_showcase;
    renderVideoPreview();
  } else {
    throw new Error(`未知任务类型：${module}`);
  }
  state.currentTaskIds[module] = task.id;
  if (module === "product_generate") state.currentCopyTaskId = task.id;
  if (notify) showToast("已加载任务配置");
}

function loadStoredCopyTask(task, { notify = true } = {}) {
  switchTab("generate");
  switchGenerateMode("text");
  state.generateMain = taskToFile(task);
  document.querySelector("#vfPrompt").value = task.base_prompt || "";
  document.querySelector("#vfCount").value = String(task.output_count || 1);
  requestCountInput.value = String(task.request_count || 1);
  stylePackInput.value = task.style_pack || "auto";
  copyCategoryInput.value =
    task.category || task.options?.category || "auto";
  promptTemplateInput.value =
    task.prompt_template || VisualForgeCore.DEFAULT_COPY_PROMPT_TEMPLATE;
  state.copyTemplateKey = "copy";
  directPromptInput.checked = task.direct_prompt === true;
  document.querySelector("#vfSkuGenerate").value = task.sku || "";
  document.querySelector("#vfGenerateEngine").value = task.engine || "muse";
  document.querySelector("#vfGenerateChainMode").value =
    task.chain_mode || "original";
  generateBackground.value =
    task.background_mode || task.options?.background_mode || "match";
  document.querySelector("#vfSize").value = task.size || "1024x1024";
  state.currentCopyTaskId = task.id;
  state.currentTaskIds.product_generate = task.id;
  renderGeneratePreview();
  renderRequestSummary();
  updatePromptTemplateState();
  if (notify) showToast("已加载任务配置");
}

async function executeTaskModule(task) {
  const module = taskModule(task);
  if (module === "product_color") {
    return runProductColors(null, false);
  }
  if (module === "logo_recolor") return runLogoJob("recolor", false);
  if (module === "logo_image_generate") return runLogoJob("batch", false);
  if (module === "pattern_transfer") return runPatternTransfer(null, false);
  if (module === "product_generate") return runLogoJob("generate", false);
  if (module === "product_video_generate") return runProductVideo(null, false);
  throw new Error(`未知任务类型：${module}`);
}

async function executeStoredTask(task, { fromQueue = false } = {}) {
  if (state.busy || (state.queueRunning && !fromQueue)) return null;
  await loadStoredTask(task, { notify: false });
  await setTaskStatus(task.id, {
    status: "running",
    last_started_at: new Date().toISOString(),
    error: null,
  });
  try {
    const result = await executeTaskModule(task);
    if (!result) {
      const latest = await VisualForgeStore.getTask(task.id).catch(() => null);
      throw new Error(latest?.error || "任务执行未返回完成结果");
    }
    await setTaskStatus(task.id, {
      status: "succeeded",
      last_job_id: result?.id || task.last_job_id || null,
      last_finished_at: new Date().toISOString(),
      error: null,
    });
    return result;
  } catch (error) {
    await setTaskStatus(task.id, {
      status: "failed",
      error: error.message || String(error),
      last_finished_at: new Date().toISOString(),
    });
    throw error;
  }
}

async function runStoredCopyTask(task) {
  return executeStoredTask(task);
}

async function runTaskQueue(tasks, { retry = false } = {}) {
  if (state.busy || state.queueRunning) return;
  if (!tasks.length) {
    showToast(retry ? "没有需要重试的失败任务" : "任务列表为空，请先保存任务", true);
    return;
  }
  state.queueRunning = true;
  state.queuePaused = false;
  state.queueFailedTaskIds = [];
  state.queueSucceeded = 0;
  state.queueFailed = 0;
  state.queueSaved = 0;
  queueCopyTasks.disabled = true;
  updateQueueControls();
  try {
    for (let index = 0; index < tasks.length; index += 1) {
      await waitWhilePaused();
      const task = tasks[index];
      taskState.textContent =
        `${retry ? "重试队列" : "排队执行"} ${index + 1}/${tasks.length} · ` +
        `${taskDisplayName(task).slice(0, 26)}`;
      queueSummary.textContent =
        `队列 ${index + 1}/${tasks.length} · 成功 ${state.queueSucceeded} · ` +
        `失败 ${state.queueFailed} · 自动保存 ${state.queueSaved} · ` +
        `未保存 ${state.queueSucceeded - state.queueSaved}`;
      try {
        const result = await executeStoredTask(task, { fromQueue: true });
        if (result) {
          state.queueSucceeded += 1;
          if (result?.export_path) state.queueSaved += 1;
        } else {
          state.queueFailed += 1;
          state.queueFailedTaskIds.push(task.id);
        }
      } catch (error) {
        state.queueFailed += 1;
        state.queueFailedTaskIds.push(task.id);
        await setTaskStatus(task.id, {
          status: "failed",
          last_finished_at: new Date().toISOString(),
        });
        showToast(`排队任务失败：${error.message}`, true);
      }
      await renderCopyTasks();
      queueSummary.textContent =
        `队列 ${index + 1}/${tasks.length} · 成功 ${state.queueSucceeded} · ` +
        `失败 ${state.queueFailed} · 自动保存 ${state.queueSaved} · ` +
        `未保存 ${state.queueSucceeded - state.queueSaved}`;
      updateQueueControls();
    }
    taskState.textContent =
      `任务队列完成 · 成功 ${state.queueSucceeded} · 失败 ${state.queueFailed}`;
    await autoArchiveUnsavedJobs({ notify: false });
    queueSummary.textContent =
      `队列完成 · 成功 ${state.queueSucceeded} · 失败 ${state.queueFailed} · ` +
      `自动保存 ${state.queueSaved} · 未保存 ` +
      `${state.queueSucceeded - state.queueSaved}`;
    showToast(
      `任务队列完成：成功 ${state.queueSucceeded}，失败 ${state.queueFailed}，` +
        `自动保存 ${state.queueSaved}，未保存 ${state.queueSucceeded - state.queueSaved}`,
    );
  } finally {
    state.queueRunning = false;
    state.queuePaused = false;
    state.paused = false;
    queueCopyTasks.disabled = state.copyTasks.length === 0;
    updateQueueControls();
    await renderCopyTasks();
  }
}

async function queueAllCopyTasks() {
  const tasks = [...(await VisualForgeStore.listTasks())].sort((left, right) =>
    String(left.created_at).localeCompare(String(right.created_at)),
  );
  await runTaskQueue(tasks);
}

async function retryFailedQueueTasks() {
  const ids = new Set(state.queueFailedTaskIds);
  const tasks = (await VisualForgeStore.listTasks()).filter((task) =>
    ids.has(task.id),
  );
  await runTaskQueue(tasks, { retry: true });
}

async function duplicateTask(task, count = 1) {
  const amount = Math.floor(Number(count) || 1);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error("复制次数必须是大于 0 的整数");
  }
  const duplicates = [];
  for (let index = 0; index < amount; index += 1) {
    const now = new Date(Date.now() + index).toISOString();
    const duplicate = {
      ...task,
      id: crypto.randomUUID().replaceAll("-", ""),
      created_at: now,
      updated_at: now,
      status: "pending",
      last_job_id: null,
    };
    await VisualForgeStore.putTask(duplicate);
    duplicates.push(duplicate);
  }
  state.currentCopyTaskId = duplicates.at(-1)?.id || null;
  state.currentTaskIds[taskModule(task)] = duplicates.at(-1)?.id || null;
  await renderCopyTasks();
  showToast(`已复制 ${duplicates.length} 个任务`);
  return duplicates;
}

async function duplicateCopyTask(task, count = 1) {
  return duplicateTask(task, count);
}

async function deleteTask(task) {
  if (!window.confirm(`删除任务：${taskDisplayName(task).slice(0, 30) || task.id}？`)) {
    return;
  }
  await VisualForgeStore.deleteTask(task.id);
  if (state.currentCopyTaskId === task.id) state.currentCopyTaskId = null;
  for (const [module, taskId] of Object.entries(state.currentTaskIds)) {
    if (taskId === task.id) delete state.currentTaskIds[module];
  }
  await renderCopyTasks();
  showToast("任务已删除");
}

async function deleteCopyTask(task) {
  return deleteTask(task);
}

async function addCopyTaskFromLast() {
  const tasks = await VisualForgeStore.listTasks();
  const latest = tasks[0];
  if (!latest) {
    switchTab("generate");
    switchGenerateMode("text");
    showToast("请先保存任意模式任务");
    return;
  }
  const duplicates = await duplicateTask(latest);
  await loadStoredTask(duplicates.at(-1));
}

async function loadLatestCopyTask() {
  const tasks = await VisualForgeStore.listTasks();
  if (!tasks.length) {
    showToast("还没有可加载的任务", true);
    return;
  }
  await loadStoredTask(tasks[0]);
}

function detachCurrentTaskFromSavedVersion() {
  state.currentTaskIds = {};
  state.currentCopyTaskId = null;
  showToast("已解除任务关联；下次保存会创建新任务，不覆盖原任务");
}

function updatePromptTemplateState() {
  const isDefault =
    promptTemplateInput.value.trim() ===
    (defaultPromptTemplates()[state.copyTemplateKey] ||
      VisualForgeCore.DEFAULT_COPY_PROMPT_TEMPLATE);
  promptTemplateState.textContent = isDefault
    ? "内置默认模板"
    : "自定义模板";
}

async function persistPromptTemplate({ notify = true } = {}) {
  const template = promptTemplateInput.value.trim();
  if (!template) throw new Error("提示词模板不能为空");
  VisualForgeCore.buildCopyVariationPrompts(
    "模板校验",
    1,
    template,
  );
  state.promptTemplates = {
    ...state.promptTemplates,
    copy: template,
  };
  await chrome.storage.local.set({
    copyPromptTemplate: template,
    promptTemplates: state.promptTemplates,
  });
  const catalogInput = promptCatalog.querySelector(
    '[data-prompt-key="copy"]',
  );
  if (catalogInput) catalogInput.value = template;
  updatePromptTemplateState();
  if (notify) showToast("默认提示词模板已保存");
}

async function loadPromptPreferences() {
  const defaults = {
    copyPromptTemplate: VisualForgeCore.DEFAULT_COPY_PROMPT_TEMPLATE,
    copyMemoryEnabled: true,
    promptTemplates: {},
    copyDirectPrompt: false,
    autoContinueEnabled: false,
    autoContinueTimeoutEnabled: false,
    autoRegenerateTextOnly: false,
    immediateDownload: true,
    interfaceScale: 1.1,
    linksOnlyExport: false,
  };
  const stored = await chrome.storage.local.get(defaults);
  state.promptTemplates = {
    ...defaultPromptTemplates(),
    ...(stored.promptTemplates || {}),
    copy:
      stored.promptTemplates?.copy ||
      stored.copyPromptTemplate ||
      VisualForgeCore.DEFAULT_COPY_PROMPT_TEMPLATE,
  };
  state.videoPromptTemplate = state.promptTemplates.video_showcase;
  state.copyTemplateKey = "copy";
  promptTemplateInput.value = state.promptTemplates.copy;
  rememberPrompt.checked = stored.copyMemoryEnabled !== false;
  directPromptInput.checked = stored.copyDirectPrompt === true;
  autoContinueInput.checked = stored.autoContinueEnabled === true;
  autoContinueTimeoutInput.checked =
    stored.autoContinueTimeoutEnabled === true;
  autoRegenerateTextOnlyInput.checked =
    stored.autoRegenerateTextOnly === true;
  immediateDownloadInput.checked = stored.immediateDownload !== false;
  autoContinueTimeoutInput.disabled = !autoContinueInput.checked;
  linksOnlyExportInput.checked = stored.linksOnlyExport === true;
  applyInterfaceScale(stored.interfaceScale, { persist: false });
  updatePromptTemplateState();
  renderPromptCatalog();
  await loadPromptMemories();
}

async function textSha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function memoryToFile(memory) {
  const image = memory.main_image;
  if (!image?.blob) throw new Error("记忆缺少主图");
  return new File([image.blob], image.name, {
    type: image.type || "image/png",
  });
}

async function rememberPromptTask(task) {
  if (!rememberPrompt.checked) return;
  const imageHash = await blobSha256(task.main_image.blob);
  const id = await textSha256(
    [
      imageHash,
      task.base_prompt,
      task.prompt_template,
      task.direct_prompt,
      task.style_pack,
      task.prompt_template_key,
      task.output_count,
      task.request_count,
      task.engine,
      task.chain_mode,
      task.background_mode,
      task.category,
      task.size,
      task.sku,
    ].join("\n"),
  );
  const memories = await VisualForgeStore.listPromptMemories(50);
  const existing = memories.find((memory) => memory.id === id);
  const now = new Date().toISOString();
  await VisualForgeStore.putPromptMemory({
    id,
    main_image: {
      name: task.main_image.name,
      type: task.main_image.type,
      size: task.main_image.size,
      blob: task.main_image.blob,
    },
    prompt: task.base_prompt,
    prompt_template: task.prompt_template,
    direct_prompt: task.direct_prompt === true,
    style_pack: task.style_pack || "auto",
    prompt_template_key: task.prompt_template_key || "copy",
    output_count: task.output_count,
    request_count: task.request_count || 1,
    engine: task.engine,
    chain_mode: task.chain_mode,
    background_mode: task.background_mode || "match",
    category: task.category || task.options?.category || "auto",
    size: task.size,
    sku: task.sku,
    use_count: Number(existing?.use_count || 0) + 1,
    created_at: existing?.created_at || now,
    updated_at: now,
  });
  await VisualForgeStore.prunePromptMemories(20);
  await loadPromptMemories();
}

async function renderPromptMemories() {
  for (const url of state.promptMemoryUrls) URL.revokeObjectURL(url);
  state.promptMemoryUrls = [];
  promptMemoryList.replaceChildren();
  promptMemoryEmpty.hidden = state.promptMemories.length > 0;
  for (const memory of state.promptMemories) {
    const item = document.createElement("article");
    item.className = "vf-memory-item";
    const image = document.createElement("img");
    image.alt = memory.main_image?.name || "记忆主图";
    if (memory.main_image?.blob) {
      const url = URL.createObjectURL(memory.main_image.blob);
      state.promptMemoryUrls.push(url);
      image.src = url;
    }
    const copy = document.createElement("div");
    copy.className = "vf-memory-copy";
    const title = document.createElement("strong");
    title.textContent = memory.prompt || "未命名记忆";
    title.title = memory.prompt || "";
    const meta = document.createElement("small");
    meta.textContent =
      `${memory.request_count || 1} 次对话 × ${memory.output_count || 1} 张 · ` +
      `${productCategoryLabel(memory.category)} · ` +
      `${memory.engine === "muse" ? "Muse" : "图片模型"}` +
      `${memory.use_count > 1 ? ` · 使用 ${memory.use_count} 次` : ""}`;
    copy.append(title, meta);
    const actions = document.createElement("div");
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = "恢复";
    restore.addEventListener("click", () => restorePromptMemory(memory));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "删除";
    remove.addEventListener("click", async () => {
      await VisualForgeStore.deletePromptMemory(memory.id);
      await loadPromptMemories();
      showToast("记忆已删除");
    });
    actions.append(restore, remove);
    item.append(image, copy, actions);
    promptMemoryList.append(item);
  }
}

async function loadPromptMemories() {
  state.promptMemories = await VisualForgeStore.listPromptMemories(20);
  await renderPromptMemories();
}

function restorePromptMemory(memory) {
  try {
    switchTab("generate");
    switchGenerateMode("text");
    state.generateMain = memoryToFile(memory);
    state.currentCopyTaskId = null;
    document.querySelector("#vfPrompt").value = memory.prompt || "";
    promptTemplateInput.value =
      memory.prompt_template || VisualForgeCore.DEFAULT_COPY_PROMPT_TEMPLATE;
    state.copyTemplateKey = "copy";
    directPromptInput.checked = memory.direct_prompt === true;
    document.querySelector("#vfCount").value = String(memory.output_count || 1);
    requestCountInput.value = String(memory.request_count || 1);
    stylePackInput.value = memory.style_pack || "auto";
    document.querySelector("#vfGenerateEngine").value = memory.engine || "muse";
    document.querySelector("#vfGenerateChainMode").value =
      memory.chain_mode || "original";
    generateBackground.value = memory.background_mode || "match";
    copyCategoryInput.value = memory.category || "auto";
    document.querySelector("#vfSize").value = memory.size || "1024x1024";
    document.querySelector("#vfSkuGenerate").value = memory.sku || "";
    renderGeneratePreview();
    renderRequestSummary();
    updatePromptTemplateState();
    showToast("已恢复提示词和主图");
  } catch (error) {
    showToast(error.message, true);
  }
}

function switchTab(tabName) {
  state.activeTab = tabName;
  contextTitle.textContent = tabLabels[tabName] || "Visual Forge";
  uploadTitle.textContent = uploadLabels[tabName] || "添加图片";
  uploadZone.hidden = ["generate", "video", "tasks", "prompts"].includes(tabName);
  tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === tabName);
  });
  panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.panel === tabName);
  });
  renderMainPreview();
  if (tabName === "tasks") void renderCopyTasks();
}

function switchGenerateMode(mode) {
  document.querySelectorAll("[data-generate-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.generateMode === mode);
  });
  document.querySelectorAll("[data-generate-pane]").forEach((pane) => {
    pane.classList.toggle("is-active", pane.dataset.generatePane === mode);
  });
  if (mode === "text") renderGeneratePreview();
}

function totalFileBytes() {
  return state.files.reduce((total, file) => total + file.size, 0);
}

function addFiles(files) {
  let incoming = [...files];
  if (["product", "recolor", "batch"].includes(state.activeTab)) {
    if (incoming.length > 1) {
      showToast("当前模式只接受 1 张图片，已使用第一张");
      incoming = incoming.slice(0, 1);
    }
    state.files = incoming.length ? [incoming[0]] : state.files;
    renderFiles();
    renderMainPreview();
    return;
  }
  const next = [...state.files];
  for (const file of incoming) {
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

function showGenerateProgress(message, current = 0, total = 0, isError = false) {
  generateProgress.hidden = false;
  generateProgress.classList.toggle("is-error", isError);
  generateProgress.replaceChildren();
  const text = document.createElement("span");
  text.textContent = message;
  generateProgress.append(text);
  if (total > 0) {
    const bar = document.createElement("i");
    bar.style.width = `${Math.min(100, (current / total) * 100)}%`;
    generateProgress.append(bar);
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

async function autoArchiveUnsavedJobs({ notify = true } = {}) {
  if (autoArchiveRunning) return 0;
  autoArchiveRunning = true;
  try {
    const current = await VisualForgeArchive.status();
    if (current.permission !== "granted") return 0;
    const jobs = await VisualForgeJobs.list(100);
    const unsaved = jobs.filter(
      (job) => job.status === "succeeded" && !job.export_path,
    );
    let archived = 0;
    for (const job of unsaved) {
      try {
        const updated = await VisualForgeJobs.exportJob(job.id, false);
        if (updated.export_path) {
          archived += 1;
          upsertJobCard(updated);
        }
      } catch {
        // A later focus/authorization event can retry.
      }
    }
    if (archived && notify) {
      showToast(`已自动补存 ${archived} 个任务`);
    }
    return archived;
  } finally {
    autoArchiveRunning = false;
  }
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
  if (kind === "logo_image_generate" && state.files.length !== 1) {
    throw new Error("Logo 重绘需要且只能添加 1 张商品主图");
  }
  if (kind === "product_generate" && !state.generateMain) {
    throw new Error("产品裂变需要先选择 1 张商品主图");
  }
}

async function createLocalJob(kind, options, files) {
  const enrichedOptions = {
    ...options,
    export_mode:
      options.export_mode ||
      (linksOnlyExportInput.checked ? "links_only" : "files"),
  };
  return VisualForgeJobs.create(
    kind,
    enrichedOptions,
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
  const file = new File(
    [bytes],
    payload?.name || fallbackName,
    { type: payload?.type || "image/png" },
  );
  if (payload?.url) {
    try {
      Object.defineProperty(file, "museSourceUrl", {
        value: String(payload.url),
        configurable: true,
      });
    } catch {
      // Link-only export remains optional when File cannot be annotated.
    }
  }
  return file;
}

async function payloadSha256(payload) {
  const binary = atob(payload?.data || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return blobSha256(new Blob([bytes]));
}

async function blobSha256(blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function safeDownloadSegment(value, fallback = "visual") {
  return String(value || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[ .-]+|[ .-]+$/g, "")
    .slice(0, 80) || fallback;
}

function immediateDownloadFiles(
  files,
  {
    module = "muse",
    label = "任务",
    batchIndex = 1,
    totalBatches = 1,
    outputOffset = 0,
  } = {},
) {
  if (!immediateDownloadInput.checked || linksOnlyExportInput.checked) return;
  if (!chrome.downloads?.download) {
    if (!state.immediateDownloadErrorShown) {
      state.immediateDownloadErrorShown = true;
      showToast("当前浏览器不支持自动下载，已继续保留任务归档", true);
    }
    return;
  }
  const now = new Date();
  const day = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const time = new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(now)
    .replaceAll(":", "-");
  const folder = safeDownloadSegment(label, module);
  files.forEach((file, index) => {
    const outputIndex = outputOffset + index + 1;
    const filename =
      `VisualForge自动保存/${day}/${folder}/${time}_` +
      `批次${String(batchIndex).padStart(2, "0")}-${String(totalBatches).padStart(2, "0")}_` +
      `${String(outputIndex).padStart(3, "0")}_${safeDownloadSegment(file.name, "image.png")}`;
    const url = URL.createObjectURL(file);
    chrome.downloads.download(
      {
        url,
        filename,
        conflictAction: "uniquify",
        saveAs: false,
      },
      (downloadId) => {
        const error = chrome.runtime.lastError;
        if (error || !downloadId) {
          if (!state.immediateDownloadErrorShown) {
            state.immediateDownloadErrorShown = true;
            showToast(
              `Muse 图片自动下载失败：${error?.message || "浏览器未返回下载任务"}`,
              true,
            );
          }
        } else {
          state.immediateDownloadCount += 1;
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
    );
  });
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
    job.options?.prompt_version_label ||
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
  const isVideoJob = job.kind === "product_video_generate";
  const museLinks = Array.isArray(job.options?.muse_image_urls)
    ? job.options.muse_image_urls.filter(Boolean)
    : Array.isArray(job.options?.muse_video_urls)
      ? job.options.muse_video_urls.filter(Boolean)
      : [];
  if (job.status === "succeeded") {
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.textContent = job.export_path
      ? museLinks.length && job.options?.export_mode === "links_only"
        ? isVideoJob
          ? "视频链接已保存"
          : "图片链接已保存"
        : "已保存到授权目录"
      : job.archive_error
        ? "重新授权并保存"
        : museLinks.length && job.options?.export_mode === "links_only"
          ? isVideoJob
            ? "保存视频链接到目录"
            : "保存图片链接到目录"
          : "保存到授权目录";
    exportButton.title =
      job.export_path ||
      job.archive_error ||
      (museLinks.length && job.options?.export_mode === "links_only"
        ? isVideoJob
          ? "导出 Muse 视频链接"
          : "导出 Muse 图片链接"
        : isVideoJob
          ? "导出全部视频"
          : "导出全部图片");
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
    if (museLinks.length) {
      const linkDownload = document.createElement("button");
      linkDownload.type = "button";
      linkDownload.textContent =
        job.kind === "product_video_generate"
          ? "下载视频链接"
          : "下载图片链接";
      linkDownload.title =
        job.kind === "product_video_generate"
          ? "下载 Muse 原始视频 URL 列表，不打包视频"
          : "下载 Muse 原始图片 URL 列表，不打包图片";
      linkDownload.addEventListener("click", () =>
        downloadMuseImageLinks(job),
      );
      actions.append(linkDownload);
    }
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

function downloadMuseImageLinks(job) {
  const links = Array.isArray(job.options?.muse_image_urls)
    ? job.options.muse_image_urls.filter(Boolean)
    : Array.isArray(job.options?.muse_video_urls)
      ? job.options.muse_video_urls.filter(Boolean)
      : [];
  if (!links.length) {
    showToast("该任务没有可导出的 Muse 图片链接", true);
    return;
  }
  const isVideoJob = job.kind === "product_video_generate";
  const text = [
    `# Visual Forge Muse ${isVideoJob ? "视频" : "图片"}链接`,
    `# Job: ${job.id}`,
    "# Muse 临时链接可能过期，请尽快转存。",
    "",
    ...links.map((url, index) => `${String(index + 1).padStart(3, "0")}\t${url}`),
  ].join("\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    `visualforge-${isVideoJob ? "video-" : ""}links-${job.id.slice(0, 8)}.txt`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function getMuseTab() {
  if (state.preferredMuseTabId) {
    try {
      const preferred = await chrome.tabs.get(state.preferredMuseTabId);
      if (/^https:\/\/muse\.ai\//.test(preferred.url || "")) {
        return preferred;
      }
    } catch {
      // The recovery tab may have been closed by the user.
    }
    state.preferredMuseTabId = null;
    state.preferredMuseWindowId = null;
  }
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

async function buildPatternBatches(
  sourceRefs = state.patternRefs,
  batchSize = boundedBatchSize(patternBatchSize.value),
) {
  const maximum = boundedBatchSize(batchSize);
  const valid = sourceRefs
    .filter(isImageFile)
    .filter((file) => file.size <= PATTERN_BATCH_LIMIT)
    .sort((left, right) =>
      (left.webkitRelativePath || left.name).localeCompare(
        right.webkitRelativePath || right.name,
      ),
    );
  const oversized = sourceRefs.filter(
    (file) => isImageFile(file) && file.size > PATTERN_BATCH_LIMIT,
  );
  const groups = [];
  let current = [];
  let size = 0;
  for (const file of valid) {
    if (
      current.length &&
      (current.length >= maximum || size + file.size > PATTERN_BATCH_LIMIT)
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
  return { batches, oversized, valid, batchSize: maximum };
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
    `共 ${result.valid.length} 张参考图，全部参与处理；已自动分为 ` +
    `${result.batches.length} 批，每批最多 ${result.batchSize} 张，单批最大 ` +
    `${(largest / 1024 / 1024).toFixed(1)}MB（上限 25MB）。` +
    (result.oversized.length
      ? ` 已跳过 ${result.oversized.length} 张超过 24MB 的图片。`
      : "");
  document.querySelector("#vfDownloadPatternBatches").hidden =
    result.batches.length === 0;
}

async function runPatternTransfer(
  retryRefs = null,
  interactiveArchive = false,
  runContext = {},
) {
  if (state.busy) return;
  let lastCreatedJob = null;
  try {
    if (!state.patternBase) {
      throw new Error("请选择一张白底商品图");
    }
    if (!state.patternRefs.length) {
      throw new Error("请选择印花参考图文件夹");
    }
    if (!retryRefs?.length && !state.patternBatches.length) {
      await refreshPatternBatches();
    }
    const requestMode =
      patternRequestMode.value === "batch" ? "batch" : "stable";
    const batchSize = boundedBatchSize(patternBatchSize.value);
    let batches = state.patternBatches;
    let sourceRefs = state.patternRefs;
    if (retryRefs?.length) {
      sourceRefs = retryRefs;
      batches = (await buildPatternBatches(retryRefs, batchSize)).batches;
    }
    if (!batches.length) {
      throw new Error("没有符合大小限制的参考图");
    }
    const tab = await getMuseTab();
    await sendTabMessage(tab.id, { type: "VF_PING" });
    const sku = document.querySelector("#vfSkuPattern").value.trim();
    const startedAt = new Date().toISOString();
    const archiveStem = VisualForgeArchive.buildStem(
      "pattern_batch_finalize",
      { sku },
      startedAt,
    );
    const archiveStatus = await refreshArchiveStatus();
    let archiveGroupName = null;
    if (archiveStatus.permission === "granted") {
      try {
        archiveGroupName = await VisualForgeArchive.reserveGroup(archiveStem);
      } catch {
        archiveGroupName = null;
      }
    }
    if (!archiveGroupName) {
      archiveGroupName =
        `${archiveStem}_${String(runContext.task?.id || crypto.randomUUID()).slice(0, 6)}`;
    }
    setBusy(true, "", true);
    const basePayload = await serializeFile(
      state.patternBase,
      `__base__-${state.patternBase.name}`,
    );
    const backgroundMode = document.querySelector("#vfPatternBackground").value;
    const category = patternCategoryInput.value || "auto";
    const allReferences = batches.flatMap((batch) => batch.files);
    let completed = 0;
    const failures = [];
    state.failedPatternRefs = [];
    retryPatternFailed.disabled = true;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      const generated = [];
      const references = [];
      if (requestMode === "batch") {
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
            template: state.promptTemplates.pattern_batch,
            autoContinue: autoContinueInput.checked,
            autoContinueTimeout: autoContinueTimeoutInput.checked,
            backgroundMode,
            category,
            references: batch.files.map((file) => ({
              name: file.name,
              relative_path: file.webkitRelativePath || file.name,
            })),
            index: batchIndex + 1,
            total: allReferences.length,
          });
          generated.push(...result.outputs);
          references.push(...result.references);
          const returnedFiles = result.outputs.map((item, index) =>
            payloadToFile(
              item,
              `muse-pattern-${batchIndex + 1}-${index + 1}.webp`,
            ),
          );
          showMuseReturnedImages(
            returnedFiles,
            { batch: batchIndex + 1, total: batches.length },
          );
          immediateDownloadFiles(returnedFiles, {
            module: "pattern_transfer",
            label: sku ? `印花套图_${sku}` : "印花套图",
            batchIndex: batchIndex + 1,
            totalBatches: batches.length,
            outputOffset: completed,
          });
        } catch (error) {
          for (let fileIndex = 0; fileIndex < batch.files.length; fileIndex += 1) {
            await waitWhilePaused();
            const reference = batch.files[fileIndex];
            const overallIndex =
              completed + generated.length + failures.length + 1;
            setPatternProgress(
              `批量请求失败，自动改为逐张 · ${reference.name}`,
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
                category,
                overallIndex,
                allReferences.length,
              );
              generated.push(result.output);
              references.push(result.reference);
              const returnedFile = payloadToFile(
                result.output,
                `muse-pattern-${overallIndex}.webp`,
              );
              showMuseReturnedImages(
                [returnedFile],
                { batch: batchIndex + 1, total: batches.length },
              );
              immediateDownloadFiles([returnedFile], {
                module: "pattern_transfer",
                label: sku ? `印花套图_${sku}` : "印花套图",
                batchIndex: batchIndex + 1,
                totalBatches: batches.length,
                outputOffset: overallIndex - 1,
              });
            } catch (fallbackError) {
              failures.push({
                file: reference,
                name: reference.name,
                error: fallbackError.message,
              });
            }
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
              category,
              overallIndex,
              allReferences.length,
            );
            generated.push(result.output);
            references.push(result.reference);
            const returnedFile = payloadToFile(
              result.output,
              `muse-pattern-${overallIndex}.webp`,
            );
            showMuseReturnedImages(
              [returnedFile],
              { batch: batchIndex + 1, total: batches.length },
            );
            immediateDownloadFiles([returnedFile], {
              module: "pattern_transfer",
              label: sku ? `印花套图_${sku}` : "印花套图",
              batchIndex: batchIndex + 1,
              totalBatches: batches.length,
              outputOffset: overallIndex - 1,
            });
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
            task_id: runContext.task?.id || null,
            references,
            muse_image_urls: generated.map((item) => item.url || null),
            background_mode: backgroundMode,
            category,
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
        lastCreatedJob = await monitorJob(created);
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
      `完成，${completed} 张参考图已生成并进入归档`,
      completed,
      completed,
    );
    showToast("印花套图全部完成");
    if (runContext.task?.id) {
      await setTaskStatus(runContext.task.id, {
        status: "succeeded",
        last_job_id: lastCreatedJob?.id || null,
        last_finished_at: new Date().toISOString(),
        error: null,
      });
    }
    return lastCreatedJob || true;
  } catch (error) {
    setPatternProgress(error.message || "印花套图失败", 0, 0, true);
    showToast(error.message || "印花套图失败", true);
    if (runContext.task?.id) {
      await setTaskStatus(runContext.task.id, {
        status: "failed",
        error: error.message || String(error),
        last_finished_at: new Date().toISOString(),
      });
    }
    return false;
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
  category,
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
    template: state.promptTemplates.pattern_single,
    autoContinue: autoContinueInput.checked,
    autoContinueTimeout: autoContinueTimeoutInput.checked,
    backgroundMode,
    category,
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

async function runLogoJob(
  runType,
  interactiveArchive = false,
  retryPrompts = null,
  retryContext = null,
) {
  if (state.busy) return false;
  let completedJob = null;
  try {
    setBusy(true, "", runType !== "recolor");
    if (runType === "recolor") {
      validateLocalJob("logo_recolor");
      const created = await createLocalJob(
        "logo_recolor",
        {
          task_id: state.currentTaskIds.logo_recolor || null,
          colors: document.querySelector("#vfColors").value,
          remove_background: document.querySelector("#vfRecolorBackground").value,
          trim: true,
          sku: document.querySelector("#vfSkuRecolor").value.trim(),
        },
        state.files,
      );
      completedJob = await monitorJob(created);
      if (state.currentTaskIds.logo_recolor) {
        await setTaskStatus(state.currentTaskIds.logo_recolor, {
          status: "succeeded",
          last_job_id: completedJob?.id || null,
          last_finished_at: new Date().toISOString(),
          error: null,
        });
      }
    } else if (runType === "batch") {
      validateLocalJob("logo_image_generate");
      const logoPrompt = document.querySelector("#vfLogoPrompt").value.trim();
      if (!logoPrompt) throw new Error("请填写新 Logo 的设计要求");
      const requestMode =
        logoRequestMode.value === "batch" ? "batch" : "stable";
      const requestCount = safePositiveInteger(
        logoRequestCount.value,
        "请求次数",
      );
      const outputCount = safePositiveInteger(
        logoOutputCount.value,
        "每批数量",
        4,
      );
      const totalOutputs = requestCount * outputCount;
      if (!Number.isSafeInteger(totalOutputs)) {
        throw new Error("请求次数过大，超出浏览器可处理范围");
      }
      const tab = await getMuseTab();
      await sendTabMessage(tab.id, { type: "VF_PING" });
      logoDesignProgress.hidden = false;
      logoDesignProgress.classList.remove("is-error");
      logoDesignProgress.textContent =
        requestMode === "batch"
          ? `Muse 正在按 ${requestCount} 次请求重绘 Logo，每次返回 ${outputCount} 张…`
          : `Muse 正在逐张重绘 Logo，共 ${totalOutputs} 张…`;
      const master = state.files[0];
      const masterPayload = await serializeFile(
        master,
        `__logo_design_source__-${master.name}`,
      );
      const generated = [];
      const resultHashes = new Set();
      let failedOutputs = 0;
      let completedOutputs = 0;
      const generateSingle = async (requestIndex, imageIndex) => {
        const output = await sendTabMessage(tab.id, {
          type: "VF_MUSE_GENERATE_LOGO_DESIGN",
          master: masterPayload,
          prompt: logoPrompt,
          template: state.promptTemplates.logo_design,
          autoContinue: autoContinueInput.checked,
          autoContinueTimeout: autoContinueTimeoutInput.checked,
        });
        return payloadToFile(
          output,
          `logo-redesign-${String(requestIndex).padStart(2, "0")}-` +
            `${String(imageIndex).padStart(2, "0")}.webp`,
        );
      };
      const acceptUnique = async (files) => {
        const hashes = await Promise.all(files.map(blobSha256));
        if (
          hashes.some(
            (hash, index) =>
              resultHashes.has(hash) || hashes.indexOf(hash) !== index,
          )
        ) {
          return false;
        }
        hashes.forEach((hash) => resultHashes.add(hash));
        return true;
      };
      for (let requestIndex = 1; requestIndex <= requestCount; requestIndex += 1) {
        await waitWhilePaused();
        let batchFiles = [];
        let batchAccepted = false;
        if (requestMode === "batch") {
          logoDesignProgress.textContent =
            `批量重绘 ${requestIndex}/${requestCount} · 请求返回 ${outputCount} 张`;
          try {
            const result = await sendTabMessage(tab.id, {
              type: "VF_MUSE_GENERATE_LOGO_DESIGN_BATCH",
              master: masterPayload,
              prompt: logoPrompt,
              template: state.promptTemplates.logo_design_batch,
              count: outputCount,
              request_index: requestIndex,
              autoContinue: autoContinueInput.checked,
              autoContinueTimeout: autoContinueTimeoutInput.checked,
            });
            if (result?.outputs?.length !== outputCount) {
              throw new Error(
                `Muse 返回 ${result?.outputs?.length || 0} 张，预期 ${outputCount} 张`,
              );
            }
            batchFiles = result.outputs.map((output, index) =>
              payloadToFile(
                output,
                `logo-redesign-${String(requestIndex).padStart(2, "0")}-` +
                  `${String(index + 1).padStart(2, "0")}.webp`,
              ),
            );
            batchAccepted = await acceptUnique(batchFiles);
            if (!batchAccepted) {
              throw new Error("Muse 返回了重复图片");
            }
          } catch (error) {
            logoDesignProgress.classList.add("is-error");
            logoDesignProgress.textContent =
              `批量请求失败，正在改为逐张发送：${error.message}`;
            batchFiles = [];
          }
        }
        if (batchAccepted) {
          generated.push(...batchFiles);
          completedOutputs += batchFiles.length;
          showMuseReturnedImages(batchFiles, {
            batch: requestIndex,
            total: requestCount,
          });
          immediateDownloadFiles(batchFiles, {
            module: "logo_image_generate",
            label: "Logo重绘",
            batchIndex: requestIndex,
            totalBatches: requestCount,
            outputOffset: completedOutputs - batchFiles.length,
          });
          logoDesignProgress.classList.remove("is-error");
          continue;
        }
        for (let imageIndex = 1; imageIndex <= outputCount; imageIndex += 1) {
          await waitWhilePaused();
          const overallIndex = completedOutputs + failedOutputs + 1;
          logoDesignProgress.textContent =
            `逐张重绘 ${overallIndex}/${totalOutputs} · ` +
            `请求 ${requestIndex}/${requestCount} · 图片 ${imageIndex}/${outputCount}`;
          try {
            const file = await generateSingle(requestIndex, imageIndex);
            const hash = await blobSha256(file);
            if (resultHashes.has(hash)) {
              throw new Error("Muse 返回了重复图片");
            }
            resultHashes.add(hash);
            generated.push(file);
            completedOutputs += 1;
            showMuseReturnedImages([file], {
              batch: requestIndex,
              total: requestCount,
            });
            immediateDownloadFiles([file], {
              module: "logo_image_generate",
              label: "Logo重绘",
              batchIndex: requestIndex,
              totalBatches: requestCount,
              outputOffset: completedOutputs - 1,
            });
          } catch {
            failedOutputs += 1;
          }
        }
      }
      if (!generated.length) {
        throw new Error("Muse 没有返回可用的 Logo 重绘图片");
      }
      const created = await createLocalJob(
        "logo_image_generate",
        {
          task_id: state.currentTaskIds.logo_image_generate || null,
          prompt: logoPrompt,
          sku: document.querySelector("#vfSkuBatch").value.trim(),
          source_mode: "muse_logo_redesign",
          generation_engine: "muse",
          request_mode: requestMode,
          request_count: requestCount,
          output_count: outputCount,
          total_outputs: totalOutputs,
          failed_outputs: failedOutputs,
          muse_image_urls: generated.map(
            (file) => file.museSourceUrl || null,
          ),
        },
        [master, ...generated],
      );
      completedJob = await monitorJob(created);
      logoDesignProgress.textContent =
        `完成，Muse 已生成 ${generated.length} 张新的 Logo 设计` +
        (failedOutputs ? `，失败 ${failedOutputs} 张` : "") +
        "并进入归档";
      if (failedOutputs) {
        throw new Error(
          `已完成 ${generated.length} 张，失败 ${failedOutputs} 张`,
        );
      }
      if (state.currentTaskIds.logo_image_generate) {
        await setTaskStatus(state.currentTaskIds.logo_image_generate, {
          status: "succeeded",
          last_job_id: completedJob?.id || null,
          last_finished_at: new Date().toISOString(),
          error: null,
        });
      }
    } else {
      validateLocalJob("product_generate");
      const prompt = document.querySelector("#vfPrompt").value.trim();
      const size = document.querySelector("#vfSize").value;
      const sku = document.querySelector("#vfSkuGenerate").value.trim();
      const chainMode = document.querySelector("#vfGenerateChainMode").value;
      const engine =
        retryContext?.engine ||
        document.querySelector("#vfGenerateEngine").value;
      const task = await saveCurrentCopyTask({ silent: true });
      const outputsPerRound = Number(task.output_count || 1);
      const requestCount = Number(task.request_count || 1);
      const count = outputsPerRound * requestCount;
      const template =
        task.prompt_template || VisualForgeCore.DEFAULT_COPY_PROMPT_TEMPLATE;
      const stylePack = task.style_pack || "auto";
      const backgroundMode =
        task.background_mode ||
        task.options?.background_mode ||
        "match";
      const category =
        task.category ||
        task.options?.category ||
        "auto";
      const batchPlans =
        task.direct_prompt === true
          ? Array.from({ length: requestCount }, (_, batchIndex) => ({
              batch_index: batchIndex + 1,
              prompt,
              variants: Array.from(
                { length: outputsPerRound },
                (_, index) => ({
                  direction:
                    `direct_${batchIndex * outputsPerRound + index + 1}`,
                  task_index: batchIndex * outputsPerRound + index + 1,
                  prompt,
                }),
              ),
            }))
          : VisualForgeCore.buildCopyBatchPrompts(
              prompt,
              outputsPerRound,
              requestCount,
              template,
              stylePack,
              backgroundMode,
              category,
            );
      await setCopyTaskStatus(task.id, {
        status: "running",
        last_started_at: new Date().toISOString(),
      });
      const tab = engine === "muse" ? await getMuseTab() : null;
      if (tab) await sendTabMessage(tab.id, { type: "VF_PING" });
      const provider =
        engine === "model" ? await VisualForgeModel.createProvider() : null;
      let currentSource = state.generateMain;
      const resultHashes = new Set();
      const generatedFiles = [];
      const generatedVariants = [];
      const failedVariants = [];
      let lastError = null;

      for (let batchIndex = 0; batchIndex < batchPlans.length; batchIndex += 1) {
        await waitWhilePaused();
        const batch = batchPlans[batchIndex];
        const sourceForBatch = currentSource;
        showGenerateProgress(
          `产品裂变任务 · 对话 ${batch.batch_index}/${requestCount} · ` +
            `请求返回 ${outputsPerRound} 张`,
          batchIndex * outputsPerRound,
          count,
        );
        let generatedForBatch = [];
        let accepted = false;
        lastError = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const retryInstruction =
              attempt === 0
                ? ""
                : `上一批结果中存在重复图片。这是第 ${attempt + 1} 次尝试，` +
                  `仍需返回 ${outputsPerRound} 张独立图片，` +
                  "并让每张的构图、机位、裁剪、背景、光线和道具明显不同。";
            if (engine === "muse") {
              const masterPayload = await serializeFile(
                sourceForBatch,
                `__copy_batch_${batch.batch_index}__-${sourceForBatch.name}`,
              );
              const result = await sendTabMessage(tab.id, {
                type: "VF_MUSE_GENERATE_COPY_BATCH",
                master: masterPayload,
                prompt: retryInstruction
                  ? `${batch.prompt}\n\n${retryInstruction}`
                  : batch.prompt,
                count: outputsPerRound,
                batch_index: batch.batch_index,
                autoContinue: autoContinueInput.checked,
                autoContinueTimeout: autoContinueTimeoutInput.checked,
              });
              if (result?.outputs?.length !== outputsPerRound) {
                throw new Error(
                  `Muse 本轮返回 ${result?.outputs?.length || 0} 张，` +
                    `预期 ${outputsPerRound} 张`,
                );
              }
              generatedForBatch = result.outputs.map((output, index) =>
                payloadToFile(
                  output,
                  `copy-${String(batchIndex * outputsPerRound + index + 1).padStart(3, "0")}.webp`,
                ),
              );
            } else {
              generatedForBatch = [];
              for (
                let imageIndex = 0;
                imageIndex < batch.variants.length;
                imageIndex += 1
              ) {
                const generated = await provider.edit(
                  retryInstruction
                    ? `${batch.prompt}\n\n${retryInstruction}`
                    : batch.prompt,
                  size,
                  "high",
                  sourceForBatch,
                  batch.variants[imageIndex].task_index - 1,
                );
                generatedForBatch.push(
                  new File(
                    [generated],
                    `copy-${String(batchIndex * outputsPerRound + imageIndex + 1).padStart(3, "0")}.webp`,
                    { type: generated.type || "image/png" },
                  ),
                );
              }
            }
            const fingerprints = [];
            for (const generatedFile of generatedForBatch) {
              fingerprints.push(await blobSha256(generatedFile));
            }
            if (
              fingerprints.some(
                (fingerprint, index) =>
                  resultHashes.has(fingerprint) ||
                  fingerprints.indexOf(fingerprint) !== index,
              )
            ) {
              showGenerateProgress(
                `对话 ${batch.batch_index}/${requestCount} 存在重复图，正在重新请求整批`,
                batchIndex * outputsPerRound,
                count,
                true,
              );
              continue;
            }
            fingerprints.forEach((fingerprint) =>
              resultHashes.add(fingerprint),
            );
            accepted = true;
            break;
          } catch (error) {
            lastError = error;
            if (/^VF_MUSE_TEXT_ONLY_FAILED:/.test(error.message)) {
              break;
            }
          }
        }
        if (!accepted) {
          lastError =
            lastError ||
            new Error("整批生成连续失败或重复，任务已停止");
          if (/^VF_MUSE_TEXT_ONLY_FAILED:/.test(lastError.message)) {
            failedVariants.push(...batch.variants);
            showGenerateProgress(
              `对话 ${batch.batch_index}/${requestCount} 连续两次只返回文字，已跳过本批`,
              batchIndex * outputsPerRound,
              count,
              true,
            );
            continue;
          }
          throw new Error(
            `对话 ${batch.batch_index}/${requestCount} 失败：${lastError.message}`,
          );
        }
        generatedFiles.push(...generatedForBatch);
        generatedVariants.push(
          ...batch.variants.map((variant) => ({
            ...variant,
            prompt: batch.prompt,
          })),
        );
        showMuseReturnedImages(generatedForBatch, {
          batch: batch.batch_index,
          total: requestCount,
        });
        immediateDownloadFiles(generatedForBatch, {
          module: "product_generate",
          label: taskDisplayName(task),
          batchIndex: batch.batch_index,
          totalBatches: requestCount,
          outputOffset: batchIndex * outputsPerRound,
        });
        if (chainMode === "previous") currentSource = generatedForBatch.at(-1);
      }

      if (!generatedFiles.length) {
        throw new Error(
          `全部 ${requestCount} 次请求均未返回图片，任务失败`,
        );
      }
      showGenerateProgress(
        `已生成 ${generatedFiles.length} 张，失败 ${failedVariants.length} 张，正在归档`,
        generatedFiles.length,
        count,
      );
      const created = await createLocalJob(
        "product_generate",
        {
          task_id: task.id,
          prompt,
          base_prompt: prompt,
          prompt_template: template,
          style_pack: stylePack,
          background_mode: backgroundMode,
          category,
          output_count: outputsPerRound,
          request_count: requestCount,
          total_requests: requestCount,
          total_images: count,
          size,
          quality: "high",
          sku,
          source_mode: "image_to_image",
          generation_engine: "pre_generated",
          pre_generated: true,
          provider: engine,
          chain_mode: chainMode,
          prompts: generatedVariants,
          successful_images: generatedFiles.length,
          failed_images: failedVariants.length,
          failed_requests: Math.ceil(
            failedVariants.length / Math.max(1, outputsPerRound),
          ),
          failed_variants: failedVariants.map((variant) => ({
            direction: variant.direction,
            task_index: variant.task_index,
            prompt: variant.prompt,
          })),
          muse_image_urls: generatedFiles.map(
            (file) => file.museSourceUrl || null,
          ),
        },
        [state.generateMain, ...generatedFiles],
      );
      const finalJob = await monitorJob(created);
      completedJob = finalJob;
      await setCopyTaskStatus(task.id, {
        status: failedVariants.length ? "failed" : "succeeded",
        last_job_id: finalJob.id,
        last_finished_at: new Date().toISOString(),
        error: failedVariants.length
          ? `成功 ${generatedFiles.length} 张，失败 ${failedVariants.length} 张`
          : null,
      });
      state.failedGeneratePrompts = [];
      state.generateChainRetry = null;
      retryFailedGenerate.disabled = true;
      showGenerateProgress(
        failedVariants.length
          ? `完成，成功 ${generatedFiles.length} 张，失败 ${failedVariants.length} 张`
          : `完成，一条产品裂变任务已归档 ${generatedFiles.length} 张图片`,
        generatedFiles.length,
        count,
      );
      if (failedVariants.length) {
        throw new Error(
          `成功 ${generatedFiles.length} 张，失败 ${failedVariants.length} 张`,
        );
      }
    }
    showToast("任务处理完成");
    return completedJob || true;
  } catch (error) {
    if (runType === "batch") {
      logoDesignProgress.hidden = false;
      logoDesignProgress.classList.add("is-error");
      logoDesignProgress.textContent = error.message || "Logo 重绘失败";
    }
    if (runType === "recolor" && state.currentTaskIds.logo_recolor) {
      await setTaskStatus(state.currentTaskIds.logo_recolor, {
        status: "failed",
        error: error.message || String(error),
        last_finished_at: new Date().toISOString(),
      });
    }
    if (
      runType === "batch" &&
      state.currentTaskIds.logo_image_generate
    ) {
      await setTaskStatus(state.currentTaskIds.logo_image_generate, {
        status: "failed",
        error: error.message || String(error),
        last_finished_at: new Date().toISOString(),
      });
    }
    if (runType === "generate" && state.currentCopyTaskId) {
      await setCopyTaskStatus(state.currentCopyTaskId, {
        status: "failed",
        error: error.message || String(error),
        last_finished_at: new Date().toISOString(),
      });
    }
    if (runType === "generate") {
      state.failedGeneratePrompts = [{ prompt: "" }];
      state.generateChainRetry = null;
      retryFailedGenerate.disabled = false;
    }
    showToast(error.message || "任务提交失败", true);
    return false;
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

function videoPresentationInstruction(value) {
  return {
    product:
      "商品独立展示，不出现真人；使用真实棚拍或街景环境，通过环绕、推近和细节镜头表现商品",
    worn_no_face:
      "真人模特只做商品上身展示，镜头始终限制在颈部以下，通过自然走动、转身和局部细节表现穿着效果",
    mixed:
      "前半段展示商品独立细节，后半段展示真人模特上身效果；真人镜头始终限制在颈部以下",
  }[value] || "商品独立展示，不出现真人";
}

function buildProductVideoPrompt({
  instruction = "",
  template = "",
  durationSeconds = 8,
  aspectRatio = "9:16",
  presentationMode = "product",
  categoryValue = "auto",
  requestIndex = 1,
  requestCount = 1,
} = {}) {
  const category =
    window.VisualForgePromptTemplates.productCategoryValues(
      categoryValue,
      instruction,
    );
  const rendered = window.VisualForgePromptTemplates.render(
    template || window.VisualForgePromptTemplates.DEFAULTS.video_showcase,
    {
      instruction: String(instruction || "").trim(),
      duration_seconds: String(durationSeconds),
      aspect_ratio: String(aspectRatio),
      presentation_instruction: videoPresentationInstruction(presentationMode),
      category_name: category.category_name,
      category_print_area: category.category_print_area,
      category_base_surface: category.category_base_surface,
      category_protected_area: category.category_protected_area,
      category_model_region: category.category_model_region,
      request_index: String(requestIndex),
      request_count: String(requestCount),
    },
  );
  const categoryLocked =
    window.VisualForgePromptTemplates.ensureProductCategoryConstraint(
      rendered,
      categoryValue,
      instruction,
    );
  return window.VisualForgePromptTemplates.ensureVideoNoFaceConstraint(
    categoryLocked,
  );
}

async function runProductVideo(
  retryRequests = null,
  interactiveArchive = false,
) {
  if (state.busy) return false;
  let completedJob = null;
  try {
    if (!state.videoMain) {
      throw new Error("产品视频需要先选择 1 张商品主图");
    }
    const requestCount = safePositiveInteger(
      document.querySelector("#vfVideoRequestCount").value,
      "视频请求次数",
    );
    const requestedIndexes = Array.isArray(retryRequests) && retryRequests.length
      ? [...new Set(retryRequests)]
      : Array.from({ length: requestCount }, (_, index) => index + 1);
    const totalRequests = requestedIndexes.length;
    const durationSeconds = safePositiveInteger(
      document.querySelector("#vfVideoDuration").value,
      "视频时长",
      10,
    );
    if (![5, 8, 10].includes(durationSeconds)) {
      throw new Error("视频时长仅支持 5、8 或 10 秒");
    }
    const aspectRatio = document.querySelector("#vfVideoAspect").value;
    if (!["9:16", "1:1", "16:9"].includes(aspectRatio)) {
      throw new Error("视频画面比例无效");
    }
    const presentationMode =
      document.querySelector("#vfVideoPresentation").value;
    const category = videoCategoryInput.value || "auto";
    const instruction = document.querySelector("#vfVideoPrompt").value.trim();
    const template =
      state.videoPromptTemplate ||
      state.promptTemplates.video_showcase ||
      window.VisualForgePromptTemplates.DEFAULTS.video_showcase;
    const tab = await getMuseTab();
    await sendTabMessage(tab.id, { type: "VF_PING" });
    museConnection.textContent = "MUSE READY";
    museConnection.className = "is-online";
    setBusy(true, "", true);
    const masterPayload = await serializeFile(
      state.videoMain,
      `__video_product_source__-${state.videoMain.name}`,
    );
    const generated = [];
    const failures = [];
    state.failedVideoRequests = [];
    retryFailedVideo.disabled = true;
    for (let index = 0; index < requestedIndexes.length; index += 1) {
      await waitWhilePaused();
      const requestIndex = requestedIndexes[index];
      setVideoProgress(
        `Muse 正在生成视频 ${index + 1}/${totalRequests} · ` +
          `请求 ${requestIndex}/${requestCount}`,
        index,
        totalRequests,
      );
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const result = await sendTabMessage(tab.id, {
            type: "VF_MUSE_GENERATE_VIDEO",
            master: masterPayload,
            prompt: buildProductVideoPrompt({
              instruction,
              template,
              durationSeconds,
              aspectRatio,
              presentationMode,
              categoryValue: category,
              requestIndex,
              requestCount,
            }),
            duration_seconds: durationSeconds,
            aspect_ratio: aspectRatio,
            request_index: requestIndex,
            request_count: requestCount,
            autoContinue: autoContinueInput.checked,
            autoContinueTimeout: autoContinueTimeoutInput.checked,
          });
          const file = payloadToFile(
            result,
            `product-video-${String(requestIndex).padStart(2, "0")}.mp4`,
          );
          if (!/^video\//i.test(file.type || "")) {
            throw new Error("Muse 返回的不是可识别视频文件");
          }
          generated.push(file);
          showMuseReturnedImages([file], {
            batch: requestIndex,
            total: requestCount,
          });
          immediateDownloadFiles([file], {
            module: "product_video_generate",
            label: document.querySelector("#vfSkuVideo").value.trim()
              ? `产品视频_${document.querySelector("#vfSkuVideo").value.trim()}`
              : "产品视频",
            batchIndex: requestIndex,
            totalBatches: requestCount,
            outputOffset: index,
          });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt === 0) {
            setVideoProgress(
              `视频请求 ${requestIndex} 失败，正在自动重试：${error.message}`,
              index,
              totalRequests,
              true,
            );
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
        }
      }
      if (lastError) {
        failures.push({
          request_index: requestIndex,
          error: lastError.message,
        });
      }
      setVideoProgress(
        `视频进度 ${index + 1}/${totalRequests} · ` +
          `成功 ${generated.length} · 失败 ${failures.length}`,
        index + 1,
        totalRequests,
        failures.length > 0,
      );
    }
    state.failedVideoRequests = failures.map(
      (failure) => failure.request_index,
    );
    retryFailedVideo.disabled = state.failedVideoRequests.length === 0;
    if (!generated.length) {
      throw new Error(
        failures[0]?.error || "Muse 没有返回可播放的产品视频",
      );
    }
    setVideoProgress(
      `已生成 ${generated.length} 个视频，正在归档`,
      generated.length,
      requestedIndexes.length,
    );
    const created = await createLocalJob(
      "product_video_generate",
      {
        task_id: state.currentTaskIds.product_video_generate || null,
        prompt: instruction,
        prompt_template: template,
        sku: document.querySelector("#vfSkuVideo").value.trim(),
        presentation_mode: presentationMode,
        category,
        duration_seconds: durationSeconds,
        aspect_ratio: aspectRatio,
        request_count: requestCount,
        successful_videos: generated.length,
        failed_videos: failures.length,
        failed_requests: failures,
        video_engine: "muse",
        muse_video_urls: generated.map(
          (file) => file.museSourceUrl || null,
        ),
      },
      [state.videoMain, ...generated],
    );
    completedJob = await monitorJob(created);
    if (state.currentTaskIds.product_video_generate) {
      await setTaskStatus(state.currentTaskIds.product_video_generate, {
        status: failures.length ? "failed" : "succeeded",
        last_job_id: completedJob?.id || null,
        last_finished_at: new Date().toISOString(),
        error: failures.length
          ? `成功 ${generated.length} 个，失败 ${failures.length} 个`
          : null,
      });
    }
    if (failures.length) {
      setVideoProgress(
        `完成：成功 ${generated.length} 个视频，失败 ${failures.length} 个，可重试失败请求`,
        generated.length,
        requestedIndexes.length,
        true,
      );
      throw new Error(
        `已完成 ${generated.length} 个视频，失败 ${failures.length} 个`,
      );
    }
    setVideoProgress(
      `完成，${generated.length} 个产品视频已生成并归档`,
      generated.length,
      requestedIndexes.length,
    );
    showToast(`产品视频完成：${generated.length} 个`);
    return completedJob;
  } catch (error) {
    setVideoProgress(error.message || "产品视频生成失败", 0, 0, true);
    showToast(error.message || "产品视频生成失败", true);
    if (state.currentTaskIds.product_video_generate) {
      await setTaskStatus(state.currentTaskIds.product_video_generate, {
        status: "failed",
        error: error.message || String(error),
        last_finished_at: new Date().toISOString(),
      });
    }
    return false;
  } finally {
    setBusy(false);
  }
}

async function runProductColors(colors = null, interactiveArchive = false) {
  if (state.busy) return;
  try {
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
    const requestMode =
      colorRequestMode.value === "batch" ? "batch" : "stable";
    const batchSize =
      requestMode === "batch" ? boundedBatchSize(colorBatchSize.value) : 1;
    const generated = [];
    const failures = [];
    const resultHashes = new Set();
    for (
      let batchStart = 0;
      batchStart < targetColors.length;
      batchStart += batchSize
    ) {
      await waitWhilePaused();
      const colorBatch = targetColors.slice(batchStart, batchStart + batchSize);
      showProgress(
        requestMode === "batch" && batchSize > 1
          ? `Muse 批量生成 ${colorBatch.length} 个颜色 · ${batchStart + 1}-` +
              `${batchStart + colorBatch.length}/${targetColors.length}`
          : `Muse 正在生成 ${colorBatch[0].hex} · ${batchStart + 1}/${targetColors.length}`,
        batchStart,
        targetColors.length,
      );
      colorBatch.forEach((color) => {
        state.colorState[color.hex] = { status: "generating" };
      });
      renderColorQueue(targetColors);
      let batchOutputs = [];
      try {
        if (requestMode === "batch" && colorBatch.length > 1) {
          const result = await sendTabMessage(tab.id, {
            type: "VF_MUSE_GENERATE_COLOR_BATCH",
            master: masterPayload,
            colors: colorBatch,
            template: state.promptTemplates.product_color_batch,
            autoContinue: autoContinueInput.checked,
            autoContinueTimeout: autoContinueTimeoutInput.checked,
            total: targetColors.length,
            region,
          });
          if (result?.outputs?.length !== colorBatch.length) {
            throw new Error(
              `Muse 返回 ${result?.outputs?.length || 0} 张，` +
                `预期 ${colorBatch.length} 张`,
            );
          }
          batchOutputs = result.outputs;
          const hashes = await Promise.all(
            batchOutputs.map((output) => payloadSha256(output)),
          );
          if (
            hashes.some(
              (hash, index) =>
                resultHashes.has(hash) || hashes.indexOf(hash) !== index,
            )
          ) {
            throw new Error("Muse 返回了重复颜色图，自动改为逐色发送");
          }
          hashes.forEach((hash) => resultHashes.add(hash));
        } else {
          const output = await sendTabMessage(tab.id, {
            type: "VF_MUSE_GENERATE_COLOR",
            master: masterPayload,
            color: colorBatch[0],
            template: state.promptTemplates.product_color,
            autoContinue: autoContinueInput.checked,
            autoContinueTimeout: autoContinueTimeoutInput.checked,
            index: batchStart + 1,
            total: targetColors.length,
            region,
          });
          batchOutputs = [output];
          resultHashes.add(await payloadSha256(output));
        }
        batchOutputs.forEach((output, index) => {
          const color = colorBatch[index];
          generated.push({ file: output, color });
          state.colorState[color.hex] = { status: "success" };
        });
        const returnedFiles = batchOutputs.map((output, index) =>
          payloadToFile(
            output,
            `muse-color-${batchStart + index + 1}.webp`,
          ),
        );
        showMuseReturnedImages(
          returnedFiles,
          {
            batch: Math.floor(batchStart / batchSize) + 1,
            total: Math.ceil(targetColors.length / batchSize),
          },
        );
        immediateDownloadFiles(returnedFiles, {
          module: "product_color",
          label: "商品配色",
          batchIndex: Math.floor(batchStart / batchSize) + 1,
          totalBatches: Math.ceil(targetColors.length / batchSize),
          outputOffset: batchStart,
        });
        renderColorQueue(targetColors);
      } catch (error) {
        showProgress(
          `批量颜色请求失败，自动逐色发送：${error.message}`,
          batchStart,
          targetColors.length,
          true,
        );
        for (let colorIndex = 0; colorIndex < colorBatch.length; colorIndex += 1) {
          await waitWhilePaused();
          const color = colorBatch[colorIndex];
          const index = batchStart + colorIndex;
          state.colorState[color.hex] = { status: "generating" };
          renderColorQueue(targetColors);
          try {
            const output = await sendTabMessage(tab.id, {
              type: "VF_MUSE_GENERATE_COLOR",
              master: masterPayload,
              color,
              template: state.promptTemplates.product_color,
              autoContinue: autoContinueInput.checked,
              autoContinueTimeout: autoContinueTimeoutInput.checked,
              index: index + 1,
              total: targetColors.length,
              region,
            });
            generated.push({ file: output, color });
            state.colorState[color.hex] = { status: "success" };
            const returnedFile = payloadToFile(
              output,
              `muse-color-${index + 1}.webp`,
            );
            showMuseReturnedImages(
              [returnedFile],
              { batch: index + 1, total: targetColors.length },
            );
            immediateDownloadFiles([returnedFile], {
              module: "product_color",
              label: "商品配色",
              batchIndex: index + 1,
              totalBatches: targetColors.length,
              outputOffset: index,
            });
          } catch (fallbackError) {
            failures.push({ color: color.hex, error: fallbackError.message });
            state.colorState[color.hex] = {
              status: "failed",
              error: fallbackError.message,
            };
          }
          renderColorQueue(targetColors);
        }
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
        task_id: state.currentTaskIds.product_color || null,
        colors: generated.map((item) => item.color),
        muse_image_urls: generated.map(
          (item) => item.file.museSourceUrl || item.file.url || null,
        ),
        failed_colors: failures.map((failure) => failure.color),
        failure_details: failures.map((failure) => ({
          color: failure.color,
          error: failure.error,
        })),
        pass_limit: 3,
        review_limit: 5,
        region,
        sheet_columns: 4,
        sku: document.querySelector("#vfProductSku").value.trim(),
        request_mode: requestMode,
        batch_size: batchSize,
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
    if (issueCount) {
      throw new Error(`已完成 ${generated.length} 个颜色，${issueCount} 个颜色需要重试`);
    }
    if (state.currentTaskIds.product_color) {
      await setTaskStatus(state.currentTaskIds.product_color, {
        status: "succeeded",
        last_job_id: finalJob?.id || null,
        last_finished_at: new Date().toISOString(),
        error: null,
      });
    }
    return finalJob;
  } catch (error) {
    if (state.failedProductColors.length) {
      retryFailedColors.disabled = false;
    }
    showProgress(error.message || "商品配色失败", 0, 0, true);
    showToast(error.message || "商品配色失败", true);
    if (state.currentTaskIds.product_color) {
      await setTaskStatus(state.currentTaskIds.product_color, {
        status: "failed",
        error: error.message || String(error),
        last_finished_at: new Date().toISOString(),
      });
    }
    return false;
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
  if (parsed.kind === "logo_image_recolor") {
    switchTab("batch");
    document.querySelector("#vfSkuBatch").value = parsed.options.sku || "";
    const promptInput = document.querySelector("#vfLogoPrompt");
    if (!promptInput.value.trim()) {
      promptInput.value =
        `将所有已有 Logo 重新设计为以 ${parsed.options.color} 为主色的全新 Logo`;
    }
    showToast("已填入 Logo 重绘要求，请确认后点击开始");
    return;
  }
  if (parsed.kind === "product_generate") {
    switchTab("generate");
    document.querySelector("#vfSkuGenerate").value = parsed.options.sku || "";
    document.querySelector("#vfPrompt").value = parsed.options.prompt;
    document.querySelector("#vfCount").value = String(parsed.options.count);
    requestCountInput.value = "1";
    document.querySelector("#vfSize").value = parsed.options.size;
    renderRequestSummary();
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
generateMainInput.addEventListener("change", () => {
  state.generateMain = generateMainInput.files[0] || null;
  renderGeneratePreview();
});
videoMainInput.addEventListener("change", () => {
  const file = videoMainInput.files[0] || null;
  if (file && !isImageFile(file)) {
    videoMainInput.value = "";
    showToast("产品视频主图必须是图片文件", true);
    return;
  }
  state.videoMain = file;
  state.videoPromptTemplate =
    state.promptTemplates.video_showcase ||
    window.VisualForgePromptTemplates.DEFAULTS.video_showcase;
  renderVideoPreview();
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
document.querySelector("#vfRunVideo").addEventListener("click", () => {
  void runProductVideo(null, true);
});
retryFailedVideo.addEventListener("click", () => {
  if (!state.failedVideoRequests.length) return;
  void runProductVideo([...state.failedVideoRequests], true);
});
retryPatternFailed.addEventListener("click", () => {
  if (!state.failedPatternRefs.length) return;
  void runPatternTransfer([...state.failedPatternRefs], true);
});
retryFailedGenerate.addEventListener("click", () => {
  if (!state.failedGeneratePrompts.length) return;
  const context = state.generateChainRetry;
  void runLogoJob(
    "generate",
    true,
    state.failedGeneratePrompts.map((item) => ({ ...item })),
    context,
  );
});
document
  .querySelector("#vfDownloadPatternBatches")
  .addEventListener("click", downloadPatternBatchArchives);

document.querySelector("#vfRefresh").addEventListener("click", () => {
  void loadJobs();
});
saveColorTask.addEventListener("click", () => {
  void saveCurrentModeTask("product_color").catch((error) =>
    showToast(error.message, true),
  );
});
saveRecolorTask.addEventListener("click", () => {
  void saveCurrentModeTask("logo_recolor").catch((error) =>
    showToast(error.message, true),
  );
});
saveLogoImageTask.addEventListener("click", () => {
  void saveCurrentModeTask("logo_image_generate").catch((error) =>
    showToast(error.message, true),
  );
});
newLogoImageTask.addEventListener("click", () => {
  void saveCurrentModeTask("logo_image_generate", { forceNew: true }).catch(
    (error) => showToast(error.message, true),
  );
});
savePatternTask.addEventListener("click", () => {
  void saveCurrentModeTask("pattern_transfer").catch((error) =>
    showToast(error.message, true),
  );
});
document.querySelector("#vfSaveVideoTask").addEventListener("click", () => {
  void saveCurrentModeTask("product_video_generate").catch((error) =>
    showToast(error.message, true),
  );
});
fontDecrease.addEventListener("click", () =>
  changeInterfaceScale(-INTERFACE_SCALE_STEP),
);
fontIncrease.addEventListener("click", () =>
  changeInterfaceScale(INTERFACE_SCALE_STEP),
);
fontScaleValue.addEventListener("click", () =>
  applyInterfaceScale(1.1, { notify: true }),
);
linksOnlyExportInput.addEventListener("change", () => {
  void chrome.storage.local.set({
    linksOnlyExport: linksOnlyExportInput.checked,
  });
  showToast(
    linksOnlyExportInput.checked
      ? "后续 Muse 任务将只保存原始图片链接"
      : "后续任务将保存图片文件",
  );
});
window.addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    changeInterfaceScale(
      event.deltaY < 0 ? INTERFACE_SCALE_STEP : -INTERFACE_SCALE_STEP,
    );
  },
  { passive: false },
);
saveCopyTasks.addEventListener("click", () => {
  void saveCurrentCopyTask().catch((error) => showToast(error.message, true));
});
addCopyTask.addEventListener("click", () => {
  void addCopyTaskFromLast();
});
loadLastCopyTask.addEventListener("click", () => {
  void loadLatestCopyTask();
});
detachCurrentTask.addEventListener("click", detachCurrentTaskFromSavedVersion);
queueCopyTasks.addEventListener("click", () => {
  void queueAllCopyTasks();
});
queuePause.addEventListener("click", () => {
  setQueuePaused(!state.queuePaused);
});
retryFailedQueue.addEventListener("click", () => {
  void retryFailedQueueTasks();
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
    await VisualForgeArchive.chooseNewDirectory();
    await refreshArchiveStatus();
    await autoArchiveUnsavedJobs();
    showToast("归档目录已授权");
  } catch (error) {
    showToast(error.message, true);
  }
});
document.querySelector("#vfProductColors").addEventListener("input", () => {
  renderColorChips();
});
colorBatchSize.addEventListener("change", () => {
  colorBatchSize.value = String(boundedBatchSize(colorBatchSize.value));
});
logoRequestCount.addEventListener("change", () => {
  logoRequestCount.value = String(
    safePositiveInteger(logoRequestCount.value, "请求次数"),
  );
  renderLogoRequestSummary();
});
logoOutputCount.addEventListener("change", renderLogoRequestSummary);
logoRequestMode.addEventListener("change", renderLogoRequestSummary);
patternBatchSize.addEventListener("change", async () => {
  patternBatchSize.value = String(boundedBatchSize(patternBatchSize.value));
  state.patternBatches = [];
  if (state.patternRefs.length) {
    try {
      await refreshPatternBatches();
    } catch (error) {
      showToast(`参考图处理失败：${error.message}`, true);
    }
  }
});
requestCountInput.addEventListener("change", () => {
  requestCountInput.value = String(
    Math.max(1, Math.floor(Number(requestCountInput.value) || 1)),
  );
  renderRequestSummary();
});
document.querySelector("#vfCount").addEventListener("change", renderRequestSummary);
document
  .querySelector("#vfVideoRequestCount")
  .addEventListener("change", (event) => {
    try {
      event.target.value = String(
        safePositiveInteger(event.target.value, "视频请求次数"),
      );
    } catch (error) {
      event.target.value = "1";
      showToast(error.message, true);
    }
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
document.querySelector("#vfResetPromptTemplate").addEventListener("click", () => {
  promptTemplateInput.value = VisualForgeCore.DEFAULT_COPY_PROMPT_TEMPLATE;
  updatePromptTemplateState();
  void persistPromptTemplate().catch((error) => showToast(error.message, true));
});
document.querySelector("#vfSavePromptTemplate").addEventListener("click", () => {
  void persistPromptTemplate().catch((error) => showToast(error.message, true));
});
promptTemplateInput.addEventListener("input", updatePromptTemplateState);
directPromptInput.addEventListener("change", () => {
  void chrome.storage.local.set({
    copyDirectPrompt: directPromptInput.checked,
  });
});
function syncAutoContinuePreference() {
  autoContinueTimeoutInput.disabled = !autoContinueInput.checked;
  if (!autoContinueInput.checked) autoContinueTimeoutInput.checked = false;
  void (async () => {
    await chrome.storage.local.set({
      autoContinueEnabled: autoContinueInput.checked,
      autoContinueTimeoutEnabled: autoContinueTimeoutInput.checked,
    });
    try {
      const tab = await getMuseTab();
      await sendTabMessage(tab.id, {
        type: "VF_SET_AUTO_CONTINUE",
        enabled: autoContinueInput.checked,
        timeoutEnabled: autoContinueTimeoutInput.checked,
      });
    } catch {
      // Muse may not be open while changing the preference.
    }
  })();
}
autoContinueInput.addEventListener("change", syncAutoContinuePreference);
autoContinueTimeoutInput.addEventListener("change", syncAutoContinuePreference);
autoRegenerateTextOnlyInput.addEventListener("change", () => {
  void (async () => {
    await chrome.storage.local.set({
      autoRegenerateTextOnly: autoRegenerateTextOnlyInput.checked,
    });
    try {
      const tab = await getMuseTab();
      await sendTabMessage(tab.id, {
        type: "VF_SET_AUTO_REGENERATE",
        enabled: autoRegenerateTextOnlyInput.checked,
      });
    } catch {
      // Muse may not be open while changing the preference.
    }
  })();
});
immediateDownloadInput.addEventListener("change", () => {
  void chrome.storage.local.set({
    immediateDownload: immediateDownloadInput.checked,
  });
  showToast(
    immediateDownloadInput.checked
      ? "Muse 返回图片或视频后将立即下载到浏览器下载目录"
      : "已关闭 Muse 返回媒体即时下载",
  );
});
document
  .querySelector("#vfSaveAllPromptTemplates")
  .addEventListener("click", () => {
    void persistPromptCatalog().catch((error) =>
      showToast(error.message, true),
    );
  });
document
  .querySelector("#vfResetAllPromptTemplates")
  .addEventListener("click", () => {
    const defaults = defaultPromptTemplates();
    promptCatalog.querySelectorAll("[data-prompt-key]").forEach((textarea) => {
      textarea.value = defaults[textarea.dataset.promptKey];
    });
    void persistPromptCatalog("全部模板已恢复默认").catch((error) =>
      showToast(error.message, true),
    );
  });
rememberPrompt.addEventListener("change", () => {
  void chrome.storage.local.set({
    copyMemoryEnabled: rememberPrompt.checked,
  });
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
  void refreshArchiveStatus()
    .then(() => autoArchiveUnsavedJobs())
    .catch(() => {});
});

async function initialize() {
  installEmbeddedControls();
  renderProductCategoryOptions();
  switchTab("product");
  renderColorChips();
  renderRequestSummary();
  renderLogoRequestSummary();
  await loadRecentColors();
  await loadPromptPreferences();
  await VisualForgeStore.recoverInterrupted();
  await loadJobs();
  await autoArchiveUnsavedJobs({ notify: false });
  await renderCopyTasks();
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
