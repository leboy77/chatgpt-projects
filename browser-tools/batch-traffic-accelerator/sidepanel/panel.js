(() => {
  const DEMO_PRODUCTS = [
    {
      id: "601104436953141:BM-QZ-104",
      productId: "601104436953141",
      sku: "BM-QZ-104",
      title: "Men's lightweight quarter zip fleece pullover",
      exposure: 1680,
      visits: 124,
      conversion: 2.8,
      currentPrice: 39.9,
      cost: 22.4,
      stock: 84,
      rank: 1,
      active: false
    },
    {
      id: "601099950063201:BM-QZ-117",
      productId: "601099950063201",
      sku: "BM-QZ-117",
      title: "Men's thermal quarter zip fleece sweatshirt",
      exposure: 2360,
      visits: 184,
      conversion: 3.4,
      currentPrice: 44.5,
      cost: 25.8,
      stock: 126,
      rank: 2,
      active: false
    },
    {
      id: "601099549132387:BM-QZ-128",
      productId: "601099549132387",
      sku: "BM-QZ-128",
      title: "Men's half zip polar fleece pullover long sleeve",
      exposure: 980,
      visits: 72,
      conversion: 2.1,
      currentPrice: 36.8,
      cost: 19.6,
      stock: 63,
      rank: 3,
      active: false
    },
    {
      id: "601099697878066:BM-QZ-136",
      productId: "601099697878066",
      sku: "BM-QZ-136",
      title: "Men's quarter zip mock neck sweatshirt",
      exposure: 520,
      visits: 31,
      conversion: 1.5,
      currentPrice: 42.2,
      cost: 27.3,
      stock: 18,
      rank: 4,
      active: false
    },
    {
      id: "601104498704277:BM-QZ-142",
      productId: "601104498704277",
      sku: "BM-QZ-142",
      title: "Men's half zip polar fleece pullover",
      exposure: 1160,
      visits: 87,
      conversion: 2.5,
      currentPrice: 38.6,
      cost: 20.1,
      stock: 45,
      rank: 5,
      active: true
    },
    {
      id: "601099774591230:BM-QZ-153",
      productId: "601099774591230",
      sku: "BM-QZ-153",
      title: "Men's quarter zip stand collar fleece sweatshirt",
      exposure: 840,
      visits: 59,
      conversion: 2.2,
      currentPrice: 41.8,
      cost: 23.5,
      stock: 73,
      rank: 6,
      active: false
    },
    {
      id: "601103555721984:BM-QZ-159",
      productId: "601103555721984",
      sku: "BM-QZ-159",
      title: "Men's fuzzy fleece half zip sweatshirt",
      exposure: 2900,
      visits: 233,
      conversion: 4.1,
      currentPrice: 49.9,
      cost: 32.1,
      stock: 91,
      rank: 7,
      active: false
    },
    {
      id: "601102075123694:BM-QZ-163",
      productId: "601102075123694",
      sku: "BM-QZ-163",
      title: "Men's quarter zip pullover sweatshirt long sleeve",
      exposure: 470,
      visits: 29,
      conversion: 1.1,
      currentPrice: 34.9,
      cost: 19.5,
      stock: 0,
      rank: 8,
      active: false
    },
    {
      id: "601099540586484:BM-QZ-171",
      productId: "601099540586484",
      sku: "BM-QZ-171",
      title: "Men's thermal half zip sweatshirt thick fleece",
      exposure: 730,
      visits: 51,
      conversion: 1.8,
      currentPrice: 45.2,
      cost: 28.9,
      stock: 52,
      rank: 9,
      active: false
    },
    {
      id: "601104638048054:BM-QZ-184",
      productId: "601104638048054",
      sku: "BM-QZ-184",
      title: "Men's casual fleece quarter zip jacket",
      exposure: 1540,
      visits: 118,
      conversion: 2.9,
      currentPrice: 51.8,
      cost: 31.2,
      stock: 120,
      rank: 10,
      active: false
    },
    {
      id: "601099742696050:BM-QZ-196",
      productId: "601099742696050",
      sku: "BM-QZ-196",
      title: "Men's soft fleece zip neck sweater",
      exposure: 2100,
      visits: 146,
      conversion: 2.3,
      currentPrice: 67.5,
      cost: 39.8,
      stock: 48,
      rank: 11,
      active: false
    },
    {
      id: "601103785362194:BM-QZ-204",
      productId: "601103785362194",
      sku: "BM-QZ-204",
      title: "Men's lightweight hiking quarter zip sweatshirt",
      exposure: 380,
      visits: 19,
      conversion: 0.8,
      currentPrice: 35.5,
      cost: 20.4,
      stock: 32,
      rank: 12,
      active: false
    },
    {
      id: "601104174778877:BM-QZ-217",
      productId: "601104174778877",
      sku: "BM-QZ-217",
      title: "Men's fleece lined zip sweatshirt jacket",
      exposure: 1920,
      visits: 150,
      conversion: 3.2,
      currentPrice: 47.6,
      cost: 26.7,
      stock: 88,
      rank: 13,
      active: false
    },
    {
      id: "601099996537552:BM-QZ-226",
      productId: "601099996537552",
      sku: "BM-QZ-226",
      title: "Men's half zip winter fleece pullover",
      exposure: 650,
      visits: 42,
      conversion: 1.6,
      currentPrice: 43.3,
      cost: 25.1,
      stock: 41,
      rank: 14,
      active: false
    },
    {
      id: "601104398886084:BM-QZ-237",
      productId: "601104398886084",
      sku: "BM-QZ-237",
      title: "Men's casual polar fleece stand collar pullover",
      exposure: 890,
      visits: 64,
      conversion: 1.9,
      currentPrice: 89.9,
      cost: 51.2,
      stock: 33,
      rank: 15,
      active: false
    },
    {
      id: "601099803158132:BM-QZ-249",
      productId: "601099803158132",
      sku: "BM-QZ-249",
      title: "Men's fluffy fleece half zip outdoor sweatshirt",
      exposure: 1440,
      visits: 104,
      conversion: 2.7,
      currentPrice: 40.9,
      cost: 21.8,
      stock: 62,
      rank: 16,
      active: false
    },
    {
      id: "601104785252756:BM-QZ-258",
      productId: "601104785252756",
      sku: "BM-QZ-258",
      title: "Men's warm quarter zip fleece winter top",
      exposure: 1210,
      visits: 93,
      conversion: 2.4,
      currentPrice: 46.7,
      cost: 34.6,
      stock: 27,
      rank: 17,
      active: false
    },
    {
      id: "601104024003386:BM-QZ-263",
      productId: "601104024003386",
      sku: "BM-QZ-263",
      title: "Men's breathable quarter zip fleece sports top",
      exposure: 1770,
      visits: 132,
      conversion: 3.0,
      currentPrice: 37.9,
      cost: 20.7,
      stock: 104,
      rank: 18,
      active: false
    }
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const hasExtensionApi = Boolean(globalThis.chrome?.runtime?.id);

  const elements = {
    tabs: $$(".step-tab"),
    panels: $$(".tab-panel"),
    preset: $("#preset"),
    discountRate: $("#discountRate"),
    batchSize: $("#batchSize"),
    keyword: $("#keyword"),
    minExposure: $("#minExposure"),
    minMargin: $("#minMargin"),
    maxPrice: $("#maxPrice"),
    minConversion: $("#minConversion"),
    excludeActive: $("#excludeActive"),
    excludeOutOfStock: $("#excludeOutOfStock"),
    previewCount: $("#previewCount"),
    hitCount: $("#hitCount"),
    excludedCount: $("#excludedCount"),
    averageMargin: $("#averageMargin"),
    totalDiscount: $("#totalDiscount"),
    productList: $("#productList"),
    primaryButton: $("#primaryButton"),
    actionHint: $("#actionHint"),
    actionCount: $("#actionCount"),
    refreshButton: $("#refreshButton"),
    sourceLabel: $("#sourceLabel"),
    pageState: $("#pageState"),
    toast: $("#toast"),
    runEmpty: $("#runEmpty"),
    runActive: $("#runActive"),
    runStatusEyebrow: $("#runStatusEyebrow"),
    runTitle: $("#runTitle"),
    runPercent: $("#runPercent"),
    runProgress: $("#runProgress"),
    processedCount: $("#processedCount"),
    successCount: $("#successCount"),
    failedCount: $("#failedCount"),
    skippedCount: $("#skippedCount"),
    runMessage: $("#runMessage"),
    resultList: $("#resultList"),
    exportButton: $("#exportButton")
  };

  let activeTab = "config";
  let previewFilter = "included";
  let source = "demo";
  let products = DEMO_PRODUCTS.map(normalizeDemoProduct);
  let evaluatedProducts = [];
  let runState = emptyRunState();
  let toastTimer = null;

  bindEvents();
  restoreRunState();
  recalculate();
  listenForRunUpdates();

  function bindEvents() {
    elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    $$("[data-go-tab]").forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.goTab));
    });

    [
      elements.discountRate,
      elements.batchSize,
      elements.keyword,
      elements.minExposure,
      elements.minMargin,
      elements.maxPrice,
      elements.minConversion,
      elements.excludeActive,
      elements.excludeOutOfStock
    ].forEach((input) => {
      input.addEventListener("input", () => {
        if (input === elements.keyword) return recalculate();
        recalculate();
      });
      input.addEventListener("change", recalculate);
    });

    elements.preset.addEventListener("change", applyPreset);
    elements.refreshButton.addEventListener("click", syncPage);
    elements.primaryButton.addEventListener("click", handlePrimaryAction);
    elements.exportButton.addEventListener("click", exportCsv);

    $$(".mini-filter").forEach((button) => {
      button.addEventListener("click", () => {
        previewFilter = button.dataset.filter;
        $$(".mini-filter").forEach((item) => item.classList.toggle("is-active", item === button));
        renderPreviewList();
      });
    });
  }

  function normalizeDemoProduct(item) {
    return {
      ...item,
      source: "demo",
      status: item.active ? "加速中" : "待加速"
    };
  }

  function readConfig() {
    return {
      preset: elements.preset.value,
      discountRate: Number(elements.discountRate.value) || 0,
      batchSize: Number(elements.batchSize.value) || 5,
      keyword: elements.keyword.value.trim().toLowerCase(),
      minExposure: Number(elements.minExposure.value) || 0,
      minMargin: Number(elements.minMargin.value) || 0,
      maxPrice: Number(elements.maxPrice.value) || Number.MAX_SAFE_INTEGER,
      minConversion: Number(elements.minConversion.value) || 0,
      excludeActive: elements.excludeActive.checked,
      excludeOutOfStock: elements.excludeOutOfStock.checked,
      intervalMs: 340
    };
  }

  function applyPreset() {
    const preset = elements.preset.value;
    if (preset === "balanced") {
      setInput(elements.discountRate, 8);
      setInput(elements.batchSize, 5);
      setInput(elements.minExposure, 300);
      setInput(elements.minMargin, 18);
      setInput(elements.maxPrice, 80);
      setInput(elements.minConversion, 1.2);
      elements.excludeActive.checked = true;
      elements.excludeOutOfStock.checked = true;
    }
    if (preset === "clearance") {
      setInput(elements.discountRate, 15);
      setInput(elements.batchSize, 10);
      setInput(elements.minExposure, 100);
      setInput(elements.minMargin, 5);
      setInput(elements.maxPrice, 120);
      setInput(elements.minConversion, 0.5);
      elements.excludeActive.checked = true;
      elements.excludeOutOfStock.checked = true;
    }
    recalculate();
  }

  function setInput(input, value) {
    input.value = String(value);
  }

  function recalculate() {
    const config = readConfig();
    evaluatedProducts = products.map((product) => evaluateProduct(product, config));
    const included = evaluatedProducts.filter((item) => item.included);
    const excluded = evaluatedProducts.filter((item) => !item.included);
    const averageMargin =
      included.length === 0
        ? 0
        : included.reduce((sum, item) => sum + item.projectedMargin, 0) / included.length;
    const totalDiscount = included.reduce(
      (sum, item) => sum + (item.currentPrice - item.projectedPrice),
      0
    );

    elements.previewCount.textContent = String(included.length);
    elements.hitCount.textContent = String(included.length);
    elements.excludedCount.textContent = String(excluded.length);
    elements.averageMargin.textContent = `${averageMargin.toFixed(1)}%`;
    elements.totalDiscount.textContent = formatMoney(totalDiscount);

    if (activeTab !== "result") {
      elements.actionHint.textContent =
        activeTab === "preview" ? "已生成预演，确认后开始模拟执行" : "按当前规则生成预演";
      elements.actionCount.textContent = `${included.length} 个命中商品`;
    }

    renderPreviewList();
    updatePrimaryButton();
  }

  function evaluateProduct(product, config) {
    const currentPrice = Number(product.currentPrice || 0);
    const cost = Number(product.cost || 0);
    const projectedPrice = roundMoney(currentPrice * (1 - config.discountRate / 100));
    const projectedMargin = projectedPrice > 0 ? ((projectedPrice - cost) / projectedPrice) * 100 : 0;
    const searchText = `${product.title} ${product.sku} ${product.productId}`.toLowerCase();
    let reason = "";

    if (config.keyword && !searchText.includes(config.keyword)) reason = "不匹配搜索词";
    else if (Number(product.exposure || 0) < config.minExposure) reason = "曝光不足";
    else if (Number(product.conversion || 0) < config.minConversion) reason = "转化率偏低";
    else if (cost <= 0) reason = "缺少成本";
    else if (currentPrice <= 0) reason = "售价缺失";
    else if (currentPrice > config.maxPrice) reason = "超过售价上限";
    else if (config.excludeActive && product.active) reason = "正在加速";
    else if (config.excludeOutOfStock && Number(product.stock || 0) <= 0) reason = "无库存";
    else if (projectedMargin < config.minMargin) reason = "预计毛利不足";

    return {
      ...product,
      currentPrice,
      projectedPrice,
      projectedMargin,
      included: !reason,
      reason: reason || "符合规则"
    };
  }

  function renderPreviewList() {
    const config = readConfig();
    const sourceList =
      previewFilter === "included"
        ? evaluatedProducts.filter((item) => item.included)
        : evaluatedProducts;
    const sorted = [...sourceList].sort((a, b) => {
      if (a.included !== b.included) return a.included ? -1 : 1;
      return b.projectedMargin - a.projectedMargin;
    });

    if (sorted.length === 0) {
      elements.productList.innerHTML = `
        <div class="run-empty">
          <span class="run-empty-icon">⌕</span>
          <h2>没有命中商品</h2>
          <p>请降低毛利或曝光要求，也可以切换到“全部”查看被排除原因。</p>
        </div>
      `;
      return;
    }

    elements.productList.innerHTML = sorted
      .slice(0, 60)
      .map((item) => {
        const thumb = escapeHtml(item.sku.slice(-3));
        const reason = item.included
          ? `毛利 ${item.projectedMargin.toFixed(1)}%`
          : item.reason;
        return `
          <article class="product-row ${item.included ? "" : "is-excluded"}">
            <div class="product-thumb">${thumb}</div>
            <div class="product-main">
              <div class="product-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
              <div class="product-meta">
                <span>${escapeHtml(item.sku)}</span>
                <i></i>
                <span>曝光 ${formatNumber(item.exposure)}</span>
                <i></i>
                <span>转化 ${Number(item.conversion || 0).toFixed(1)}%</span>
              </div>
            </div>
            <div class="product-side">
              <span class="product-price"><s>${formatMoney(item.currentPrice)}</s>${formatMoney(item.projectedPrice)}</span>
              <span class="${item.included ? "status-chip" : "reason-chip"}">${escapeHtml(reason)}</span>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function switchTab(tabName) {
    activeTab = tabName;
    elements.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
    elements.panels.forEach((panel) =>
      panel.classList.toggle("is-active", panel.dataset.panel === tabName)
    );
    updatePrimaryButton();

    if (tabName === "preview") {
      elements.actionHint.textContent = "预演不会修改真实价格";
      elements.actionCount.textContent = `${
        evaluatedProducts.filter((item) => item.included).length
      } 个命中商品`;
    } else if (tabName === "result") {
      renderRunState();
    } else {
      recalculate();
    }
  }

  function updatePrimaryButton() {
    elements.primaryButton.classList.remove("danger");
    elements.primaryButton.disabled = false;

    if (activeTab === "config") {
      elements.primaryButton.innerHTML = "生成预演 <span>→</span>";
      return;
    }

    if (activeTab === "preview") {
      const count = evaluatedProducts.filter((item) => item.included).length;
      elements.primaryButton.innerHTML = `开始演示 <span>(${count})</span>`;
      elements.primaryButton.disabled = count === 0;
      return;
    }

    if (runState.status === "running" || runState.status === "stopping") {
      elements.primaryButton.classList.add("danger");
      elements.primaryButton.innerHTML = "停止任务";
      return;
    }

    elements.primaryButton.innerHTML = "新建演示";
  }

  async function handlePrimaryAction() {
    if (activeTab === "config") {
      switchTab("preview");
      showToast("预演已生成，请检查命中商品和预计毛利");
      return;
    }

    if (activeTab === "preview") {
      const included = evaluatedProducts.filter((item) => item.included);
      if (included.length === 0) return;
      await startRun(included);
      switchTab("result");
      return;
    }

    if (runState.status === "running" || runState.status === "stopping") {
      await stopRun();
      return;
    }

    await resetRun();
    switchTab("config");
  }

  async function startRun(items) {
    const config = readConfig();
    const payload = {
      config,
      items: items.map((item) => ({
        id: item.id,
        sku: item.sku,
        productId: item.productId,
        title: item.title,
        currentPrice: item.currentPrice,
        projectedPrice: item.projectedPrice,
        projectedMargin: Number(item.projectedMargin.toFixed(2)),
        stock: item.stock,
        rank: item.rank
      }))
    };

    elements.primaryButton.disabled = true;
    try {
      if (hasExtensionApi) {
        const response = await chrome.runtime.sendMessage({
          type: "START_DEMO_RUN",
          payload
        });
        if (!response?.ok) throw new Error(response?.error || "无法启动演示");
        runState = response.state;
      } else {
        runState = createLocalRun(payload);
        runLocalDemo();
      }
      renderRunState();
      showToast("模拟任务已启动，页面关闭也不会产生真实提交");
    } catch (error) {
      showToast(error.message);
    } finally {
      elements.primaryButton.disabled = false;
      updatePrimaryButton();
    }
  }

  async function stopRun() {
    elements.primaryButton.disabled = true;
    try {
      if (hasExtensionApi) {
        const response = await chrome.runtime.sendMessage({ type: "STOP_DEMO_RUN" });
        if (response?.ok) runState = response.state;
      } else {
        runState.stopRequested = true;
        runState.status = "stopping";
      }
      renderRunState();
      showToast("停止指令已发送，将在当前商品处理完后生效");
    } finally {
      elements.primaryButton.disabled = false;
      updatePrimaryButton();
    }
  }

  async function resetRun() {
    if (hasExtensionApi) {
      const response = await chrome.runtime.sendMessage({ type: "RESET_DEMO_RUN" });
      if (response?.ok) runState = response.state;
    } else {
      runState = emptyRunState();
    }
    renderRunState();
  }

  async function restoreRunState() {
    if (hasExtensionApi) {
      try {
        const response = await chrome.runtime.sendMessage({ type: "GET_RUN_STATE" });
        if (response?.ok) runState = response.state;
      } catch (error) {
        console.warn("无法恢复运行状态", error);
      }
    } else {
      const cached = localStorage.getItem("traffic_demo_run");
      if (cached) {
        try {
          runState = JSON.parse(cached);
        } catch (error) {
          console.warn("无法解析本地演示状态", error);
        }
      }
    }
    renderRunState();
    updatePrimaryButton();
  }

  function listenForRunUpdates() {
    if (!hasExtensionApi) return;
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type !== "RUN_STATE") return;
      runState = message.state;
      renderRunState();
      updatePrimaryButton();
    });
  }

  function emptyRunState() {
    return {
      id: null,
      status: "idle",
      startedAt: null,
      finishedAt: null,
      stopRequested: false,
      config: null,
      summary: { total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0 },
      items: [],
      logs: []
    };
  }

  function createLocalRun(payload) {
    return {
      id: `local-${Date.now()}`,
      status: "running",
      startedAt: Date.now(),
      finishedAt: null,
      stopRequested: false,
      config: payload.config,
      summary: {
        total: payload.items.length,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0
      },
      items: payload.items.map((item, index) => ({
        ...item,
        order: index + 1,
        runStatus: "queued",
        resultMessage: "等待执行",
        processedAt: null
      })),
      logs: []
    };
  }

  async function runLocalDemo() {
    const state = runState;
    for (const item of state.items) {
      if (state.stopRequested) {
        item.runStatus = "skipped";
        item.resultMessage = "任务已停止";
        state.summary.skipped += 1;
        state.summary.processed += 1;
      } else {
        item.runStatus = "submitting";
        item.resultMessage = "正在提交价格增长";
        persistLocalState();
        renderRunState();
        await sleep(340);

        const shouldFail =
          item.projectedMargin < 0 ||
          (Number(item.stock || 0) > 0 && Number(item.rank || 0) % 9 === 0);
        item.runStatus = shouldFail ? "failed" : "succeeded";
        item.resultMessage = shouldFail
          ? "演示失败：价格不在可申报区间"
          : `已按 ${formatMoney(item.projectedPrice)} 提交`;
        item.processedAt = Date.now();
        state.summary.processed += 1;
        state.summary[shouldFail ? "failed" : "succeeded"] += 1;
      }
      persistLocalState();
      renderRunState();
    }
    state.status = state.stopRequested ? "stopped" : "completed";
    state.finishedAt = Date.now();
    persistLocalState();
    renderRunState();
    updatePrimaryButton();
  }

  function persistLocalState() {
    try {
      localStorage.setItem("traffic_demo_run", JSON.stringify(runState));
    } catch (error) {
      console.warn(error);
    }
  }

  function renderRunState() {
    const hasRun = runState.status !== "idle" && runState.items?.length > 0;
    elements.runEmpty.classList.toggle("is-hidden", hasRun);
    elements.runActive.classList.toggle("is-hidden", !hasRun);
    if (!hasRun) {
      elements.resultList.innerHTML = "";
      return;
    }

    const total = runState.summary.total || runState.items.length || 1;
    const percent = Math.round(((runState.summary.processed || 0) / total) * 100);
    const labels = {
      running: "正在执行",
      stopping: "正在停止",
      stopped: "已停止",
      completed: "执行完成",
      error: "执行异常"
    };

    elements.runStatusEyebrow.textContent = labels[runState.status] || "任务记录";
    elements.runTitle.textContent =
      runState.status === "completed" ? "本次演示已完成" : "演示加速任务";
    elements.runPercent.textContent = `${percent}%`;
    elements.runProgress.style.width = `${percent}%`;
    elements.processedCount.textContent = String(runState.summary.processed || 0);
    elements.successCount.textContent = String(runState.summary.succeeded || 0);
    elements.failedCount.textContent = String(runState.summary.failed || 0);
    elements.skippedCount.textContent = String(runState.summary.skipped || 0);
    elements.runMessage.textContent = getRunMessage(runState);

    elements.resultList.innerHTML = runState.items
      .map((item) => {
        const status = statusMeta(item.runStatus);
        return `
          <article class="result-row">
            <span class="result-index">${String(item.order).padStart(2, "0")}</span>
            <div class="result-main">
              <strong title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.sku)} · ${formatMoney(item.projectedPrice)} · ${escapeHtml(
                item.resultMessage
              )}</small>
            </div>
            <span class="status-chip ${status.className}">${status.label}</span>
          </article>
        `;
      })
      .join("");

    updatePrimaryButton();
  }

  function getRunMessage(state) {
    if (state.status === "running") {
      return `正在处理第 ${Math.min(state.summary.processed + 1, state.summary.total)} 个商品，预计每项约 0.34 秒`;
    }
    if (state.status === "stopping") return "停止指令已收到，当前商品处理完后终止";
    if (state.status === "completed") {
      return `演示执行完成：成功 ${state.summary.succeeded}，失败 ${state.summary.failed}`;
    }
    if (state.status === "stopped") return "任务已停止，未处理的商品保持队列状态";
    if (state.status === "error") return "演示任务异常结束";
    return "正在等待页面执行结果";
  }

  function statusMeta(status) {
    const map = {
      queued: { label: "待执行", className: "" },
      submitting: { label: "提交中", className: "processing" },
      succeeded: { label: "已成功", className: "" },
      failed: { label: "失败", className: "failed" },
      skipped: { label: "已跳过", className: "" }
    };
    return map[status] || map.queued;
  }

  async function syncPage() {
    if (!hasExtensionApi) {
      showToast("当前是独立预览模式；加载扩展后可尝试读取 TEMU 页面表格");
      return;
    }

    elements.refreshButton.disabled = true;
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
        url: [
          "https://agentseller.temu.com/*",
          "https://agentseller-eu.temu.com/*",
          "https://seller.kuajingmaihuo.com/*",
          "https://allinone.uban360.com/*"
        ]
      });
      const tab = tabs[0];
      if (!tab?.id) {
        elements.pageState.textContent = "当前标签页不在 TEMU 后台";
        showToast("请先打开 TEMU 经营分析 → 流量分析页面");
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { type: "SCAN_PAGE" });
      if (!response?.ok) throw new Error("页面扫描失败");
      elements.pageState.textContent = response.context.isTrafficAnalysis
        ? `已识别流量分析页 · ${response.products.length} 行`
        : `已连接页面 · 未识别流量分析`;

      if (response.products.length > 0) {
        products = response.products.map((item, index) => ({
          ...item,
          rank: index + 1,
          conversion: Number(item.conversion || 0),
          currentPrice: Number(item.currentPrice || 0),
          cost: 0,
          stock: Number(item.stock || 0),
          active: Boolean(item.active)
        }));
        source = "page";
        elements.sourceLabel.textContent = `页面读取 ${products.length} 行`;
        recalculate();
        showToast(
          `读取到 ${products.length} 行页面数据。Demo 尚未自动补全成本和可申报价，请先核对。`
        );
      } else {
        showToast("没有识别到商品表格，继续使用内置演示数据");
      }
    } catch (error) {
      elements.pageState.textContent = "页面连接失败";
      showToast(`${error.message}；请刷新目标页面后重试`);
    } finally {
      elements.refreshButton.disabled = false;
    }
  }

  function exportCsv() {
    if (!runState.items?.length) {
      showToast("还没有可导出的执行记录");
      return;
    }

    const rows = [
      ["序号", "商品", "SKU", "原价", "预演价", "预计毛利", "状态", "结果"],
      ...runState.items.map((item) => [
        item.order,
        item.title,
        item.sku,
        item.currentPrice,
        item.projectedPrice,
        item.projectedMargin,
        item.runStatus,
        item.resultMessage
      ])
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `流量加速预演_${dateStamp()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("执行记录已导出");
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 3200);
  }

  function formatMoney(value) {
    return `¥${Number(value || 0).toFixed(2)}`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN").format(Number(value || 0));
  }

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function dateStamp() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
      date.getHours()
    )}${pad(date.getMinutes())}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
})();
