(() => {
  const SAMPLE_PAIRS = [
    { spu: "12345678901", skc: "223456789011" },
    { spu: "12345678902", skc: "223456789012" },
    { spu: "57800253644", skc: "535019829284" },
    { spu: "46618134145", skc: "497858944606" },
    { spu: "59441361643", skc: "525437620322" },
    { spu: "41655815776", skc: "584467560529" },
    { spu: "54994658840", skc: "428414575336" },
    { spu: "48441612575", skc: "579167367742" },
    { spu: "59128470342", skc: "543860626316" },
    { spu: "50143956352", skc: "434507983551" },
    { spu: "41838285436", skc: "405484658485" },
    { spu: "43655176117", skc: "477969483151" },
    { spu: "56819404429", skc: "548435128297" },
    { spu: "47391825602", skc: "432177667149" },
    { spu: "59227086073", skc: "572389195990" },
    { spu: "56779728080", skc: "416719801336" },
    { spu: "44724308032", skc: "595619528422" }
  ];

  const BASE_PRICE_ROWS = [
    ...["S", "M", "L", "XL", "XXL", "XXXL"].map((size) => ({
      skc: "Mixed Color2",
      sku: `${size}-Mixed Color2`,
      referencePrice: 145.31,
      target: true
    })),
    ...["S", "M", "L", "XL", "XXL", "XXXL"].map((size) => ({
      skc: "Mixed Color8",
      sku: `${size}-Mixed Color8`,
      referencePrice: 111,
      target: false
    }))
  ];

  const DEFAULT_STATIONS = [
    {
      code: "DE",
      name: "德国",
      station: "德国站",
      group: "欧盟",
      region: "eu",
      enabled: true,
      targetPrice: 120,
      otherPrice: null,
      tierPrice: null,
      submitMode: "指定规格批量加速",
      note: "空白价格阻断提交"
    },
    {
      code: "FR",
      name: "法国",
      station: "法国站",
      group: "欧盟",
      region: "eu",
      enabled: false,
      targetPrice: 150,
      otherPrice: null,
      tierPrice: null,
      submitMode: "指定规格批量加速",
      note: ""
    },
    {
      code: "NL",
      name: "荷兰",
      station: "荷兰站",
      group: "欧盟",
      region: "eu",
      enabled: false,
      targetPrice: 120,
      otherPrice: 110,
      tierPrice: null,
      submitMode: "指定规格批量加速",
      note: ""
    },
    {
      code: "IT",
      name: "意大利",
      station: "意大利站",
      group: "欧盟",
      region: "eu",
      enabled: false,
      targetPrice: null,
      otherPrice: null,
      tierPrice: null,
      submitMode: "指定规格批量加速",
      note: ""
    }
  ];

  const hasExtensionApi = Boolean(globalThis.chrome?.runtime?.id);
  const PANEL_INSTANCE_ID =
    globalThis.crypto?.randomUUID?.() ||
    `panel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const elements = {
    tabs: $$(".step-tab"),
    panels: $$(".tab-panel"),
    productSource: $("#productSource"),
    searchMode: $("#searchMode"),
    searchModeField: $("#searchModeField"),
    categoryPath: $("#categoryPath"),
    categoryField: $("#categoryField"),
    skuField: $("#skuField"),
    skuFieldLabel: $("#skuFieldLabel"),
    skuFieldHelp: $("#skuFieldHelp"),
    taskName: $("#taskName"),
    skuKeyword: $("#skuKeyword"),
    specName: $("#specName"),
    idType: $("#idType"),
    idTypeField: $("#idTypeField"),
    region: $("#region"),
    duration: $("#duration"),
    accelerationMode: $("#accelerationMode"),
    tierStrategy: $("#tierStrategy"),
    tierStrategyField: $("#tierStrategyField"),
    taskInterval: $("#taskInterval"),
    navigationGuard: $("#navigationGuard"),
    dryRun: $("#dryRun"),
    contextStation: $("#contextStation"),
    sourceLabel: $("#sourceLabel"),
    pageState: $("#pageState"),
    currentStoreName: $("#currentStoreName"),
    storeAvatar: $("#storeAvatar"),
    storeBindingLabel: $("#storeBindingLabel"),
    bindStoreButton: $("#bindStoreButton"),
    pairCount: $("#pairCount"),
    queueCount: $("#queueCount"),
    queueReadyCount: $("#queueReadyCount"),
    queueQueuedCount: $("#queueQueuedCount"),
    queueRunningCount: $("#queueRunningCount"),
    queueDoneCount: $("#queueDoneCount"),
    queuePausedCount: $("#queuePausedCount"),
    queueList: $("#queueList"),
    clearDoneTasksButton: $("#clearDoneTasksButton"),
    pairMetric: $("#pairMetric"),
    stationMetric: $("#stationMetric"),
    fallbackMetric: $("#fallbackMetric"),
    riskMetric: $("#riskMetric"),
    checkNotice: $("#checkNotice"),
    stationSummary: $("#stationSummary"),
    importSummary: $("#importSummary"),
    importDiagnostics: $("#importDiagnostics"),
    stationTable: $("#stationTable"),
    stationPriceHeading: $("#stationPriceHeading"),
    stationPriceNote: $("#stationPriceNote"),
    pairList: $("#pairList"),
    priceList: $("#priceList"),
    pricePreviewTitle: $("#pricePreviewTitle"),
    pricePreviewSubtitle: $("#pricePreviewSubtitle"),
    importButton: $("#importButton"),
    importFile: $("#importFile"),
    productImportPanel: $("#productImportPanel"),
    productImportButton: $("#productImportButton"),
    productImportFile: $("#productImportFile"),
    exportEnvironmentButton: $("#exportEnvironmentButton"),
    importEnvironmentButton: $("#importEnvironmentButton"),
    importEnvironmentFile: $("#importEnvironmentFile"),
    syncButton: $("#syncButton"),
    openTrafficButton: $("#openTrafficButton"),
    scanGoodsButton: $("#scanGoodsButton"),
    inspectModalButton: $("#inspectModalButton"),
    primaryButton: $("#primaryButton"),
    actionHint: $("#actionHint"),
    actionCount: $("#actionCount"),
    runStatusEyebrow: $("#runStatusEyebrow"),
    runTitle: $("#runTitle"),
    runPercent: $("#runPercent"),
    runProgress: $("#runProgress"),
    runTotal: $("#runTotal"),
    runSuccess: $("#runSuccess"),
    runExceptions: $("#runExceptions"),
    runFailed: $("#runFailed"),
    pauseButton: $("#pauseButton"),
    retryButton: $("#retryButton"),
    exportButton: $("#exportButton"),
    clearLogButton: $("#clearLogButton"),
    timeline: $("#timeline"),
    taskLog: $("#taskLog"),
    toast: $("#toast"),
    stationModal: $("#stationModal"),
    stationModalCode: $("#stationModalCode"),
    stationModalTitle: $("#stationModalTitle"),
    stationModalClose: $("#stationModalClose"),
    stationModalCancel: $("#stationModalCancel"),
    stationModalSave: $("#stationModalSave"),
    stationEnabled: $("#stationEnabled"),
    modalTargetPrice: $("#modalTargetPrice"),
    modalOtherPrice: $("#modalOtherPrice"),
    modalTierPrice: $("#modalTierPrice"),
    modalTargetPriceField: $("#modalTargetPriceField"),
    modalOtherPriceField: $("#modalOtherPriceField"),
    modalTierPriceField: $("#modalTierPriceField"),
    stationModalNote: $("#stationModalNote")
  };

  let activeTab = "config";
  let stations = hasExtensionApi ? [] : clone(DEFAULT_STATIONS);
  let pairs = hasExtensionApi ? [] : clone(SAMPLE_PAIRS);
  let cacheMeta = null;
  let selectedStationCode = "DE";
  let taskQueue = [];
  let queueState = {
    status: "idle",
    currentTaskId: null,
    currentIndex: -1,
    logs: []
  };
  let editingTaskId = null;
  let operationLock = null;
  let scanProgress = null;
  let storeBinding = null;
  let currentStoreContext = null;
  let importDiagnostics = null;
  let source = hasExtensionApi ? "empty" : "demo";
  let importing = false;
  let toastTimer = null;
  let runToken = 0;
  let contentScriptRecoverySequence = 0;
  let isExecutionLeader = false;
  let executionLeaseTimer = null;
  let stateSaveDirty = false;
  let stateSaveTimer = null;
  let stateSaveInFlight = null;
  let task = {
    status: "idle",
    paused: false,
    items: [],
    logs: []
  };

  bindEvents();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void saveState({ immediate: true });
  });
  globalThis.addEventListener("pagehide", () => {
    void saveState({ immediate: true });
  });
  restoreState().finally(async () => {
    renderAll();
    await refreshStoreContext({ silent: true });
  });

  function bindEvents() {
    elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    [
      elements.productSource,
      elements.skuKeyword,
      elements.searchMode,
      elements.categoryPath,
      elements.taskName,
      elements.specName,
      elements.idType,
      elements.region,
      elements.duration,
      elements.accelerationMode,
      elements.tierStrategy,
      elements.taskInterval,
      elements.navigationGuard,
      elements.dryRun
    ].forEach((input) => {
      input.addEventListener("input", handleConfigChange);
      input.addEventListener("change", handleConfigChange);
    });

    elements.importButton.addEventListener("click", () => {
      if (importing) return;
      elements.importFile.value = "";
      elements.importFile.click();
    });
    elements.importFile.addEventListener("change", importWorkbook);
    elements.productImportButton.addEventListener("click", () => {
      elements.productImportFile.value = "";
      elements.productImportFile.click();
    });
    elements.productImportFile.addEventListener(
      "change",
      importProductWorkbook
    );
    elements.bindStoreButton.addEventListener("click", bindCurrentStore);
    elements.exportEnvironmentButton.addEventListener("click", exportEnvironment);
    elements.importEnvironmentButton.addEventListener("click", () => {
      elements.importEnvironmentFile.value = "";
      elements.importEnvironmentFile.click();
    });
    elements.importEnvironmentFile.addEventListener(
      "change",
      importEnvironment
    );
    elements.syncButton.addEventListener("click", syncCurrentPage);
    elements.openTrafficButton.addEventListener("click", openTrafficAnalysis);
    elements.scanGoodsButton.addEventListener("click", () => scanGoods());
    elements.inspectModalButton.addEventListener("click", inspectTrafficModal);
    elements.primaryButton.addEventListener("click", handlePrimaryAction);
    elements.pauseButton.addEventListener("click", togglePause);
    elements.retryButton.addEventListener("click", retryFailed);
    elements.exportButton.addEventListener("click", exportCsv);
    elements.clearDoneTasksButton.addEventListener("click", clearDoneTasks);
    elements.clearLogButton.addEventListener("click", () => {
      task.logs = [];
      renderRun();
      saveState();
    });

    elements.stationModalClose.addEventListener("click", closeStationModal);
    elements.stationModalCancel.addEventListener("click", closeStationModal);
    elements.stationModalSave.addEventListener("click", saveStationModal);
    elements.stationModal.addEventListener("click", (event) => {
      if (event.target === elements.stationModal) closeStationModal();
    });

    if (hasExtensionApi && chrome.runtime.onMessage?.addListener) {
      chrome.runtime.onMessage.addListener((message) => {
        if (
          message?.type === "SCAN_PROGRESS" &&
          operationLock?.kind === "scan" &&
          message.operationId === operationLock.operationId
        ) {
          scanProgress = message.progress;
          renderPairs();
          updatePrimaryButton();
        }
        if (message?.type === "QUEUE_FORCE_PAUSED") {
          queueState.status = "paused";
          const currentTask = taskQueue.find(
            (item) => item.id === queueState.currentTaskId
          );
          if (currentTask) {
            currentTask.status = "paused";
            if (currentTask.run) {
              currentTask.run.status = "paused";
              currentTask.run.paused = true;
            }
            task = currentTask.run || task;
          }
          runToken += 1;
          renderAll();
          showToast("队列已由另一个插件页面暂停");
        }
      });
    }
  }

  async function restoreState() {
    if (hasExtensionApi) {
      try {
        const response = await chrome.runtime.sendMessage({ type: "GET_APP_STATE" });
        if (response?.ok) {
          applyConfig(response.state.config);
          if (Array.isArray(response.state.stations)) {
            stations = response.state.stations;
          }
          if (Array.isArray(response.state.pairs)) {
            pairs = response.state.pairs;
          }
          if (response.state.cacheMeta) cacheMeta = response.state.cacheMeta;
          if (response.state.storeBinding) {
            storeBinding = response.state.storeBinding;
          }
          if (Array.isArray(response.state.logs)) task.logs = response.state.logs;
          if (Array.isArray(response.state.taskQueue)) {
            taskQueue = hydrateTaskQueue(response.state.taskQueue);
          }
          if (response.state.queueState) {
            queueState = {
              ...queueState,
              ...response.state.queueState
            };
          }
          if (response.state.importDiagnostics) {
            const persisted = response.state.importDiagnostics;
            const currentTargetCount = stations.filter((station) =>
              hasPrice(station.targetPrice)
            ).length;
            importDiagnostics = {
              ...persisted,
              targetPricePresent: currentTargetCount,
              tierPricePresent: stations.filter((station) =>
                hasPrice(station.tierPrice)
              ).length,
              finalEnabled: stations.filter((station) => station.enabled).length
            };
          }
          source = inferPersistedSource(response.state);
        }
      } catch (error) {
        console.warn("读取插件状态失败", error);
      }
      restoreQueueRuntime();
      await reconcileExecutionLease();
      return;
    }

    const cached = localStorage.getItem("traffic_spec_demo_v3");
    if (!cached) return;
    try {
      const value = JSON.parse(cached);
      applyConfig(value.config);
      if (Array.isArray(value.stations)) stations = value.stations;
      if (Array.isArray(value.pairs)) pairs = value.pairs;
      if (value.cacheMeta) cacheMeta = value.cacheMeta;
      if (value.storeBinding) storeBinding = value.storeBinding;
      if (Array.isArray(value.logs)) task.logs = value.logs;
      if (Array.isArray(value.taskQueue)) {
        taskQueue = hydrateTaskQueue(value.taskQueue);
      }
      if (value.queueState) queueState = { ...queueState, ...value.queueState };
      if (value.importDiagnostics) importDiagnostics = value.importDiagnostics;
      source = inferPersistedSource(value);
    } catch (error) {
      console.warn(error);
    }
    restoreQueueRuntime();
  }

  function inferPersistedSource(persistedState = {}) {
    const declaredSource = persistedState.cacheMeta?.source;
    if (declaredSource === "import" || declaredSource === "page") {
      return declaredSource;
    }
    if (!pairs.length) return "empty";
    return persistedState.config?.productSource === "tableImport"
      ? "import"
      : "page";
  }

  function applyConfig(config = {}) {
    elements.productSource.value =
      config.productSource === "tableImport" ? "tableImport" : "goodsList";
    elements.skuKeyword.value = config.skuKeyword || "DWRG";
    elements.searchMode.value = config.searchMode || "sku";
    elements.categoryPath.value = config.categoryPath || "";
    elements.taskName.value = config.taskName || "";
    elements.specName.value = config.specName || "";
    elements.idType.value = config.idType || "SPU";
    elements.region.value = config.region || "eu";
    elements.duration.value = config.duration || "30";
    elements.accelerationMode.value =
      ["priceTier", "reduceThenTier"].includes(config.accelerationMode)
        ? config.accelerationMode
        : "custom";
    elements.tierStrategy.value =
      config.tierStrategy === "minDiscount" ? "minDiscount" : "maxTraffic";
    elements.taskInterval.value =
      Number.isFinite(Number(config.taskIntervalSeconds))
        ? String(config.taskIntervalSeconds)
        : "15";
    elements.navigationGuard.checked = config.navigationGuard !== false;
    elements.dryRun.checked = config.dryRun === true;
  }

  function restoreQueueRuntime() {
    operationLock = null;
    scanProgress = null;
    const currentTask = taskQueue.find(
      (item) => item.id === queueState.currentTaskId
    );
    if (currentTask?.run) {
      task = currentTask.run;
    }
  }

  async function reconcileExecutionLease() {
    if (!hasExtensionApi) return;
    const stored = await chrome.storage.local.get("traffic_spec_execution_lease");
    const lease = stored.traffic_spec_execution_lease;
    const active = Number(lease?.expiresAt) > Date.now();
    isExecutionLeader = Boolean(
      active && lease?.ownerId === PANEL_INSTANCE_ID
    );
    if (queueState.status === "running" && !active) {
      queueState.status = "paused";
      const currentTask = taskQueue.find(
        (item) => item.id === queueState.currentTaskId
      );
      if (currentTask) {
        currentTask.status = "paused";
        if (currentTask.run) {
          currentTask.run.status = "paused";
          currentTask.run.paused = true;
          task = currentTask.run;
        }
      }
      await saveState({ immediate: true });
      return;
    }
    if (active && !isExecutionLeader) {
      const delay = Math.min(
        60000,
        Math.max(1000, Number(lease.expiresAt) - Date.now() + 250)
      );
      setTimeout(() => {
        void reconcileExecutionLease().then(renderAll);
      }, delay);
    }
  }

  function readConfig() {
    return {
      productSource: elements.productSource.value,
      skuKeyword: elements.skuKeyword.value.trim(),
      searchMode: elements.searchMode.value,
      categoryPath: elements.categoryPath.value.trim(),
      taskName: elements.taskName.value.trim(),
      specName: elements.specName.value.trim(),
      idType: elements.idType.value,
      region: elements.region.value,
      duration: elements.duration.value,
      accelerationMode: elements.accelerationMode.value,
      tierStrategy: elements.tierStrategy.value,
      taskIntervalSeconds: Number(elements.taskInterval.value) || 15,
      fallbackReferencePrice: false,
      navigationGuard: elements.navigationGuard.checked,
      dryRun: elements.dryRun.checked
    };
  }

  function handleConfigChange() {
    renderAll();
    saveState();
  }

  function currentStation() {
    return stations.find((station) => station.code === selectedStationCode) || stations[0];
  }

  function isPriceTierMode() {
    return elements.accelerationMode.value === "priceTier";
  }

  function isHybridMode() {
    return elements.accelerationMode.value === "reduceThenTier";
  }

  function usesTierStrategy() {
    return isPriceTierMode() || isHybridMode();
  }

  function renderStoreBinding() {
    const detected = currentStoreContext?.storeName || "";
    const bound = storeBinding?.storeName || "";
    elements.storeAvatar.textContent =
      (detected || bound || "?").replace(/\s+/g, "").slice(0, 1).toUpperCase();
    elements.currentStoreName.textContent = detected || "当前店铺未连接";
    if (!bound) {
      elements.storeBindingLabel.textContent =
        "尚未绑定店铺；绑定后才能创建和执行任务";
      elements.storeBindingLabel.classList.remove("is-bound");
      return;
    }
    if (!detected) {
      elements.storeBindingLabel.textContent = `已绑定：${bound}；刷新 TEMU 页面以确认当前店铺`;
      elements.storeBindingLabel.classList.remove("is-bound");
      return;
    }
    if (normalizeStoreName(detected) !== normalizeStoreName(bound)) {
      elements.storeBindingLabel.textContent = `店铺不匹配：绑定 ${bound}，当前 ${detected}；任务执行已阻止`;
      elements.storeBindingLabel.classList.remove("is-bound");
      return;
    }
    elements.storeBindingLabel.textContent = `已绑定：${bound}`;
    elements.storeBindingLabel.classList.add("is-bound");
  }

  async function refreshStoreContext(options = {}) {
    if (!hasExtensionApi) return null;
    const tab = await getTargetTab(options.showError !== false);
    if (!tab?.id) return null;
    try {
      const response = await sendTabMessage(tab.id, {
        type: "GET_STORE_CONTEXT"
      });
      if (!response?.ok) {
        throw new Error(response?.error || "页面未返回店铺信息");
      }
      currentStoreContext = response.store || null;
      renderStoreBinding();
      return currentStoreContext;
    } catch (error) {
      if (!options.silent) {
        showToast(`读取店铺失败：${error.message}；请刷新 TEMU 页面后重试`);
      }
      return null;
    }
  }

  async function bindCurrentStore() {
    const context = await refreshStoreContext();
    if (!context?.storeName) {
      showToast("没有识别到当前店铺，请打开 TEMU 商家中心后刷新页面");
      return;
    }
    if (
      !globalThis.confirm(
        `将当前店铺“${context.storeName}”绑定到此插件环境？\n\n绑定后，店铺不匹配的任务将被阻止执行。`
      )
    ) {
      return;
    }
    storeBinding = {
      storeName: context.storeName,
      host: context.host,
      region: context.region,
      boundAt: Date.now()
    };
    renderAll();
    await saveState();
    showToast(`已绑定店铺：${context.storeName}`);
  }

  async function ensureStoreBinding() {
    const context = await refreshStoreContext();
    if (!context?.storeName) {
      showToast("未识别当前店铺，请打开 TEMU 商家中心并刷新页面");
      return false;
    }
    if (!storeBinding?.storeName) {
      showToast("请先点击“绑定店铺”");
      return false;
    }
    if (
      normalizeStoreName(context.storeName) !==
      normalizeStoreName(storeBinding.storeName)
    ) {
      showToast(
        `店铺不匹配：已绑定 ${storeBinding.storeName}，当前是 ${context.storeName}`
      );
      return false;
    }
    return true;
  }

  function normalizeStoreName(value) {
    return String(value || "")
      .replace(/[（(]?\s*\d+(?:\.\d+)?\s*万?\s*人关注\s*[）)]?\s*$/i, "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function enabledStations() {
    return stations.filter(
      (station) =>
        station.enabled && station.region === elements.region.value
    );
  }

  function evaluatePriceRows(station = currentStation()) {
    const hasTargetSpec = Boolean(
      elements.specName.value.trim().replace(/\s+/g, "")
    );
    return BASE_PRICE_ROWS.map((row) => {
      const target = Boolean(row.target && hasTargetSpec);
      const configured = target ? station.targetPrice : station.otherPrice;
      const missingPrice =
        configured == null ||
        configured === "" ||
        !Number.isFinite(Number(configured));
      const price = missingPrice ? null : Number(configured);
      const overLimit = Number.isFinite(price) && price > row.referencePrice;
      const invalid =
        missingPrice || !Number.isFinite(price) || price <= 0 || overLimit;
      return {
        ...row,
        target,
        configured,
        missingPrice,
        price,
        valid: !invalid,
        type: invalid ? "exception" : "success",
        error: invalid
          ? overLimit
            ? `${formatMoney(price)} > 参考价 ${formatMoney(row.referencePrice)}`
            : missingPrice
              ? "缺少价格，已阻断"
              : "价格无效"
          : "使用站点表格价格"
      };
    });
  }

  function renderAll() {
    renderStoreBinding();
    renderSearchMode();
    renderAccelerationMode();
    renderQueue();
    updatePrimaryButton();
    if (activeTab === "config") {
      renderStations();
      renderImportDiagnostics();
      renderPairs();
      renderPrices();
      renderMetrics();
      return;
    }
    if (activeTab === "check") {
      renderPairs();
      renderPrices();
      renderMetrics();
      return;
    }
    if (activeTab === "run") {
      renderRun();
    }
  }

  function renderAccelerationMode() {
    const tierMode = isPriceTierMode();
    const hybridMode = isHybridMode();
    elements.tierStrategyField.hidden = !usesTierStrategy();
    elements.stationPriceHeading.textContent = tierMode
      ? "点击站点设置档位匹配目标价"
      : hybridMode
        ? "点击站点设置让价目标价格"
        : "点击站点设置两个价格";
    elements.stationPriceNote.textContent = tierMode
      ? "自动匹配模式读取平台当前档位；目标价不高于每个 SKU 的对应申报价格时才可进入。"
      : hybridMode
        ? "先尝试继续让价；不能继续时按指定规格价和其他规格价匹配现有档位。"
        : "只有填写指定规格价格才会自动启用站点；其他规格价格不会单独触发启用。";
  }

  function renderSearchMode() {
    const tableMode = elements.productSource.value === "tableImport";
    const categoryMode = elements.searchMode.value === "category";
    elements.searchModeField.hidden = tableMode;
    elements.categoryField.hidden = tableMode || !categoryMode;
    elements.skuField.hidden = tableMode;
    elements.idTypeField.hidden = tableMode;
    elements.productImportPanel.hidden = !tableMode;
    elements.skuFieldLabel.textContent = categoryMode
      ? "二级过滤：货号 X（可选）"
      : "货号关键词 X";
    elements.skuFieldHelp.textContent = categoryMode
      ? "在所选类目中继续按 SKU 模糊查询，可留空"
      : "商品列表中使用 SKU 模糊查询";
  }

  function renderStations() {
    const selectedRegion = elements.region.value;
    const tierMode = isPriceTierMode();
    const enabled = enabledStations().length;
    elements.stationSummary.textContent = `${enabled} 个启用站点（${regionLabel(
      selectedRegion
    )}）`;
    if (!stations.length) {
      elements.stationTable.innerHTML =
        '<div class="queue-empty">尚未载入站点。请先导入标准价格表，或导入同一店铺的环境配置。</div>';
      return;
    }
    elements.stationTable.innerHTML = stations
      .slice(0, 80)
      .map((station) => {
        const target =
          station.targetPrice == null ? "参考价" : formatMoney(station.targetPrice);
        const other =
          station.otherPrice == null ? "参考价" : formatMoney(station.otherPrice);
        const tier =
          station.tierPrice == null ? "未填写" : formatMoney(station.tierPrice);
        const available =
          station.enabled && station.region === selectedRegion;
        return `
          <button class="station-row ${available ? "" : "is-disabled"} ${
            tierMode ? "tier-mode" : ""
          }" data-station="${escapeHtml(
            station.code
          )}" type="button">
            <span class="station-state ${available ? "is-on" : ""}">
              ${
                available
                  ? "启用"
                  : station.enabled
                    ? "区域不符"
                    : "停用"
              }
            </span>
            <span class="station-name">
              <strong>${escapeHtml(station.station)}</strong>
              <small>${escapeHtml(station.code)} · ${escapeHtml(station.group || station.region)}</small>
            </span>
            ${
              tierMode
                ? `<span class="station-price">
                    <small>档位目标价</small>
                    <b>${tier}</b>
                  </span>`
                : `<span class="station-price">
                    <small>指定规格</small>
                    <b>${target}</b>
                  </span>
                  <span class="station-price">
                    <small>其他规格</small>
                    <b>${other}</b>
                  </span>`
            }
            <span class="station-edit">设置 ›</span>
          </button>
        `;
      })
      .join("");

    elements.stationTable.querySelectorAll("[data-station]").forEach((button) => {
      button.addEventListener("click", () => openStationModal(button.dataset.station));
    });
  }

  function renderImportDiagnostics() {
    if (!importDiagnostics) {
      elements.importDiagnostics.hidden = true;
      elements.importDiagnostics.textContent = "";
      return;
    }
    const invalid = importDiagnostics.invalidPriceCells || [];
    elements.importDiagnostics.hidden = false;
    elements.importDiagnostics.classList.toggle(
      "has-errors",
      invalid.length > 0
    );
    const invalidText = invalid.length
      ? ` · 无法解析 ${invalid.length} 项：${invalid
          .slice(0, 5)
          .map((item) => `${item.countryCode}/${item.column}=${item.rawValue}`)
          .join("，")}`
      : "";
    elements.importDiagnostics.textContent =
      `导入诊断：识别 ${importDiagnostics.rowsFound} 个站点` +
      ` · 启用列为是 ${importDiagnostics.explicitEnabled}` +
      ` · 指定规格价格 ${importDiagnostics.targetPricePresent}` +
      ` · 其他规格价格 ${importDiagnostics.otherPricePresent}` +
      ` · 档位匹配价格 ${importDiagnostics.tierPricePresent || 0}` +
      ` · 商品 ID ${importDiagnostics.spuCount || 0} SPU / ${
        importDiagnostics.skcCount || 0
      } SKC` +
      (importDiagnostics.parserPlaceholderCount
        ? ` · 已清理解析占位值 ¥${importDiagnostics.parserPlaceholderPrice} 的 ${importDiagnostics.parserPlaceholderCount} 项`
        : "") +
      ` · 最终启用 ${importDiagnostics.finalEnabled}${invalidText}`;
  }

  function renderPairs() {
    const staleCache = isCacheStale();
    elements.pairCount.textContent = String(pairs.length);
    elements.pairMetric.textContent = String(pairs.length);
    elements.sourceLabel.textContent =
      scanProgress
        ? `扫描第 ${scanProgress.page || 1} 页 · 已发现 ${
            scanProgress.uniquePairs || 0
          } 组`
        : cacheMeta?.source === "page" && cacheMeta.verified !== true
          ? "商品缓存尚未完成数量校验，请重新检索"
        : staleCache
        ? "参数已修改，当前为旧缓存"
        : source === "page"
        ? cacheMeta?.resultTotal != null
          ? `已校验 ${cacheMeta.loadedRows || pairs.length}/${cacheMeta.resultTotal} 条 · ${pairs.length} 组 ID`
          : `${pairs.length} 组页面 ID 已缓存`
        : source === "import"
          ? (() => {
              const spuCount = pairs.filter(
                (pair) => (pair.idType || "SKC") === "SPU"
              ).length;
              const skcCount = pairs.length - spuCount;
              return `表格导入 ${pairs.length} 组（SPU ${spuCount} / SKC ${skcCount}）`;
            })()
          : source === "empty"
            ? "尚未载入商品，请先检索商品列表"
          : `${pairs.length} 组实测 ID 已载入`;

    elements.pairList.innerHTML = pairs
      .slice(0, 80)
      .map(
        (pair, index) => {
          const pairType = pair.idType || elements.idType.value;
          const displayId =
            pairType === "SKC" ? pair.skc : pair.spu;
          return `
          <article class="pair-row">
            <span class="pair-index">${String(index + 1).padStart(2, "0")}</span>
            <div class="pair-main">
              <strong>${escapeHtml(displayId || "-")}</strong>
              <small>${escapeHtml(pairType)} · SPU ${escapeHtml(
                pair.spu || "-"
              )} · SKC ${escapeHtml(pair.skc || "-")}</small>
            </div>
            <span class="status-chip ${staleCache ? "failed" : ""}">${
              staleCache ? "旧缓存" : "已缓存"
            }</span>
          </article>
        `;
        }
      )
      .join("");
  }

  function renderPrices() {
    const station = currentStation();
    if (!station) {
      elements.pricePreviewTitle.textContent = "尚未导入站点";
      elements.pricePreviewSubtitle.textContent =
        "导入标准价格表或同一店铺的环境配置后再预检";
      elements.riskMetric.textContent = "0";
      elements.fallbackMetric.textContent = "0";
      elements.checkNotice.textContent =
        "当前没有站点价格数据，无法生成可执行任务。";
      elements.priceList.innerHTML =
        '<div class="queue-empty">尚未导入站点价格</div>';
      return;
    }
    if (isPriceTierMode()) {
      const tierConfigured = hasPrice(station.tierPrice);
      const configured = tierConfigured
        ? formatMoney(station.tierPrice)
        : "未填写";
      elements.contextStation.textContent = `${regionLabel(
        elements.region.value
      )} · ${station.station} · 自动档位匹配`;
      elements.pricePreviewTitle.textContent = `${station.station}档位匹配预检`;
      elements.pricePreviewSubtitle.textContent =
        `目标价 ${configured} · ${
          elements.tierStrategy.value === "minDiscount"
            ? "优先更少让价"
            : "优先更多流量"
        }`;
      elements.riskMetric.textContent = tierConfigured ? "0" : "1";
      elements.fallbackMetric.textContent = "0";
      elements.checkNotice.textContent = tierConfigured
        ? "执行时会读取流量加速器当前显示的档位，并选择所有 SKU 的对应申报价格均不低于目标价的档位。"
        : "自动匹配模式需要填写档位匹配目标价；未填写的启用站点会记录为配置异常。";
      elements.priceList.innerHTML = `
        <article class="price-row ${tierConfigured ? "" : "is-invalid"}">
          <div class="price-main">
            <strong>${configured}</strong>
            <small>不修改日常申报价；按平台档位直接匹配后提交</small>
          </div>
          <div class="price-side">
            <b>${tierConfigured ? "待平台读取" : "缺少目标价"}</b>
            <span class="status-chip ${tierConfigured ? "fallback" : "failed"}">${
              tierConfigured ? "档位模式" : "异常"
            }</span>
          </div>
        </article>
      `;
      return;
    }
    const rows = evaluatePriceRows(station);
    const missingCount = rows.filter((row) => row.missingPrice).length;
    const errors = rows.filter((row) => !row.valid).length;
    const regionStation =
      stations.find(
        (item) =>
          item.region === elements.region.value && item.enabled
      ) || station;
    elements.contextStation.textContent = `${regionLabel(
      elements.region.value
    )} · ${regionStation.station} · 商品流量`;
    elements.pricePreviewTitle.textContent = `${station.station}价格预检`;
    elements.pricePreviewSubtitle.textContent = `指定规格价 ${
      station.targetPrice == null ? "未填写" : formatMoney(station.targetPrice)
    } · 其他规格价 ${
      station.otherPrice == null ? "未填写" : formatMoney(station.otherPrice)
    }`;
    elements.riskMetric.textContent = String(errors);
    elements.fallbackMetric.textContent = String(missingCount);
    elements.checkNotice.textContent = errors
      ? `${station.station}有 ${errors} 个尺码缺少价格或价格无效，将阻断该站点提交。`
      : `${station.station}全部尺码使用表格配置价格。`;

    elements.priceList.innerHTML = rows
      .map(
        (row) => `
          <article class="price-row ${row.valid ? "" : "is-invalid"}">
            <div class="price-main">
              <strong>${escapeHtml(row.sku)}</strong>
              <small>${row.target ? "目标规格" : "其他规格"} · 参考价 ${formatMoney(
                row.referencePrice
              )}</small>
            </div>
            <div class="price-side">
              <b>${row.missingPrice ? "未填写" : formatMoney(row.price)}</b>
              <span class="status-chip ${
                row.valid ? "" : "failed"
              }">${row.valid ? "通过" : row.missingPrice ? "缺价格" : "异常"}</span>
            </div>
          </article>
        `
      )
      .join("");
  }

  function renderMetrics() {
    elements.stationMetric.textContent = String(enabledStations().length);
    if (!currentStation()) {
      elements.fallbackMetric.textContent = "0";
      elements.riskMetric.textContent = "0";
      elements.actionCount.textContent = `0 个启用站点 · ${pairs.length} 个商品`;
      return;
    }
    if (isPriceTierMode()) {
      const invalidTierStations = enabledStations().filter(
        (station) => !hasPrice(station.tierPrice)
      ).length;
      elements.fallbackMetric.textContent = "0";
      elements.riskMetric.textContent = String(invalidTierStations);
      elements.actionCount.textContent = `${enabledStations().length} 个启用站点 · ${
        pairs.length
      } 个商品`;
      return;
    }
    const selectedRows = evaluatePriceRows();
    const missingCount = selectedRows.filter((row) => row.missingPrice).length;
    const errors = selectedRows.filter((row) => !row.valid).length;
    elements.fallbackMetric.textContent = String(missingCount);
    elements.riskMetric.textContent = String(errors);
    elements.actionCount.textContent = `${enabledStations().length} 个启用站点 · ${
      pairs.length
    } 个商品`;
  }

  function renderQueue() {
    const queued = taskQueue.filter((item) => item.status === "queued").length;
    const running = taskQueue.filter((item) => item.status === "running").length;
    const done = taskQueue.filter((item) => item.status === "done").length;
    const paused = taskQueue.filter((item) => item.status === "paused").length;

    elements.queueCount.textContent = String(taskQueue.length);
    elements.queueReadyCount.textContent = String(queued);
    elements.queueQueuedCount.textContent = String(queued);
    elements.queueRunningCount.textContent = String(running);
    elements.queueDoneCount.textContent = String(done);
    elements.queuePausedCount.textContent = String(paused);

    if (!taskQueue.length) {
      elements.queueList.innerHTML =
        '<div class="queue-empty">还没有任务。完成参数和商品检查后，点击“加入任务队列”。</div>';
      return;
    }

    elements.queueList.innerHTML = taskQueue
      .map((taskItem, index) => {
        const stationCount = (taskItem.stations || []).filter(
          (station) => station.enabled
        ).length;
        const status = taskItem.status || "queued";
        const statusText =
          {
            queued: "排队中",
            running: "执行中",
            paused: "已暂停",
            done: "已完成",
            stopped: "已停止"
          }[status] || status;
        const canEdit = status === "queued";
        const canDelete = status === "queued" || status === "paused";
        return `
          <article class="queue-card ${status === "running" ? "is-running" : ""}"
            data-task-id="${escapeHtml(taskItem.id)}"
            draggable="${canEdit ? "true" : "false"}">
            <div class="queue-card-head">
              <span class="queue-order">${index + 1}</span>
              <div class="queue-card-title">
                <strong>${escapeHtml(taskItem.name)}</strong>
                <small>${escapeHtml(taskItem.config?.skuKeyword || "-")} · ${
                  escapeHtml(taskItem.config?.specName || "全部规格")
                } · ${escapeHtml(taskItem.config?.idType || "SPU")}</small>
              </div>
              <span class="queue-card-status ${status}">${statusText}</span>
            </div>
            <div class="queue-card-meta">
              <span>商品 ${(taskItem.pairs || []).length} 组</span>
              <span>店铺 ${escapeHtml(
                taskItem.storeContext?.storeName || "未绑定旧任务"
              )}</span>
              <span>启用站点 ${stationCount} 个</span>
              <span>区域 ${regionLabel(taskItem.config?.region || "eu")}</span>
              <span>${
                taskItem.config?.productSource === "tableImport"
                  ? "表格商品 ID"
                  : taskItem.config?.searchMode === "category"
                    ? "类目检索"
                    : "SKU 检索"
              }</span>
              <span>${
                taskItem.config?.accelerationMode === "priceTier"
                  ? "自动档位匹配"
                  : taskItem.config?.accelerationMode === "reduceThenTier"
                    ? "让价优先"
                    : "指定规格价格"
              }</span>
              <span>间隔 ${escapeHtml(taskItem.config?.taskIntervalSeconds || 15)} 秒</span>
              <span>${taskItem.config?.dryRun ? "仅检查" : "真实提交"}</span>
            </div>
            <div class="queue-card-actions">
              ${
                canEdit
                  ? `<button class="mini-button" data-queue-action="edit" data-task-id="${escapeHtml(
                      taskItem.id
                    )}" type="button">编辑</button>`
                  : ""
              }
              ${
                canDelete
                  ? `<button class="mini-button" data-queue-action="delete" data-task-id="${escapeHtml(
                      taskItem.id
                    )}" type="button">删除</button>`
                  : ""
              }
            </div>
          </article>
        `;
      })
      .join("");

    elements.queueList.querySelectorAll("[data-queue-action]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.queueAction === "edit") {
          loadTaskForEdit(button.dataset.taskId);
        } else {
          deleteQueuedTask(button.dataset.taskId);
        }
      });
    });

    let draggedTaskId = null;
    elements.queueList.querySelectorAll(".queue-card[draggable='true']").forEach((card) => {
      card.addEventListener("dragstart", () => {
        draggedTaskId = card.dataset.taskId;
        card.classList.add("is-dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("is-dragging");
      });
      card.addEventListener("dragover", (event) => event.preventDefault());
      card.addEventListener("drop", async (event) => {
        event.preventDefault();
        const targetId = card.dataset.taskId;
        if (!draggedTaskId || draggedTaskId === targetId) return;
        const from = taskQueue.findIndex((item) => item.id === draggedTaskId);
        const to = taskQueue.findIndex((item) => item.id === targetId);
        if (from < 0 || to < 0) return;
        const [moved] = taskQueue.splice(from, 1);
        taskQueue.splice(to, 0, moved);
        renderQueue();
        await saveState();
      });
    });
  }

  function renderRun() {
    const total = task.items.length;
    const success = task.items.filter((item) => item.status === "success").length;
    const exceptions = task.items.filter(
      (item) => item.status === "exception"
    ).length;
    const failed = task.items.filter((item) => item.status === "failed").length;
    const processed = task.items.filter((item) =>
      ["success", "exception", "failed"].includes(item.status)
    ).length;
    const percent = total ? Math.round((processed / total) * 100) : 0;
    const labels = {
      idle: "等待开始",
      running: "执行中",
      paused: "已暂停",
      done: "执行完成",
      stopped: "已停止"
    };

    elements.runStatusEyebrow.textContent = labels[task.status] || "任务状态";
    elements.runTitle.textContent = task.paused
      ? "任务已暂停，可继续或重试失败项"
      : task.status === "done"
        ? "本轮批量任务已完成"
        : "批量任务状态";
    elements.runPercent.textContent = `${percent}%`;
    elements.runProgress.style.width = `${percent}%`;
    elements.runTotal.textContent = String(total);
    elements.runSuccess.textContent = String(success);
    elements.runExceptions.textContent = String(exceptions);
    elements.runFailed.textContent = String(failed);

    const processedItems = task.items.filter(
      (item) => item.status !== "pending"
    );
    const timelineItems = (
      processedItems.length ? processedItems : task.items
    ).slice(-80);

    elements.timeline.innerHTML = timelineItems.length
      ? timelineItems
          .map(
            (item) => `
              <article class="timeline-item status-${item.status}">
                <span class="timeline-dot">${statusIcon(item.status)}</span>
                <div>
                  <strong>${escapeHtml(item.label || item.station)}</strong>
                  <p>${escapeHtml(item.message || statusLabel(item.status))}</p>
                </div>
                <em>${escapeHtml(statusLabel(item.status))}</em>
              </article>
            `
          )
          .join("")
      : `
          <article class="timeline-item">
            <span class="timeline-dot">○</span>
            <div>
              <strong>尚未开始</strong>
              <p>请先完成站点和商品检查。</p>
            </div>
            <em>待执行</em>
          </article>
        `;

    elements.taskLog.innerHTML = task.logs.length
      ? task.logs
          .slice(-120)
          .map(
            (entry) => `
              <div class="log-entry log-${entry.level}">
                <time>${formatTime(entry.at)}</time>
                <span>${escapeHtml(entry.message)}</span>
              </div>
            `
          )
          .join("")
      : '<div class="task-log-empty">暂无状态日志</div>';

    elements.pauseButton.disabled = !["running", "paused"].includes(task.status);
    elements.pauseButton.textContent = task.status === "paused" ? "继续" : "暂停";
    elements.retryButton.disabled = failed === 0 || task.status === "running";
  }

  function switchTab(tabName) {
    activeTab = tabName;
    elements.tabs.forEach((tab) =>
      tab.classList.toggle("is-active", tab.dataset.tab === tabName)
    );
    elements.panels.forEach((panel) =>
      panel.classList.toggle("is-active", panel.dataset.panel === tabName)
    );
    renderAll();
  }

  function updatePrimaryButton() {
    if (operationLock?.kind === "scan") {
      elements.primaryButton.disabled = true;
      elements.primaryButton.innerHTML = "商品检索中…";
      elements.actionHint.textContent =
        scanProgress
          ? `第 ${scanProgress.page || 1} 页 · 已发现 ${
              scanProgress.uniquePairs || 0
            } 组`
          : "正在自动查找商品列表";
      return;
    }
    elements.primaryButton.disabled = false;
    if (activeTab === "config") {
      elements.primaryButton.innerHTML = "生成检查 <span>→</span>";
      elements.actionHint.textContent = "先导入站点价格或使用已载入数据";
      return;
    }
    if (activeTab === "check") {
      elements.primaryButton.innerHTML = `${
        editingTaskId ? "更新任务队列" : "加入任务队列"
      } <span>+</span>`;
      elements.actionHint.textContent = `${enabledStations().length} 个启用站点 · ${
        pairs.length
      } 个商品`;
      return;
    }
    if (activeTab === "queue") {
      if (queueState.status === "running") {
        elements.primaryButton.innerHTML = "暂停队列 <span>Ⅱ</span>";
        elements.actionHint.textContent = "暂停会在当前商品站点组完成后生效";
      } else if (queueState.status === "paused") {
        elements.primaryButton.innerHTML = "继续队列 <span>▶</span>";
        elements.actionHint.textContent = "继续执行当前任务和后续任务";
      } else {
        elements.primaryButton.innerHTML = "开始任务队列 <span>→</span>";
        elements.actionHint.textContent = `${taskQueue.length} 个任务`;
      }
      return;
    }
    if (queueState.status === "running") {
      elements.primaryButton.innerHTML = "暂停队列 <span>Ⅱ</span>";
      elements.actionHint.textContent = "暂停会在当前商品站点组完成后生效";
    } else if (queueState.status === "paused") {
      elements.primaryButton.innerHTML = "继续队列 <span>▶</span>";
      elements.actionHint.textContent = "继续执行当前任务和后续任务";
    } else {
      elements.primaryButton.innerHTML = "返回任务队列 <span>→</span>";
      elements.actionHint.textContent = "选择一个任务队列开始执行";
    }
  }

  async function handlePrimaryAction() {
    if (activeTab === "config") {
      if (!validateSearchConfig()) return;
      if (!enabledStations().length) {
        showToast("请至少启用一个站点");
        return;
      }
      if (!validateAccelerationConfig()) return;
      if (!(await autoScanCacheIfNeeded())) return;
      switchTab("check");
      showToast("价格表与商品 ID 检查已生成");
      return;
    }
    if (activeTab === "check") {
      await addCurrentTask();
      return;
    }
    if (activeTab === "queue") {
      if (queueState.status === "running" || queueState.status === "paused") {
        togglePause();
      } else {
        await startQueue();
      }
      return;
    }
    if (queueState.status === "running" || queueState.status === "paused") {
      togglePause();
    } else {
      switchTab("queue");
    }
  }

  function createTaskId() {
    return `task_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
  }

  function makeCurrentSnapshot() {
    const config = readConfig();
    const enabled = stations.filter((station) => station.enabled);
    const categoryName =
      config.categoryPath.split(">").at(-1)?.trim() || config.categoryPath;
    const primaryName =
      config.productSource === "tableImport"
        ? `表格商品 ${pairs.length} 组`
        : config.searchMode === "category"
          ? categoryName
          : config.skuKeyword;
    return {
      id: editingTaskId || createTaskId(),
      name:
        config.taskName ||
        `${primaryName}${
          config.searchMode === "category" && config.skuKeyword
            ? ` + ${config.skuKeyword}`
            : ""
        }${
          config.specName ? ` · ${config.specName}` : " · 全部规格"
        }`,
      createdAt:
        taskQueue.find((item) => item.id === editingTaskId)?.createdAt ||
        Date.now(),
      updatedAt: Date.now(),
      status: "queued",
      storeContext: storeBinding ? clone(storeBinding) : null,
      config: clone(config),
      stations: clone(stations),
      pairs: clone(pairs),
      cacheMeta: clone(cacheMeta),
      preparationLogs: clone(task.logs.slice(-50)),
      enabledStationCodes: enabled.map((station) => station.code),
      run: null
    };
  }

  async function addCurrentTask() {
    if (!hasExtensionApi) {
      showToast("独立预览不能保存真实任务队列");
      return;
    }
    if (!(await ensureStoreBinding())) return;
    if (!validateSearchConfig()) return;
    if (!enabledStations().length) {
      showToast("请至少启用一个站点");
      return;
    }
    if (!validateAccelerationConfig()) return;
    if (!pairs.length) {
      showToast("请先检索商品列表或导入 SKC");
      return;
    }
    if (!(await autoScanCacheIfNeeded())) {
      switchTab("check");
      return;
    }

    const snapshot = makeCurrentSnapshot();
    const existingIndex = taskQueue.findIndex((item) => item.id === snapshot.id);
    if (existingIndex >= 0) {
      if (taskQueue[existingIndex].status !== "queued") {
        showToast("只有排队中的任务可以编辑");
        return;
      }
      taskQueue[existingIndex] = snapshot;
    } else {
      taskQueue.push(snapshot);
    }
    editingTaskId = null;
    elements.taskName.value = "";
    renderQueue();
    renderMetrics();
    updatePrimaryButton();
    await saveState({ immediate: true });
    switchTab("queue");
    showToast(
      existingIndex >= 0
        ? `已更新任务：${snapshot.name}`
        : `已加入任务队列：${snapshot.name}`
    );
  }

  function loadTaskForEdit(taskId) {
    const taskItem = taskQueue.find((item) => item.id === taskId);
    if (!taskItem || taskItem.status !== "queued") return;
    applyConfig(taskItem.config);
    stations = clone(taskItem.stations || []);
    pairs = clone(taskItem.pairs || []);
    cacheMeta = clone(taskItem.cacheMeta);
    if (!stations.some((station) => station.code === selectedStationCode)) {
      selectedStationCode = stations[0]?.code || "DE";
    }
    editingTaskId = taskId;
    switchTab("config");
    renderAll();
    showToast(`正在编辑任务：${taskItem.name}`);
  }

  async function deleteQueuedTask(taskId) {
    const index = taskQueue.findIndex((item) => item.id === taskId);
    if (
      index < 0 ||
      !["queued", "paused"].includes(taskQueue[index].status)
    ) {
      return;
    }

    const wasCurrentTask = queueState.currentTaskId === taskId;
    if (wasCurrentTask) {
      runToken++;
      operationLock = null;
      queueState.status = "idle";
      queueState.currentTaskId = null;
      queueState.currentIndex = -1;
      task = {
        status: "idle",
        paused: false,
        items: [],
        logs: []
      };
    }

    const [removed] = taskQueue.splice(index, 1);
    if (editingTaskId === taskId) editingTaskId = null;
    if (wasCurrentTask && index < taskQueue.length) {
      const next = taskQueue.slice(index).find(
        (item) => !["done", "stopped"].includes(item.status)
      );
      if (next) {
        queueState.currentIndex = taskQueue.indexOf(next);
        queueState.currentTaskId = next.id;
        task = next.run || task;
      }
    }
    renderAll();
    await saveState();
    showToast(`已删除任务：${removed.name}`);
  }

  async function clearDoneTasks() {
    taskQueue = taskQueue.filter(
      (item) => !["done", "stopped"].includes(item.status)
    );
    renderQueue();
    updatePrimaryButton();
    await saveState();
  }

  function makeTaskRun(taskItem) {
    const selectedRegion = taskItem.config?.region || "eu";
    const enabledStations = (taskItem.stations || []).filter(
      (station) =>
        station.region === selectedRegion &&
        (station.enabled ||
          (taskItem.enabledStationCodes || []).includes(station.code))
    );
    const items = [];
    const groups = [];

    for (const pair of taskItem.pairs || []) {
      const productKey = `${pair.spu || "-"}:${pair.skc}`;
      const regionMap = new Map();
      for (const station of enabledStations) {
        const groupKey = `${productKey}:${station.region}`;
        let group = regionMap.get(groupKey);
        if (!group) {
          group = {
            key: groupKey,
            productKey,
            pair: clone(pair),
            region: station.region,
            stationCodes: [],
            status: "pending"
          };
          regionMap.set(groupKey, group);
          groups.push(group);
        }
        group.stationCodes.push(station.code);
        items.push({
          id: `${groupKey}:${station.code}`,
          idType: pair.idType || taskItem.config?.idType || "SPU",
          groupKey,
          productKey,
          code: station.code,
          station: station.station,
          region: station.region,
          spu: pair.spu || "",
          skc: pair.skc,
          targetPrice: station.targetPrice,
          otherPrice: station.otherPrice,
          tierPrice: station.tierPrice,
          label: `${station.station} · ${pair.spu || pair.skc}`,
          status: "pending",
          attempts: 0,
          submitted: false,
          retryable: false,
          message: "等待执行"
        });
      }
      void regionMap;
    }

    return {
      status: "queued",
      paused: false,
      startedAt: null,
      finishedAt: null,
      items,
      groups,
      logs: [
        ...clone(taskItem.preparationLogs || []),
        logEntry(
          "info",
          `任务准备完成：${(taskItem.pairs || []).length} 个商品，${
            enabledStations.length
          } 个启用站点，商品优先执行`
        )
      ]
    };
  }

  async function acquireExecutionLeadership() {
    if (!hasExtensionApi) return true;
    const response = await chrome.runtime.sendMessage({
      type: "ACQUIRE_EXECUTION_LEASE",
      ownerId: PANEL_INSTANCE_ID,
      ttlMs: 60000
    });
    if (!response?.ok) {
      showToast(`申请执行权失败：${response?.error || "后台无响应"}`);
      return false;
    }
    isExecutionLeader = Boolean(response.acquired);
    if (isExecutionLeader) {
      startExecutionLeaseHeartbeat();
      return true;
    }
    showToast("另一个插件页面正在执行，请在显示“执行中”的页面暂停");
    return false;
  }

  function startExecutionLeaseHeartbeat() {
    if (executionLeaseTimer) clearInterval(executionLeaseTimer);
    executionLeaseTimer = setInterval(async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "RENEW_EXECUTION_LEASE",
          ownerId: PANEL_INSTANCE_ID,
          ttlMs: 60000
        });
        if (!response?.renewed) {
          isExecutionLeader = false;
          queueState.status = "paused";
          runToken += 1;
          renderAll();
          showToast("当前页面已失去队列执行权，任务已暂停");
        }
      } catch (error) {
        console.warn("续租执行权失败", error);
      }
    }, 15000);
  }

  async function releaseExecutionLeadership() {
    if (executionLeaseTimer) {
      clearInterval(executionLeaseTimer);
      executionLeaseTimer = null;
    }
    if (!hasExtensionApi || !isExecutionLeader) {
      isExecutionLeader = false;
      return;
    }
    isExecutionLeader = false;
    await chrome.runtime
      .sendMessage({
        type: "RELEASE_EXECUTION_LEASE",
        ownerId: PANEL_INSTANCE_ID
      })
      .catch((error) => console.warn(error));
  }

  async function requestQueuePauseFromBackground() {
    const response = await chrome.runtime.sendMessage({
      type: "FORCE_PAUSE_QUEUE"
    });
    if (!response?.ok || !response.paused) {
      showToast(response?.error || "暂停队列失败");
      return false;
    }
    queueState.status = "paused";
    const currentTask = taskQueue.find(
      (item) => item.id === queueState.currentTaskId
    );
    if (currentTask) {
      currentTask.status = "paused";
      if (currentTask.run) {
        currentTask.run.status = "paused";
        currentTask.run.paused = true;
        task = currentTask.run;
      }
    }
    showToast("已请求当前执行页面暂停队列");
    renderAll();
    return true;
  }

  async function startQueue() {
    if (!hasExtensionApi) {
      showToast("独立预览不能执行真实任务队列");
      return;
    }
    if (operationLock) {
      showToast(
        operationLock.kind === "scan"
          ? "商品列表正在扫描，请等待完成"
          : "任务队列已在执行"
      );
      return;
    }
    if (!(await ensureStoreBinding())) return;
    if (!taskQueue.some((item) => !["done", "stopped"].includes(item.status))) {
      showToast("任务队列中没有待执行任务");
      return;
    }
    if (!(await acquireExecutionLeadership())) return;
    if (
      queueState.status !== "paused" ||
      queueState.currentIndex >= taskQueue.length
    ) {
      queueState.currentIndex = taskQueue.findIndex(
        (item) => !["done", "stopped"].includes(item.status)
      );
      queueState.currentTaskId =
        taskQueue[queueState.currentIndex]?.id || null;
    }

    runToken++;
    const token = runToken;
    operationLock = {
      kind: "execute",
      taskId: queueState.currentTaskId || null,
      startedAt: Date.now()
    };
    queueState.status = "running";
    switchTab("run");
    renderAll();
    await saveState({ immediate: true });
    try {
      await processQueue(token);
    } finally {
      if (token === runToken) {
        operationLock = null;
      }
      await saveState({ immediate: true });
      await releaseExecutionLeadership();
    }
  }

  async function processQueue(token) {
    let index = Math.max(0, queueState.currentIndex);
    for (; index < taskQueue.length && token === runToken; index++) {
      if (queueState.status === "paused") break;
      const taskItem = taskQueue[index];
      if (["done", "stopped"].includes(taskItem.status)) continue;
      const liveStore = await refreshStoreContext({ silent: true });
      if (
        !taskItem.storeContext?.storeName ||
        normalizeStoreName(taskItem.storeContext.storeName) !==
          normalizeStoreName(storeBinding?.storeName) ||
        !liveStore?.storeName ||
        normalizeStoreName(liveStore.storeName) !==
          normalizeStoreName(storeBinding?.storeName)
      ) {
        taskItem.status = "paused";
        taskItem.run = taskItem.run || makeTaskRun(taskItem);
        taskItem.run.status = "paused";
        taskItem.run.paused = true;
        taskItem.run.logs.push(
          logEntry(
            "error",
            `店铺不匹配：任务属于 ${
              taskItem.storeContext?.storeName || "未绑定旧任务"
            }，绑定 ${storeBinding?.storeName || "未绑定"}，当前 ${
              liveStore?.storeName || "未识别"
            }`
          )
        );
        queueState.status = "paused";
        task = taskItem.run;
        renderAll();
        await saveState();
        return;
      }

      queueState.currentIndex = index;
      queueState.currentTaskId = taskItem.id;
      taskItem.status = "running";
      taskItem.run = taskItem.run || makeTaskRun(taskItem);
      taskItem.run.status = "running";
      taskItem.run.paused = false;
      taskItem.run.startedAt = taskItem.run.startedAt || Date.now();
      task = taskItem.run;
      task.logs.push(logEntry("info", `开始任务：${taskItem.name}`));
      renderAll();
      await saveState();

      try {
        await processTaskRun(taskItem, token);
      } catch (error) {
        queueState.status = "paused";
        taskItem.status = "paused";
        taskItem.run.status = "paused";
        taskItem.run.paused = true;
        taskItem.run.logs.push(
          logEntry("error", `任务暂停：${error.message}`)
        );
        await saveState();
        return;
      }
      if (token !== runToken) return;
      if (queueState.status === "paused") {
        taskItem.status = "paused";
        await saveState();
        return;
      }

      taskItem.status = "done";
      taskItem.run.status = "done";
      taskItem.run.paused = false;
      taskItem.run.finishedAt = Date.now();
      taskItem.run.logs.push(
        logEntry(
          "info",
          `任务完成：成功 ${
            taskItem.run.items.filter((item) => item.status === "success").length
          }，配置异常 ${
            taskItem.run.items.filter((item) => item.status === "exception").length
          }，可重试失败 ${
            taskItem.run.items.filter((item) => item.status === "failed").length
          }`
        )
      );
      renderAll();
      await saveState();

      const hasNextTask = taskQueue
        .slice(index + 1)
        .some((item) => !["done", "stopped"].includes(item.status));
      if (hasNextTask && queueState.status !== "paused") {
        await waitForTaskInterval(taskItem);
      }
    }

    if (token !== runToken) return;
    if (queueState.status !== "paused") {
      queueState.status = "done";
      queueState.currentIndex = taskQueue.length;
      queueState.logs.push(logEntry("info", "任务队列执行完成"));
      operationLock = null;
      updatePrimaryButton();
      renderAll();
      await saveState();
    }
  }

  async function processTaskRun(taskItem, token) {
    const run = taskItem.run;
    const enabledStations = (taskItem.stations || []).filter(
      (station) =>
        station.region === (taskItem.config?.region || "eu") &&
        (station.enabled ||
          (taskItem.enabledStationCodes || []).includes(station.code))
    );
    const firstRegion = enabledStations[0]?.region || "eu";
    const recoveryBeforeTask = contentScriptRecoverySequence;
    const tab = await getExecutionTab(firstRegion);
    if (!tab?.id) return;
    if (contentScriptRecoverySequence > recoveryBeforeTask) {
      run.logs.push(
        logEntry(
          "success",
          "执行页面连接已恢复：检测到扩展更新或标签页脚本断开，已自动重新注入页面脚本。"
        )
      );
      renderRun();
      await saveState();
    }

    const totalGroups = run.groups.length;
    for (let groupIndex = 0; groupIndex < run.groups.length; groupIndex++) {
      if (token !== runToken || queueState.status === "paused") return;
      const group = run.groups[groupIndex];
      if (group.status === "done") continue;
      const groupItems = run.items.filter((item) => item.groupKey === group.key);
      if (!groupItems.some((item) => item.status === "pending")) {
        group.status = "done";
        continue;
      }

      group.status = "running";
      for (const item of groupItems) {
        if (item.status === "pending") {
          item.status = "running";
          item.attempts++;
          item.message = "商品定位检索：查询当前商品";
        }
      }
      run.logs.push(
        logEntry(
          "info",
          `商品定位检索：方式 ${
            taskItem.config?.productSource === "tableImport"
              ? "表格导入"
              : "商品列表检索"
          }，ID 类型 ${
            group.pair.idType || taskItem.config?.idType || "SPU"
          }，ID ${group.pair.spu || group.pair.skc}，地区 ${regionLabel(
            group.region
          )}，查询一次后处理 ${group.stationCodes.length} 个站点${
            (group.pair.idType || taskItem.config?.idType) === "SPU" &&
            !group.pair.spu &&
            group.pair.skc
              ? "；使用兼容字段中的 SPU 查询"
              : ""
          }`
        )
      );
      renderRun();
      await saveState();

      const stationsForGroup = enabledStations.filter((station) =>
        group.stationCodes.includes(station.code) &&
        groupItems.some(
          (item) =>
            item.code === station.code &&
            ["pending", "running"].includes(item.status)
        )
      );
      let response;
      const recoveryBeforeGroup = contentScriptRecoverySequence;
      try {
        await ensureTrafficPageForTab(tab.id, group.region);
        response = await sendTabMessage(tab.id, {
          type: "RUN_PRODUCT_STATIONS",
          config: {
            ...taskItem.config,
            idType: group.pair.idType || taskItem.config?.idType || "SPU",
            spu: group.pair.spu || "",
            skc: group.pair.skc,
            stations: stationsForGroup
          }
        });
      } catch (error) {
        response = {
          ok: false,
          error: error.message,
          results: []
        };
      }

      if (contentScriptRecoverySequence > recoveryBeforeGroup) {
        run.logs.push(
          logEntry(
            "success",
            "执行页面连接已恢复：已自动重新注入 content script，继续当前商品。"
          )
        );
      }

      if (!response?.ok) {
        for (const item of groupItems.filter(
          (item) => item.status === "pending" || item.status === "running"
        )) {
          item.status = "failed";
          item.retryable = true;
          item.message = `可重试失败：${response?.error || "页面没有返回结果"}`;
        }
      } else {
        if (response.query) {
          run.logs.push(
            logEntry(
              "info",
              `流量分析定位查询：${response.query.idType} ${
                response.query.id
              }${
                response.query.fallbackUsed
                  ? "（兼容使用备用字段中的商品 ID）"
                  : ""
              }`
            )
          );
        }
        const byCode = new Map(
          (response.results || []).map((result) => [result.code, result])
        );
        for (const item of groupItems) {
          const result = byCode.get(item.code);
          if (!result) {
            if (item.status === "running") {
              item.status = "pending";
              item.message = "等待继续执行";
            }
            continue;
          }
          item.status = ["success", "exception", "failed"].includes(
            result.status
          )
            ? result.status
            : "failed";
          item.submitted = Boolean(result.submitted);
          item.retryable = Boolean(result.retryable);
          item.stage = result.stage || "";
          item.message = result.message || statusLabel(item.status);
          const level =
            item.status === "success"
              ? "success"
              : item.status === "exception"
                ? "warning"
                : "error";
          run.logs.push(logEntry(level, `${item.label}：${item.message}`));
        }

        const systemicMessage = detectSystemicStationFailure(
          response.results || []
        );
        if (systemicMessage) {
          for (const item of groupItems) {
            if (
              !item.submitted &&
              ["pending", "running", "exception", "failed"].includes(
                item.status
              )
            ) {
              item.status = "pending";
              item.retryable = false;
              item.message = "系统异常已拦截，等待修复后继续";
            }
          }
          queueState.status = "paused";
          taskItem.status = "paused";
          run.status = "paused";
          run.paused = true;
          run.logs.push(
            logEntry(
              "error",
              `系统保护：同一商品的多个站点出现相同异常“${systemicMessage}”，队列已自动暂停，当前商品未提交的站点保持待处理。`
            )
          );
        } else if (response.rateLimited) {
          queueState.status = "paused";
          taskItem.status = "paused";
          run.status = "paused";
          run.paused = true;
          run.logs.push(
            logEntry(
              "warning",
              "检测到请求频繁：队列已自动暂停，当前未完成站点保持待处理"
            )
          );
        }
      }

      updateAdaptiveRateControl(taskItem, response, groupItems);
      group.status =
        groupItems.every((item) =>
          ["success", "exception", "failed"].includes(item.status)
        )
          ? "done"
          : queueState.status === "paused"
            ? "paused"
            : "done";
      renderAll();
      await saveState();

      if (queueState.status === "paused") return;
      const hasMoreGroups = run.groups
        .slice(groupIndex + 1)
        .some((item) => item.status !== "done");
      if (hasMoreGroups) {
        await waitForTaskInterval(taskItem);
      }
    }
  }

  async function togglePause() {
    const currentTask = taskQueue.find(
      (item) => item.id === queueState.currentTaskId
    );
    if (queueState.status === "running") {
      if (
        hasExtensionApi &&
        !isExecutionLeader &&
        operationLock?.kind !== "execute"
      ) {
        await requestQueuePauseFromBackground();
        return;
      }
      queueState.status = "paused";
      if (currentTask) {
        currentTask.status = "paused";
        if (currentTask.run) {
          currentTask.run.status = "paused";
          currentTask.run.paused = true;
          currentTask.run.logs.push(logEntry("warning", "任务队列已暂停"));
        }
      }
    } else if (queueState.status === "paused") {
      queueState.status = "running";
      if (currentTask) {
        currentTask.status = "running";
        if (currentTask.run) {
          currentTask.run.status = "running";
          currentTask.run.paused = false;
          currentTask.run.logs.push(logEntry("info", "任务队列已继续"));
        }
      }
      if (!operationLock) {
        await startQueue();
      } else {
        renderAll();
        saveState({ immediate: true });
      }
      return;
    }
    renderAll();
    saveState({ immediate: true });
  }

  async function retryFailed() {
    if (!hasExtensionApi || operationLock) return;
    let taskIndex = Math.max(0, queueState.currentIndex);
    let taskItem = taskQueue[taskIndex];
    if (!taskItem || !taskItem.run?.items.some((item) => item.status === "failed")) {
      taskIndex = taskQueue.findIndex((item) =>
        item.run?.items.some((failedItem) => failedItem.status === "failed")
      );
      taskItem = taskQueue[taskIndex];
    }
    if (!taskItem?.run) {
      showToast("没有找到可重试失败项");
      return;
    }

    const failed = taskItem.run.items.filter((item) => item.status === "failed");
    if (!failed.length) {
      showToast("当前任务没有可重试失败项");
      return;
    }
    failed.forEach((item) => {
      item.status = "pending";
      item.message = "等待重新执行";
      item.submitted = false;
      item.retryable = false;
    });
    taskItem.run.groups.forEach((group) => {
      if (
        taskItem.run.items.some(
          (item) => item.groupKey === group.key && item.status === "pending"
        )
      ) {
        group.status = "pending";
      }
    });
    taskItem.status = "paused";
    taskItem.run.status = "paused";
    taskItem.run.paused = true;
    taskItem.run.logs.push(
      logEntry("info", `准备重试 ${failed.length} 个可重试失败项`)
    );
    queueState.currentIndex = taskIndex;
    queueState.currentTaskId = taskItem.id;
    queueState.status = "paused";
    task = taskItem.run;
    await saveState();
    await startQueue();
  }

  async function waitForTaskInterval(taskItem) {
    const control = getAdaptiveRateControl(taskItem);
    const seconds = control.currentSeconds;
    const jitter = seconds >= 8 ? Math.floor(Math.random() * 3000) : 0;
    const waitMs = Math.round(seconds * 1000 + jitter);
    taskItem.run.logs.push(
      logEntry(
        "info",
        `防频繁间隔：自适应当前 ${seconds.toFixed(
          1
        )} 秒，等待 ${(waitMs / 1000).toFixed(1)} 秒后处理下一商品`
      )
    );
    renderRun();
    await saveState();
    await sleep(waitMs);
  }

  function getAdaptiveRateControl(taskItem) {
    const configured = Math.max(
      0.1,
      Number(taskItem.config?.taskIntervalSeconds) || 15
    );
    taskItem.run.rateControl = taskItem.run.rateControl || {
      configuredSeconds: configured,
      currentSeconds: configured >= 8 ? Math.min(10, configured) : configured,
      minimumSeconds: configured >= 8 ? 8 : configured,
      healthyStreak: 0
    };
    const control = taskItem.run.rateControl;
    control.configuredSeconds = configured;
    control.minimumSeconds = configured >= 8 ? 8 : configured;
    control.currentSeconds = Math.max(
      control.minimumSeconds,
      Number(control.currentSeconds) || control.minimumSeconds
    );
    return control;
  }

  function updateAdaptiveRateControl(taskItem, response, groupItems) {
    const control = getAdaptiveRateControl(taskItem);
    if (control.configuredSeconds < 8) return;
    const previousSeconds = control.currentSeconds;
    const rateLimited = Boolean(response?.rateLimited);
    const failedCount = groupItems.filter(
      (item) => item.status === "failed"
    ).length;

    if (rateLimited) {
      control.currentSeconds = control.configuredSeconds;
      control.healthyStreak = 0;
    } else if (failedCount === 0) {
      control.healthyStreak += 1;
      if (control.healthyStreak >= 3) {
        control.currentSeconds = Math.max(
          control.minimumSeconds,
          control.currentSeconds - 1
        );
        control.healthyStreak = 0;
      }
    } else {
      control.healthyStreak = 0;
    }

    if (control.currentSeconds !== previousSeconds) {
      taskItem.run.logs.push(
        logEntry(
          rateLimited ? "warning" : "info",
          rateLimited
            ? `自适应间隔已回退到 ${control.currentSeconds} 秒`
            : `自适应间隔已降至 ${control.currentSeconds} 秒`
        )
      );
    }
  }

  function isRateLimitMessage(message) {
    return /请求频繁|操作频繁|系统繁忙|操作过快|稍后重试|请勿重复/.test(
      String(message || "")
    );
  }

  function detectSystemicStationFailure(results) {
    if (!Array.isArray(results) || results.length < 3) return "";
    const failures = results.filter(
      (result) =>
        !result.submitted &&
        ["exception", "failed"].includes(result.status)
    );
    if (failures.length !== results.length) return "";
    const messages = [
      ...new Set(
        failures.map((result) => String(result.message || "").trim()).filter(Boolean)
      )
    ];
    if (messages.length !== 1) return "";
    const message = messages[0];
    if (
      /没有获取加速资格|未找到.+站商品行|已在流量加速中/.test(message)
    ) {
      return "";
    }
    return message;
  }

  async function ensureTrafficPageForTab(tabId, region) {
    const destination = trafficAnalysisUrl(region);
    const tab = await chrome.tabs.get(tabId);
    const currentUrl = tab.url || "";
    let wrongRegion = false;
    if (currentUrl.includes("/main/flux-analysis")) {
      wrongRegion = new URL(currentUrl).origin !== new URL(destination).origin;
    }
    if (!currentUrl.includes("/main/flux-analysis") || wrongRegion) {
      await chrome.tabs.update(tabId, { url: destination });
    }
    await waitForTrafficPage(tabId);
  }

  function openStationModal(code) {
    selectedStationCode = code;
    const station = currentStation();
    elements.stationModalCode.textContent = `${station.code} · ${
      station.group || regionLabel(station.region)
    }`;
    elements.stationModalTitle.textContent = `设置${station.station}价格`;
    elements.stationEnabled.checked = station.enabled;
    elements.modalTargetPrice.value =
      station.targetPrice == null ? "" : String(station.targetPrice);
    elements.modalOtherPrice.value =
      station.otherPrice == null ? "" : String(station.otherPrice);
    elements.modalTierPrice.value =
      station.tierPrice == null ? "" : String(station.tierPrice);
    const tierMode = isPriceTierMode();
    elements.modalTargetPriceField.hidden = tierMode;
    elements.modalOtherPriceField.hidden = tierMode;
    elements.modalTierPriceField.hidden = !tierMode;
    elements.stationModalNote.textContent = tierMode
      ? "插件会查找所有 SKU 的对应申报价均不低于目标价的档位。目标价只用于匹配，不会写入日常申报价。"
      : isHybridMode()
        ? "先尝试继续让价；不可用时按每个 SKU 的指定规格价或其他规格价匹配现有档位，默认选择最高流量档。"
        : "目标规格和其他规格价格都必须填写。任一价格留空或高于参考申报价时，该站点会阻断提交。";
    elements.stationModal.hidden = false;
  }

  function closeStationModal() {
    elements.stationModal.hidden = true;
  }

  async function saveStationModal() {
    const station = currentStation();
    station.enabled = elements.stationEnabled.checked;
    station.targetPrice = emptyToNull(elements.modalTargetPrice.value);
    station.otherPrice = emptyToNull(elements.modalOtherPrice.value);
    station.tierPrice = emptyToNull(elements.modalTierPrice.value);
    closeStationModal();
    renderAll();
    await saveState();
    showToast(`${station.station}价格设置已保存`);
  }

  async function importWorkbook() {
    const file = elements.importFile.files?.[0];
    if (!file || importing) return;
    importing = true;
    elements.importButton.disabled = true;
    elements.importButton.textContent = "导入中…";
    try {
      let result;
      if (/\.csv$/i.test(file.name)) {
        const rows = globalThis.TemuXlsxReader.parseCsv(await file.text());
        result = {
          countries: countriesFromCsv(rows),
          productIdRows: productsFromCsv(rows),
          skcRows: []
        };
      } else {
        result = await globalThis.TemuXlsxReader.readWorkbook(
          await file.arrayBuffer()
        );
      }
      const countries = (result.countries || []).filter(
        (row) => row.code && row.name
      );
      if (!countries.length) {
        throw new Error("没有找到“国家价格”工作表的有效站点行");
      }
      stations = countries.map((row) => ({
        ...row,
        targetPrice: Number.isFinite(row.targetPrice) ? row.targetPrice : null,
        otherPrice: Number.isFinite(row.otherPrice) ? row.otherPrice : null,
        tierPrice: Number.isFinite(row.tierPrice) ? row.tierPrice : null,
        enabled:
          row.enabled ||
          Number.isFinite(row.targetPrice) ||
          Number.isFinite(row.tierPrice)
      }));
      const autoEnabled = stations.filter((row) => row.enabled).length;
      const invalidPriceCells = [];
      for (const row of countries) {
        if (
          String(row.targetPriceRaw || "").trim() &&
          !Number.isFinite(row.targetPrice)
        ) {
          invalidPriceCells.push({
            countryCode: row.code,
            column: "指定规格价格",
            rawValue: String(row.targetPriceRaw)
          });
        }
        if (
          String(row.otherPriceRaw || "").trim() &&
          !Number.isFinite(row.otherPrice)
        ) {
          invalidPriceCells.push({
            countryCode: row.code,
            column: "其他规格价格",
            rawValue: String(row.otherPriceRaw)
          });
        }
        if (
          String(row.tierPriceRaw || "").trim() &&
          !Number.isFinite(row.tierPrice)
        ) {
          invalidPriceCells.push({
            countryCode: row.code,
            column: "档位匹配价格",
            rawValue: String(row.tierPriceRaw)
          });
        }
      }
      importDiagnostics = {
        rowsFound: countries.length,
        explicitEnabled: countries.filter((row) => row.enabled).length,
        targetPricePresent: countries.filter((row) =>
          String(row.targetPriceRaw || "").trim()
        ).length,
        otherPricePresent: countries.filter((row) =>
          String(row.otherPriceRaw || "").trim()
        ).length,
        tierPricePresent: countries.filter((row) =>
          String(row.tierPriceRaw || "").trim()
        ).length,
        invalidPriceCells,
        finalEnabled: autoEnabled,
        at: Date.now()
      };
      if (!stations.some((row) => row.code === selectedStationCode)) {
        selectedStationCode = stations[0].code;
      }

      const productImport = applyImportedProductIds(
        result.productIdRows || [],
        file.name
      );
      importDiagnostics.productIdCount = productImport.total;
      importDiagnostics.spuCount = productImport.spuCount;
      importDiagnostics.skcCount = productImport.skcCount;

      elements.importSummary.textContent = `${countries.length} 个站点 · ${
        autoEnabled
      } 个自动启用站点 · ${productImport.spuCount} 个 SPU · ${
        productImport.skcCount
      } 个 SKC · ${file.name}`;
      renderAll();
      await saveState();
      showToast(`已导入 ${countries.length} 个站点，自动启用 ${autoEnabled} 个`);
    } catch (error) {
      showToast(`导入失败：${error.message}`);
    } finally {
      importing = false;
      elements.importButton.disabled = false;
      elements.importButton.textContent = "导入表格";
    }
  }

  function applyImportedProductIds(rows, fileName = "") {
    const enabledRows = (rows || []).filter(
      (row) => row.enabled && /^\d{6,}$/.test(String(row.id || ""))
    );
    const unique = new Map();
    for (const row of enabledRows) {
      const idType = row.idType === "SKC" ? "SKC" : "SPU";
      unique.set(`${idType}:${row.id}`, {
        idType,
        spu: idType === "SPU" ? row.id : row.spu || "",
        skc: idType === "SKC" ? row.id : row.skc || ""
      });
    }
    const imported = [...unique.values()];
    const spuCount = imported.filter((pair) => pair.idType === "SPU").length;
    const skcCount = imported.filter((pair) => pair.idType === "SKC").length;
    if (imported.length) {
      pairs = imported;
      source = "import";
      elements.productSource.value = "tableImport";
      const types = new Set(imported.map((pair) => pair.idType));
      if (types.size === 1) elements.idType.value = [...types][0];
      cacheMeta = {
        skuKeyword: elements.skuKeyword.value.trim(),
        specName: elements.specName.value.trim(),
        searchMode: elements.searchMode.value,
        categoryPath: elements.categoryPath.value.trim(),
        region: elements.region.value,
        source: "import",
        verified: true,
        fileName,
        scannedAt: Date.now()
      };
    }
    task.logs.push(
      logEntry(
        imported.length ? "success" : "warning",
        imported.length
          ? `商品 ID 表格导入：${fileName || "表格"}，SPU ${spuCount} 个，SKC ${skcCount} 个，去重 ${imported.length} 组`
          : `商品 ID 表格导入：${fileName || "表格"} 没有可用的启用 SPU/SKC`
      )
    );
    return {
      total: imported.length,
      spuCount,
      skcCount
    };
  }

  async function importProductWorkbook() {
    const file = elements.productImportFile.files?.[0];
    if (!file) return;
    elements.productImportButton.disabled = true;
    elements.productImportButton.textContent = "导入中…";
    try {
      let result;
      if (/\.csv$/i.test(file.name)) {
        const rows = globalThis.TemuXlsxReader.parseCsv(await file.text());
        result = { productIdRows: productsFromCsv(rows) };
      } else {
        result = await globalThis.TemuXlsxReader.readWorkbook(
          await file.arrayBuffer()
        );
      }
      const imported = applyImportedProductIds(
        result.productIdRows || [],
        file.name
      );
      if (!imported.total) {
        throw new Error("没有找到已启用且有效的 SPU ID 或 SKC ID");
      }
      importDiagnostics = {
        ...(importDiagnostics || {
          rowsFound: stations.length,
          explicitEnabled: 0,
          targetPricePresent: 0,
          otherPricePresent: 0,
          tierPricePresent: 0,
          invalidPriceCells: [],
          finalEnabled: enabledStations().length,
          at: Date.now()
        }),
        productIdCount: imported.total,
        spuCount: imported.spuCount,
        skcCount: imported.skcCount
      };
      renderAll();
      await saveState();
      showToast(
        `商品 ID 导入完成：SPU ${imported.spuCount} 个，SKC ${imported.skcCount} 个`
      );
    } catch (error) {
      showToast(`商品 ID 导入失败：${error.message}`);
    } finally {
      elements.productImportButton.disabled = false;
      elements.productImportButton.textContent = "导入商品 ID 表";
      elements.productImportFile.value = "";
    }
  }

  function countriesFromCsv(rows) {
    const headerIndex = rows.findIndex((row) => row.includes("国家代码"));
    if (headerIndex < 0) return [];
    const headers = rows[headerIndex].map((value) => String(value).trim());
    return rows
      .slice(headerIndex + 1)
      .map((row) => {
        const value = Object.fromEntries(
          headers.map((header, index) => [header, row[index] || ""])
        );
        const code = value["国家代码"] || "";
        const name = value["国家名称"] || value["站点"] || "";
        const group = value["分组"] || "";
        const targetPriceRaw = String(
          value["指定规格价格(RMB)"] ||
            value["指定规格价格"] ||
            value["提交价格(RMB)"] ||
            value["提交价格"] ||
            ""
        ).trim();
        const otherPriceRaw = String(
          value["其他规格价格(RMB)"] ||
            value["其他规格价格"] ||
            value["最低接受价(RMB)"] ||
            value["最低接受价"] ||
            ""
        ).trim();
        const tierPriceRaw = String(
          value["档位匹配价格(RMB)"] ||
            value["档位匹配价格"] ||
            value["加速档位目标价(RMB)"] ||
            value["加速档位目标价"] ||
            ""
        ).trim();
        return {
          code,
          name,
          station: name.endsWith("站") ? name : `${name}站`,
          group,
          region: /美国/.test(group) ? "us" : /欧盟|欧洲/.test(group) ? "eu" : "global",
          enabled: /^是$/.test(value["启用(是/否)"] || value["启用"] || ""),
          targetPriceRaw,
          targetPrice: parsePriceValue(targetPriceRaw),
          otherPriceRaw,
          otherPrice: parsePriceValue(otherPriceRaw),
          tierPriceRaw,
          tierPrice: parsePriceValue(tierPriceRaw),
          submitMode: value["提交方式"] || "",
          note: value["备注"] || ""
        };
      })
      .filter((row) => row.code && row.name);
  }

  function productsFromCsv(rows) {
    const headerIndex = rows.findIndex((row) =>
      row.some((value) =>
        ["商品ID", "SPU ID", "SKC ID"].includes(String(value).trim())
      )
    );
    if (headerIndex < 0) return [];
    const headers = rows[headerIndex].map((value) => String(value).trim());
    return rows
      .slice(headerIndex + 1)
      .map((row) => {
        const value = Object.fromEntries(
          headers.map((header, index) => [header, String(row[index] || "").trim()])
        );
        let spu = value["SPU ID"] || value["SPU"] || "";
        let skc = value["SKC ID"] || value["SKC"] || "";
        const genericId = value["商品ID"] || value["商品 ID"] || "";
        const typeRaw =
          value["商品ID类型"] ||
          value["ID类型"] ||
          value["商品ID类型(SPU/SKC)"] ||
          "";
        let idType = /SPU/i.test(typeRaw)
          ? "SPU"
          : /SKC/i.test(typeRaw)
            ? "SKC"
            : spu
              ? "SPU"
              : "SKC";
        let id = idType === "SPU" ? spu : skc;
        if (
          !typeRaw &&
          !("SPU ID" in value) &&
          skc &&
          !spu &&
          skc.length <= 11
        ) {
          idType = "SPU";
          spu = skc;
          skc = "";
          id = spu;
        }
        if (!id && genericId) {
          id = genericId;
        } else if (idType === "SPU" && !spu && skc) {
          idType = "SKC";
          id = skc;
        } else if (idType === "SKC" && !skc && spu) {
          idType = "SPU";
          id = spu;
        }
        const enabledRaw = value["启用(是/否)"] || value["启用"] || "";
        return {
          goodsCode: value["货号"] || "",
          idType,
          id,
          spu,
          skc,
          enabled:
            /^是$/i.test(enabledRaw) ||
            (!enabledRaw && /^\d{6,}$/.test(id)),
          note: value["备注"] || ""
        };
      })
      .filter((row) => /^\d{6,}$/.test(row.id));
  }

  async function exportEnvironment() {
    if (!(await ensureStoreBinding())) return;
    const payload = {
      format: "temu-batch-traffic-environment",
      formatVersion: 1,
      pluginVersion: hasExtensionApi
        ? chrome.runtime.getManifest().version
        : "preview",
      exportedAt: new Date().toISOString(),
      storeBinding: clone(storeBinding),
      state: {
        config: readConfig(),
        stations: clone(stations),
        pairs: clone(pairs),
        cacheMeta: clone(cacheMeta),
        storeBinding: clone(storeBinding),
        taskQueue: clone(taskQueue),
        queueState: clone(queueState),
        importDiagnostics: clone(importDiagnostics),
        logs: clone(task.logs)
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeStore = sanitizeFileName(storeBinding.storeName) || "store";
    anchor.href = url;
    anchor.download = `流量加速环境_${safeStore}_${dateStamp()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("环境配置已导出；登录状态和代理不会被导出");
  }

  async function importEnvironment() {
    const file = elements.importEnvironmentFile.files?.[0];
    if (!file) return;
    elements.importEnvironmentButton.disabled = true;
    try {
      const payload = JSON.parse(await file.text());
      if (
        payload?.format !== "temu-batch-traffic-environment" ||
        payload?.formatVersion !== 1 ||
        !payload?.state
      ) {
        throw new Error("不是可识别的流量加速环境文件");
      }
      const importedBinding = payload.storeBinding || payload.state.storeBinding;
      if (!importedBinding?.storeName) {
        throw new Error("环境文件缺少店铺绑定信息，请从 v0.6.5 或更高版本重新导出");
      }
      const context = await refreshStoreContext();
      if (!context?.storeName) {
        throw new Error("无法识别当前店铺，请打开 TEMU 商家中心并刷新页面");
      }
      if (
        normalizeStoreName(context.storeName) !==
        normalizeStoreName(importedBinding.storeName)
      ) {
        throw new Error(
          `店铺不匹配：环境属于 ${importedBinding.storeName}，当前是 ${context.storeName}`
        );
      }
      if (
        !globalThis.confirm(
          `导入后将替换当前参数、站点价格、商品缓存和任务队列。\n\n店铺：${importedBinding.storeName}\n文件名：${file.name}\n\n继续导入？`
        )
      ) {
        return;
      }

      const imported = payload.state;
      applyConfig(imported.config || {});
      stations = Array.isArray(imported.stations) ? imported.stations : [];
      pairs = Array.isArray(imported.pairs) ? imported.pairs : [];
      cacheMeta = imported.cacheMeta || null;
      storeBinding = clone(importedBinding);
      taskQueue = (Array.isArray(imported.taskQueue)
        ? imported.taskQueue
        : []
      ).map((taskItem) => {
        if (taskItem.status === "running") {
          return {
            ...taskItem,
            status: "paused",
            run: taskItem.run
              ? { ...taskItem.run, status: "paused", paused: true }
              : taskItem.run
          };
        }
        return taskItem;
      });
      queueState = {
        status:
          imported.queueState?.status === "running"
            ? "paused"
            : imported.queueState?.status || "idle",
        currentTaskId: imported.queueState?.currentTaskId || null,
        currentIndex: Number.isInteger(imported.queueState?.currentIndex)
          ? imported.queueState.currentIndex
          : -1,
        logs: Array.isArray(imported.queueState?.logs)
          ? imported.queueState.logs
          : []
      };
      importDiagnostics = imported.importDiagnostics || null;
      task = { status: "idle", paused: false, items: [], logs: [] };
      if (queueState.currentTaskId) {
        const currentTask = taskQueue.find(
          (item) => item.id === queueState.currentTaskId
        );
        if (currentTask?.run) task = currentTask.run;
      }
      operationLock = null;
      scanProgress = null;
      runToken++;
      renderAll();
      await saveState();
      showToast(`环境已导入：${importedBinding.storeName}`);
    } catch (error) {
      showToast(`导入环境失败：${error.message}`);
    } finally {
      elements.importEnvironmentButton.disabled = false;
      elements.importEnvironmentFile.value = "";
    }
  }

  function sanitizeFileName(value) {
    return String(value || "").replace(/[\\/:*?"<>|]/g, "_").trim();
  }

  async function syncCurrentPage() {
    if (!hasExtensionApi) {
      showToast("独立预览模式：加载扩展后可连接 TEMU 页面");
      return;
    }
    const tab = await getTargetTab();
    if (!tab) return;
    try {
      const response = await sendTabMessage(tab.id, { type: "PING" });
      if (!response?.ok) throw new Error(response?.error || "页面未响应");
      const context = response.context;
      if (context.storeName) {
        currentStoreContext = {
          storeName: context.storeName,
          host: context.host,
          region:
            context.host?.includes("-us.")
              ? "us"
              : context.host?.includes("-eu.")
                ? "eu"
                : "global"
        };
        renderStoreBinding();
      }
      elements.pageState.textContent =
        context.kind === "goods"
          ? "已连接商品列表"
          : context.kind === "traffic"
            ? context.hasTrafficModal
              ? "已连接价格弹窗"
              : "已连接流量分析"
            : "页面类型不支持";
      if (context.kind === "goods") await scanGoods();
      else if (context.kind === "traffic" && context.hasTrafficModal) {
        await inspectTrafficModal();
      } else {
        showToast("请在商品列表或“调整申报价”弹窗页面使用");
      }
    } catch (error) {
      showToast(error.message);
    }
  }

  async function openTrafficAnalysis() {
    if (!hasExtensionApi) {
      showToast("独立预览模式：加载扩展后可打开 TEMU 流量分析");
      return;
    }
    const tab = await getTargetTab();
    if (!tab) return;
    const region = elements.region.value;
    const station =
      stations.find(
        (item) => item.region === region && item.enabled
      ) || currentStation();
    const destination = trafficAnalysisUrl(region);
    elements.openTrafficButton.disabled = true;
    elements.openTrafficButton.textContent = "正在打开…";
    try {
      const currentUrl = tab.url || "";
      const wrongRegion =
        currentUrl.includes("/main/flux-analysis") &&
        new URL(currentUrl).origin !== new URL(destination).origin;
      if (!currentUrl.includes("/main/flux-analysis") || wrongRegion) {
        await chrome.tabs.update(tab.id, { url: destination });
      }
      const response = await waitForTrafficPage(tab.id);
      elements.pageState.textContent = "已连接流量分析";
      elements.contextStation.textContent = `${regionLabel(
        region
      )} · ${station.station} · 商品流量`;
      showToast(
        response.context?.kind === "traffic"
          ? `${regionLabel(region)}流量分析已就绪`
          : "流量分析页面已打开"
      );
    } catch (error) {
      showToast(`流量分析入口未就绪：${error.message}`);
    } finally {
      elements.openTrafficButton.disabled = false;
      elements.openTrafficButton.textContent = "打开流量分析";
    }
  }

  function trafficAnalysisUrl(region) {
    if (region === "us") {
      return "https://agentseller-us.temu.com/main/flux-analysis";
    }
    if (region === "eu") {
      return "https://agentseller-eu.temu.com/main/flux-analysis";
    }
    return "https://agentseller.temu.com/main/flux-analysis";
  }

  async function waitForTrafficPage(tabId, timeout = 15000) {
    const startedAt = Date.now();
    let lastError = null;
    while (Date.now() - startedAt < timeout) {
      try {
        const response = await sendTabMessage(tabId, { type: "PING" });
        if (response?.ok && response.context?.kind === "traffic") {
          return response;
        }
      } catch (error) {
        lastError = error;
      }
      await sleep(350);
    }
    throw new Error(
      lastError?.message || "页面加载超时，请刷新或手动重新打开一次"
    );
  }

  async function scanGoods(options = {}) {
    if (!hasExtensionApi) {
      source = "demo";
      pairs = clone(SAMPLE_PAIRS);
      renderAll();
      showToast("独立预览模式：已载入 DWRG + Mixed Color2 的实际检索结果");
      return true;
    }
    if (operationLock) {
      showToast(
        operationLock.kind === "scan"
          ? "商品列表正在扫描，请等待完成"
          : "任务队列正在执行，不能同时扫描商品列表"
      );
      return false;
    }
    const operationId = `scan_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    operationLock = {
      kind: "scan",
      operationId,
      startedAt: Date.now()
    };
    scanProgress = {
      page: 1,
      currentPairs: 0,
      uniquePairs: 0,
      elapsedMs: 0
    };
    renderAll();
    await saveState();
    elements.scanGoodsButton.disabled = true;
    elements.scanGoodsButton.textContent = options.automatic
      ? "自动检索中…"
      : "检索中…";
    const scanConfig = readConfig();
    task.logs.push(
      logEntry(
        "info",
        `商品定位检索开始：方式 商品列表检索，模式 ${
          scanConfig.searchMode === "category" ? "单类目" : "SKU 模糊"
        }，货号 ${scanConfig.skuKeyword || "空"}，类目 ${
          scanConfig.categoryPath || "空"
        }，规格 ${scanConfig.specName || "空"}`
      )
    );
    try {
      const candidates = await getGoodsTabs();
      const errors = [];
      for (const tab of candidates) {
        try {
          return await scanGoodsTab(tab, operationId);
        } catch (error) {
          errors.push(error.message);
        }
      }

      if (candidates.length) {
        throw new Error(
          `已有商品列表页未通过扫描校验：${
            errors.at(-1) || "页面未返回结果"
          }。请刷新当前商品列表后重试，插件不会继续新开页面。`
        );
      }

      const created = await chrome.tabs.create({
        url: "https://agentseller.temu.com/goods/list",
        active: true
      });
      try {
        return await scanGoodsTab(created, operationId);
      } catch (error) {
        errors.push(error.message);
      }
      throw new Error(
        errors.at(-1) ||
          "没有找到可用的正常商品列表标签页"
      );
    } catch (error) {
      task.logs.push(
        logEntry("error", `商品定位检索失败：${error.message}`)
      );
      showToast(error.message);
      return false;
    } finally {
      if (
        operationLock?.kind === "scan" &&
        operationLock.operationId === operationId
      ) {
        operationLock = null;
      }
      scanProgress = null;
      elements.scanGoodsButton.disabled = false;
      elements.scanGoodsButton.textContent = "检索商品列表";
      renderAll();
      await saveState();
    }
  }

  async function scanGoodsTab(tab, operationId) {
    await chrome.tabs.update(tab.id, { active: true });
    await waitForContentKind(tab.id, "goods", 20000);
    const response = await sendTabMessage(tab.id, {
        type: "SCAN_GOODS",
      config: readConfig(),
      operationId
    });
    if (!response?.ok) throw new Error(response?.error || "商品列表读取失败");
    if (
      response.total != null &&
      Number(response.rawCount) !== Number(response.total)
    ) {
      throw new Error(
        `商品数据数量校验失败：平台显示 ${response.total} 条，实际读取 ${response.rawCount} 条`
      );
    }
    pairs = response.pairs || [];
    source = "page";
    cacheMeta = {
      skuKeyword: elements.skuKeyword.value.trim(),
      specName: elements.specName.value.trim(),
      searchMode: elements.searchMode.value,
      categoryPath: elements.categoryPath.value.trim(),
      region: elements.region.value,
      source: "page",
      resultTotal: response.total,
      loadedRows: response.rawCount,
      pageSize: response.pageSize,
      verified: response.verified,
      specFilterApplied: response.specFilterApplied,
      scannedAt: Date.now()
    };
    renderAll();
    await saveState();
    task.logs.push(
      logEntry(
        "success",
        `商品定位检索完成：页面 ${response.pages?.length || 0} 页，平台 ${
          response.total == null ? "数量未知" : `${response.total} 条`
        }，实际读取 ${response.rawCount ?? "-"} 条，缓存 ${
          pairs.length
        } 组 SPU/SKC${
          response.specFilterApplied ? "" : "；商品页无规格筛选框"
        }`
      )
    );
    const baseMessage =
      response.total == null
        ? `已从商品列表缓存 ${pairs.length} 组 SPU / SKC`
        : `数量校验通过：${response.rawCount}/${response.total} 条，去重后 ${pairs.length} 组 SPU / SKC`;
    showToast(
      response.warning ? `${baseMessage}；${response.warning}` : baseMessage
    );
    return true;
  }

  async function autoScanCacheIfNeeded() {
    if (elements.productSource.value === "tableImport") {
      if (!pairs.length) {
        showToast("请先导入商品 ID 表");
        return false;
      }
      return true;
    }
    if (!isCacheStale()) return true;
    showToast("参数已修改，正在自动检索商品列表…");
    const result = await scanGoods({ automatic: true });
    return Boolean(result && !isCacheStale());
  }

  async function getGoodsTabs() {
    const tabs = await chrome.tabs.query({
      url: [
        "https://agentseller.temu.com/goods/list*",
        "https://agentseller-eu.temu.com/goods/list*",
        "https://agentseller-us.temu.com/goods/list*"
      ]
    });
    return tabs.sort(
      (left, right) =>
        Number(right.active) - Number(left.active) ||
        (right.lastAccessed || 0) - (left.lastAccessed || 0)
    );
  }

  async function waitForContentKind(tabId, kind, timeout = 20000) {
    const startedAt = Date.now();
    let lastError = null;
    while (Date.now() - startedAt < timeout) {
      try {
        const response = await sendTabMessage(tabId, { type: "PING" });
        if (response?.ok && response.context?.kind === kind) return response;
      } catch (error) {
        lastError = error;
      }
      await sleep(350);
    }
    throw new Error(lastError?.message || "商品列表页面加载超时");
  }

  function isMissingContentScriptError(error) {
    return /Receiving end does not exist|Could not establish connection/i.test(
      String(error?.message || error || "")
    );
  }

  async function sendTabMessage(tabId, message) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      if (!isMissingContentScriptError(error)) throw error;
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content/content.js"]
        });
        contentScriptRecoverySequence += 1;
        await sleep(300);
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (recoveryError) {
        throw new Error(
          `页面脚本连接断开，自动恢复失败：${recoveryError.message}`
        );
      }
    }
  }

  async function getExecutionTab(region) {
    const tabs = await chrome.tabs.query({
      url: [
        "https://agentseller.temu.com/*",
        "https://agentseller-eu.temu.com/*",
        "https://agentseller-us.temu.com/*"
      ]
    });
    const trafficTabs = tabs.filter((tab) =>
      String(tab.url || "").includes("/main/flux-analysis")
    );
    const existing =
      trafficTabs.find((tab) => tab.active) ||
      trafficTabs.sort(
        (left, right) =>
          (right.lastAccessed || 0) - (left.lastAccessed || 0)
      )[0];
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      await waitForTrafficPage(existing.id);
      return existing;
    }

    const created = await chrome.tabs.create({
      url: trafficAnalysisUrl(region),
      active: true
    });
    await waitForTrafficPage(created.id, 20000);
    return created;
  }

  async function inspectTrafficModal() {
    if (!hasExtensionApi) {
      renderPrices();
      showToast("独立预览模式：已按当前站点价格重算 12 个规格");
      return;
    }
    const tab = await getTargetTab();
    if (!tab) return;
    elements.inspectModalButton.disabled = true;
    elements.inspectModalButton.textContent = "检查中…";
    try {
      const station = currentStation();
      const tierMode = usesTierStrategy();
      const response = await sendTabMessage(tab.id, {
        type: tierMode
          ? "PREVIEW_ACCELERATION_TIERS"
          : "FILL_TRAFFIC_PRICES",
        config: tierMode
          ? {
              accelerationMode: elements.accelerationMode.value,
              tierPrice: station.tierPrice,
              tierStrategy: elements.tierStrategy.value,
              specName: elements.specName.value.trim(),
              targetPrice: station.targetPrice,
              otherPrice: station.otherPrice
            }
          : {
              specName: elements.specName.value.trim(),
              targetPrice: station.targetPrice,
              otherPrice: station.otherPrice,
              guardReferencePrice: true,
              fallbackReferencePrice: false,
              dryRun: elements.dryRun.checked
            }
      });
      if (!response?.ok) throw new Error(response?.error || "价格检查失败");
      renderPrices();
      if (tierMode) {
        showToast(
          response.selected
            ? `匹配第 ${response.selected.index} 档${
                response.usedFallback ? "（按允许规则回退）" : ""
              }，未提交`
            : response.message
        );
      } else {
        showToast(
          response.errors?.length
            ? `已填价，${response.errors.length} 个尺码异常，未提交`
            : "全部尺码通过价格校验"
        );
      }
    } catch (error) {
      showToast(error.message);
    } finally {
      elements.inspectModalButton.disabled = false;
      elements.inspectModalButton.textContent = "检查当前弹窗";
    }
  }

  async function getTargetTab(showError = true) {
    const urls = [
      "https://agentseller.temu.com/*",
      "https://agentseller-eu.temu.com/*",
      "https://agentseller-us.temu.com/*",
      "https://seller.kuajingmaihuo.com/*"
    ];
    let tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
      url: urls
    });
    if (!tabs.length) {
      tabs = await chrome.tabs.query({ url: urls });
      tabs.sort(
        (left, right) =>
          (right.lastAccessed || 0) - (left.lastAccessed || 0)
      );
    }
    const tab = tabs[0];
    if (!tab?.id) {
      if (showError) {
        showToast("请先打开 TEMU Seller Central 商品列表或流量分析");
      }
      return null;
    }
    return tab;
  }

  function hydrateTaskQueue(persistedTaskQueue) {
    return (persistedTaskQueue || []).map((taskItem) => {
      if (!taskItem?.run) return taskItem;
      const rebuilt = makeTaskRun(taskItem);
      const storedItems = Array.isArray(taskItem.run.items)
        ? taskItem.run.items
        : [];
      const storedById = new Map(
        storedItems.filter((item) => item?.id).map((item) => [item.id, item])
      );
      const mergedItems = rebuilt.items.map((item) => ({
        ...item,
        ...(storedById.get(item.id) || {})
      }));
      const rebuiltIds = new Set(mergedItems.map((item) => item.id));
      for (const item of storedItems) {
        if (item?.id && !rebuiltIds.has(item.id)) mergedItems.push(item);
      }
      return {
        ...taskItem,
        run: {
          ...rebuilt,
          ...taskItem.run,
          items: mergedItems,
          groups:
            Array.isArray(taskItem.run.groups) && taskItem.run.groups.length
              ? taskItem.run.groups
              : rebuilt.groups,
          logs: Array.isArray(taskItem.run.logs)
            ? taskItem.run.logs
            : rebuilt.logs
        }
      };
    });
  }

  function shouldPersistRunItem(item) {
    return (
      item.status !== "pending" ||
      Number(item.attempts) > 0 ||
      Boolean(item.submitted) ||
      Boolean(item.retryable) ||
      !["等待执行", "等待继续执行"].includes(item.message)
    );
  }

  function compactTaskQueueForSave(tasks) {
    return (tasks || []).map((taskItem) => {
      if (!taskItem?.run) return taskItem;
      return {
        ...taskItem,
        run: {
          ...taskItem.run,
          items: (taskItem.run.items || []).filter(shouldPersistRunItem),
          logs: (taskItem.run.logs || []).slice(-1000)
        }
      };
    });
  }

  function buildStateForSave() {
    const state = {
      config: readConfig(),
      stations,
      pairs,
      cacheMeta,
      storeBinding,
      taskQueue: compactTaskQueueForSave(taskQueue),
      queueState: {
        ...queueState,
        logs: (queueState.logs || []).slice(-500)
      },
      operationLock,
      importDiagnostics,
      logs: (task.logs || []).slice(-1000)
    };
    return state;
  }

  async function flushStateSave() {
    if (stateSaveInFlight) await stateSaveInFlight;
    if (!stateSaveDirty) return;
    stateSaveDirty = false;
    const state = buildStateForSave();
    stateSaveInFlight = (async () => {
      if (hasExtensionApi) {
        await chrome.runtime
          .sendMessage({ type: "SAVE_APP_STATE", state })
          .catch((error) => console.warn(error));
      } else {
        localStorage.setItem("traffic_spec_demo_v3", JSON.stringify(state));
      }
    })();
    try {
      await stateSaveInFlight;
    } finally {
      stateSaveInFlight = null;
    }
  }

  function saveState(options = {}) {
    stateSaveDirty = true;
    if (options.immediate) {
      if (stateSaveTimer) {
        clearTimeout(stateSaveTimer);
        stateSaveTimer = null;
      }
      return flushStateSave();
    }
    if (stateSaveTimer) return Promise.resolve();
    stateSaveTimer = setTimeout(() => {
      stateSaveTimer = null;
      void flushStateSave();
    }, 500);
    return Promise.resolve();
  }

  function exportCsv() {
    const rows = [
      ["任务", "商品", "站点", "站点代码", "区域", "状态", "尝试次数", "说明"],
      ...taskQueue.flatMap((taskItem) =>
        (taskItem.run?.items || []).map((item) => [
          taskItem.name,
          item.spu || item.skc,
          item.station,
          item.code,
          regionLabel(item.region),
          item.status,
          item.attempts,
          item.message
        ])
      )
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `指定规格流量加速结果_${dateStamp()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("执行结果已导出");
  }

  function regionLabel(region) {
    return region === "us" ? "美国区" : region === "eu" ? "欧洲区" : "全球";
  }

  function isCacheStale() {
    if (!cacheMeta) return false;
    if (elements.productSource.value === "tableImport") {
      return false;
    }
    if (cacheMeta.source === "import") return true;
    if (cacheMeta.source === "page" && cacheMeta.verified !== true) return true;
    const cachedSearchMode = cacheMeta.searchMode || "sku";
    return (
      String(cacheMeta.skuKeyword || "").trim() !==
        elements.skuKeyword.value.trim() ||
      String(cacheMeta.specName || "").trim() !==
        elements.specName.value.trim() ||
      cachedSearchMode !== elements.searchMode.value ||
      (cachedSearchMode === "category" &&
        String(cacheMeta.categoryPath || "").trim() !==
          elements.categoryPath.value.trim())
    );
  }

  function validateSearchConfig() {
    if (elements.productSource.value === "tableImport") {
      if (!pairs.length) {
        showToast("请先导入 SPU ID 或 SKC ID 表格");
        return false;
      }
      return true;
    }
    const mode = elements.searchMode.value;
    if (mode === "sku" && !elements.skuKeyword.value.trim()) {
      showToast("SKU 模糊查询模式需要填写货号关键词 X");
      return false;
    }
    if (mode === "category" && !elements.categoryPath.value.trim()) {
      showToast("类目检索模式需要填写商品类目");
      return false;
    }
    return true;
  }

  function validateAccelerationConfig() {
    if (isPriceTierMode()) {
      const missing = enabledStations().filter(
        (station) => !hasPrice(station.tierPrice)
      );
      if (!missing.length) return true;
      showToast(
        `自动档位匹配缺少目标价：${missing
          .slice(0, 3)
          .map((station) => station.station)
          .join("、")}${missing.length > 3 ? "等" : ""}`
      );
      return false;
    }
    if (isHybridMode()) {
      const hasSpec = Boolean(elements.specName.value.trim());
      const missing = enabledStations().filter(
        (station) =>
          !hasPrice(station.otherPrice) ||
          (hasSpec && !hasPrice(station.targetPrice))
      );
      if (!missing.length) return true;
      showToast(
        `让价优先模式缺少价格：${missing
          .slice(0, 3)
          .map((station) => station.station)
          .join("、")}${missing.length > 3 ? "等" : ""}`
      );
      return false;
    }
    return true;
  }

  function statusLabel(status) {
    return {
      pending: "待处理",
      running: "执行中",
      success: "成功",
      exception: "配置异常",
      failed: "失败（可重试）"
    }[status] || status;
  }

  function statusIcon(status) {
    return { pending: "○", running: "…", success: "✓", exception: "!", failed: "×" }[
      status
    ] || "○";
  }

  function logEntry(level, message) {
    return { at: Date.now(), level, message };
  }

  function emptyToNull(value) {
    return value === "" || value == null ? null : Number(value);
  }

  function hasPrice(value) {
    return (
      value !== null &&
      value !== "" &&
      Number.isFinite(Number(value))
    );
  }

  function parsePriceValue(value) {
    const normalized = String(value ?? "")
      .replace(/rmb|cny|元/gi, "")
      .replace(/[,\s¥￥]/g, "");
    if (!normalized) return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  function formatMoney(value) {
    return `¥${Number(value || 0).toFixed(2)}`;
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function dateStamp() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
      date.getDate()
    )}_${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 3200);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
