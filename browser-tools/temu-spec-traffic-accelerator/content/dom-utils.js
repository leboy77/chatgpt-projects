(function installTemuAcceleratorDomUtils() {
  class PageError extends Error {
    constructor(code, message, details = null) {
      super(message);
      this.name = "PageError";
      this.code = code;
      this.details = details;
    }
  }

  const UI_HOST_ID = "temu-spec-accelerator-host";
  const ACTIVE_TEXT = ["流量加速中", "已加速"];
  const ELIGIBLE_TEXT = "该商品已获得开启流量加速器机会";
  const SITE_MARKER = "经营站点：";
  const SPU_MARKER = "SPU ID：";

  function normalizeText(value) {
    return String(value ?? "")
      .replace(/[\u00ad\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeSku(value) {
    return normalizeText(value).toLowerCase();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    if (element.closest(`#${UI_HOST_ID}`)) return false;
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function elementText(element) {
    return normalizeText(element?.innerText || element?.textContent || "");
  }

  async function waitFor(predicate, options = {}) {
    const timeout = options.timeout ?? 20000;
    const interval = options.interval ?? 200;
    const startedAt = Date.now();
    let lastError = null;

    while (Date.now() - startedAt < timeout) {
      try {
        const result = predicate();
        if (result) return result;
      } catch (error) {
        lastError = error;
      }
      await sleep(interval);
    }

    if (lastError) throw lastError;
    throw new PageError(
      "UI_TIMEOUT",
      options.message || "等待页面状态超时",
    );
  }

  function findElementsByText(text, options = {}) {
    const root = options.root || document;
    const selector =
      options.selector ||
      "button,a,[role='button'],label,span,div,p";
    const expected = normalizeText(text);
    const exact = options.exact ?? true;
    const maxTextLength = options.maxTextLength ?? 120;
    const elements = root.querySelectorAll(selector);
    const matches = [];

    for (const element of elements) {
      if (!isVisible(element)) continue;
      const current = elementText(element);
      if (!current || current.length > maxTextLength) continue;
      const matched = exact
        ? current === expected
        : current.includes(expected);
      if (matched) matches.push(element);
    }

    return matches.sort((a, b) => {
      const aArea = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
      const bArea = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
      return aArea - bArea;
    });
  }

  function clickableFromElement(element) {
    return element?.closest(
      "button,a,[role='button'],[role='link'],[tabindex]:not([tabindex='-1'])",
    );
  }

  function findClickableByText(root, text, options = {}) {
    const exact = options.exact ?? true;
    const direct = root.querySelectorAll(
      "button,a,li,[role='button'],[role='link'],[role='option'],[tabindex]:not([tabindex='-1'])",
    );
    const expected = normalizeText(text);
    const exactMatches = [];
    const partialMatches = [];

    for (const element of direct) {
      if (!isVisible(element)) continue;
      if (element.disabled || element.getAttribute("aria-disabled") === "true") {
        continue;
      }
      const current = elementText(element);
      if (!current) continue;
      if (current === expected) exactMatches.push(element);
      else if (!exact && current.includes(expected)) partialMatches.push(element);
    }

    if (exactMatches.length) return exactMatches[0];
    if (partialMatches.length) return partialMatches[0];

    const textMatches = findElementsByText(text, {
      root,
      exact,
      selector: root === document ? "span,div,p" : "*",
      maxTextLength: 160,
    });
    for (const match of textMatches) {
      const clickable = clickableFromElement(match);
      if (clickable && isVisible(clickable)) return clickable;
      if (isVisible(match)) return match;
    }

    return null;
  }

  function clickElement(element) {
    if (!element) throw new PageError("ELEMENT_NOT_FOUND", "未找到可点击元素");
    element.scrollIntoView({ block: "center", inline: "center" });
    element.focus?.({ preventScroll: true });
    element.click();
  }

  function findActionByText(overlay, text, options = {}) {
    return (
      findClickableByText(overlay, text, options) ||
      findClickableByText(document.body, text, options)
    );
  }

  function setNativeValue(input, value) {
    if (!(input instanceof HTMLInputElement)) {
      throw new PageError("INPUT_NOT_FOUND", "目标不是可编辑输入框");
    }
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setter) {
      throw new PageError("INPUT_UNSUPPORTED", "当前浏览器不支持输入框赋值");
    }
    input.focus?.({ preventScroll: true });
    setter.call(input, String(value));
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
    input.blur?.();
  }

  function parseNumberFromText(text) {
    const match = String(text ?? "").match(/[¥￥]?\s*([\d,]+(?:\.\d+)?)/);
    if (!match) return null;
    const parsed = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function toCents(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0
      ? Math.round(numeric * 100)
      : null;
  }

  function getPageRegion() {
    const host = location.hostname.toLowerCase();
    if (host === "agentseller-eu.temu.com") return "欧区";
    if (host === "agentseller-us.temu.com") return "美国";
    if (host === "agentseller.temu.com") return "全球";

    const body = elementText(document.body);
    const match = body.match(/商品流量\s*[·•]\s*(全球|美国|欧区)/);
    return match?.[1] || "";
  }

  function ensureFluxPage() {
    if (!location.pathname.includes("/main/flux-analysis")) {
      throw new PageError(
        "WRONG_PAGE",
        "请先打开 Temu 经营分析-流量分析-商品流量页面",
      );
    }
  }

  async function switchRegion(regionLabel) {
    ensureFluxPage();
    if (getPageRegion() === regionLabel) return getPageRegion();

    const clickable = findClickableByText(document.body, regionLabel, {
      exact: true,
    });
    if (!clickable) {
      throw new PageError(
        "REGION_NOT_FOUND",
        `未找到区域入口：${regionLabel}`,
      );
    }

    clickElement(clickable);
    await waitFor(() => getPageRegion() === regionLabel, {
      timeout: 30000,
      message: `切换至${regionLabel}超时`,
    });
    await sleep(800);
    return getPageRegion();
  }

  function findFluxSearchInput() {
    const inputs = [...document.querySelectorAll("input")].filter(
      (input) =>
        isVisible(input) &&
        normalizeText(input.placeholder).includes("多个查询请空格或逗号"),
    );
    if (inputs.length) return inputs[0];

    const fallback = [...document.querySelectorAll("input")].filter(
      (input) => isVisible(input) && input.value === "SKC",
    );
    return fallback[0] || null;
  }

  function findQueryButton() {
    const direct = [...document.querySelectorAll("button")].filter(
      (button) =>
        isVisible(button) &&
        !button.disabled &&
        elementText(button) === "查询" &&
        !elementText(button.closest("form")?.parentElement || "").includes(
          "站内消息",
        ),
    );
    if (direct.length) return direct[0];

    const clickable = findClickableByText(document.body, "查询", {
      exact: true,
    });
    return clickable?.closest("button") || clickable;
  }

  function findSearchTypeInput(searchInput) {
    let scope = searchInput.parentElement;
    for (let depth = 0; scope && depth < 8; depth += 1) {
      if (elementText(scope).includes("商品ID查询")) {
        return [...scope.querySelectorAll("input")].find(
          (input) =>
            input !== searchInput &&
            isVisible(input) &&
            ["SKC", "SPU"].includes(normalizeText(input.value).toUpperCase()),
        );
      }
      scope = scope.parentElement;
    }
    return null;
  }

  async function ensureSkcSearchType(searchInput) {
    const typeInput = findSearchTypeInput(searchInput);
    if (!typeInput) {
      throw new PageError(
        "SEARCH_TYPE_NOT_FOUND",
        "未找到 SKC/SPU 查询类型控件",
      );
    }
    if (normalizeText(typeInput.value).toUpperCase() === "SKC") return;

    clickElement(typeInput);
    const option = await waitFor(
      () => findClickableByText(document.body, "SKC", { exact: true }),
      { timeout: 5000, message: "等待 SKC 查询类型选项超时" },
    );
    clickElement(option);
    await waitFor(
      () => normalizeText(typeInput.value).toUpperCase() === "SKC",
      { timeout: 5000, message: "切换查询类型为 SKC 失败" },
    );
  }

  function resultCandidateIsLeaf(element) {
    const text = elementText(element);
    if (!text.includes(SITE_MARKER) || !text.includes(SPU_MARKER)) return false;
    for (const child of element.children) {
      const childText = elementText(child);
      if (childText.includes(SITE_MARKER) && childText.includes(SPU_MARKER)) {
        return false;
      }
    }
    return true;
  }

  function getResultRows() {
    const tableRows = [...document.querySelectorAll("tr,[role='row']")].filter(
      (row) =>
        isVisible(row) &&
        elementText(row).includes(SITE_MARKER) &&
        elementText(row).includes(SPU_MARKER),
    );
    if (tableRows.length) return tableRows;

    const candidates = [...document.querySelectorAll("li,div,section")].filter(
      (element) =>
        isVisible(element) &&
        elementText(element).length < 6000 &&
        resultCandidateIsLeaf(element),
    );
    return candidates.sort(
      (a, b) => elementText(a).length - elementText(b).length,
    );
  }

  function getResultTotal() {
    const match = elementText(document.body).match(/共有\s*(\d+)\s*条/);
    return match ? Number(match[1]) : null;
  }

  function parseResultRow(row) {
    const text = elementText(row);
    const siteMatch = text.match(/经营站点：\s*([^\s]+站)/);
    const spuMatch = text.match(/SPU\s*ID：\s*(\d+)/i);
    const hasEligibility = text.includes(ELIGIBLE_TEXT);
    const isActive = ACTIVE_TEXT.some((marker) => text.includes(marker));
    const openButton = findClickableByText(row, "立即开启", { exact: false });

    return {
      element: row,
      siteName: siteMatch?.[1] || "",
      spuId: spuMatch?.[1] || "",
      status: isActive ? "ACTIVE" : hasEligibility ? "ELIGIBLE" : "NOT_ELIGIBLE",
      canOpen: Boolean(openButton || hasEligibility),
      text,
    };
  }

  function findNextPageControl() {
    const controls = [
      ...document.querySelectorAll(
        "button,a,[role='button'],[aria-label],[title]",
      ),
    ].filter((element) => {
      if (!isVisible(element)) return false;
      const label = normalizeText(
        [
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          elementText(element),
        ]
          .filter(Boolean)
          .join(" "),
      );
      return (
        label === "下一页" ||
        label.includes("下一页") ||
        label.toLowerCase().includes("next page")
      );
    });
    return controls.find(
      (element) =>
        !element.disabled &&
        element.getAttribute("aria-disabled") !== "true",
    );
  }

  async function waitForStableResultRows() {
    await sleep(400);
    let previousCount = -1;
    let previousTotal = null;
    let stableReads = 0;

    await waitFor(
      () => {
        const count = getResultRows().length;
        const total = getResultTotal();
        const pageText = elementText(document.body);
        if (count === 0 && pageText.includes("暂无数据")) return true;
        const consistentWithTotal =
          total === null || count === 0 || count <= total;
        if (count === previousCount && total === previousTotal && consistentWithTotal) {
          stableReads += 1;
        }
        else {
          previousCount = count;
          previousTotal = total;
          stableReads = 0;
        }
        return count > 0 && consistentWithTotal && stableReads >= 2;
      },
      { timeout: 30000, interval: 150, message: "等待商品查询结果超时" },
    );
  }

  let lastQueryBaseline = null;

  function getResultSignature() {
    return getResultRows()
      .slice(0, 5)
      .map((row) => {
        const parsed = parseResultRow(row);
        return `${parsed.siteName}|${parsed.spuId}`;
      })
      .join(",");
  }

  async function searchSkc(skcId, options = {}) {
    ensureFluxPage();
    const input = findFluxSearchInput();
    if (!input) {
      throw new PageError("SEARCH_INPUT_NOT_FOUND", "未找到商品 ID 查询输入框");
    }

    input.scrollIntoView({ block: "center" });
    await ensureSkcSearchType(input);
    const normalizedSkcId = String(skcId);
    const retryBaseline =
      lastQueryBaseline?.skcId === normalizedSkcId ? lastQueryBaseline : null;
    const inputAlreadyMatches =
      normalizeText(input.value) === normalizedSkcId;
    const previousTotal = retryBaseline?.previousTotal ?? getResultTotal();
    const previousSignature =
      retryBaseline?.previousSignature ?? getResultSignature();
    setNativeValue(input, normalizedSkcId);
    await sleep(100);

    const queryButton = findQueryButton();
    if (!queryButton) {
      throw new PageError("QUERY_BUTTON_NOT_FOUND", "未找到查询按钮");
    }
    clickElement(queryButton);
    lastQueryBaseline = {
      skcId: normalizedSkcId,
      previousTotal,
      previousSignature,
    };

    if (options.allowSameResult || inputAlreadyMatches) {
      await waitForStableResultRows();
      return;
    }

    await waitFor(
      () => {
        const currentTotal = getResultTotal();
        const currentRows = getResultRows();
        const currentSignature = getResultSignature();
        const pageText = elementText(document.body);
        if (currentRows.length === 0 && pageText.includes("暂无数据")) {
          return true;
        }
        if (
          currentTotal !== previousTotal &&
          (currentTotal === 0 ||
            (currentRows.length > 0 && currentRows.length <= currentTotal))
        ) {
          return true;
        }
        return (
          currentSignature !== previousSignature &&
          (currentTotal === previousTotal ||
            currentTotal === null ||
            currentRows.length <= currentTotal)
        );
      },
      {
        timeout: 60000,
        interval: 250,
        message: `等待 SKC ${skcId} 查询结果刷新超时`,
      },
    );
    await waitForStableResultRows();
  }

  async function loadAllResultRows() {
    const rowsByKey = new Map();
    let pageCount = 0;

    const collect = () => {
      for (const row of getResultRows()) {
        const parsed = parseResultRow(row);
        if (!parsed.siteName || !parsed.spuId) continue;
        rowsByKey.set(`${parsed.siteName}|${parsed.spuId}`, parsed);
      }
    };

    collect();
    const expectedTotal = getResultTotal();

    while (
      expectedTotal !== null &&
      rowsByKey.size < expectedTotal &&
      pageCount < 50
    ) {
      const next = findNextPageControl();
      if (!next) break;
      clickElement(next);
      await sleep(350);
      await waitForStableResultRows();
      collect();
      pageCount += 1;
    }

    if (expectedTotal !== null && rowsByKey.size < expectedTotal) {
      throw new PageError(
        "RESULT_PAGINATION_FAILED",
        `查询结果共 ${expectedTotal} 条，仅成功读取 ${rowsByKey.size} 条`,
      );
    }

    return [...rowsByKey.values()];
  }

  async function lookupSkc(skcId, options = {}) {
    await searchSkc(skcId, options);
    const rows = await loadAllResultRows();
    const sites = {};
    for (const row of rows) {
      if (sites[row.siteName]) {
        throw new PageError(
          "AMBIGUOUS_SITE_ROW",
          `同一 SKC 在${row.siteName}返回了多个商品行`,
        );
      }
      const { element, ...serializable } = row;
      sites[row.siteName] = serializable;
    }
    return {
      total: getResultTotal() ?? rows.length,
      sites,
    };
  }

  function findOverlayByKeyword(keyword) {
    const expected = normalizeText(keyword);
    const candidates = [...document.querySelectorAll("div,section,form")].filter(
      (element) => {
        if (!isVisible(element)) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width < 500 || rect.height < 250) return false;
        return elementText(element).includes(expected);
      },
    );

    return candidates.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return aRect.width * aRect.height - bRect.width * bRect.height;
    })[0];
  }

  async function waitForOverlay(keyword, timeout = 20000) {
    return waitFor(() => findOverlayByKeyword(keyword), {
      timeout,
      message: `等待“${keyword}”弹窗超时`,
    });
  }

  async function openSiteAcceleration(row) {
    const parsed = parseResultRow(row);
    if (parsed.status === "ACTIVE") return "ALREADY_ACTIVE";
    const openButton = findClickableByText(row, "立即开启", { exact: false });
    if (!openButton) {
      if (parsed.status === "ELIGIBLE") {
        throw new PageError("OPEN_BUTTON_NOT_FOUND", "商品可开启但未找到开启入口");
      }
      return "NOT_ELIGIBLE";
    }

    clickElement(openButton);
    await waitForOverlay("流量加速器", 25000);
    return "OPENED";
  }

  async function openCustomPriceEditor(outerOverlay) {
    let link = null;
    try {
      link = await waitFor(
        () => findActionByText(outerOverlay, "去获取", { exact: true }),
        { timeout: 15000, message: "等待自定义价格入口超时" },
      );
    } catch {
      throw new PageError("CUSTOM_PRICE_LINK_NOT_FOUND", "未找到去获取入口");
    }
    clickElement(link);
    return waitForOverlay("调整申报价", 25000);
  }

  function parseSkuLabel(text) {
    const normalized = normalizeText(text);
    const match = normalized.match(
      /([A-Z0-9]+)-Mixed\s*Color\s*(\d+)/i,
    );
    if (match) {
      return {
        skuLabel: `${match[1].toUpperCase()}-Mixed Color${match[2]}`,
        colorGroup: `Mixed Color${match[2]}`,
      };
    }

    const localized = normalized.match(
      /([\p{Script=Han}]+(?:\s*\d+)?)\s*[-－]\s*(XXXL|XXL|XL|L|M|S)(?=\s|¥|￥|$)/iu,
    );
    if (!localized) return null;
    const colorGroup = normalizeText(localized[1]);
    const size = localized[2].toUpperCase();
    return {
      skuLabel: `${colorGroup}-${size}`,
      colorGroup,
    };
  }

  function skuMatchesColorGroup(skuLabel, targetColorGroup) {
    const sku = normalizeSku(skuLabel);
    const target = normalizeSku(targetColorGroup);
    if (!sku || !target) return false;
    if (sku.endsWith(`-${target}`)) return true;

    const sizeSuffix = sku.match(/-(xxxl|xxl|xl|l|m|s)$/i);
    return Boolean(
      sizeSuffix &&
        sku.slice(0, -sizeSuffix[0].length) === target,
    );
  }

  function findPriceRowContainer(input) {
    let current = input.parentElement;
    for (let depth = 0; current && depth < 12; depth += 1) {
      const text = elementText(current);
      if (
        text.length < 1200 &&
        text.includes("参考申报价格") &&
        parseSkuLabel(text)
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function readPriceRows(editor) {
    const inputs = [...editor.querySelectorAll("input")].filter(
      (input) =>
        isVisible(input) &&
        !input.disabled &&
        (normalizeText(input.placeholder).includes("请输入") ||
          normalizeText(input.parentElement?.innerText).includes("¥")),
    );
    const rows = [];
    const seen = new Set();

    for (const input of inputs) {
      if (seen.has(input)) continue;
      seen.add(input);
      const rowElement = findPriceRowContainer(input);
      if (!rowElement) continue;
      const text = elementText(rowElement);
      const sku = parseSkuLabel(text);
      const referenceMatch = text.match(
        /参考申报价格[：:]\s*[¥￥]?\s*([\d,]+(?:\.\d+)?)/,
      );
      if (!sku || !referenceMatch) continue;
      rows.push({
        input,
        rowElement,
        skuLabel: sku.skuLabel,
        colorGroup: sku.colorGroup,
        referencePrice: Number(referenceMatch[1].replace(/,/g, "")),
        referenceCents: toCents(referenceMatch[1].replace(/,/g, "")),
      });
    }

    return rows;
  }

  function getScrollContainers(root) {
    const containers = [root, ...root.querySelectorAll("*")].filter(
      (element) =>
        isVisible(element) &&
        element.scrollHeight > element.clientHeight + 20 &&
        ["auto", "scroll"].includes(
          window.getComputedStyle(element).overflowY,
        ),
    );
    return containers;
  }

  async function collectPriceRowsWithScrolling(editor, targetColorGroup) {
    const byInput = new Map();
    const collect = () => {
      for (const row of readPriceRows(editor)) {
        byInput.set(row.input, row);
      }
    };

    collect();
    for (const container of getScrollContainers(editor)) {
      const originalTop = container.scrollTop;
      container.scrollTop = 0;
      await sleep(30);
      collect();
      const step = Math.max(200, Math.floor(container.clientHeight * 0.75));
      for (
        let position = 0;
        position <= container.scrollHeight;
        position += step
      ) {
        container.scrollTop = position;
        await sleep(20);
        collect();
      }
      container.scrollTop = originalTop;
    }

    return [...byInput.values()].map((row) => ({
      ...row,
      isTarget: skuMatchesColorGroup(row.skuLabel, targetColorGroup),
    }));
  }

  function validatePriceRows(rows, targetCents, genericCents) {
    const failures = [];
    const prepared = rows.map((row) => {
      const desiredCents = row.isTarget ? targetCents : genericCents;
      const rowFailure =
        !row.referenceCents ||
        !desiredCents ||
        desiredCents > row.referenceCents;
      if (rowFailure) {
        failures.push({
          skuLabel: row.skuLabel,
          expectedCents: desiredCents,
          referenceCents: row.referenceCents,
        });
      }
      return { ...row, desiredCents, rowFailure };
    });

    return { prepared, failures };
  }

  async function fillPriceRows(rows) {
    const filled = [];
    for (const row of rows) {
      row.input.scrollIntoView({ block: "center" });
      const value = (row.desiredCents / 100).toFixed(2);
      setNativeValue(row.input, value);
      await sleep(15);
      const actualCents = toCents(row.input.value);
      if (actualCents !== row.desiredCents) {
        throw new PageError(
          "PRICE_READBACK_FAILED",
          `${row.skuLabel} 价格回读不一致`,
          { expectedCents: row.desiredCents, actualCents },
        );
      }
      filled.push({
        skuLabel: row.skuLabel,
        price: Number((actualCents / 100).toFixed(2)),
        priceType: row.isTarget ? "指定规格" : "通用规格",
        referencePrice: row.referencePrice,
      });
    }
    return filled;
  }

  async function cancelPriceEditor(editor) {
    const cancel = findActionByText(editor, "取消", { exact: true });
    if (cancel) clickElement(cancel);
    await sleep(120);
  }

  async function abandonAcceleration(outerOverlay) {
    const abandon =
      findActionByText(outerOverlay, "放弃加速机会", { exact: true }) ||
      findActionByText(outerOverlay, "关闭", { exact: false });
    if (abandon) clickElement(abandon);
    await sleep(120);
  }

  function serializePriceFailures(failures) {
    return failures.slice(0, 200).map((failure) => ({
      skuLabel: failure.skuLabel,
      expectedPrice: failure.expectedCents
        ? Number((failure.expectedCents / 100).toFixed(2))
        : null,
      referencePrice: failure.referenceCents
        ? Number((failure.referenceCents / 100).toFixed(2))
        : null,
    }));
  }

  async function processSite({
    siteName,
    targetColorGroup,
    targetPriceCents,
    genericPriceCents,
  }) {
    ensureFluxPage();
    const rows = getResultRows();
    const row = rows.find(
      (candidate) => parseResultRow(candidate).siteName === siteName,
    );
    if (!row) {
      return { status: "NO_SITE", reason: "当前查询结果中未找到目标站点" };
    }

    const initial = await openSiteAcceleration(row);
    if (initial === "ALREADY_ACTIVE") {
      return { status: "ALREADY_ACTIVE", reason: "该站点已加速" };
    }
    if (initial === "NOT_ELIGIBLE") {
      return { status: "NOT_ELIGIBLE", reason: "没有获取加速资格" };
    }

    const outerOverlay = findOverlayByKeyword("流量加速器");
    if (!outerOverlay) {
      throw new PageError("ACCELERATION_MODAL_NOT_FOUND", "未找到加速设置弹窗");
    }

    let editor = null;
    try {
      editor = await openCustomPriceEditor(outerOverlay);
      const priceRows = await collectPriceRowsWithScrolling(
        editor,
        targetColorGroup,
      );
      if (!priceRows.length) {
        throw new PageError("PRICE_ROWS_NOT_FOUND", "未读取到价格输入行");
      }

      const skuLabels = priceRows.map((rowInfo) => rowInfo.skuLabel);
      if (new Set(skuLabels).size !== skuLabels.length) {
        throw new PageError(
          "DUPLICATE_PRICE_ROW",
          "价格页存在重复 SKU，已停止避免重复填写",
        );
      }

      const targetCount = priceRows.filter((rowInfo) => rowInfo.isTarget).length;
      if (!targetCount) {
        throw new PageError(
          "TARGET_SKU_NOT_FOUND",
          `未找到指定颜色组：${targetColorGroup}`,
        );
      }
      const genericCount = priceRows.length - targetCount;

      const validation = validatePriceRows(
        priceRows,
        targetPriceCents,
        genericPriceCents,
      );
      if (validation.failures.length) {
        await cancelPriceEditor(editor);
        editor = null;
        await abandonAcceleration(outerOverlay);
        return {
          status: "SKIPPED_PRICE_LIMIT",
          reason:
            "存在高于超级流量加权参考申报价的 SKU，整条站点任务已跳过",
          priceRowCount: priceRows.length,
          targetSkuCount: targetCount,
          genericSkuCount: genericCount,
          overLimitSkus: serializePriceFailures(validation.failures),
        };
      }

      const finalPrices = await fillPriceRows(validation.prepared);
      const confirm = findActionByText(editor, "确认", { exact: true });
      if (!confirm) {
        throw new PageError("PRICE_CONFIRM_NOT_FOUND", "未找到价格确认按钮");
      }
      clickElement(confirm);
      await waitFor(() => !findOverlayByKeyword("调整申报价"), {
        timeout: 15000,
        message: "价格确认后弹窗未关闭",
      });
      editor = null;
      await sleep(120);

      const submit = findActionByText(
        findOverlayByKeyword("流量加速器"),
        "立即加速",
        { exact: true },
      );
      if (!submit) {
        throw new PageError("SUBMIT_BUTTON_NOT_FOUND", "未找到立即加速按钮");
      }
      clickElement(submit);
      const confirmation = await waitFor(
        () => findOverlayByKeyword("确认选择"),
        {
          timeout: 2000,
          interval: 100,
          message: "等待提交二次确认超时",
        },
      ).catch(() => null);
      if (confirmation) {
        const confirmSubmit = findActionByText(confirmation, "确认", {
          exact: true,
        });
        if (!confirmSubmit) {
          throw new PageError(
            "SUBMIT_CONFIRM_NOT_FOUND",
            "二次确认弹窗未找到确认按钮",
          );
        }
        clickElement(confirmSubmit);
      }
      await sleep(400);

      return {
        status: "SUBMITTED",
        reason: "已自动提交，等待查询验证",
        priceRowCount: priceRows.length,
        targetSkuCount: targetCount,
        genericSkuCount: genericCount,
        minTargetReferencePrice: Math.min(
          ...priceRows
            .filter((rowInfo) => rowInfo.isTarget)
            .map((rowInfo) => rowInfo.referencePrice),
        ),
        minGenericReferencePrice: genericCount
          ? Math.min(
              ...priceRows
                .filter((rowInfo) => !rowInfo.isTarget)
                .map((rowInfo) => rowInfo.referencePrice),
            )
          : null,
        finalPrices,
      };
    } catch (error) {
      if (editor || findOverlayByKeyword("调整申报价")) {
        await cancelPriceEditor(editor || findOverlayByKeyword("调整申报价"));
      }
      const currentOuter = findOverlayByKeyword("流量加速器");
      if (currentOuter) await abandonAcceleration(currentOuter);
      throw error;
    }
  }

  globalThis.TemuAcceleratorDom = {
    PageError,
    abandonAcceleration,
    cancelPriceEditor,
    classifySku: skuMatchesColorGroup,
    clickElement,
    collectPriceRowsWithScrolling,
    ensureFluxPage,
    fillPriceRows,
    findClickableByText,
    findFluxSearchInput,
    findOverlayByKeyword,
    findQueryButton,
    getPageRegion,
    getResultRows,
    getResultTotal,
    loadAllResultRows,
    lookupSkc,
    normalizeText,
    openSiteAcceleration,
    parseResultRow,
    processSite,
    searchSkc,
    sleep,
    switchRegion,
    validatePriceRows,
    waitFor,
    waitForOverlay,
  };
})();
