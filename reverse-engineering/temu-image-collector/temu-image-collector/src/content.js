(() => {
  "use strict";

  const pagePath = location.pathname.toLowerCase();
  const supportedPage =
    /\/(?:mall|search_result|goods)\.html$/.test(pagePath) ||
    /-g-\d+\.html$/.test(pagePath);
  if (/\/(?:login\.html|bgn_[^/]+\.html)$/.test(pagePath)) {
    chrome.storage.local.get({ tecActiveJob: null }, ({ tecActiveJob }) => {
      if (!tecActiveJob || tecActiveJob.status !== "running") return;
      tecActiveJob.status = "paused";
      tecActiveJob.pauseReason =
        "检测到 Temu 登录或安全验证，已完成进度已保存；验证后回到 Temu 页面点击“继续采集”";
      tecActiveJob.pausedAt = new Date().toISOString();
      chrome.storage.local.set({ tecActiveJob });
    });
    return;
  }
  if (!supportedPage) return;

  if (globalThis.__TEC_TEMU_IMAGE_COLLECTOR__) return;
  globalThis.__TEC_TEMU_IMAGE_COLLECTOR__ = true;

  const PANEL_ID = "tec-panel";
  const PANEL_POSITION_KEY = "tecPanelPosition";
  const IMAGE_FOLDER = "图片";
  const CARD_SELECTOR = '[data-tooltip^="goodContainer-"]';
  const CARD_IMAGE_SELECTOR =
    "img.goods-img-external,.goods-img-external img,img[data-cui-image]";
  const GOODS_LIST_SELECTOR = ".js-goods-list";
  const RECOMMENDATION_HEADINGS = new Set(
    [
      "top picks for you",
      "top picks",
      "recommended for you",
      "recommendations for you",
      "for you",
      "为你推荐",
      "猜你喜欢",
      "推荐商品",
    ].map((value) => value.toLocaleLowerCase()),
  );
  const QUICK_LOOK_TEXT = /^(quick\s*look|快速查看)$/i;
  const MODE_META = {
    simple: { label: "简单采集", description: "读取每张商品卡片的当前首图" },
    colors: { label: "多首图采集", description: "按色值读取每个色值的首图" },
    full: { label: "完整采集", description: "按色值读取全部轮播图" },
  };

  const state = {
    selected: new Map(),
    cards: new WeakMap(),
    running: false,
    abortController: null,
    pausedJob: null,
    collectTitle: true,
    lastHref: location.href,
    lastLog: "",
    excludedCount: 0,
    excludedReasonCounts: { recommendation: 0, advertisement: 0 },
    excludedProductIds: new Set(),
  };

  const sleep = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  function isAntiBotUrl(url = location.href) {
    return /\/(?:login\.html|bgn_[^/]+\.html)/i.test(String(url || ""));
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get({ [key]: null }, (values) => {
        resolve(values?.[key] || null);
      });
    });
  }

  function storageSet(values) {
    return new Promise((resolve) => {
      chrome.storage.local.set(values, () => resolve());
    });
  }

  async function saveActiveJob(job) {
    job.updatedAt = new Date().toISOString();
    state.pausedJob = job;
    await storageSet({ tecActiveJob: job });
  }

  async function clearActiveJob() {
    state.pausedJob = null;
    await storageSet({ tecActiveJob: null });
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function makeTimestamp(date = new Date()) {
    const datePart = [
      date.getFullYear(),
      pad2(date.getMonth() + 1),
      pad2(date.getDate()),
    ].join("-");
    const timePart = [
      pad2(date.getHours()),
      pad2(date.getMinutes()),
      pad2(date.getSeconds()),
    ].join("-");
    return {
      folder: `${datePart}_${timePart}`,
      iso: date.toISOString(),
      local: `${datePart} ${timePart.replace(/-/g, ":")}`,
    };
  }

  function safeSegment(value, fallback, maxLength = 80) {
    const safe = normalizeText(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/[. ]+$/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLength);
    return safe || fallback;
  }

  function isVisible(element, minimumWidth = 0, minimumHeight = 0) {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < minimumWidth || rect.height < minimumHeight) return false;
    const style = getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0
    );
  }

  function findRecommendationSections() {
    const sections = new Set();
    for (const section of document.querySelectorAll(GOODS_LIST_SELECTOR)) {
      const hasRecommendationHeading = [...section.children].some((child) => {
        if (child.querySelector(CARD_SELECTOR)) return false;
        return RECOMMENDATION_HEADINGS.has(
          normalizeText(child.textContent).toLocaleLowerCase(),
        );
      });
      if (hasRecommendationHeading) sections.add(section);
    }
    return sections;
  }

  function hasAdvertisementBadge(card) {
    return [...card.querySelectorAll("div,span")].some((element) => {
      if (normalizeText(element.textContent).toUpperCase() !== "AD") {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return (
        rect.width >= 8 &&
        rect.width <= 80 &&
        rect.height >= 8 &&
        rect.height <= 60
      );
    });
  }

  function productCardExclusion(card, recommendationSections) {
    const section = card.closest(GOODS_LIST_SELECTOR);
    if (
      section &&
      recommendationSections.has(section) &&
      section.querySelectorAll(CARD_SELECTOR).length
    ) {
      return "recommendation";
    }
    return hasAdvertisementBadge(card) ? "advertisement" : "";
  }

  function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }

  function stripImageQuery(value) {
    if (!isHttpUrl(value)) return "";
    try {
      const url = new URL(value, location.href);
      url.search = "";
      url.hash = "";
      return url.href;
    } catch {
      return "";
    }
  }

  function backgroundUrl(element) {
    if (!element) return "";
    const background = getComputedStyle(element).backgroundImage;
    return background?.match(/url\(["']?([^"')]+)["']?\)/)?.[1] || "";
  }

  function imageUrlsFromElement(element) {
    if (!element) return [];
    const values = [];
    if (element.currentSrc) values.push(element.currentSrc);
    if (element.src) values.push(element.src);
    if (element.getAttribute("data-src")) {
      values.push(element.getAttribute("data-src"));
    }
    if (element.getAttribute("data-lazy-src")) {
      values.push(element.getAttribute("data-lazy-src"));
    }
    values.push(backgroundUrl(element));
    return [...new Set(values.filter(isHttpUrl))];
  }

  function imageUrlsIn(root) {
    if (!root) return [];
    const values = [];
    for (const image of root.querySelectorAll("img")) {
      values.push(...imageUrlsFromElement(image));
    }
    for (const element of [root, ...root.querySelectorAll("[style]")]) {
      const url = backgroundUrl(element);
      if (isHttpUrl(url)) values.push(url);
    }
    return [...new Set(values)];
  }

  function productImageUrl(root) {
    const images = [...root.querySelectorAll(CARD_IMAGE_SELECTOR)].concat(
      [...root.querySelectorAll("img")].filter((image) =>
        /product|goods/i.test(
          `${image.className} ${image.alt} ${image.src} ${image.dataset.src || ""}`,
        ),
      ),
    );
    for (const image of images) {
      const url = imageUrlsFromElement(image)[0];
      if (url) return url;
    }
    return imageUrlsIn(root).find((url) => /kwcdn|product|goods/i.test(url)) || "";
  }

  function extractProductId(card) {
    const tooltip = card.getAttribute("data-tooltip") || "";
    const fromTooltip = tooltip.replace(/^goodContainer-/, "");
    if (/^\d{6,}$/.test(fromTooltip)) return fromTooltip;

    for (const anchor of card.querySelectorAll("a[href]")) {
      const href = anchor.href || anchor.getAttribute("href") || "";
      const pathMatch = href.match(/-g-(\d{6,})(?:\.html)?(?:[?#]|$)/i);
      if (pathMatch) return pathMatch[1];
      try {
        const id = new URL(href, location.href).searchParams.get("goods_id");
        if (/^\d{6,}$/.test(id || "")) return id;
      } catch {
        // Ignore malformed links.
      }
    }
    return "";
  }

  function extractCardInfo(card) {
    const id = extractProductId(card);
    if (!id) return null;
    const anchor =
      [...card.querySelectorAll("a[href]")].find((candidate) =>
        candidate.href.includes(id),
      ) || card.querySelector("a[href]");
    const image = card.querySelector(CARD_IMAGE_SELECTOR);
    const rawTitle = normalizeText(
      anchor?.getAttribute("aria-label") ||
        anchor?.getAttribute("title") ||
        image?.alt ||
        card.getAttribute("aria-label") ||
        card.textContent,
    );
    const title = rawTitle
      .replace(/^item\s+picture\s+/i, "")
      .replace(/^image\s+/i, "")
      .slice(0, 240);
    return {
      id,
      card,
      title,
      link: anchor?.href || "",
      firstImage: productImageUrl(card),
    };
  }

  function selectedCountText() {
    const selectable = document.querySelectorAll(".tec-select-button").length;
    const ignored = state.excludedCount
      ? ` · 已忽略推荐/广告 ${state.excludedCount} 个`
      : "";
    return `可采集 ${selectable} 个 · 已选 ${state.selected.size} 个${ignored}`;
  }

  function refreshPanelSummary() {
    const summary = document.querySelector("#tec-summary");
    if (summary) {
      if (state.pausedJob?.products?.length) {
        const job = state.pausedJob;
        const completed = (job.completedProductIds || []).length;
        const failed = job.failedProductIds?.length || 0;
        const ignored = state.excludedCount
          ? ` · 已忽略推荐/广告 ${state.excludedCount}`
          : "";
        summary.textContent = `任务：完成 ${completed}/${job.products.length} · 待处理 ${Math.max(
          0,
          job.products.length - completed,
        )} · 失败 ${failed}${ignored}`;
      } else {
        summary.textContent = selectedCountText();
      }
    }
    const button = document.querySelector("#tec-start");
    if (button && !state.running) {
      button.disabled = state.selected.size === 0 && !state.pausedJob;
      button.textContent = state.pausedJob
        ? pausedJobButtonLabel()
        : "开始采集";
    }
    refreshRowToggleLabels();
  }

  function pausedJobButtonLabel(job = state.pausedJob) {
    if (!job) return "开始采集";
    const completed = (job.completedProductIds || []).length;
    const remaining = Math.max(0, (job.products?.length || 0) - completed);
    if (
      remaining === (job.failedProductIds?.length || 0) &&
      (job.failedProductIds?.length || 0) > 0
    ) {
      return "重试失败项";
    }
    return "继续采集";
  }

  function updateSelectButton(button, selected) {
    button.classList.toggle("tec-selected", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.textContent = selected ? "已选" : "采集";
    button.title = selected ? "取消选择此商品" : "选择此商品";
  }

  function injectCardButton(card, info) {
    let button = card.querySelector(":scope > .tec-select-button");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "tec-select-button";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = button.dataset.tecId;
        const currentCard = button.closest(CARD_SELECTOR);
        const currentInfo = currentCard && extractCardInfo(currentCard);
        if (!id || !currentInfo) return;
        if (state.selected.has(id)) {
          state.selected.delete(id);
          updateSelectButton(button, false);
        } else {
          state.selected.set(id, currentInfo);
          updateSelectButton(button, true);
        }
        refreshPanelSummary();
      });
      card.classList.add("tec-card-host");
      card.appendChild(button);
    }
    button.dataset.tecId = info.id;
    updateSelectButton(button, state.selected.has(info.id));
    button.disabled = state.running || Boolean(state.pausedJob);
  }

  function visualCardRows() {
    const entries = [...document.querySelectorAll(".tec-select-button")]
      .map((button) => {
        const card = button.closest(CARD_SELECTOR);
        if (!card) return null;
        const rect = card.getBoundingClientRect();
        const id = button.dataset.tecId;
        if (!id) return null;
        return { card, id, left: rect.left, top: rect.top };
      })
      .filter(Boolean)
      .sort((left, right) => left.top - right.top || left.left - right.left);

    const rows = [];
    for (const entry of entries) {
      const row = rows.find(
        (candidate) => Math.abs(candidate.top - entry.top) <= 12,
      );
      if (row) {
        row.cards.push(entry);
      } else {
        rows.push({ top: entry.top, cards: [entry] });
      }
    }
    for (const row of rows) {
      row.cards.sort((left, right) => left.left - right.left);
    }
    return rows;
  }

  function refreshRowToggleLabels() {
    for (const button of document.querySelectorAll(".tec-row-toggle-button")) {
      let rowIds = [];
      try {
        rowIds = JSON.parse(button.dataset.tecRowIds || "[]");
      } catch {
        rowIds = [];
      }
      const hasSelected = rowIds.some((id) => state.selected.has(id));
      button.textContent = hasSelected ? "本排不选" : "本排全选";
      button.classList.toggle("tec-row-has-selected", hasSelected);
      button.title = hasSelected
        ? "取消这一排所有已选商品"
        : "选择这一排所有可采集商品";
      button.disabled = state.running || Boolean(state.pausedJob);
    }
  }

  function injectRowToggleButtons() {
    const currentButtons = new Set();
    for (const row of visualCardRows()) {
      if (row.cards.length < 2) continue;
      const anchorCard = row.cards[row.cards.length - 1].card;
      let button = anchorCard.querySelector(
        ":scope > .tec-row-toggle-button",
      );
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "tec-row-toggle-button";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (state.running || state.pausedJob) return;

          let rowIds = [];
          try {
            rowIds = JSON.parse(button.dataset.tecRowIds || "[]");
          } catch {
            rowIds = [];
          }
          if (!rowIds.length) return;
          const rowIdSet = new Set(rowIds);
          const hasSelected = rowIds.some((id) => state.selected.has(id));
          if (hasSelected) {
            for (const id of rowIds) state.selected.delete(id);
          } else {
            for (const card of document.querySelectorAll(CARD_SELECTOR)) {
              const info = extractCardInfo(card);
              if (info && rowIdSet.has(info.id)) {
                state.selected.set(info.id, info);
              }
            }
          }
          scanCards();
        });
        anchorCard.appendChild(button);
      }
      button.dataset.tecRowIds = JSON.stringify(
        row.cards.map((entry) => entry.id),
      );
      currentButtons.add(button);
    }

    for (const button of document.querySelectorAll(".tec-row-toggle-button")) {
      if (!currentButtons.has(button)) button.remove();
    }
  }

  function scanCards() {
    if (location.href !== state.lastHref) {
      state.lastHref = location.href;
      state.selected.clear();
      refreshPanelSummary();
    }

    const recommendationSections = findRecommendationSections();
    const excludedProductIds = new Set();
    const collectableProductIds = new Set();
    const excludedReasonCounts = { recommendation: 0, advertisement: 0 };
    let excludedCount = 0;

    for (const card of document.querySelectorAll(CARD_SELECTOR)) {
      const id = extractProductId(card);
      const exclusion = productCardExclusion(card, recommendationSections);
      if (exclusion) {
        excludedCount += 1;
        excludedReasonCounts[exclusion] += 1;
        if (id) excludedProductIds.add(id);
        card.querySelector(":scope > .tec-select-button")?.remove();
        card.querySelector(":scope > .tec-row-toggle-button")?.remove();
        card.classList.remove("tec-card-host");
        state.cards.delete(card);
        continue;
      }
      const info = extractCardInfo(card);
      if (!info) continue;
      collectableProductIds.add(info.id);
      state.cards.set(card, info);
      if (state.selected.has(info.id)) {
        state.selected.set(info.id, { ...state.selected.get(info.id), ...info });
      }
      injectCardButton(card, info);
    }
    injectRowToggleButtons();

    state.excludedCount = excludedCount;
    state.excludedReasonCounts = excludedReasonCounts;
    state.excludedProductIds = new Set(
      [...excludedProductIds].filter((id) => !collectableProductIds.has(id)),
    );
    for (const productId of state.excludedProductIds) {
      state.selected.delete(productId);
    }
    refreshPanelSummary();
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="tec-panel-head" title="按住拖动，双击恢复右下角位置">
        <span class="tec-panel-title">Temu 商品首图采集器</span>
        <button type="button" class="tec-icon-button" id="tec-toggle-panel" title="最小化">—</button>
      </div>
      <div class="tec-panel-body">
        <div class="tec-panel-row">
          <span class="tec-summary" id="tec-summary">可采集 0 个 · 已选 0 个</span>
          <button type="button" class="tec-action" id="tec-select-all">全选可采集</button>
          <button type="button" class="tec-action" id="tec-clear">清空选择</button>
        </div>
        <div class="tec-panel-row">
          <select id="tec-mode" aria-label="采集模式">
            <option value="simple">简单采集</option>
            <option value="colors">多首图采集</option>
            <option value="full">完整采集</option>
          </select>
          <label class="tec-checkbox">
            <input type="checkbox" id="tec-collect-title" checked>
            <span>采集商品标题</span>
          </label>
          <button type="button" class="tec-action primary" id="tec-start" disabled>开始采集</button>
          <button type="button" class="tec-action" id="tec-abandon-job" hidden>放弃任务</button>
          <button type="button" class="tec-action" id="tec-log-toggle">查看日志</button>
        </div>
        <div class="tec-panel-row">
          <span class="tec-save-path">保存路径：<strong id="tec-save-path-name">浏览器默认下载</strong></span>
          <span id="tec-page-picker-slot"></span>
          <button type="button" class="tec-action" id="tec-clear-cache">清理 Temu 缓存</button>
        </div>
        <div class="tec-progress-wrap" aria-hidden="true">
          <div id="tec-progress"></div>
        </div>
        <div class="tec-note" id="tec-progress-text">选择商品后开始采集</div>
        <pre id="tec-log"></pre>
      </div>
    `;
    document.documentElement.appendChild(panel);

    panel
      .querySelector("#tec-toggle-panel")
      .addEventListener("click", () => {
        panel.classList.toggle("tec-minimized");
        requestAnimationFrame(() => clampPanelToViewport(panel));
      });
    panel.querySelector("#tec-select-all").addEventListener("click", () => {
      if (state.running) return;
      const recommendationSections = findRecommendationSections();
      for (const card of document.querySelectorAll(CARD_SELECTOR)) {
        if (productCardExclusion(card, recommendationSections)) continue;
        const info = extractCardInfo(card);
        if (info) state.selected.set(info.id, info);
      }
      scanCards();
    });
    panel.querySelector("#tec-clear").addEventListener("click", () => {
      if (state.running) return;
      state.selected.clear();
      scanCards();
      setProgress(0, "已清空选择");
    });
    panel.querySelector("#tec-log-toggle").addEventListener("click", (event) => {
      const log = panel.querySelector("#tec-log");
      log.classList.toggle("tec-visible");
      event.currentTarget.textContent = log.classList.contains("tec-visible")
        ? "收起日志"
        : "查看日志";
    });
    panel.querySelector("#tec-mode").addEventListener("change", (event) => {
      chrome.storage.local.set({ tecMode: event.target.value });
      const meta = MODE_META[event.target.value];
      setProgress(0, meta.description);
    });
    panel
      .querySelector("#tec-collect-title")
      .addEventListener("change", (event) => {
        state.collectTitle = event.target.checked;
        chrome.storage.local.set({ tecCollectTitle: state.collectTitle });
      });
    panel.querySelector("#tec-start").addEventListener("click", () => {
      if (state.running) {
        state.abortController?.abort();
        return;
      }
      if (state.pausedJob) {
        runCollection(state.pausedJob.mode, state.pausedJob);
      } else {
        runCollection(panel.querySelector("#tec-mode").value);
      }
    });
    panel.querySelector("#tec-abandon-job").addEventListener("click", async () => {
      if (state.running) return;
      if (!window.confirm("放弃当前未完成任务？已生成的 ZIP 文件不会被删除。")) {
        return;
      }
      await clearActiveJob();
      setProgress(0, "已放弃未完成任务");
      appendLog("已放弃未完成任务");
      setRunning(false);
    });
    panel.querySelector("#tec-clear-cache").addEventListener("click", () => {
      clearTemuCache();
    });

    chrome.storage.local.get(
      { tecMode: "simple", tecCollectTitle: true },
      ({ tecMode, tecCollectTitle }) => {
        const mode = panel.querySelector("#tec-mode");
        if (MODE_META[tecMode]) mode.value = tecMode;
        state.collectTitle = tecCollectTitle !== false;
        panel.querySelector("#tec-collect-title").checked = state.collectTitle;
        setProgress(0, MODE_META[mode.value].description);
        restoreActiveJob();
      },
    );
    updateSavePathLabel(
      document.documentElement.dataset.tecSaveDirectory || "",
      document.documentElement.dataset.tecSaveDirectoryStatus || "default",
    );
    setupPanelDragging(panel);
  }

  function clampPanelToViewport(panel) {
    if (!panel?.style.left || !panel?.style.top) return null;
    const margin = 8;
    const rect = panel.getBoundingClientRect();
    const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
    const x = Math.min(maxX, Math.max(margin, Number.parseFloat(panel.style.left)));
    const y = Math.min(maxY, Math.max(margin, Number.parseFloat(panel.style.top)));
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    return { x, y };
  }

  function setupPanelDragging(panel) {
    const header = panel.querySelector(".tec-panel-head");
    let dragging = false;
    let pointerId = null;
    let offsetX = 0;
    let offsetY = 0;

    const savePosition = () => {
      const position = clampPanelToViewport(panel);
      if (position) chrome.storage.local.set({ [PANEL_POSITION_KEY]: position });
    };

    storageGet(PANEL_POSITION_KEY).then((position) => {
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        return;
      }
      panel.style.left = `${position.x}px`;
      panel.style.top = `${position.y}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      clampPanelToViewport(panel);
    });

    header.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button,input,select,a")) {
        return;
      }
      const rect = panel.getBoundingClientRect();
      dragging = true;
      pointerId = event.pointerId;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      header.setPointerCapture(pointerId);
      document.body.style.userSelect = "none";
      event.preventDefault();
    });

    header.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      const rect = panel.getBoundingClientRect();
      const margin = 8;
      const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
      const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
      const x = Math.min(maxX, Math.max(margin, event.clientX - offsetX));
      const y = Math.min(maxY, Math.max(margin, event.clientY - offsetY));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      event.preventDefault();
    });

    const finishDrag = (event) => {
      if (!dragging || (event && event.pointerId !== pointerId)) return;
      dragging = false;
      if (header.hasPointerCapture(pointerId)) {
        header.releasePointerCapture(pointerId);
      }
      pointerId = null;
      document.body.style.userSelect = "";
      savePosition();
    };

    header.addEventListener("pointerup", finishDrag);
    header.addEventListener("pointercancel", finishDrag);
    header.addEventListener("dblclick", (event) => {
      if (event.target.closest("button,input,select,a")) return;
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.bottom = "";
      chrome.storage.local.set({ [PANEL_POSITION_KEY]: null });
    });
    window.addEventListener("resize", () => {
      requestAnimationFrame(() => clampPanelToViewport(panel));
    });
  }

  async function restoreActiveJob() {
    const job = await storageGet("tecActiveJob");
    if (!job?.products?.length) return;
    if (job.status === "running") {
      job.status = "paused";
      job.pauseReason =
        job.pauseReason || "上一次任务因页面跳转或关闭而中断，可从断点继续";
      await saveActiveJob(job);
    }
    if (job.status !== "paused") return;
    state.pausedJob = job;
    const mode = document.querySelector("#tec-mode");
    const titleToggle = document.querySelector("#tec-collect-title");
    if (mode && MODE_META[job.mode]) mode.value = job.mode;
    if (titleToggle) titleToggle.checked = job.titleEnabled !== false;
    state.collectTitle = job.titleEnabled !== false;
    setRunning(false);
    setProgress(
      0,
      `存在未完成任务：商品 ${(job.completedProductIds || []).length}/${
        job.products.length
      }，点击“继续采集”恢复`,
    );
    appendLog(job.pauseReason || "检测到未完成任务，可继续采集");
  }

  function updateSavePathLabel(name, status = "default") {
    const label = document.querySelector("#tec-save-path-name");
    if (!label) return;
    if (name && status === "ready") {
      label.textContent = name;
      label.title = name;
    } else if (name && status === "permission") {
      label.textContent = `${name}（需重新授权）`;
      label.title = name;
    } else {
      label.textContent = "浏览器默认下载";
      label.title = "";
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message?.__tecTemuBridge) return;
    if (message.type === "TEC_DIRECTORY_STATE") {
      updateSavePathLabel(
        message.name || "",
        message.available
          ? "ready"
          : message.permission === "prompt"
            ? "permission"
            : "default",
      );
      if (message.error) appendLog(`保存目录：${message.error}`);
    }
  });

  function setProgress(percent, text) {
    const bar = document.querySelector("#tec-progress");
    const label = document.querySelector("#tec-progress-text");
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (label && text) label.textContent = text;
  }

  function appendLog(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    state.lastLog = line;
    const log = document.querySelector("#tec-log");
    if (log) {
      log.textContent += `${log.textContent ? "\n" : ""}${line}`;
      log.scrollTop = log.scrollHeight;
    }
  }

  function setRunning(running) {
    state.running = running;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const hasPausedJob = Boolean(state.pausedJob);
    panel.querySelector("#tec-start").textContent = running
      ? "停止采集"
      : hasPausedJob
        ? pausedJobButtonLabel()
        : "开始采集";
    panel.querySelector("#tec-start").disabled =
      !running && !hasPausedJob && state.selected.size === 0;
    panel.querySelector("#tec-select-all").disabled = running || hasPausedJob;
    panel.querySelector("#tec-clear").disabled = running || hasPausedJob;
    panel.querySelector("#tec-mode").disabled = running || hasPausedJob;
    panel.querySelector("#tec-collect-title").disabled =
      running || hasPausedJob;
    panel.querySelector("#tec-abandon-job").hidden =
      !hasPausedJob || running;
    for (const button of document.querySelectorAll(".tec-select-button")) {
      button.disabled = running || hasPausedJob;
    }
    for (const button of document.querySelectorAll(".tec-row-toggle-button")) {
      button.disabled = running || hasPausedJob;
    }
    refreshRowToggleLabels();
  }

  function findQuickLookControl(card) {
    if (!card?.isConnected) return null;
    const candidates = [
      ...card.querySelectorAll("button,a,[role='button'],span"),
    ].filter(
      (element) =>
        isVisible(element) && QUICK_LOOK_TEXT.test(normalizeText(element.textContent)),
    );
    return (
      candidates.sort((left, right) => {
        const leftChildren = left.childElementCount;
        const rightChildren = right.childElementCount;
        if (leftChildren !== rightChildren) return leftChildren - rightChildren;
        return (
          left.getBoundingClientRect().width - right.getBoundingClientRect().width
        );
      })[0] || null
    );
  }

  function findQuickLookDialog() {
    return (
      [...document.querySelectorAll('[role="dialog"]')].find((dialog) => {
        if (!isVisible(dialog, 400, 300)) return false;
        return Boolean(
          dialog.querySelector('[role="option"][aria-label*="image" i]') ||
            dialog.querySelector('[role="radio"][data-spec-value-id]'),
        );
      }) || null
    );
  }

  async function closeQuickLook() {
    const dialog = findQuickLookDialog();
    if (!dialog) return true;
    const closeButton = dialog.querySelector(
      '[role="button"][aria-label="close" i],button[aria-label="close" i]',
    );
    if (closeButton) {
      closeButton.click();
    } else {
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }),
      );
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await sleep(150);
      if (!findQuickLookDialog()) return true;
    }
    return false;
  }

  async function waitFor(check, timeoutMs, intervalMs = 200) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const result = check();
      if (result) return result;
      await sleep(intervalMs);
    }
    return null;
  }

  function optionImageUrl(option) {
    for (const image of option.querySelectorAll("img")) {
      const urls = imageUrlsFromElement(image);
      if (urls[0]) return urls[0];
    }
    return imageUrlsIn(option)[0] || "";
  }

  function getCarouselItems(dialog) {
    const options = [...dialog.querySelectorAll('[role="option"]')].filter(
      (option) => {
        if (!optionImageUrl(option)) return false;
        const rect = option.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.width <= 180;
      },
    );
    const chosen = options.length
      ? options
      : [...dialog.querySelectorAll('[role="option"]')].filter((option) =>
          optionImageUrl(option),
        );
    chosen.sort(
      (left, right) =>
        Number(left.dataset.index ?? 9999) - Number(right.dataset.index ?? 9999),
    );

    const result = [];
    const seen = new Set();
    for (const option of chosen) {
      const thumbUrl = optionImageUrl(option);
      const baseUrl = stripImageQuery(thumbUrl);
      if (!baseUrl || seen.has(baseUrl)) continue;
      seen.add(baseUrl);
      result.push({
        index: Number(option.dataset.index ?? result.length),
        baseUrl,
        thumbUrl,
      });
    }
    return result;
  }

  function getColorOptions(dialog) {
    const radios = [
      ...dialog.querySelectorAll(
        '[role="radio"], [role="radio"][data-spec-value-id]',
      ),
    ].filter((option) => isVisible(option));
    if (!radios.length) return [];

    const groups = new Map();
    for (const radio of radios) {
      let parent = radio.parentElement;
      let matchedGroup = null;
      for (let depth = 0; parent && depth < 5; depth += 1) {
        const siblings = [...parent.querySelectorAll('[role="radio"]')].filter(
          (option) => isVisible(option),
        );
        if (siblings.length >= 2 && siblings.includes(radio)) {
          matchedGroup = parent;
          break;
        }
        parent = parent.parentElement;
      }
      if (!matchedGroup) matchedGroup = radio.parentElement;
      if (!matchedGroup) continue;
      if (!groups.has(matchedGroup)) groups.set(matchedGroup, []);
      groups.get(matchedGroup).push(radio);
    }

    const colorLabels = [
      ...dialog.querySelectorAll("span,div,p,strong,b"),
    ]
      .filter(
        (element) =>
          isVisible(element) &&
          !element.querySelector('[role="radio"]') &&
          /^(?:colou?r|颜色)\s*:/i.test(normalizeText(element.innerText)),
      )
      .map((element) => element.getBoundingClientRect());

    const groupsWithOptions = [...groups.entries()].map(([group, options]) => {
      const context = normalizeText(
        `${group.innerText || ""} ${group.previousElementSibling?.innerText || ""}`,
      ).slice(0, 800);
      const names = options.map((option) =>
        normalizeText(
          option.getAttribute("aria-label") ||
            option.textContent ||
            option.dataset.specValueId,
        ),
      );
      const imageCount = options.filter((option) =>
        /kwcdn|product|goods/i.test(optionImageUrl(option)),
      ).length;
      const sizeCount = names.filter((name) =>
        /^(?:xxs|xs|s|m|l|xl|xxl|xxxl|xxxxl|one\s*size|均码|eu\s*\d+|\d{2,3})$/i.test(
          name,
        ),
      ).length;
      const hasColorCue =
        /colou?r|颜色/i.test(context) ||
        names.some((name) => /colou?r|颜色/i.test(name));
      const hasSizeCue =
        /(?:^|\s)(?:size|尺码|鞋码|码数)\s*:?/i.test(context) ||
        sizeCount === options.length;
      const groupRect = group.getBoundingClientRect();
      const nearestColorLabel = colorLabels.reduce((distance, rect) => {
        const below =
          rect.bottom >= groupRect.top - 24 &&
          rect.bottom <= groupRect.top + 180;
        const candidate = below
          ? Math.abs(groupRect.top - rect.bottom)
          : Number.POSITIVE_INFINITY;
        return Math.min(distance, candidate);
      }, Number.POSITIVE_INFINITY);
      const positionedUnderColorLabel =
        Number.isFinite(nearestColorLabel) && nearestColorLabel <= 180;
      const hasColorSignal =
        hasColorCue || imageCount > 0 || positionedUnderColorLabel;
      const score =
        !hasColorSignal || (hasSizeCue && !hasColorCue)
          ? Number.NEGATIVE_INFINITY
          : imageCount * 10 +
            (hasColorCue ? 20 : 0) +
            (positionedUnderColorLabel ? 30 : 0) +
            Math.min(options.length, 8);
      return { group, options, score };
    });
    groupsWithOptions.sort((left, right) => right.score - left.score);
    const best = groupsWithOptions[0];
    if (!best || !Number.isFinite(best.score) || best.score <= 0) return [];
    return best.options;
  }

  function colorName(option, index) {
    const value =
      option.getAttribute("aria-label") ||
      option.textContent ||
      option.dataset.specValueId ||
      `色值${index + 1}`;
    return normalizeText(value) || `色值${index + 1}`;
  }

  function isColorOptionUnavailable(option) {
    const text = normalizeText(option.innerText).toLowerCase();
    const className =
      typeof option.className === "string" ? option.className.toLowerCase() : "";
    const disabled =
      option.matches(":disabled") ||
      option.getAttribute("aria-disabled") === "true" ||
      option.getAttribute("data-disabled") === "true";
    const unavailableText =
      /sold\s*out|out\s*of\s*stock|unavailable|卖完|售罄|缺货|无货/.test(text);
    const unavailableClass =
      /(?:^|[-_\s])(?:disabled|unavailable|sold-?out|out-?of-?stock)(?:$|[-_\s])/i.test(
        className,
      );
    const opacity = Number.parseFloat(getComputedStyle(option).opacity);
    return disabled || unavailableText || unavailableClass || opacity < 0.35;
  }

  async function snapshotColor(dialog, colorOption, index, fullMode) {
    if (!colorOption) {
      await waitFor(() => getCarouselItems(dialog).length > 0, 8000);
      const items = getCarouselItems(dialog);
      return {
        name: "默认",
        id: "default",
        items: fullMode ? items : items.slice(0, 1),
      };
    }

    const beforeItems = getCarouselItems(dialog);
    const before = beforeItems
      .map((item) => item.baseUrl)
      .join("|");
    const alreadySelected = colorOption.getAttribute("aria-checked") === "true";
    if (!alreadySelected && isColorOptionUnavailable(colorOption)) {
      return {
        name: colorName(colorOption, index),
        id: colorOption.dataset.specValueId || "",
        skipped: true,
        warning: "色值已售罄，已跳过",
        items: [],
      };
    }
    if (!alreadySelected) {
      colorOption.scrollIntoView({ block: "nearest", inline: "nearest" });
      colorOption.click();
      let selected = await waitFor(
        () => colorOption.getAttribute("aria-checked") === "true",
        1800,
        80,
      );
      if (!selected && !isColorOptionUnavailable(colorOption)) {
        colorOption.click();
        selected = await waitFor(
          () => colorOption.getAttribute("aria-checked") === "true",
          1200,
          80,
        );
      }
      if (!selected) {
        return {
          name: colorName(colorOption, index),
          id: colorOption.dataset.specValueId || "",
          skipped: true,
          warning: isColorOptionUnavailable(colorOption)
            ? "色值已售罄，已跳过"
            : "点击后色值未选中，可能已售罄，已跳过",
          items: [],
        };
      }
      await waitFor(() => {
        const after = getCarouselItems(dialog)
          .map((item) => item.baseUrl)
          .join("|");
        return after && after !== before;
      }, 1600, 80);
    }
    await waitFor(() => getCarouselItems(dialog).length > 0, 3000);
    const items = getCarouselItems(dialog);
    const signature = items.map((item) => item.baseUrl).join("|");
    if (!alreadySelected && signature === before) {
      return {
        name: colorName(colorOption, index),
        id: colorOption.dataset.specValueId || "",
        skipped: true,
        warning: "切换色值后轮播图未变化，可能已售罄，已跳过",
        items: [],
      };
    }
    return {
      name: colorName(colorOption, index),
      id: colorOption.dataset.specValueId || "",
      checked:
        colorOption.getAttribute("aria-checked") === "true" || alreadySelected,
      signature,
      items: fullMode ? items : items.slice(0, 1),
    };
  }

  async function captureViaQuickLook(product, fullMode, signal) {
    if (signal?.aborted) {
      return { colors: [], warning: "", stopped: true };
    }
    const card = product.card?.isConnected
      ? product.card
      : [...document.querySelectorAll(CARD_SELECTOR)].find(
          (candidate) => extractProductId(candidate) === product.id,
        );
    if (!card) {
      return {
        colors: [],
        warning: "商品卡片已离开虚拟列表，已回退到缓存首图",
      };
    }

    await closeQuickLook();
    let dialog = null;
    for (let attempt = 0; attempt < 2 && !dialog; attempt += 1) {
      if (signal?.aborted) {
        return { colors: [], warning: "", stopped: true };
      }
      const liveCard = card.isConnected
        ? card
        : [...document.querySelectorAll(CARD_SELECTOR)].find(
            (candidate) => extractProductId(candidate) === product.id,
          );
      if (!liveCard) break;
      liveCard.scrollIntoView({ block: "center", inline: "nearest" });
      await sleep(100);
      const control = findQuickLookControl(liveCard);
      if (!control) break;
      control.click();
      dialog = await waitFor(() => {
        const candidate = findQuickLookDialog();
        return candidate && getCarouselItems(candidate).length
          ? candidate
          : null;
      }, 4500);
      if (!dialog) await closeQuickLook();
    }
    if (!dialog) {
      await closeQuickLook();
      return { colors: [], warning: "Quick look 打开或轮播加载超时" };
    }

    await sleep(80);
    let colorOptions = getColorOptions(dialog);
    const colorSectionVisible = /(?:^|\s)(?:colou?r|颜色)\s*:/i.test(
      normalizeText(dialog.innerText).slice(0, 1600),
    );
    if (!colorOptions.length && colorSectionVisible) {
      appendLog(`${product.id}：色值选项未就绪，重新打开 Quick look`);
      await closeQuickLook();
      await sleep(120);
      const liveCard = [...document.querySelectorAll(CARD_SELECTOR)].find(
        (candidate) => extractProductId(candidate) === product.id,
      );
      const control = findQuickLookControl(liveCard);
      if (liveCard && control) {
        liveCard.scrollIntoView({ block: "center", inline: "nearest" });
        await sleep(100);
        control.click();
        const retryDialog = await waitFor(() => {
          const candidate = findQuickLookDialog();
          return candidate && getCarouselItems(candidate).length
            ? candidate
            : null;
        }, 4500);
        if (retryDialog) {
          dialog = retryDialog;
          await sleep(120);
          colorOptions = getColorOptions(dialog);
        }
      }
    }
    if (!colorOptions.length && colorSectionVisible) {
      await waitFor(() => getColorOptions(dialog).length > 0, 1200);
      colorOptions = getColorOptions(dialog);
    }
    const sourceOptions = colorOptions.length ? colorOptions : [null];
    const colors = [];
    const seenColorSignatures = new Map();
    let stopped = false;
    for (let index = 0; index < sourceOptions.length; index += 1) {
      if (signal?.aborted) {
        stopped = true;
        break;
      }
      const snapshot = await snapshotColor(
        dialog,
        sourceOptions[index],
        index,
        fullMode,
      );
      if (!snapshot.items.length) {
        snapshot.warning = "色值下未读取到轮播图片";
      } else if (snapshot.signature) {
        const duplicateOf = seenColorSignatures.get(snapshot.signature);
        if (duplicateOf) {
          snapshot.items = [];
          snapshot.skipped = true;
          snapshot.warning = `轮播图与色值“${duplicateOf}”相同，可能已售罄，已跳过`;
        } else {
          seenColorSignatures.set(snapshot.signature, snapshot.name);
        }
      }
      colors.push(snapshot);
    }

    await closeQuickLook();
    return {
      colors,
      warning: colorOptions.length
        ? ""
        : "未检测到可选色值，已按默认单色图保存",
      stopped,
    };
  }

  function selectedProducts() {
    return [...state.selected.values()]
      .filter((product) => !state.excludedProductIds.has(product.id))
      .map((product) => {
        const liveCard = [...document.querySelectorAll(CARD_SELECTOR)].find(
          (card) => extractProductId(card) === product.id,
        );
        if (!liveCard) return product;
        const live = extractCardInfo(liveCard);
        return live ? { ...product, ...live } : product;
      });
  }

  function addAsset(
    assets,
    usedPaths,
    { product, color, index, image, fullMode, titleEnabled },
  ) {
    if (!image?.baseUrl) return;
    const titleSegment = titleEnabled
      ? `_${safeSegment(product.title, "商品", 45)}`
      : "";
    const productFolder = `${safeSegment(
      product.id,
      "unknown-product",
    )}${titleSegment}`;
    const safeColor = safeSegment(color.name, `色值${index + 1}`, 50);
    let relativeBase;
    if (fullMode) {
      relativeBase = `${IMAGE_FOLDER}/${productFolder}/${safeColor}/${pad2(
        index + 1,
      )}`;
    } else if (color.name === "默认") {
      relativeBase = `${IMAGE_FOLDER}/${product.id}${titleSegment}_首图`;
    } else {
      relativeBase = `${IMAGE_FOLDER}/${product.id}${titleSegment}_${safeColor}_首图`;
    }
    let uniqueBase = relativeBase;
    let suffix = 2;
    while (usedPaths.has(uniqueBase)) {
      uniqueBase = `${relativeBase}_${suffix++}`;
    }
    usedPaths.add(uniqueBase);
    assets.push({
      productId: product.id,
      productTitle: titleEnabled ? product.title : "",
      colorName: color.name,
      colorId: color.id,
      carouselIndex: image.index,
      sourceUrl: image.baseUrl,
      thumbnailUrl: image.thumbUrl,
      relativeBase,
      usedBase: uniqueBase,
      status: "pending",
      filePath: "",
      error: "",
    });
  }

  function buildAssets(mode, products, captures, titleEnabled) {
    const assets = [];
    const usedPaths = new Set();
    for (const product of products) {
      if (mode === "simple") {
        addAsset(assets, usedPaths, {
          product,
          color: { name: "默认", id: "default" },
          index: 0,
          image: {
            baseUrl: stripImageQuery(product.firstImage),
            thumbUrl: product.firstImage,
            index: 0,
          },
          fullMode: false,
          titleEnabled,
        });
        continue;
      }

      const capture = captures.get(product.id);
      const colors = capture?.colors?.length
        ? capture.colors
        : [
            {
              name: "默认",
              id: "fallback",
              items: product.firstImage
                ? [
                    {
                      baseUrl: stripImageQuery(product.firstImage),
                      thumbUrl: product.firstImage,
                      index: 0,
                    },
                  ]
                : [],
              warning: capture?.warning || "未读取到色值",
            },
          ];

      colors.forEach((color, colorIndex) => {
        color.items.forEach((image, imageIndex) => {
          addAsset(assets, usedPaths, {
            product,
            color,
            index: mode === "full" ? imageIndex : colorIndex,
            image,
            fullMode: mode === "full",
            titleEnabled,
          });
        });
      });
    }
    return assets;
  }

  function extensionFromMime(mime, url) {
    const normalized = String(mime || "").toLowerCase();
    if (normalized.includes("jpeg")) return "jpg";
    if (normalized.includes("png")) return "png";
    if (normalized.includes("webp")) return "webp";
    if (normalized.includes("avif")) return "avif";
    if (normalized.includes("gif")) return "gif";
    if (normalized.includes("svg")) return "svg";
    const match = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    return match?.[1]?.toLowerCase() || "jpg";
  }

  async function fetchWithTimeout(url, timeoutMs, parentSignal) {
    const controller = new AbortController();
    const onAbort = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) onAbort();
    parentSignal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: "omit",
        cache: "force-cache",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("图片响应为空");
      return { blob, mime: response.headers.get("content-type") || blob.type };
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onAbort);
    }
  }

  async function downloadImage(asset, signal) {
    const transformed = `${asset.sourceUrl}?imageView2/2/w/1600/q/95/format/jpeg`;
    const candidates = [
      ...new Set(
        [asset.sourceUrl, transformed, asset.thumbnailUrl].filter(isHttpUrl),
      ),
    ];
    if (!candidates.length) throw new Error("没有可下载图片 URL");

    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (signal.aborted) throw new DOMException("任务已停止", "AbortError");
      const url = candidates[Math.min(attempt, candidates.length - 1)];
      try {
        const { blob, mime } = await fetchWithTimeout(url, 20000, signal);
        const ext = extensionFromMime(mime, url);
        return {
          blob,
          mime,
          ext,
          downloadedUrl: url,
        };
      } catch (error) {
        lastError = error;
        if (signal.aborted) throw error;
        await sleep(400 * (attempt + 1));
      }
    }
    throw lastError || new Error("下载失败");
  }

  async function pool(items, concurrency, worker) {
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (cursor < items.length) {
          const index = cursor++;
          await worker(items[index], index);
        }
      },
    );
    await Promise.all(workers);
  }

  function triggerDownload(blob, fileName) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.style.display = "none";
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 15000);
  }

  async function saveArchive(blob, fileName) {
    const directoryName =
      document.documentElement.dataset.tecSaveDirectory || "";
    const directoryStatus =
      document.documentElement.dataset.tecSaveDirectoryStatus || "default";
    if (!directoryName || directoryStatus !== "ready") {
      triggerDownload(blob, fileName);
      return { method: "browser" };
    }

    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(result);
      };
      const onMessage = (event) => {
        if (event.source !== window) return;
        const message = event.data;
        if (
          message?.__tecTemuBridge &&
          message.type === "TEC_SAVE_ZIP_RESULT" &&
          message.token === token
        ) {
          if (message.ok) {
            finish({
              method: "directory",
              directoryName: message.directoryName,
              fileName: message.fileName,
            });
          } else {
            triggerDownload(blob, fileName);
            finish({
              method: "browser",
              warning: message.error || "目录保存失败，已改用默认下载",
            });
          }
        }
      };
      const timer = setTimeout(() => {
        triggerDownload(blob, fileName);
        finish({
          method: "browser",
          warning: "目录保存超时，已改用默认下载",
        });
      }, 30000);
      window.addEventListener("message", onMessage);
      try {
        window.postMessage(
          {
            __tecTemuBridge: true,
            type: "TEC_SAVE_ZIP",
            token,
            blob,
            fileName,
          },
          location.origin,
        );
      } catch (error) {
        triggerDownload(blob, fileName);
        finish({
          method: "browser",
          warning: `目录保存失败：${error.message || error}`,
        });
      }
    });
  }

  function clearTemuCache() {
    if (state.running) {
      appendLog("采集进行中，无法清理缓存");
      return;
    }
    const confirmed = window.confirm(
      "清理 Temu 网页缓存会移除 HTTP 缓存、缓存存储和 Service Worker，但不会清除 Cookie 或登录账号。清理后建议刷新页面。继续吗？",
    );
    if (!confirmed) return;
    setProgress(0, "正在清理 Temu 网页缓存");
    chrome.runtime.sendMessage(
      { type: "TEC_CLEAR_TEMU_CACHE" },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError || !response?.ok) {
          const reason =
            runtimeError?.message || response?.error || "未知错误";
          setProgress(0, `缓存清理失败：${reason}`);
          appendLog(`缓存清理失败：${reason}`);
          return;
        }
        setProgress(0, "Temu 网页缓存已清理，请刷新页面");
        appendLog(`已清理 ${response.origin} 的网页缓存`);
      },
    );
  }

  function createJob(mode, products) {
    const timestamp = makeTimestamp();
    return {
      version: 1,
      id: `tec-${Date.now()}`,
      mode,
      status: "running",
      titleEnabled: state.collectTitle,
      createdAt: timestamp.iso,
      startedAtLocal: timestamp.local,
      rootFolder: `${MODE_META[mode].label}+${timestamp.folder}`,
      products: products.map(({ card, ...product }) => ({
        ...product,
        title: state.collectTitle ? product.title : "",
      })),
      captures: {},
      completedProductIds: [],
      partialProductIds: [],
      failedProductIds: [],
      warnings: [],
      skippedColorCount: 0,
      defaultFallbackCount: 0,
      quickLookFailureCount: 0,
      pauseReason: "",
      updatedAt: timestamp.iso,
    };
  }

  async function pauseActiveJob(job, reason) {
    job.status = "paused";
    job.pauseReason = reason;
    job.pausedAt = new Date().toISOString();
    await saveActiveJob(job);
    setRunning(false);
    setProgress(
      0,
      `已暂停：商品 ${(job.completedProductIds || []).length}/${
        job.products.length
      }。完成验证后点击“继续采集”`,
    );
    appendLog(reason);
  }

  async function runCollection(mode, existingJob = null) {
    if (state.running) return;
    const meta = MODE_META[mode];
    if (!meta) return;
    scanCards();
    let products = existingJob ? existingJob.products || [] : selectedProducts();
    if (existingJob) {
      products = products.filter(
        (product) => !state.excludedProductIds.has(product.id),
      );
      existingJob.products = products;
      existingJob.completedProductIds = (
        existingJob.completedProductIds || []
      ).filter((productId) => !state.excludedProductIds.has(productId));
      existingJob.failedProductIds = (
        existingJob.failedProductIds || []
      ).filter((productId) => !state.excludedProductIds.has(productId));
      existingJob.partialProductIds = (
        existingJob.partialProductIds || []
      ).filter((productId) => !state.excludedProductIds.has(productId));
      for (const productId of state.excludedProductIds) {
        delete existingJob.captures?.[productId];
      }
    }
    if (!products.length) {
      setProgress(
        0,
        existingJob
          ? "当前任务没有可继续采集的商品"
          : "请先选择商品（推荐区和广告商品已自动忽略）",
      );
      return;
    }

    const job = existingJob || createJob(mode, products);
    const rootFolder = job.rootFolder;
    const captures = new Map(Object.entries(job.captures || {}));
    const warnings = Array.isArray(job.warnings) ? job.warnings : [];
    const failedProducts = new Set(job.failedProductIds || []);
    const completedProducts = new Set(job.completedProductIds || []);
    if (!Array.isArray(job.partialProductIds)) job.partialProductIds = [];
    state.collectTitle = job.titleEnabled !== false;
    const titleToggle = document.querySelector("#tec-collect-title");
    if (titleToggle) titleToggle.checked = state.collectTitle;
    job.status = "running";
    job.pauseReason = "";
    await saveActiveJob(job);

    const abortController = new AbortController();
    state.abortController = abortController;
    setRunning(true);
    appendLog(
      `${existingJob ? "继续" : "开始"} ${meta.label}，共 ${
        products.length
      } 个商品，已完成 ${completedProducts.size} 个`,
    );
    setProgress(1, `${meta.label}：准备采集`);

    try {
      let stoppedDuringCapture = false;
      let consecutiveQuickLookFailures = 0;
      const addWarning = (entry) => {
        const key = `${entry.productId || ""}|${entry.color || ""}|${
          entry.type || ""
        }|${entry.message || ""}`;
        if (
          !warnings.some(
            (warning) =>
              `${warning.productId || ""}|${warning.color || ""}|${
                warning.type || ""
              }|${warning.message || ""}` === key,
          )
        ) {
          warnings.push(entry);
        }
      };
      const commitCapture = (product, capture, complete = true) => {
        captures.set(product.id, capture);
        job.captures[product.id] = capture;
        failedProducts.delete(product.id);
        if (complete) {
          completedProducts.add(product.id);
          job.partialProductIds = job.partialProductIds.filter(
            (id) => id !== product.id,
          );
        } else if (!job.partialProductIds.includes(product.id)) {
          job.partialProductIds.push(product.id);
        }
        if (capture.warning) {
          addWarning({
            productId: product.id,
            type: "quick-look",
            message: capture.warning,
          });
          appendLog(`${product.id}：${capture.warning}`);
        }
        for (const color of capture.colors || []) {
          if (color.skipped) job.skippedColorCount += 1;
          if (color.warning) {
            addWarning({
              productId: product.id,
              color: color.name,
              type: "color",
              message: color.warning,
            });
            appendLog(`${product.id}/${color.name}：${color.warning}`);
          }
        }
        if (capture.colors?.length) {
          const imageCount = capture.colors.reduce(
            (count, color) => count + color.items.length,
            0,
          );
          appendLog(
            `${product.id}：识别 ${capture.colors.length} 个色值，读取 ${imageCount} 张图`,
          );
          if (capture.colors.every((color) => color.name === "默认")) {
            job.defaultFallbackCount += 1;
          }
        }
      };
      const saveJobProgress = async () => {
        job.completedProductIds = [...completedProducts];
        job.failedProductIds = [...failedProducts];
        job.warnings = warnings;
        await saveActiveJob(job);
      };

      if (mode !== "simple") {
        for (let index = 0; index < products.length; index += 1) {
          const product = products[index];
          const isPartial = job.partialProductIds.includes(product.id);
          if (captures.has(product.id) && !isPartial) continue;
          if (isPartial) {
            captures.delete(product.id);
            delete job.captures[product.id];
            job.partialProductIds = job.partialProductIds.filter(
              (id) => id !== product.id,
            );
          }
          if (abortController.signal.aborted) {
            stoppedDuringCapture = true;
            break;
          }
          if (isAntiBotUrl()) {
            await pauseActiveJob(
              job,
              "检测到 Temu 登录或安全验证，采集已暂停。完成验证后点击“继续采集”",
            );
            return;
          }
          setProgress(
            2 + Math.round((index / products.length) * 18),
            `${meta.label}：读取商品 ${index + 1}/${products.length}`,
          );
          appendLog(`读取 ${product.id} 的 Quick look`);
          job.currentProductId = product.id;
          job.currentIndex = index;
          await saveActiveJob(job);
          const capture = await captureViaQuickLook(
            product,
            mode === "full",
            abortController.signal,
          );
          if (capture.stopped) {
            if (capture.colors?.length) {
              commitCapture(product, capture, false);
              await saveJobProgress();
            }
            stoppedDuringCapture = true;
            break;
          }
          const isQuickLookFailure =
            Boolean(capture.warning) && !capture.colors?.length;
          if (isQuickLookFailure) {
            consecutiveQuickLookFailures += 1;
            failedProducts.add(product.id);
            job.quickLookFailureCount =
              (job.quickLookFailureCount || 0) + 1;
            addWarning({
              productId: product.id,
              type: "quick-look",
              message: capture.warning,
            });
            appendLog(`${product.id}：${capture.warning}，稍后重试`);
          } else if (capture.colors?.length) {
            consecutiveQuickLookFailures = 0;
            commitCapture(product, capture);
          }
          await saveJobProgress();
          if (consecutiveQuickLookFailures >= 3) {
            const message =
              "连续 3 个商品无法打开 Quick look，采集已暂停；请检查登录状态、页面验证或网络，完成后点击“继续采集”";
            addWarning({
              productId: product.id,
              type: "batch",
              message,
            });
            job.warnings = warnings;
            await pauseActiveJob(job, message);
            return;
          }
          if (index < products.length - 1) await sleep(60);
        }
      }

      if (
        mode !== "simple" &&
        !stoppedDuringCapture &&
        !abortController.signal.aborted &&
        failedProducts.size
      ) {
        const retryProducts = products.filter((product) =>
          failedProducts.has(product.id),
        );
        appendLog(`进入失败重试：${retryProducts.length} 个商品`);
        await sleep(1200);
        for (const product of retryProducts) {
          if (abortController.signal.aborted) {
            stoppedDuringCapture = true;
            break;
          }
          if (isAntiBotUrl()) {
            await pauseActiveJob(
              job,
              "重试过程中检测到安全验证，采集再次暂停；验证完成后点击“继续采集”",
            );
            return;
          }
          setProgress(18, `${meta.label}：重试失败商品 ${product.id}`);
          appendLog(`重试 ${product.id}`);
          const capture = await captureViaQuickLook(
            product,
            mode === "full",
            abortController.signal,
          );
          if (capture.stopped) {
            if (capture.colors?.length) {
              commitCapture(product, capture, false);
              await saveJobProgress();
            }
            stoppedDuringCapture = true;
            break;
          }
          if (capture.colors?.length) {
            commitCapture(product, capture);
            appendLog(`${product.id}：重试成功`);
          } else {
            addWarning({
              productId: product.id,
              type: "retry",
              message: capture.warning || "失败重试仍未成功",
            });
            appendLog(`${product.id}：重试仍未成功`);
          }
          await saveJobProgress();
          await sleep(350);
        }
      }

      if (!stoppedDuringCapture && failedProducts.size) {
        for (const productId of failedProducts) {
          job.defaultFallbackCount += 1;
          addWarning({
            productId,
            type: "fallback",
            message: "自动重试仍未成功，已回退到商品卡片首图",
          });
        }
      }

      const captureProducts = stoppedDuringCapture
        ? products.filter((product) => captures.has(product.id))
        : products;
      const processedProductCount =
        mode === "simple" ? products.length : captureProducts.length;
      const unprocessedProductCount = Math.max(
        0,
        products.length - processedProductCount,
      );
      const assets = buildAssets(
        mode,
        captureProducts,
        captures,
        job.titleEnabled,
      );
      if (!assets.length) {
        job.status = "paused";
        job.pauseReason = stoppedDuringCapture
          ? "用户停止，当前没有可保存的图片"
          : "没有采集到可下载的图片";
        await saveJobProgress();
        setProgress(0, job.pauseReason);
        appendLog(job.pauseReason);
        return;
      }

      appendLog(
        stoppedDuringCapture
          ? "采集已停止，正在保存已经读取到的图片"
          : `共整理出 ${assets.length} 张图片，开始下载`,
      );
      const zip = new JSZip();
      let completed = 0;
      const downloadSignal = stoppedDuringCapture
        ? new AbortController().signal
        : abortController.signal;
      await pool(assets, 5, async (asset) => {
        if (!stoppedDuringCapture && downloadSignal.aborted) {
          asset.status = "stopped";
          asset.error = "任务已停止";
          completed += 1;
          return;
        }
        try {
          const result = await downloadImage(asset, downloadSignal);
          asset.filePath = `${asset.usedBase}.${result.ext}`;
          asset.downloadUrl = result.downloadedUrl;
          asset.mime = result.mime;
          asset.status = "success";
          zip.file(`${rootFolder}/${asset.filePath}`, result.blob);
        } catch (error) {
          if (error.name === "AbortError") {
            asset.status = "stopped";
            asset.error = "任务已停止";
          } else {
            asset.status = "failed";
            asset.error = error.message || String(error);
          }
        } finally {
          completed += 1;
          setProgress(
            20 + Math.round((completed / assets.length) * 70),
            `${meta.label}：下载 ${completed}/${assets.length}`,
          );
        }
      });

      const succeeded = assets.filter((asset) => asset.status === "success");
      if (!succeeded.length) {
        job.status = "paused";
        job.pauseReason = abortController.signal.aborted
          ? "用户停止，当前没有完整下载的图片"
          : "所有图片下载失败，未生成 ZIP";
        await saveJobProgress();
        setProgress(0, job.pauseReason);
        appendLog(job.pauseReason);
        return;
      }

      const wasStopped =
        abortController.signal.aborted || stoppedDuringCapture;
      if (wasStopped) job.pauseReason = "用户停止";
      const batchStopReason = wasStopped
        ? job.pauseReason
        : failedProducts.size
          ? `${failedProducts.size} 个商品重试后仍失败`
          : "";
      const resultJson = {
        mode,
        modeLabel: meta.label,
        titleEnabled: job.titleEnabled,
        startedAt: job.createdAt,
        startedAtLocal: job.startedAtLocal,
        finishedAt: new Date().toISOString(),
        zipRoot: rootFolder,
        stopped: wasStopped,
        summary: {
          products: processedProductCount,
          selectedProducts: products.length,
          processedProducts: processedProductCount,
          unprocessedProducts: unprocessedProductCount,
          failedProducts: failedProducts.size,
          imageTotal: assets.length,
          imageSucceeded: succeeded.length,
          imageFailed: assets.length - succeeded.length,
          colorsSkipped: job.skippedColorCount || 0,
          defaultFallbacks: job.defaultFallbackCount || 0,
          quickLookFailures: job.quickLookFailureCount || 0,
          batchStopReason,
        },
        warnings,
        records: assets.map((asset) => ({
          productId: asset.productId,
          productTitle: asset.productTitle,
          colorName: asset.colorName,
          colorId: asset.colorId,
          carouselIndex: asset.carouselIndex,
          sourceUrl: asset.sourceUrl,
          thumbnailUrl: asset.thumbnailUrl,
          downloadUrl: asset.downloadUrl || "",
          filePath: asset.filePath,
          mime: asset.mime || "",
          status: asset.status,
          error: asset.error,
        })),
      };
      zip.file(
        `${rootFolder}/采集结果.json`,
        `${JSON.stringify(resultJson, null, 2)}\n`,
      );
      if (job.titleEnabled) {
        const outputProductIds = new Set(
          assets.map((asset) => asset.productId),
        );
        const seenProductIds = new Set();
        const titleRows = products
          .filter((product) => {
            if (
              !outputProductIds.has(product.id) ||
              seenProductIds.has(product.id)
            ) {
              return false;
            }
            seenProductIds.add(product.id);
            return true;
          })
          .map((product) => ({ title: product.title || "" }));
        if (titleRows.length) {
          try {
            const titleWorkbook =
              await globalThis.TecTitleWorkbook.createBlob(titleRows);
            zip.file(`${rootFolder}/商品标题.xlsx`, titleWorkbook);
          } catch (error) {
            addWarning({
              type: "title-workbook",
              message: `商品标题.xlsx 生成失败：${error.message || error}`,
            });
            appendLog(`商品标题.xlsx 生成失败：${error.message || error}`);
          }
        }
      }
      setProgress(93, `${meta.label}：正在生成 ZIP`);
      appendLog("正在生成 ZIP");
      const blob = await zip.generateAsync(
        { type: "blob", compression: "STORE" },
        ({ percent }) => {
          setProgress(93 + Math.round(percent * 0.06), `打包 ${Math.round(percent)}%`);
        },
      );
      const saveResult = await saveArchive(blob, `${rootFolder}.zip`);
      if (saveResult.warning) appendLog(saveResult.warning);
      setProgress(
        100,
        wasStopped
          ? `已停止：商品 ${processedProductCount}/${products.length}，保留 ${succeeded.length} 张图`
          : `${meta.label}完成：商品 ${processedProductCount}/${products.length}，图片 ${succeeded.length} 张`,
      );
      appendLog(
        `统计：商品 ${processedProductCount}/${products.length}，未处理 ${unprocessedProductCount}，图片成功 ${succeeded.length}，图片失败 ${
          assets.length - succeeded.length
        }，色值跳过 ${job.skippedColorCount || 0}，默认回退 ${
          job.defaultFallbackCount || 0
        }，待重试商品 ${failedProducts.size}`,
      );
      appendLog(
        `${saveResult.method === "directory" ? "已保存到" : "ZIP 已生成："}${
          saveResult.directoryName
            ? `${saveResult.directoryName}/${rootFolder}.zip`
            : `${rootFolder}.zip`
        }，成功 ${succeeded.length}，失败 ${
          assets.length - succeeded.length
        }${wasStopped ? "（用户停止）" : ""}`,
      );

      if (wasStopped) {
        job.status = "paused";
        job.pauseReason = "用户停止，可点击“继续采集”从未完成商品恢复";
        await saveJobProgress();
      } else if (failedProducts.size) {
        job.status = "paused";
        job.pauseReason = `${failedProducts.size} 个商品重试后仍失败，可点击“重试失败项”再次处理`;
        await saveJobProgress();
        setProgress(
          100,
          `已完成当前结果，仍有 ${failedProducts.size} 个商品失败，可点击“重试失败项”`,
        );
      } else {
        await clearActiveJob();
      }
    } catch (error) {
      if (job.products?.length) {
        job.status = "paused";
        job.pauseReason = error.message || String(error);
        await saveActiveJob(job);
      }
      if (error.name === "AbortError") {
        setProgress(0, "采集已停止");
        appendLog("任务已停止，未生成 ZIP");
      } else {
        setProgress(0, `采集失败：${error.message || error}`);
        appendLog(`采集失败：${error.message || error}`);
      }
    } finally {
      state.abortController = null;
      await closeQuickLook();
      setRunning(false);
    }
  }

  function initialize() {
    createPanel();
    scanCards();
    setInterval(scanCards, 800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
