(function initSidePanel() {
  const {
    IMAGE_TASK_URL,
    PRODUCT_LIST_URL,
    normalizeHeader,
    normalizeText,
    deriveCategoryCode,
    inferImageExtension,
    sanitizeWindowsName,
    statusIsSuccessful,
    formatDateTime,
    sleep
  } = TemuCommon;

  const OUTPUT_ROOT_NAME = "下架图片合集";
  const FS_DB_NAME = "temu-downlist-fs";
  const FS_STORE_NAME = "handles";
  const FS_OUTPUT_KEY = "output-root";
  const DEFAULT_TIMEOUTS = {
    contentPing: 5000,
    spuQuery: 45000,
    imageDownload: 30000,
    fileDownload: 60000,
    downlist: 150000,
    verify: 35000
  };
  const TIMEOUT_FIELDS = [
    { key: "spuQuery", input: "queryTimeoutInput", min: 15, max: 120 },
    { key: "imageDownload", input: "imageTimeoutInput", min: 10, max: 120 },
    { key: "fileDownload", input: "fileDownloadTimeoutInput", min: 15, max: 180 },
    { key: "downlist", input: "downlistTimeoutInput", min: 60, max: 300 },
    { key: "verify", input: "verifyTimeoutInput", min: 15, max: 120 }
  ];
  let outputDirectoryHandle = null;

  const state = {
    workbook: null,
    originalAoa: [],
    fileName: "",
    sheetName: "",
    columns: { serial: 0, input: 1, status: 2 },
    lookupType: "SPU",
    rows: [],
    mode: "images",
    useCarouselFirst: false,
    override: "",
    running: false,
    paused: false,
    stopping: false,
    workTabId: null,
    progressCurrent: 0,
    progressTotal: 0,
    lastResultPath: "",
    savedImageKeys: new Set(),
    retryFilter: null,
    timeouts: { ...DEFAULT_TIMEOUTS }
  };

  const elements = {
    browserIdInput: document.getElementById("browserIdInput"),
    categoryOverrideInput: document.getElementById("categoryOverrideInput"),
    checkEnvironmentBtn: document.getElementById("checkEnvironmentBtn"),
    storageDot: document.getElementById("storageDot"),
    storageStatus: document.getElementById("storageStatus"),
    chooseOutputDirBtn: document.getElementById("chooseOutputDirBtn"),
    clearOutputDirBtn: document.getElementById("clearOutputDirBtn"),
    outputDetail: document.getElementById("outputDetail"),
    browserDot: document.getElementById("browserDot"),
    browserStatus: document.getElementById("browserStatus"),
    pageDot: document.getElementById("pageDot"),
    pageStatus: document.getElementById("pageStatus"),
    profileDetail: document.getElementById("profileDetail"),
    authorizeWrap: document.getElementById("authorizeWrap"),
    authorizeSubmitInput: document.getElementById("authorizeSubmitInput"),
    deleteAuthorizeWrap: document.getElementById("deleteAuthorizeWrap"),
    deleteAuthorizeInput: document.getElementById("deleteAuthorizeInput"),
    multiColorInput: document.getElementById("multiColorInput"),
    directSpuInput: document.getElementById("directSpuInput"),
    applyDirectInputBtn: document.getElementById("applyDirectInputBtn"),
    clearDirectInputBtn: document.getElementById("clearDirectInputBtn"),
    directInputMeta: document.getElementById("directInputMeta"),
    excelInput: document.getElementById("excelInput"),
    downloadTemplateBtn: document.getElementById("downloadTemplateBtn"),
    fileMeta: document.getElementById("fileMeta"),
    queryTimeoutInput: document.getElementById("queryTimeoutInput"),
    imageTimeoutInput: document.getElementById("imageTimeoutInput"),
    fileDownloadTimeoutInput: document.getElementById("fileDownloadTimeoutInput"),
    downlistTimeoutInput: document.getElementById("downlistTimeoutInput"),
    verifyTimeoutInput: document.getElementById("verifyTimeoutInput"),
    resetTimeoutsBtn: document.getElementById("resetTimeoutsBtn"),
    totalCount: document.getElementById("totalCount"),
    pendingCount: document.getElementById("pendingCount"),
    successCount: document.getElementById("successCount"),
    errorCount: document.getElementById("errorCount"),
    runState: document.getElementById("runState"),
    progressText: document.getElementById("progressText"),
    progressBar: document.getElementById("progressBar"),
    startBtn: document.getElementById("startBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    stopBtn: document.getElementById("stopBtn"),
    retryFailedBtn: document.getElementById("retryFailedBtn"),
    exportBtn: document.getElementById("exportBtn"),
    rowsBody: document.getElementById("rowsBody"),
    logOutput: document.getElementById("logOutput"),
    clearLogBtn: document.getElementById("clearLogBtn")
  };

  const THEMES = ["classic", "ocean", "forest", "sunset"];

  function applyTheme(theme, persist = true) {
    const nextTheme = THEMES.includes(theme) ? theme : "classic";
    document.documentElement.dataset.theme = nextTheme;
    document.querySelectorAll(".skin-swatch").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        button.dataset.theme === nextTheme ? "true" : "false"
      );
    });
    try {
      window.parent?.postMessage(
        { source: "temu-downlist-frame", type: "theme", theme: nextTheme },
        "*"
      );
    } catch (_) {
      // The UI is also usable as a normal extension page.
    }
    if (persist) {
      chrome.storage.local.set({ skin: nextTheme }).catch(() => {});
    }
  }

  function openFsDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(FS_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(FS_STORE_NAME)) {
          database.createObjectStore(FS_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getStoredOutputHandle() {
    const database = await openFsDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(FS_STORE_NAME, "readonly");
        const request = transaction.objectStore(FS_STORE_NAME).get(FS_OUTPUT_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }

  async function storeOutputHandle(handle) {
    const database = await openFsDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(FS_STORE_NAME, "readwrite");
        transaction.objectStore(FS_STORE_NAME).put(handle, FS_OUTPUT_KEY);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }

  async function removeStoredOutputHandle() {
    const database = await openFsDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(FS_STORE_NAME, "readwrite");
        transaction.objectStore(FS_STORE_NAME).delete(FS_OUTPUT_KEY);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }

  async function getHandlePermission(handle) {
    if (!handle) return "missing";
    if (!handle.queryPermission) return "granted";
    return handle.queryPermission({ mode: "readwrite" });
  }

  async function refreshOutputDirectoryStatus(requestPermission = false) {
    outputDirectoryHandle ||= await getStoredOutputHandle().catch(() => null);
    if (!outputDirectoryHandle) {
      elements.storageStatus.textContent = "浏览器下载目录";
      elements.outputDetail.textContent =
        "未选择文件夹。文件将保存到浏览器下载目录下的“下架图片合集/分类/…”中。";
      setDot(elements.storageDot, "ok");
      return null;
    }

    let permission = await getHandlePermission(outputDirectoryHandle);
    if (permission === "prompt" && requestPermission) {
      try {
        permission = await outputDirectoryHandle.requestPermission({
          mode: "readwrite"
        });
      } catch (_) {
        permission = "denied";
      }
    }

    if (permission === "granted") {
      const rootName =
        outputDirectoryHandle.name === OUTPUT_ROOT_NAME
          ? OUTPUT_ROOT_NAME
          : `${outputDirectoryHandle.name}/${OUTPUT_ROOT_NAME}`;
      elements.storageStatus.textContent = outputDirectoryHandle.name;
      elements.outputDetail.textContent = `保存位置：${rootName}/分类/主图保存`;
      setDot(elements.storageDot, "ok");
      return outputDirectoryHandle;
    }

    elements.storageStatus.textContent =
      permission === "denied" ? "目录权限已拒绝" : "需要重新授权";
    elements.outputDetail.textContent =
      "请点击“选择保存文件夹”重新授权；也可以改用浏览器下载目录。";
    setDot(elements.storageDot, permission === "denied" ? "error" : "");
    return null;
  }

  async function chooseOutputDirectory() {
    if (typeof window.showDirectoryPicker !== "function") {
      if (window.parent !== window) {
        await chrome.windows.create({
          url: chrome.runtime.getURL("sidepanel.html?setup=1"),
          type: "popup",
          width: 520,
          height: 820
        });
        throw new Error("已打开独立设置窗口，请在窗口中选择保存文件夹");
      }
      throw new Error("当前浏览器不支持文件夹选择，将继续使用浏览器下载目录");
    }
    try {
      const handle = await window.showDirectoryPicker({
        id: "temu-downlist-output",
        mode: "readwrite",
        startIn: "desktop"
      });
      outputDirectoryHandle = handle;
      await storeOutputHandle(handle);
      await chrome.storage.local.set({ outputHandleUpdatedAt: Date.now() });
      await refreshOutputDirectoryStatus(true);
      log(`已选择保存文件夹：${handle.name}`);
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (error?.name === "SecurityError" && window.parent !== window) {
        await chrome.windows.create({
          url: chrome.runtime.getURL("sidepanel.html?setup=1"),
          type: "popup",
          width: 520,
          height: 820
        });
        throw new Error("已打开独立设置窗口，请在窗口中选择保存文件夹");
      }
      throw new Error(
        error?.name === "SecurityError"
          ? "当前页面不允许打开文件夹选择器，请从浏览器工具栏打开扩展侧边栏后再选择"
          : error.message
      );
    }
  }

  async function clearOutputDirectory() {
    outputDirectoryHandle = null;
    await removeStoredOutputHandle();
    await chrome.storage.local.set({ outputHandleUpdatedAt: Date.now() });
    await refreshOutputDirectoryStatus(false);
    log("已切换为浏览器下载目录");
  }

  async function getOutputRootHandle(requestPermission = false) {
    outputDirectoryHandle ||= await getStoredOutputHandle().catch(() => null);
    if (!outputDirectoryHandle) return null;
    const permission = await refreshOutputDirectoryStatus(requestPermission);
    if (!permission) return null;
    if (outputDirectoryHandle.name === OUTPUT_ROOT_NAME) {
      return outputDirectoryHandle;
    }
    return outputDirectoryHandle.getDirectoryHandle(OUTPUT_ROOT_NAME, {
      create: true
    });
  }

  async function ensureDirectoryChain(root, parts) {
    let current = root;
    for (const part of parts) {
      const safePart = sanitizeWindowsName(part);
      if (!safePart) throw new Error("目录名称为空");
      current = await current.getDirectoryHandle(safePart, { create: true });
    }
    return current;
  }

  async function fetchImageBlob(url) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      state.timeouts.imageDownload
    );
    let response;
    try {
      response = await fetch(url, {
        credentials: "include",
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("图片下载超时");
        timeoutError.code = "IMAGE_TIMEOUT";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new Error(`图片下载 HTTP ${response.status}`);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("图片内容为空");
    if (blob.size > 30 * 1024 * 1024) throw new Error("图片超过 30MB");
    const bitmap = await createImageBitmap(blob);
    const width = bitmap.width;
    const height = bitmap.height;
    bitmap.close?.();
    if (width < 200 || height < 200) {
      throw new Error(`图片尺寸异常：${width} × ${height}`);
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await blob.arrayBuffer()
    );
    const sha256 = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    return { blob, width, height, sha256 };
  }

  async function writeBlobToDirectory(directory, filename, blob, overwrite = false) {
    if (!overwrite) {
      try {
        const existing = await directory.getFileHandle(filename);
        const file = await existing.getFile();
        if (file.size > 0) return { path: filename, reused: true };
      } catch (error) {
        if (error?.name !== "NotFoundError") throw error;
      }
    }
    const fileHandle = await directory.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
    return { path: filename, reused: false };
  }

  async function waitForDownload(downloadId) {
    return new Promise((resolve, reject) => {
      const check = () => {
        chrome.downloads.search({ id: downloadId }, (items) => {
          const item = items?.[0];
          if (!item) return;
          if (item.state === "complete") {
            chrome.downloads.onChanged.removeListener(onChanged);
            resolve(item);
          } else if (item.state === "interrupted") {
            chrome.downloads.onChanged.removeListener(onChanged);
            reject(new Error(item.error || "浏览器下载失败"));
          }
        });
      };
      const onChanged = (delta) => {
        if (delta.id === downloadId && delta.state) check();
      };
      chrome.downloads.onChanged.addListener(onChanged);
      check();
    });
  }

  async function downloadBlob(blob, relativePath) {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const downloadId = await chrome.downloads.download({
        url: objectUrl,
        filename: relativePath.replace(/\\/g, "/"),
        conflictAction: "overwrite",
        saveAs: false
      });
      try {
        await withTimeout(
          waitForDownload(downloadId),
          state.timeouts.fileDownload,
          "浏览器下载超时"
        );
      } catch (error) {
        await chrome.downloads.cancel(downloadId).catch(() => {});
        error.code = "DOWNLOAD_TIMEOUT";
        throw error;
      }
      return `浏览器下载目录/${relativePath.replace(/\\/g, "/")}`;
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
  }

  async function saveMainImage(category, filename, url) {
    const key = `${category}/${filename}`;
    if (state.savedImageKeys.has(key)) {
      return { path: key, reused: true };
    }
    const image = await fetchImageBlob(url);
    const rootHandle = await getOutputRootHandle(false);
    let savedPath;
    let reused = false;

    if (rootHandle) {
      const mainDirectory = await ensureDirectoryChain(rootHandle, [
        category,
        "主图保存"
      ]);
      const result = await writeBlobToDirectory(
        mainDirectory,
        filename,
        image.blob,
        false
      );
      reused = result.reused;
      savedPath = `${rootHandle.name}/${category}/主图保存/${filename}`;
    } else {
      savedPath = await downloadBlob(
        image.blob,
        `${OUTPUT_ROOT_NAME}/${category}/主图保存/${filename}`
      );
    }

    state.savedImageKeys.add(key);
    return {
      path: savedPath,
      reused,
      width: image.width,
      height: image.height,
      sha256: image.sha256
    };
  }

  function log(message, level = "info") {
    const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    const prefix = level === "error" ? "错误" : level === "warn" ? "提醒" : "信息";
    elements.logOutput.textContent += `[${stamp}] ${prefix}：${message}\n`;
    elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
  }

  function setDot(element, status) {
    element.classList.remove("ok", "error");
    if (status === "ok") element.classList.add("ok");
    if (status === "error") element.classList.add("error");
  }

  function setRunState(text) {
    elements.runState.textContent = text;
  }

  function setButtons() {
    const retryableCount = state.rows.filter(isRetryableFailure).length;
    const directParsed = TemuCommon.parseSpuIdText(elements.directSpuInput.value);
    elements.startBtn.disabled = state.running || !state.rows.length;
    elements.pauseBtn.disabled = !state.running;
    elements.pauseBtn.textContent = state.paused ? "继续" : "暂停";
    elements.stopBtn.disabled = !state.running;
    elements.retryFailedBtn.disabled = state.running || retryableCount === 0;
    elements.retryFailedBtn.textContent = retryableCount
      ? `重试失败项（${retryableCount}）`
      : "重试失败项";
    elements.exportBtn.disabled = !state.originalAoa.length || state.running;
    elements.directSpuInput.disabled = state.running;
    elements.applyDirectInputBtn.disabled = state.running || !directParsed.values.length;
    elements.clearDirectInputBtn.disabled =
      state.running || !normalizeText(elements.directSpuInput.value);
  }

  function isRetryableFailure(row) {
    if (!row || row.skip) return false;
    if (/需复核/.test(row.status || "")) return false;
    return /未查到|超时|处理失败|下架失败|删除失败/.test(row.status || "");
  }

  function isTimeoutError(error) {
    return /TIMEOUT|超时/i.test(`${error?.code || ""} ${error?.message || ""}`);
  }

  function withTimeout(promise, timeoutMs, message) {
    const safeTimeoutMs =
      Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
        ? Number(timeoutMs)
        : 1000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(message || "操作超时");
        error.code = "OPERATION_TIMEOUT";
        reject(error);
      }, safeTimeoutMs);
      Promise.resolve(promise).then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  function normalizeTimeoutSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const normalized = { ...DEFAULT_TIMEOUTS };
    for (const field of TIMEOUT_FIELDS) {
      normalized[field.key] = TemuCommon.clampTimeoutMs(
        source[field.key],
        field.min,
        field.max,
        DEFAULT_TIMEOUTS[field.key]
      );
    }
    return normalized;
  }

  function renderTimeoutInputs() {
    for (const field of TIMEOUT_FIELDS) {
      elements[field.input].value = String(
        Math.round(state.timeouts[field.key] / 1000)
      );
    }
  }

  async function saveTimeoutInputs() {
    const next = { ...state.timeouts };
    for (const field of TIMEOUT_FIELDS) {
      next[field.key] =
        TemuCommon.clampTimeoutMs(
          Number(elements[field.input].value) * 1000,
          field.min,
          field.max,
          DEFAULT_TIMEOUTS[field.key]
        );
    }
    state.timeouts = next;
    renderTimeoutInputs();
    await chrome.storage.local.set({ timeouts: next });
  }

  async function resetTimeoutInputs() {
    state.timeouts = { ...DEFAULT_TIMEOUTS };
    renderTimeoutInputs();
    await chrome.storage.local.set({ timeouts: state.timeouts });
    log("超时参数已恢复默认值");
  }

  function refreshProgress() {
    const percent = state.progressTotal
      ? Math.round((state.progressCurrent / state.progressTotal) * 100)
      : 0;
    elements.progressBar.style.width = `${Math.min(100, percent)}%`;
    elements.progressText.textContent = `${state.progressCurrent} / ${state.progressTotal}`;
    refreshCounts();
  }

  function refreshCounts() {
    const total = state.rows.length;
    const success = state.rows.filter((row) =>
      /主图成功|下架成功|删除成功|已完成/.test(row.status)
    ).length;
    const errors = state.rows.filter((row) =>
      /失败|异常|未查到|需复核|超时/.test(row.status)
    ).length;
    const pending = state.rows.filter(
      (row) => !row.skip && !/成功|已完成|失败|异常|未查到|需复核|超时/.test(row.status)
    ).length;
    elements.totalCount.textContent = String(total);
    elements.successCount.textContent = String(success);
    elements.errorCount.textContent = String(errors);
    elements.pendingCount.textContent = String(pending);
  }

  function rowDisplayStatus(row) {
    return row.status || row.inputStatus || "待处理";
  }

  function renderRows() {
    elements.rowsBody.replaceChildren();
    if (!state.rows.length) {
      const tr = document.createElement("tr");
      tr.className = "empty-row";
      const td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = "直接填写 SPU 或导入 Excel 后显示任务";
      tr.appendChild(td);
      elements.rowsBody.appendChild(tr);
      refreshProgress();
      return;
    }

    for (const row of state.rows) {
      const tr = document.createElement("tr");
      if (row.active) tr.classList.add("row-active");
      if (/失败|异常|超时|需复核/.test(rowDisplayStatus(row))) {
        tr.classList.add("row-error");
      }

      const values = [
        String(row.serial || row.originalRowIndex),
        row.inputId,
        row.category || "—",
        row.skc || "—",
        rowDisplayStatus(row)
      ];
      for (const value of values) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }
      elements.rowsBody.appendChild(tr);
    }
    refreshProgress();
    setButtons();
  }

  function updateRow(row, changes) {
    Object.assign(row, changes);
    renderRows();
  }

  function findColumn(headers, aliases) {
    return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
  }

  function commitTaskData({
    workbook,
    aoa,
    fileName,
    sheetName,
    columns,
    lookupType,
    rows,
    badgeText,
    logMessage
  }) {
    Object.assign(state, {
      workbook,
      originalAoa: aoa,
      fileName,
      sheetName,
      columns,
      lookupType,
      rows,
      progressCurrent: 0,
      progressTotal: rows.filter((row) => !row.skip).length,
      lastResultPath: ""
    });
    elements.fileMeta.textContent = badgeText;
    setRunState("已添加");
    renderRows();
    setButtons();
    log(logMessage);
  }

  function updateDirectInputMeta() {
    const parsed = TemuCommon.parseSpuIdText(elements.directSpuInput.value);
    if (!normalizeText(elements.directSpuInput.value)) {
      elements.directInputMeta.textContent =
        "支持粘贴整列 SPU ID，将自动去重并忽略序号等非 SPU 数字。";
    } else if (!parsed.values.length) {
      elements.directInputMeta.textContent =
        "未识别到有效的 8-20 位 SPU ID。";
    } else {
      const notes = [`已识别 ${parsed.values.length} 个 SPU`];
      if (parsed.duplicates) notes.push(`去重 ${parsed.duplicates} 个`);
      if (parsed.ignored) notes.push(`忽略 ${parsed.ignored} 个非 SPU 数字`);
      elements.directInputMeta.textContent = notes.join("，");
    }
    setButtons();
  }

  function applyDirectSpuInput() {
    if (state.running) throw new Error("任务运行中，不能替换 SPU 列表");
    const parsed = TemuCommon.parseSpuIdText(elements.directSpuInput.value);
    if (!parsed.values.length) {
      throw new Error("请先填写至少一个有效的 8-20 位 SPU ID");
    }
    if (
      state.rows.length &&
      !window.confirm("直接填写会替换当前任务列表，是否继续？")
    ) {
      return;
    }

    const aoa = [
      ["序号", "SPU ID", "状态"],
      ...parsed.values.map((id, index) => [index + 1, id, ""])
    ];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(workbook, worksheet, "下架清单");
    const columns = { serial: 0, input: 1, status: 2 };
    const rows = TemuCommon.buildTaskRowsFromAoa(aoa, columns, "SPU");
    const suffix = parsed.duplicates ? `，已去重 ${parsed.duplicates} 个` : "";

    commitTaskData({
      workbook,
      aoa,
      fileName: "直接输入",
      sheetName: "下架清单",
      columns,
      lookupType: "SPU",
      rows,
      badgeText: `直接输入 ${rows.length} 条`,
      logMessage: `已从文本框添加 ${rows.length} 个 SPU${suffix}`
    });
  }

  async function importWorkbook(file) {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false
    });
    if (aoa.length < 2) throw new Error("Excel 没有可处理的数据行");

    const headers = aoa[0];
    const serialColumn = findColumn(headers, ["序号", "sequence", "no", "number"]);
    const spuColumn = findColumn(headers, [
      "spuid",
      "spu",
      "spu编号"
    ]);
    const skcColumn = findColumn(headers, [
      "skcid",
      "sckid",
      "skc",
      "sck",
      "skc编号"
    ]);
    const statusColumn = findColumn(headers, ["状态", "status"]);
    const inputColumn = spuColumn >= 0 ? spuColumn : skcColumn;
    const lookupType = spuColumn >= 0 ? "SPU" : "SKC";

    if (inputColumn < 0) {
      throw new Error("未找到“SPU ID”列，请使用 A 序号、B SPU ID、C 状态的格式");
    }

    const columns = {
      serial: serialColumn >= 0 ? serialColumn : 0,
      input: inputColumn,
      status: statusColumn >= 0 ? statusColumn : 2
    };
    const rows = TemuCommon.buildTaskRowsFromAoa(aoa, columns, lookupType);
    const validCount = rows.filter((row) => !row.skip).length;

    commitTaskData({
      workbook,
      aoa,
      fileName: file.name,
      sheetName,
      columns,
      lookupType,
      rows,
      badgeText: file.name,
      logMessage: `已导入 ${file.name}，有效任务 ${validCount} 条`
    });
  }

  async function openProfile() {
    const browserId = normalizeText(elements.browserIdInput.value);
    if (!browserId) throw new Error("高级设置中未填写 BitBrowser ID");
    await chrome.storage.local.set({ advancedBrowserId: browserId });
    const response = await chrome.runtime.sendMessage({
      type: "openBitBrowserProfile",
      browserId
    });
    if (!response?.ok) throw new Error(response?.error || "打开比特浏览器失败");
    return response.data;
  }

  function isTemuUrl(url) {
    return /^https:\/\/agentseller(?:-eu)?\.temu\.com\//.test(url || "");
  }

  async function getOrCreateWorkTab(targetUrl) {
    const tabs = await chrome.tabs.query({});
    let tab = tabs.find((item) => item.url?.includes("/material/image-task"));
    if (!tab) tab = tabs.find((item) => isTemuUrl(item.url));
    if (!tab) {
      tab = await chrome.tabs.create({ url: targetUrl, active: true });
    } else if (targetUrl && tab.url !== targetUrl) {
      tab = await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
    } else {
      await chrome.tabs.update(tab.id, { active: true });
    }
    state.workTabId = tab.id;

    const startedAt = Date.now();
    let reloadedForInjection = false;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const current = await chrome.tabs.get(tab.id).catch(() => null);
      if (current?.status === "complete") {
        const ping = await sendToTab(tab.id, { type: "contentPing" }, false);
        if (ping?.ok) return current;
      }
      if (!reloadedForInjection && Date.now() - startedAt >= 7000) {
        reloadedForInjection = true;
        await chrome.tabs.reload(tab.id).catch(() => {});
      }
      await sleep(300);
    }
    throw new Error("Temu 页面加载或扩展脚本注入超时");
  }

  async function sendToTab(tabId, message, throwOnError = true) {
    try {
      const timeoutKey = {
        contentPing: "contentPing",
        searchAndExtract: "spuQuery",
        deletePendingSpu: "downlist",
        downlistSkc: "downlist",
        verifyDownlisted: "verify"
      }[message?.type];
      const timeoutMs = timeoutKey
        ? state.timeouts[timeoutKey]
        : state.timeouts.contentPing;
      let response = await withTimeout(
        chrome.tabs.sendMessage(tabId, message),
        timeoutMs,
        `${message?.type || "页面操作"}超时`
      );
      if (!response) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            delete globalThis.__temuDownlistContentLoaded;
          }
        });
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["shared.js", "content.js"]
        });
        await sleep(250);
        response = await withTimeout(
          chrome.tabs.sendMessage(tabId, message),
          timeoutMs,
          `${message?.type || "页面操作"}超时`
        );
      }
      if (throwOnError && !response?.ok) {
        const error = new Error(response?.error || "页面操作失败");
        error.code = response?.code || "TAB_MESSAGE_FAILED";
        throw error;
      }
      return response;
    } catch (error) {
      if (isTimeoutError(error)) {
        if (!throwOnError) return null;
        throw error;
      }
      if (!throwOnError) return null;
      throw error;
    }
  }

  async function checkEnvironment() {
    elements.checkEnvironmentBtn.disabled = true;
    setDot(elements.storageDot, "");
    setDot(elements.browserDot, "");
    setDot(elements.pageDot, "");

    try {
      await refreshOutputDirectoryStatus(true);
    } catch (error) {
      elements.storageStatus.textContent = "下载目录可用";
      setDot(elements.storageDot, "ok");
      log(`目录检查异常，继续使用浏览器下载目录：${error.message}`, "warn");
    }

    const advancedBrowserId = normalizeText(elements.browserIdInput.value);
    if (advancedBrowserId) {
      try {
        const profile = await openProfile();
        elements.browserStatus.textContent = profile.name || "指定窗口";
        elements.profileDetail.textContent = `指定窗口：序号 ${profile.seq || "-"} / ${profile.name || "-"}`;
        setDot(elements.browserDot, "ok");
      } catch (error) {
        elements.browserStatus.textContent = "使用当前窗口";
        setDot(elements.browserDot, "ok");
        log(`指定比特窗口无法打开，继续使用当前 Temu 页面：${error.message}`, "warn");
      }
    } else {
      elements.browserStatus.textContent = "使用当前窗口";
      setDot(elements.browserDot, "ok");
      elements.profileDetail.textContent = "默认操作当前已打开的 Temu 页面";
    }

    try {
      await getOrCreateWorkTab(IMAGE_TASK_URL);
      elements.pageStatus.textContent = "已就绪";
      setDot(elements.pageDot, "ok");
    } catch (error) {
      elements.pageStatus.textContent = "未就绪";
      setDot(elements.pageDot, "error");
      log(error.message, "error");
    }

    elements.checkEnvironmentBtn.disabled = false;
  }

  async function ensurePausePoint() {
    while (state.paused && !state.stopping) await sleep(300);
    if (state.stopping) throw new Error("任务已由用户停止");
  }

  async function runOneRow(row) {
    row.active = true;
    row.phase = "query";
    updateRow(row, { status: "查询中", error: "" });
    await ensurePausePoint();
    await getOrCreateWorkTab(IMAGE_TASK_URL);

    const response = await sendToTab(state.workTabId, {
      type: "searchAndExtract",
      queryType: row.lookupType,
      id: row.inputId,
      preferCarouselFirst: state.useCarouselFirst
    });
    const data = response.data;
    if (!data.found) {
      updateRow(row, {
        active: false,
        status: "未查到",
        error: `当前窗口没有该 ${row.lookupType} 的图片任务记录`
      });
      return;
    }

    const category = deriveCategoryCode(data.goodsCode, state.override);
    if (!category) {
      throw new Error(`无法从货号 ${data.goodsCode || "空"} 提取分类`);
    }

    updateRow(row, {
      spu: data.spu,
      skc: data.skc,
      goodsCode: data.goodsCode,
      category,
      imageSource: data.imageSource,
      status: "保存主图"
    });
    row.phase = "image";

    const extension = inferImageExtension(data.mainImageUrl);
    const filename = `${data.spu}_主图_01.${extension}`;
    const saved = await saveMainImage(category, filename, data.mainImageUrl);
    updateRow(row, {
      imagePath: saved.path,
      imageReused: Boolean(saved.reused),
      status: saved.reused ? "主图已存在，复用" : "主图成功"
    });

    if (state.mode === "delete") {
      updateRow(row, { status: "删除待发布商品" });
      row.phase = "delete";
      await getOrCreateWorkTab(PRODUCT_LIST_URL);
      const deleteResponse = await sendToTab(state.workTabId, {
        type: "deletePendingSpu",
        spu: data.spu
      });
      const deleteResult = deleteResponse.data;
      if (deleteResult?.outcome !== "success") {
        throw new Error(
          deleteResult?.message ||
          `未删除待发布商品：SPU ${data.spu}`
        );
      }
      updateRow(row, {
        active: false,
        status: `删除成功（${deleteResult.deletedCount} 个 SKC）`,
        downlistOutcome: "success",
        verified: true,
        error: ""
      });
      await getOrCreateWorkTab(IMAGE_TASK_URL);
      return;
    }

    if (state.mode !== "downlist") {
      updateRow(row, { active: false, status: "演练完成（主图成功）" });
      return;
    }

    updateRow(row, { status: "提交下架" });
    row.phase = "downlist";
    let downlistResult = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await ensurePausePoint();
      const result = await sendToTab(state.workTabId, {
        type: "downlistSkc",
        skc: row.skc,
        authorized: true
      });
      downlistResult = result.data;
      if (downlistResult.outcome === "success") break;
      if (downlistResult.outcome !== "busy" || attempt === 3) break;
      updateRow(row, {
        status: `平台忙碌，${attempt}/3 次后重试`
      });
      log(`SKC ${row.skc} 平台忙碌，15 秒后重试`, "warn");
      await sleep(15000);
    }

    if (downlistResult?.outcome === "success") {
      updateRow(row, {
        active: false,
        status: "下架成功",
        downlistOutcome: "success",
        error: ""
      });
      return;
    }

    if (downlistResult?.outcome === "timeout") {
      updateRow(row, {
        active: false,
        status: "超时已跳过（需复核）",
        downlistOutcome: "timeout",
        error: downlistResult.message || "等待平台结果超时"
      });
      return;
    }

    const message =
      downlistResult?.outcome === "busy"
        ? "平台连续 3 次返回系统忙碌"
        : downlistResult?.message || "下架未获得成功结果";
    updateRow(row, {
      active: false,
      status: "下架失败",
      downlistOutcome: downlistResult?.outcome || "failed",
      error: message
    });
  }

  async function verifyDownlistResults() {
    const rows = state.rows.filter(
      (row) => row.downlistOutcome === "success" && !row.skip
    );
    if (!rows.length) return;

    try {
      await getOrCreateWorkTab(PRODUCT_LIST_URL);
      for (const row of rows) {
        await ensurePausePoint();
        row.phase = "verify";
        updateRow(row, { status: "核验商品列表" });
        try {
          const response = await sendToTab(state.workTabId, {
            type: "verifyDownlisted",
            skc: row.skc
          });
          if (response.data?.verified) {
            updateRow(row, {
              verified: true,
              status: "下架成功（已核验）"
            });
          } else {
            updateRow(row, {
              verified: false,
              status: "需复核（列表未确认）",
              error: response.data?.reason || "商品列表未在已下架分类中确认"
            });
          }
        } catch (error) {
          updateRow(row, {
            verified: false,
            status: "需复核（核验失败）",
            error: error.message
          });
        }
      }
    } catch (error) {
      log(`商品列表核验未完成：${error.message}`, "warn");
    }
  }

  function buildResultWorkbook() {
    const aoa = state.originalAoa.map((row) => [...row]);
    const headers = aoa[0] || [];
    const extraStart = Math.max(headers.length, 3);
    headers[extraStart] = "输入类型";
    headers[extraStart + 1] = "输入ID";
    headers[extraStart + 2] = "SPU";
    headers[extraStart + 3] = "SKC";
    headers[extraStart + 4] = "货号分类";
    headers[extraStart + 5] = "页面货号";
    headers[extraStart + 6] = "主图文件";
    headers[extraStart + 7] = "下架/删除结果";
    headers[extraStart + 8] = "错误信息";
    headers[extraStart + 9] = "图片来源";
    aoa[0] = headers;

    for (const row of state.rows) {
      const target = aoa[row.originalRowIndex] || [];
      const statusColumn = state.columns.status >= 0 ? state.columns.status : 2;
      target[statusColumn] = rowDisplayStatus(row);
      target[extraStart] = row.lookupType;
      target[extraStart + 1] = row.inputId;
      target[extraStart + 2] = row.spu;
      target[extraStart + 3] = row.skc;
      target[extraStart + 4] = row.category;
      target[extraStart + 5] = row.goodsCode;
      target[extraStart + 6] = row.imagePath;
      target[extraStart + 7] = row.downlistOutcome;
      target[extraStart + 8] = row.error;
      target[extraStart + 9] = row.imageSource;
      aoa[row.originalRowIndex] = target;
    }

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, maybeSheetName(state.sheetName));
    return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  }

  function maybeSheetName(name) {
    return String(name || "处理结果").replace(/[\\/?*\[\]:]/g, "_").slice(0, 31);
  }

  async function exportResults() {
    if (!state.originalAoa.length) throw new Error("尚未添加任务数据");
    const bytes = buildResultWorkbook();
    const filename = `处理结果_${formatDateTime()}.xlsx`;
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const rootHandle = await getOutputRootHandle(true);
    let savedPath;
    if (rootHandle) {
      await writeBlobToDirectory(rootHandle, filename, blob, true);
      savedPath = `${rootHandle.name}/${filename}`;
    } else {
      savedPath = await downloadBlob(
        blob,
        `${OUTPUT_ROOT_NAME}/${filename}`
      );
    }
    state.lastResultPath = savedPath;
    log(`结果表已保存：${savedPath}`);
    return savedPath;
  }

  async function downloadSpuTemplate() {
    const url = chrome.runtime.getURL("templates/下架SPU模板.xlsx");
    const downloadId = await chrome.downloads.download({
      url,
      filename: "下架SPU模板.xlsx",
      conflictAction: "uniquify",
      saveAs: false
    });
    await withTimeout(
      waitForDownload(downloadId),
      state.timeouts.fileDownload,
      "模板下载超时"
    );
    log("下架 SPU 模板已下载");
  }

  async function startBatch() {
    if (state.running || !state.rows.length) return;
    state.override = normalizeText(elements.categoryOverrideInput.value).toUpperCase();
    state.useCarouselFirst = elements.multiColorInput.checked;

    if (state.mode === "downlist") {
      if (!elements.authorizeSubmitInput.checked) {
        throw new Error("请勾选“允许自动提交下架”后再开始");
      }
      const confirmed = window.confirm(
        `本批将真实提交下架，最终确认后商品可能无法恢复。\n\n有效任务：${state.progressTotal} 条\n保存位置：${elements.storageStatus.textContent}\n\n确定继续？`
      );
      if (!confirmed) return;
    }

    if (state.mode === "delete") {
      if (!elements.deleteAuthorizeInput.checked) {
        throw new Error("请勾选“允许删除待发布商品”后再开始");
      }
      const confirmed = window.confirm(
        `本批会先保存图片，再删除商品列表中“未发布到站点”的待发布商品及其全部 SKC。\n\n有效任务：${state.progressTotal} 条\n保存位置：${elements.storageStatus.textContent}\n\n删除后可在“已删除”列表尝试恢复。确定继续？`
      );
      if (!confirmed) return;
    }

    state.running = true;
    state.paused = false;
    state.stopping = false;
    state.progressCurrent = 0;
    state.savedImageKeys.clear();
    setButtons();
    setRunState("检查运行环境");

    try {
      const outputRoot = await getOutputRootHandle(true);
      log(
        outputRoot
          ? `保存位置：${outputRoot.name}`
          : "未选择文件夹，使用浏览器下载目录"
      );
      const advancedBrowserId = normalizeText(elements.browserIdInput.value);
      if (advancedBrowserId) {
        try {
          await openProfile();
        } catch (error) {
          const tabs = await chrome.tabs.query({});
          if (!tabs.some((tab) => isTemuUrl(tab.url))) {
            throw new Error(`当前没有 Temu 页面，指定比特窗口也不可用：${error.message}`);
          }
          log(`指定比特窗口无法打开，继续使用当前 Temu 页面：${error.message}`, "warn");
        }
      }
      await getOrCreateWorkTab(IMAGE_TASK_URL);

      const queued = state.rows.filter(
        (row) =>
          !row.skip &&
          (!state.retryFilter || state.retryFilter.has(row.originalRowIndex))
      );
      if (!queued.length) throw new Error("没有符合当前条件的待处理任务");
      state.progressTotal = queued.length;
      refreshProgress();
      for (let index = 0; index < queued.length; index += 1) {
        if (state.stopping) break;
        await ensurePausePoint();
        const row = queued[index];
        setRunState(`处理 ${row.lookupType} ${row.inputId}`);
        log(`开始处理第 ${index + 1}/${queued.length} 条：${row.lookupType} ${row.inputId}`);
        try {
          await runOneRow(row);
        } catch (error) {
          const timedOut = isTimeoutError(error);
          const phase = row.phase || "query";
          updateRow(row, {
            active: false,
            status: timedOut
              ? ["downlist", "delete", "verify"].includes(phase)
                ? "超时已跳过（需复核）"
                : "超时已跳过"
              : "处理失败",
            error: timedOut ? `超时：${error.message}` : error.message
          });
          log(`${row.lookupType} ${row.inputId} 失败：${error.message}`, "error");
          if (timedOut) {
            await chrome.tabs.reload(state.workTabId).catch(() => {});
            await sleep(1800);
            await getOrCreateWorkTab(IMAGE_TASK_URL).catch(() => {});
          }
        }
        state.progressCurrent = index + 1;
        refreshProgress();
      }

      if (state.mode === "downlist" && !state.stopping) {
        setRunState("核验下架结果");
        await verifyDownlistResults();
      }

      setRunState(state.stopping ? "已停止" : "已完成");
      await exportResults();
    } catch (error) {
      setRunState("批处理异常");
      log(error.message, "error");
    } finally {
      state.running = false;
      state.paused = false;
      state.stopping = false;
      state.retryFilter = null;
      for (const row of state.rows) row.active = false;
      renderRows();
      setButtons();
    }
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    setRunState(state.paused ? "已暂停" : "继续处理");
    log(state.paused ? "任务已暂停" : "任务继续");
    setButtons();
  }

  function retryFailedItems() {
    if (state.running) return;
    const failedRows = state.rows.filter(isRetryableFailure);
    if (!failedRows.length) {
      log("当前没有可重试的失败项", "warn");
      return;
    }

    state.retryFilter = new Set(
      failedRows.map((row) => row.originalRowIndex)
    );
    for (const row of failedRows) {
      row.active = false;
      row.spu = "";
      row.skc = "";
      row.goodsCode = "";
      row.category = "";
      row.imagePath = "";
      row.imageReused = false;
      row.downlistOutcome = "";
      row.verified = false;
      row.error = "";
      row.status = "待重试";
    }
    state.progressCurrent = 0;
    state.progressTotal = failedRows.length;
    renderRows();
    log(`准备重试 ${failedRows.length} 个失败项`);
    startBatch().catch((error) => log(error.message, "error"));
  }

  function stopBatch() {
    if (!state.running) return;
    state.stopping = true;
    state.paused = false;
    setRunState("正在停止");
    log("已请求停止，将在当前页面动作结束后停止", "warn");
    setButtons();
  }

  function bindEvents() {
    document.querySelectorAll('input[name="mode"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        state.mode = radio.value;
        elements.authorizeWrap.classList.toggle("hidden", state.mode !== "downlist");
        elements.deleteAuthorizeWrap.classList.toggle("hidden", state.mode !== "delete");
      });
    });

    elements.browserIdInput.addEventListener("change", async () => {
      await chrome.storage.local.set({
        advancedBrowserId: normalizeText(elements.browserIdInput.value)
      });
    });
    elements.categoryOverrideInput.addEventListener("change", async () => {
      state.override = normalizeText(elements.categoryOverrideInput.value).toUpperCase();
      await chrome.storage.local.set({ categoryOverride: state.override });
    });
    for (const field of TIMEOUT_FIELDS) {
      elements[field.input].addEventListener("change", () => {
        saveTimeoutInputs()
          .then(() => log("超时参数已保存"))
          .catch((error) => log(error.message, "error"));
      });
    }
    elements.resetTimeoutsBtn.addEventListener("click", () =>
      resetTimeoutInputs().catch((error) => log(error.message, "error"))
    );
    elements.checkEnvironmentBtn.addEventListener("click", checkEnvironment);
    elements.chooseOutputDirBtn.addEventListener("click", () =>
      chooseOutputDirectory().catch((error) => log(error.message, "error"))
    );
    elements.clearOutputDirBtn.addEventListener("click", () =>
      clearOutputDirectory().catch((error) => log(error.message, "error"))
    );
    elements.startBtn.addEventListener("click", () =>
      startBatch().catch((error) => log(error.message, "error"))
    );
    elements.pauseBtn.addEventListener("click", togglePause);
    elements.stopBtn.addEventListener("click", stopBatch);
    elements.retryFailedBtn.addEventListener("click", retryFailedItems);
    elements.exportBtn.addEventListener("click", () =>
      exportResults().catch((error) => log(error.message, "error"))
    );
    elements.clearLogBtn.addEventListener("click", () => {
      elements.logOutput.textContent = "";
    });
    document.querySelectorAll(".skin-swatch").forEach((button) => {
      button.addEventListener("click", () => applyTheme(button.dataset.theme));
    });
    elements.excelInput.addEventListener("change", async () => {
      try {
        await importWorkbook(elements.excelInput.files?.[0]);
      } catch (error) {
        elements.fileMeta.textContent = "导入失败";
        log(error.message, "error");
      }
    });
    elements.directSpuInput.addEventListener("input", updateDirectInputMeta);
    elements.directSpuInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        try {
          applyDirectSpuInput();
        } catch (error) {
          log(error.message, "error");
        }
      }
    });
    elements.applyDirectInputBtn.addEventListener("click", () => {
      try {
        applyDirectSpuInput();
      } catch (error) {
        log(error.message, "error");
      }
    });
    elements.clearDirectInputBtn.addEventListener("click", () => {
      elements.directSpuInput.value = "";
      updateDirectInputMeta();
      elements.directSpuInput.focus();
    });
    elements.downloadTemplateBtn.addEventListener("click", () =>
      downloadSpuTemplate().catch((error) => log(error.message, "error"))
    );
  }

  async function init() {
    const stored = await chrome.storage.local.get([
      "advancedBrowserId",
      "categoryOverride",
      "skin",
      "timeouts"
    ]);
    elements.browserIdInput.value = stored.advancedBrowserId || "";
    elements.categoryOverrideInput.value = stored.categoryOverride || "";
    state.override = normalizeText(elements.categoryOverrideInput.value).toUpperCase();
    state.timeouts = normalizeTimeoutSettings(stored.timeouts);
    renderTimeoutInputs();
    applyTheme(stored.skin || "classic", false);
    await refreshOutputDirectoryStatus(false);
    bindEvents();
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.outputHandleUpdatedAt) {
        refreshOutputDirectoryStatus(false).catch(() => {});
      }
    });
    renderRows();
    setButtons();
    log("扩展已加载。默认保存到浏览器下载目录，也可以选择自定义文件夹。");
    if (new URLSearchParams(location.search).get("setup") === "1") {
      log("请在当前设置窗口点击“选择保存文件夹”完成目录授权。");
    }
  }

  init().catch((error) => log(error.message, "error"));
})();
