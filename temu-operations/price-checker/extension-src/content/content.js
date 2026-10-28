(() => {
  if (globalThis.__temuPricingAssistantContentLoaded) {
    return;
  }
  globalThis.__temuPricingAssistantContentLoaded = true;

  const TARGET_PATH = "/newon/product-select";
  let activeAutomationRun = null;

  function throwIfCancelled() {
    if (!activeAutomationRun?.cancelled) {
      return;
    }
    const error = new Error("任务已按用户要求暂停");
    error.code = "CANCELLED";
    throw error;
  }

  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function isVisible(element) {
    if (!(element instanceof Element)) {
      return false;
    }
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function findByExactText(text) {
    const expected = normalizeText(text);
    const candidates = document.querySelectorAll(
      "button, [role='button'], [role='option'], option, a, span, div",
    );
    return [...candidates].find(
      (element) => isVisible(element) && normalizeText(element.textContent) === expected,
    );
  }

  function visibleDialog() {
    const candidates = document.querySelectorAll(
      "[role='dialog'], dialog, [class*='modal'], [class*='Modal'], [class*='drawer']",
    );
    return [...candidates].find((element) => {
      if (!isVisible(element)) {
        return false;
      }
      const text = normalizeText(element.textContent);
      return /申报|确认价格|站点|SKU/.test(text);
    });
  }

  function findPageSizeInput() {
    const candidates = [...document.querySelectorAll("input")].filter(
      (input) =>
        input.readOnly &&
        /^\d+$/.test(input.value) &&
        [10, 20, 50, 100].includes(Number(input.value)),
    );
    return (
      candidates.find((input) => findAncestorWithText(input, "每页", 7)) ||
      candidates.at(-1) ||
      null
    );
  }

  function inspectPage() {
    const bodyText = normalizeText(document.body?.innerText);
    const url = location.href;
    const loginRedirect =
      url.includes("/auth/authentication") || url.includes("/login");
    const targetPage = new URL(url).pathname === TARGET_PATH;
    const dialog = visibleDialog();
    const tableCount = document.querySelectorAll("table").length;
    const rowLikeCount = document.querySelectorAll(
      "table tbody tr, [role='row'], [class*='table-row']",
    ).length;
    const nativeSelectCount = document.querySelectorAll("select").length;
    const pageSizeValue = findPageSizeInput()?.value || "";
    const textSignals = {
      lifecycle: bodyText.includes("上新生命周期管理"),
      priceDeclaration: bodyText.includes("价格申报"),
      pendingSeller: bodyText.includes("待卖家确认"),
      pageSize50:
        pageSizeValue === "50" ||
        /每页\s*50|50\s*条\/页/.test(bodyText),
      productQuery: /商品\s*ID|SKC\s*ID/i.test(bodyText),
      batchManage: bodyText.includes("批量管理申报价"),
      viewAndConfirm: bodyText.includes("查看并确认申报价格"),
    };

    return {
      ok: true,
      mode: "READ_ONLY_INSPECTION",
      url,
      title: document.title,
      authenticated: !loginRedirect && targetPage,
      targetPage,
      loginRedirect,
      filtersDetected:
        textSignals.pendingSeller && textSignals.pageSize50,
      pageSizeValue,
      reviewDialogDetected: Boolean(dialog),
      textSignals,
      structure: {
        tableCount,
        rowLikeCount,
        nativeSelectCount,
      },
      capabilities: {
        canReadPage: true,
        canMutatePage: true,
        canSubmit: true,
      },
      nextStep: targetPage
        ? "可以开始自动核价"
        : "请打开 /newon/product-select 页面",
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(predicate, timeout = 15000, interval = 150) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const result = predicate();
      if (result) {
        return result;
      }
      await sleep(interval);
    }
    throw new Error("等待页面更新超时");
  }

  function progress(message, detail = {}) {
    chrome.runtime
      .sendMessage({
        type: "TEMU_AUTOMATION_PROGRESS",
        message,
        ...detail,
      })
      .catch(() => {});
  }

  function findVisibleButton(text) {
    const expected = normalizeText(text);
    return [...document.querySelectorAll("button, [role='button'], a")].find(
      (element) =>
        isVisible(element) &&
        normalizeText(element.innerText || element.textContent) === expected,
    );
  }

  function clickElement(element) {
    if (!element) {
      throw new Error("找不到需要点击的页面控件");
    }
    element.scrollIntoView({ block: "center", inline: "center" });
    element.focus?.();
    const rect = element.getBoundingClientRect();
    const options = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
    element.dispatchEvent(new PointerEvent("pointerdown", options));
    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.dispatchEvent(new PointerEvent("pointerup", options));
    element.dispatchEvent(new MouseEvent("mouseup", options));
    element.click();
  }

  function setInputValue(input, value) {
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }

  function parseMoneyCents(text) {
    const match = String(text ?? "")
      .replace(/,/g, "")
      .match(/(\d+(?:\.\d+)?)/);
    return match ? Math.round(Number(match[1]) * 100) : null;
  }

  function amountText(cents) {
    return Number.isInteger(cents) ? (cents / 100).toFixed(2) : "";
  }

  function decide(platformRmbCents, floorRmbCents, policy) {
    if (
      !Number.isInteger(platformRmbCents) ||
      !Number.isInteger(floorRmbCents) ||
      platformRmbCents <= 0 ||
      floorRmbCents <= 0
    ) {
      return "BLOCKED";
    }
    if (
      platformRmbCents > floorRmbCents ||
      (platformRmbCents === floorRmbCents && policy === "GREATER_OR_EQUAL")
    ) {
      return "ACCEPT_PLATFORM";
    }
    return "REPRICE";
  }

  function findAncestorWithText(element, text, maxDepth = 8) {
    let current = element;
    for (let depth = 0; current && depth < maxDepth; depth += 1) {
      if (normalizeText(current.innerText || current.textContent).includes(text)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  async function ensurePageSize() {
    const pageSizeInput = findPageSizeInput();
    if (!pageSizeInput) {
      throw new Error("没有找到每页条数控件");
    }
    if (pageSizeInput.value === "50") {
      return;
    }

    clickElement(pageSizeInput);
    await sleep(250);
    const option = [...document.querySelectorAll("[role='option'], li")].find(
      (element) =>
        isVisible(element) &&
        /^(50|50条\/页|50 条\/页)$/.test(normalizeText(element.textContent)),
    );
    if (!option) {
      throw new Error("没有找到每页 50 条选项");
    }
    clickElement(option);
    await sleep(500);
  }

  async function ensurePendingStatus() {
    const priceDeclarationTab = [...document.querySelectorAll(
      "[data-testid='beast-core-tab-itemLabel']",
    )].find((element) =>
      normalizeText(element.innerText).startsWith("价格申报中"),
    );
    if (!priceDeclarationTab) {
      throw new Error("没有找到价格申报中标签");
    }
    if (!priceDeclarationTab.classList.contains("TAB_active_5-124-3")) {
      clickElement(
        priceDeclarationTab.closest(
          "[data-testid='beast-core-tab-itemLabel-wrapper']",
        ) || priceDeclarationTab,
      );
      await sleep(700);
    }

    const statusLabels = [...document.querySelectorAll(
      "label[data-testid='beast-core-checkbox']",
    )].filter((element) =>
      ["价格申报中", "待卖家确认", "已生效", "已作废"].includes(
        normalizeText(element.innerText),
      ),
    );
    const label = statusLabels.find(
      (element) => normalizeText(element.innerText) === "待卖家确认",
    );
    if (!label) {
      throw new Error("没有找到待卖家确认筛选项");
    }
    for (const statusLabel of statusLabels) {
      const input = statusLabel.querySelector("input[type='checkbox']");
      const shouldBeChecked = statusLabel === label;
      if (input && input.checked !== shouldBeChecked) {
        clickElement(statusLabel);
        await sleep(120);
      }
    }
    await sleep(500);
    if (!label.querySelector("input")?.checked) {
      throw new Error("无法选择待卖家确认状态");
    }
  }

  function getProductTable() {
    const drawer = findDrawer();
    const candidates = [...document.querySelectorAll("table")]
      .filter(
        (table) =>
          table.querySelectorAll("tbody tr").length > 0 &&
          !(drawer && drawer.contains(table)),
      )
      .sort(
        (left, right) =>
          right.querySelectorAll("tbody tr").length -
          left.querySelectorAll("tbody tr").length,
      );
    return candidates[0] || null;
  }

  function readProductResultCount() {
    const countElement = [...document.querySelectorAll("div, span")].find(
      (element) =>
        isVisible(element) &&
        /^共有\s*\d+\s*条$/.test(normalizeText(element.innerText)),
    );
    const match = normalizeText(countElement?.innerText).match(
      /共有\s*(\d+)\s*条/,
    );
    return match ? Number(match[1]) : null;
  }

  function getScrollableAncestor(table, boundary) {
    let current = table?.parentElement;
    while (current && current !== boundary) {
      const style = getComputedStyle(current);
      if (
        ["auto", "scroll"].includes(style.overflowY) &&
        current.scrollHeight > current.clientHeight + 20
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  async function scanProductTableSkcs(
    table,
    requestedIds,
    expectedCount = null,
  ) {
    const requested = new Set(requestedIds);
    const found = new Set();
    const targetCount = Math.min(
      requested.size,
      Number.isInteger(expectedCount) ? expectedCount : requested.size,
    );
    const collect = () => {
      const text = table?.innerText || "";
      for (const skcId of requested) {
        if (text.includes(skcId)) {
          found.add(skcId);
        }
      }
    };
    if (!table) {
      return [];
    }

    collect();
    const scrollContainer = getScrollableAncestor(table, document.body);
    if (!scrollContainer) {
      return [...found];
    }

    const originalScrollTop = scrollContainer.scrollTop;
    let previousCount = -1;
    let stablePasses = 0;
    for (let pass = 0; pass < 4 && found.size < targetCount; pass += 1) {
      const maxScroll = Math.max(
        0,
        scrollContainer.scrollHeight - scrollContainer.clientHeight,
      );
      const step = Math.max(
        250,
        Math.floor(scrollContainer.clientHeight * 0.65),
      );
      for (let offset = 0; offset <= maxScroll; offset += step) {
        throwIfCancelled();
        scrollContainer.scrollTop = offset;
        scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
        await sleep(220);
        collect();
      }
      scrollContainer.scrollTop = maxScroll;
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(350);
      collect();
      stablePasses =
        found.size === previousCount && found.size >= targetCount
          ? stablePasses + 1
          : 0;
      previousCount = found.size;
      if (stablePasses >= 1) {
        break;
      }
    }
    scrollContainer.scrollTop = originalScrollTop;
    scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
    await sleep(200);
    return [...found];
  }

  async function clearProductSelection() {
    const table = getProductTable();
    const headerCheckbox = table?.querySelector(
      "thead input[type='checkbox']",
    );
    if (headerCheckbox?.checked) {
      clickElement(headerCheckbox);
      await sleep(400);
    }
  }

  async function querySkcs(skcIds) {
    const input = [...document.querySelectorAll("input")].find((element) =>
      element.placeholder?.includes("多个查询"),
    );
    if (!input) {
      throw new Error("没有找到 SKC 批量查询输入框");
    }

    await clearProductSelection();
    setInputValue(input, skcIds.join(" "));
    await sleep(150);
    const queryButton = findVisibleButton("查询");
    if (!queryButton) {
      throw new Error("没有找到查询按钮");
    }
    clickElement(queryButton);
    const startedAt = Date.now();
    let lastSignature = "";
    let stableChecks = 0;
    let lastCount = null;

    while (Date.now() - startedAt < 30000) {
      throwIfCancelled();
      await sleep(350);
      const resultCount = readProductResultCount();
      const signature = String(resultCount ?? "unknown");
      if (signature === lastSignature) {
        stableChecks += 1;
      } else {
        lastSignature = signature;
        stableChecks = 0;
        lastCount = resultCount;
      }
      if (
        stableChecks >= 4 &&
        Date.now() - startedAt >=
          (resultCount === null ? 6000 : 3500)
      ) {
        break;
      }
    }

    await sleep(350);
    const productTable = getProductTable();
    const resultCount = readProductResultCount();
    const returnedSkcIds = await scanProductTableSkcs(
      productTable,
      skcIds,
      resultCount,
    );
    return {
      requestedSkcIds: [...skcIds],
      returnedSkcIds,
      missingSkcIds: skcIds.filter((id) => !returnedSkcIds.includes(id)),
      resultCount,
      productsFound: productTable?.querySelectorAll(
        "tbody tr[data-testid='beast-core-table-body-tr']",
      ).length || 0,
    };
  }

  function createQueryGroups(skcIds, groupSize = 10) {
    const ids = [...new Set(skcIds)];
    const groups = [];
    for (let index = 0; index < ids.length; index += groupSize) {
      groups.push(ids.slice(index, index + groupSize));
    }
    return groups;
  }

  async function resolveQueryGroup(skcIds, batchNumber, groupLabel) {
    const requestedSkcIds = [...new Set(skcIds)];
    const returned = new Set();
    const noPending = new Set();
    const queryLog = [];
    progress(
      `第 ${batchNumber} 批：${groupLabel}，查询 ${requestedSkcIds.length} 个 SKC`,
    );
    const initial = await querySkcs(requestedSkcIds);
    queryLog.push({
      phase: "initial",
      requested: requestedSkcIds.length,
      returned: initial.returnedSkcIds.length,
      resultCount: initial.resultCount,
    });
    initial.returnedSkcIds.forEach((skcId) => returned.add(skcId));

    const unresolved = initial.missingSkcIds;
    let canonicalResult = null;
    if (unresolved.length) {
      progress(
        `第 ${batchNumber} 批：${groupLabel}，补查 ${unresolved.length} 个未返回 SKC`,
      );
      const retry = await querySkcs(unresolved);
      queryLog.push({
        phase: "retry",
        requested: unresolved.length,
        returned: retry.returnedSkcIds.length,
        resultCount: retry.resultCount,
      });
      retry.returnedSkcIds.forEach((skcId) => returned.add(skcId));
      retry.missingSkcIds.forEach((skcId) => noPending.add(skcId));
    }

    if (unresolved.length && returned.size) {
      const canonicalIds = [...returned].sort();
      progress(
        `第 ${batchNumber} 批：${groupLabel}，合并复核 ${canonicalIds.length} 个已返回 SKC`,
      );
      canonicalResult = await querySkcs(canonicalIds);
      queryLog.push({
        phase: "canonical",
        requested: canonicalIds.length,
        returned: canonicalResult.returnedSkcIds.length,
        resultCount: canonicalResult.resultCount,
      });
      if (
        canonicalResult.returnedSkcIds.length !== canonicalIds.length ||
        canonicalResult.missingSkcIds.length
      ) {
        throw new Error(
          `${groupLabel} 合并复核不完整：应有 ${canonicalIds.length} 个，实际返回 ${canonicalResult.returnedSkcIds.length} 个`,
        );
      }
    }

    return {
      requestedSkcIds,
      returnedSkcIds: [...returned].sort(),
      noPendingSkcIds: [...noPending].sort(),
      queryLog,
    };
  }

  async function selectAllProducts() {
    const headerTable = [...document.querySelectorAll("table")].find((table) => {
      const header = normalizeText(table.querySelector("thead")?.innerText);
      return header.includes("商品信息") && header.includes("SKC属性");
    });
    const headerCheckbox = headerTable?.querySelector("thead input[type='checkbox']");
    if (!headerCheckbox) {
      throw new Error("没有找到商品全选框");
    }
    if (!headerCheckbox.checked) {
      clickElement(headerCheckbox);
      await sleep(500);
    }

    const batchButton = findVisibleButton("批量管理申报价");
    await waitFor(
      () => batchButton && !batchButton.disabled,
      8000,
    );
    return { selected: headerCheckbox.checked };
  }

  async function openReviewDrawer() {
    const batchButton = findVisibleButton("批量管理申报价");
    if (!batchButton) {
      throw new Error("没有找到批量管理申报价");
    }
    clickElement(batchButton);

    let menuItem;
    try {
      menuItem = await waitFor(
        () =>
          [...document.querySelectorAll("body *")].find(
            (element) =>
              isVisible(element) &&
              element.children.length === 0 &&
              normalizeText(element.textContent) === "查看并确认申报价格",
          ),
        4000,
      );
    } catch {
      clickElement(batchButton);
      menuItem = await waitFor(
        () =>
          [...document.querySelectorAll("body *")].find(
            (element) =>
              isVisible(element) &&
              element.children.length === 0 &&
              normalizeText(element.textContent) === "查看并确认申报价格",
          ),
        5000,
      );
    }
    clickElement(menuItem.closest("li") || menuItem);

    return waitFor(() => {
      return [...document.querySelectorAll(
        "[role='dialog'], dialog, [class*='modal'], [class*='Modal'], [class*='drawer']",
      )].find(
        (element) =>
          isVisible(element) &&
          element.getBoundingClientRect().width > 500 &&
          normalizeText(element.innerText).includes("查看并确认申报价格"),
      );
    }, 10000);
  }

  function findDrawer() {
    return [...document.querySelectorAll(
      "[role='dialog'], dialog, [class*='modal'], [class*='Modal'], [class*='drawer']",
    )].find(
      (element) =>
        isVisible(element) &&
        element.getBoundingClientRect().width > 500 &&
        normalizeText(element.innerText).includes("查看并确认申报价格"),
    );
  }

  async function filterDrawerSites(drawer, countries) {
    const desired = new Set(countries.map((country) => `${country.siteName}站`));
    const getSiteLabels = () =>
      [...drawer.querySelectorAll("label[data-testid='beast-core-checkbox']")].filter(
        (label) => normalizeText(label.innerText).endsWith("站"),
      );

    for (const label of getSiteLabels()) {
      const shouldBeChecked = desired.has(normalizeText(label.innerText));
      if (label.querySelector("input")?.checked !== shouldBeChecked) {
        clickElement(label);
        await sleep(180);
      }
    }
    await sleep(900);
    return desired;
  }

  function drawerExpectedGroupCount(drawer) {
    const text = normalizeText(drawer.innerText);
    const match = text.match(/SKC信息\((\d+)\)/);
    return match ? Number(match[1]) : null;
  }

  function getDrawerScrollContainer(table, drawer) {
    let current = table?.parentElement;
    while (current && current !== drawer) {
      const style = getComputedStyle(current);
      if (
        ["auto", "scroll"].includes(style.overflowY) &&
        current.scrollHeight > current.clientHeight + 20
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  async function scanDrawer(drawer, countries, policy) {
    const tables = [...drawer.querySelectorAll("table")];
    const table = tables.find(
      (candidate) =>
        candidate.querySelector("tbody") &&
        candidate.querySelectorAll("tr").length > 1,
    );
    if (!table) {
      throw new Error("没有找到价格确认表格");
    }
    const scrollContainer = getDrawerScrollContainer(table, drawer);
    const expectedGroups = drawerExpectedGroupCount(drawer);
    const configBySite = new Map(
      countries.map((country) => [`${country.siteName}站`, country]),
    );
    const groups = new Map();
    const rowsByKey = new Map();

    function addRow(group, skuLabel, platformRmbCents) {
      if (!group?.skcId || !group.siteName || !skuLabel) {
        return;
      }
      const countryConfig = configBySite.get(group.siteName);
      const floorRmbCents = countryConfig?.floorRmbCents ?? null;
      const submitPriceRmbCents =
        countryConfig?.submitPriceRmbCents ?? floorRmbCents;
      const rowKey = [
        group.skcId,
        group.siteName,
        normalizeText(skuLabel),
        platformRmbCents,
      ].join("|");
      if (rowsByKey.has(rowKey)) {
        return;
      }
      const decision = decide(platformRmbCents, floorRmbCents, policy);
      rowsByKey.set(rowKey, {
        identity: [group.skcId, group.siteName, normalizeText(skuLabel)].join("|"),
        skcId: group.skcId,
        siteName: group.siteName,
        skuLabel: normalizeText(skuLabel),
        platformRmbCents,
        floorRmbCents,
        submitPriceRmbCents,
        decision,
        submitted: false,
      });
    }

    function parseVisibleRows() {
      const tbody = table.querySelector("tbody");
      if (!tbody) {
        return;
      }
      let currentGroup = null;
      for (const tr of tbody.querySelectorAll("tr")) {
        const cells = [...tr.cells];
        const rowText = normalizeText(tr.innerText);
        if (cells.length >= 13) {
          const skcMatch = rowText.match(/SKC[：:]\s*([A-Za-z0-9_-]+)/);
          const siteName = normalizeText(cells[3]?.innerText);
          const groupKey = `${skcMatch?.[1]}|${siteName}`;
          currentGroup = {
            key: groupKey,
            skcId: skcMatch?.[1],
            siteName,
            originalPriceText: normalizeText(cells[6]?.innerText),
          };
          groups.set(groupKey, currentGroup);
          addRow(
            currentGroup,
            normalizeText(cells[2]?.innerText),
            parseMoneyCents(cells[7]?.innerText),
          );
        } else if (cells.length === 2 && currentGroup) {
          addRow(
            currentGroup,
            normalizeText(cells[0]?.innerText),
            parseMoneyCents(cells[1]?.innerText),
          );
        }
      }
    }

    if (scrollContainer) {
      let previousGroupCount = -1;
      let noGrowthPasses = 0;
      for (
        let pass = 0;
        pass < 4 &&
        (!expectedGroups || groups.size < expectedGroups) &&
        noGrowthPasses < 2;
        pass += 1
      ) {
        const maxScroll = Math.max(
          0,
          scrollContainer.scrollHeight - scrollContainer.clientHeight,
        );
        const step = Math.max(
          300,
          Math.floor(scrollContainer.clientHeight * 0.75),
        );
        for (let offset = 0; offset <= maxScroll; offset += step) {
          throwIfCancelled();
          scrollContainer.scrollTop = offset;
          scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
          await sleep(160);
          parseVisibleRows();
          if (expectedGroups && groups.size >= expectedGroups) {
            break;
          }
        }
        scrollContainer.scrollTop = maxScroll;
        scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
        await sleep(250);
        parseVisibleRows();
        noGrowthPasses =
          groups.size === previousGroupCount ? noGrowthPasses + 1 : 0;
        previousGroupCount = groups.size;
      }
      scrollContainer.scrollTop = 0;
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(180);
      parseVisibleRows();
    }
    parseVisibleRows();

    const rows = [...rowsByKey.values()];
    const ineligibleSites = new Set(
      rows
        .filter((row) =>
          ["BLOCKED", "ALREADY_SUBMITTED"].includes(row.decision),
        )
        .map((row) => row.siteName),
    );
    return { rows, groups, ineligibleSites, expectedGroups };
  }

  async function applyRepricing(table, scrollContainer, groupsToReprice) {
    if (!groupsToReprice.length) {
      return;
    }
    const targets = new Map(
      groupsToReprice.map((group) => [group.key, group]),
    );
    const processed = new Set();
    const maxScroll = scrollContainer
      ? Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
      : 0;
    const step = scrollContainer
      ? Math.max(300, Math.floor(scrollContainer.clientHeight * 0.82))
      : maxScroll + 1;

    for (let offset = 0; offset <= maxScroll && processed.size < targets.size; offset += step) {
      if (scrollContainer) {
        scrollContainer.scrollTop = offset;
        scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
        await sleep(120);
      }

      const candidateRows = [...table.querySelectorAll("tbody tr")].filter(
        (row) => row.cells.length >= 13,
      );
      for (const row of candidateRows) {
        throwIfCancelled();
        const text = normalizeText(row.innerText);
        const skcId = text.match(/SKC[：:]\s*([A-Za-z0-9_-]+)/)?.[1];
        const siteName = normalizeText(row.cells[3]?.innerText);
        const key = `${skcId}|${siteName}`;
        const target = targets.get(key);
        if (!target || processed.has(key)) {
          continue;
        }

        const selectHeader = row.cells[8]?.querySelector(
          "[data-testid='beast-core-select-header']",
        );
        if (!selectHeader) {
          throw new Error(`${siteName || "未知站点"}没有可用的调价操作控件`);
        }
        clickElement(selectHeader);
        const repriceOption = await waitFor(
          () =>
            [...document.querySelectorAll("[role='option'], li")].find(
              (element) =>
                isVisible(element) &&
                normalizeText(element.innerText) === "重新调整报价",
            ),
          4000,
        );
        clickElement(repriceOption);
        await sleep(350);

        const refreshedRow = [...table.querySelectorAll("tbody tr")].find(
          (candidate) => {
            if (candidate.cells.length < 13) {
              return false;
            }
            const candidateText = normalizeText(candidate.innerText);
            return (
              candidateText.includes(`SKC：${target.skcId}`) &&
              normalizeText(candidate.cells[3]?.innerText) === target.siteName
            );
          },
        );
        if (!refreshedRow) {
          throw new Error(`${siteName}重新调整报价后行已失效`);
        }

        const reasonLink = [...refreshedRow.cells[11]?.querySelectorAll("a") || []].find(
          (element) => ["填写", "修改"].includes(normalizeText(element.innerText)),
        );
        if (reasonLink) {
          clickElement(reasonLink);
          const reasonInput = await waitFor(
            () =>
              [...document.querySelectorAll(
                "input[data-testid='beast-core-select-htmlInput']",
              )].find((input) => {
                const drawer = input.closest("[class*='drawer-body']");
                return (
                  drawer &&
                  normalizeText(drawer.innerText).includes(
                    "补充商家调价原因",
                  ) &&
                  normalizeText(drawer.innerText).includes("具体原因")
                );
              }),
            5000,
          );
          const reasonDrawer = reasonInput.closest("[class*='drawer-body']");
          const reasonHeader =
            reasonInput?.closest("[data-testid='beast-core-select-header']") ||
            reasonInput?.parentElement?.parentElement?.parentElement;
          if (!reasonHeader) {
            throw new Error(
              `没有找到商家调价原因类型（输入框 ${reasonInput ? "已找到" : "未找到"}）`,
            );
          }
          clickElement(reasonHeader);
          const otherReason = await waitFor(
            () =>
              [...document.querySelectorAll("[role='option'], li")].find(
                (element) =>
                  isVisible(element) &&
                  normalizeText(element.innerText) === "其他",
              ),
            4000,
          );
          clickElement(otherReason);
          await sleep(200);
          const reasonTextArea = reasonDrawer.querySelector("textarea");
          if (!reasonTextArea) {
            throw new Error("没有找到具体调价原因输入框");
          }
          setInputValue(reasonTextArea, "按商家申报价还价");
          const reasonConfirm = [...reasonDrawer.querySelectorAll("button")].find(
            (button) => normalizeText(button.innerText) === "确认",
          );
          if (!reasonConfirm) {
            throw new Error("没有找到调价原因确认按钮");
          }
          clickElement(reasonConfirm);
          await waitFor(
            () =>
              ![...document.querySelectorAll("[class*='drawer-body']")].some(
                (element) => {
                  if (
                    !isVisible(element) ||
                    element.getBoundingClientRect().width <= 500
                  ) {
                    return false;
                  }
                  return [...element.querySelectorAll("*")].some(
                    (candidate) =>
                      candidate.children.length === 0 &&
                      normalizeText(candidate.textContent) ===
                        "补充商家调价原因",
                  );
                },
              ),
            4000,
          );
          await sleep(250);
        }

        const priceRow = [...table.querySelectorAll("tbody tr")].find(
          (candidate) => {
            if (candidate.cells.length < 13) {
              return false;
            }
            const candidateText = normalizeText(candidate.innerText);
            return (
              candidateText.includes(`SKC：${target.skcId}`) &&
              normalizeText(candidate.cells[3]?.innerText) === target.siteName
            );
          },
        );
        const newPriceInput = priceRow?.cells[9]?.querySelector(
          "input[data-testid='beast-core-inputNumber-htmlInput']",
        );
        if (!newPriceInput || newPriceInput.disabled) {
          throw new Error(`${siteName}新申报价格输入框不可用`);
        }
        setInputValue(
          newPriceInput,
          amountText(
            target.submitPriceRmbCents ?? target.floorRmbCents,
          ),
        );
        processed.add(key);
        await sleep(180);
      }
    }

    if (processed.size !== targets.size) {
      throw new Error(
        `重报价格未全部完成：计划 ${targets.size} 项，完成 ${processed.size} 项`,
      );
    }
  }

  async function excludeIneligibleSites(drawer, ineligibleSites) {
    for (const siteName of ineligibleSites) {
      const label = [...drawer.querySelectorAll(
        "label[data-testid='beast-core-checkbox']",
      )].find((candidate) => normalizeText(candidate.innerText) === siteName);
      const input = label?.querySelector("input");
      if (label && input?.checked) {
        clickElement(label);
        await sleep(150);
      }
    }
    await sleep(600);
  }

  async function submitDrawer(drawer) {
    const submitButton = [...drawer.querySelectorAll("button")].find((button) =>
      normalizeText(button.innerText).startsWith("全部提交("),
    );
    if (!submitButton || submitButton.disabled) {
      throw new Error("没有找到可用的全部提交按钮");
    }
    clickElement(submitButton);

    const confirmation = await waitFor(
      () => normalizeText(document.body.innerText).includes("确认提交"),
      6000,
    );
    if (!confirmation) {
      throw new Error("没有出现提交确认提示");
    }
    const confirmButton = findVisibleButton("确认");
    if (!confirmButton) {
      throw new Error("没有找到提交确认按钮");
    }
    clickElement(confirmButton);

    await waitFor(
      () =>
        !findDrawer() ||
        normalizeText(document.body.innerText).includes("已提交"),
      15000,
    );
    return true;
  }

  async function closeDrawer(drawer) {
    const cancelButton = [...drawer.querySelectorAll("button")].find(
      (button) => normalizeText(button.innerText) === "取消",
    );
    if (cancelButton) {
      clickElement(cancelButton);
      await sleep(600);
    }
  }

  async function runBatch(
    batch,
    countries,
    policy,
    lowPricePolicy,
    submitAllowed,
    skipKeys = [],
    executionState = {},
  ) {
    throwIfCancelled();
    const staleDrawer = findDrawer();
    if (staleDrawer) {
      progress(`第 ${batch.batchNumber} 批：关闭上次残留的价格确认抽屉`);
      await closeDrawer(staleDrawer);
    }
    await clearProductSelection();
    await ensurePageSize();
    throwIfCancelled();
    await ensurePendingStatus();
    throwIfCancelled();

    const queryGroups = createQueryGroups(batch.skcIds, 10);
    const rows = [];
    const requestedSkcIds = [];
    const returnedSkcIds = [];
    const noPendingSkcIds = [];
    const queryLog = [];
    let submittedCount = 0;

    for (let index = 0; index < queryGroups.length; index += 1) {
      throwIfCancelled();
      const groupLabel = `查询组 ${index + 1}/${queryGroups.length}`;
      const resolved = await resolveQueryGroup(
        queryGroups[index],
        batch.batchNumber,
        groupLabel,
      );
      requestedSkcIds.push(...resolved.requestedSkcIds);
      returnedSkcIds.push(...resolved.returnedSkcIds);
      noPendingSkcIds.push(...resolved.noPendingSkcIds);
      queryLog.push(...resolved.queryLog);
      if (!resolved.returnedSkcIds.length) {
        continue;
      }

      const result = await processQueryGroup(
        {
          ...resolved,
          batchNumber: batch.batchNumber,
          groupLabel,
        },
        countries,
        policy,
        lowPricePolicy,
        submitAllowed,
        skipKeys,
        executionState,
      );
      rows.push(...result.rows);
      submittedCount += result.submittedCount;
    }

    return {
      rows,
      submittedCount,
      requestedSkcIds: [...new Set(requestedSkcIds)],
      returnedSkcIds: [...new Set(returnedSkcIds)],
      noPendingSkcIds: [...new Set(noPendingSkcIds)],
      queryLog,
      missingSkcIds: [...new Set(noPendingSkcIds)],
      expectedGroups: null,
      drawerSkcIds: [...new Set(rows.map((row) => row.skcId))],
      note: returnedSkcIds.length ? null : "查询完成后没有待确认商品",
    };
  }

  async function processQueryGroup(
    queryGroup,
    countries,
    policy,
    lowPricePolicy,
    submitAllowed,
    skipKeys = [],
    executionState = {},
  ) {
    const batch = { batchNumber: queryGroup.batchNumber };
    const discovery = queryGroup;

    const productTable = getProductTable();
    const productRows = productTable?.querySelectorAll(
      "tbody tr[data-testid='beast-core-table-body-tr']",
    );
    if (!productRows?.length) {
      throw new Error(
        `查询已返回 ${discovery.returnedSkcIds.length} 个 SKC，但商品表格为空`,
      );
    }

    await selectAllProducts();
    throwIfCancelled();
    const drawer = await openReviewDrawer();
    throwIfCancelled();
    await filterDrawerSites(drawer, countries);
    throwIfCancelled();
    progress(`第 ${batch.batchNumber} 批：读取全部站点和 SKU 价格`);
    const scanned = await scanDrawer(drawer, countries, policy);
    if (!scanned.rows.length) {
      throw new Error("价格确认抽屉没有读取到 SKU 行");
    }
    if (
      scanned.expectedGroups &&
      scanned.groups.size !== scanned.expectedGroups
    ) {
      throw new Error(
        `价格抽屉读取不完整：页面显示 ${scanned.expectedGroups} 组，实际读取 ${scanned.groups.size} 组`,
      );
    }
    const allowedSkcIds = new Set(discovery.returnedSkcIds);
    const drawerSkcIds = [
      ...new Set(scanned.rows.map((row) => row.skcId)),
    ];
    const staleSkcIds = drawerSkcIds.filter(
      (skcId) => !allowedSkcIds.has(skcId),
    );
    if (staleSkcIds.length) {
      throw new Error(
        `价格抽屉混入本批之外的 SKC：${staleSkcIds.slice(0, 10).join("、")}`,
      );
    }
    const skipped = new Set(skipKeys);
    if (skipped.size) {
      for (const row of scanned.rows) {
        if (skipped.has(row.identity)) {
          row.decision = "ALREADY_SUBMITTED";
        }
      }
    }

    const rowsByGroup = new Map();
    for (const row of scanned.rows) {
      const key = `${row.skcId}|${row.siteName}`;
      if (!rowsByGroup.has(key)) {
        rowsByGroup.set(key, []);
      }
      rowsByGroup.get(key).push(row);
    }

    const blockedGroupKeys = new Set();
    const repriceGroupKeys = new Set();
    for (const [key, rows] of rowsByGroup) {
      if (
        rows.some((row) =>
          ["BLOCKED", "ALREADY_SUBMITTED"].includes(row.decision),
        )
      ) {
        blockedGroupKeys.add(key);
      } else if (rows.every((row) => row.decision === "REPRICE")) {
        repriceGroupKeys.add(key);
      } else if (rows.some((row) => row.decision === "REPRICE")) {
        blockedGroupKeys.add(key);
        for (const row of rows) {
          row.decision = "BLOCKED";
          row.reason = "同一站点/SKC 的 SKU 价格跨越申报价，自动操作会误改高价 SKU";
        }
      }
    }
    const countryBySite = new Map(
      countries.map((country) => [`${country.siteName}站`, country]),
    );
    const repricedGroups = [...scanned.groups.values()]
      .filter((group) => repriceGroupKeys.has(group.key))
      .map((group) => {
        const country = countryBySite.get(group.siteName);
        return {
          ...group,
          floorRmbCents: country?.floorRmbCents,
          submitPriceRmbCents:
            country?.submitPriceRmbCents ?? country?.floorRmbCents,
        };
      });
    if (repricedGroups.length) {
      progress(
        `第 ${batch.batchNumber} 批：平台价低于申报价，还价 ${repricedGroups.length} 个站点/SKC 项目`,
      );
      await applyRepricing(
        [...drawer.querySelectorAll("table")].find(
          (candidate) => candidate.querySelectorAll("tbody tr").length > 0,
        ),
        getDrawerScrollContainer(
          [...drawer.querySelectorAll("table")].find(
            (candidate) => candidate.querySelectorAll("tbody tr").length > 0,
          ),
          drawer,
        ),
        repricedGroups,
      );
      for (const row of scanned.rows) {
        if (repriceGroupKeys.has(`${row.skcId}|${row.siteName}`)) {
          row.decision = "REPRICE";
        }
      }
    }

    throwIfCancelled();

    const ineligibleSites = new Set(
      [...blockedGroupKeys].map((key) => key.split("|").at(-1)),
    );
    if (ineligibleSites.size) {
      await excludeIneligibleSites(drawer, ineligibleSites);
    }
    const eligibleSites = new Set(
      countries
        .map((country) => `${country.siteName}站`)
        .filter((siteName) => !ineligibleSites.has(siteName)),
    );
    const eligibleGroups = [...scanned.groups.values()].filter((group) =>
      eligibleSites.has(group.siteName),
    );

    let submittedCount = 0;
    if (eligibleGroups.length && submitAllowed) {
      throwIfCancelled();
      progress(
        `第 ${batch.batchNumber} 批：提交 ${eligibleGroups.length} 个站点/SKC 项目`,
      );
      executionState.submissionStarted = true;
      if (activeAutomationRun) {
        activeAutomationRun.cancelAllowed = false;
      }
      await submitDrawer(drawer);
      submittedCount = eligibleGroups.length;
      for (const row of scanned.rows) {
        if (eligibleSites.has(row.siteName)) {
          row.submitted = true;
        }
      }
    } else {
      await closeDrawer(drawer);
    }

    return {
      rows: scanned.rows,
      submittedCount,
      requestedSkcIds: discovery.requestedSkcIds,
      returnedSkcIds: discovery.returnedSkcIds,
      noPendingSkcIds: discovery.noPendingSkcIds,
      queryLog: discovery.queryLog,
      missingSkcIds: discovery.noPendingSkcIds,
      expectedGroups: scanned.expectedGroups,
      drawerSkcIds,
    };
  }

  async function runAutomation(payload) {
    if (!Array.isArray(payload?.batches) || !payload.batches.length) {
      throw new Error("没有可执行的 SKC 批次");
    }
    if (!Array.isArray(payload.countries) || !payload.countries.length) {
      throw new Error("没有选择核价站点");
    }

    const runState = { cancelled: false, cancelAllowed: true };
    activeAutomationRun = runState;
    try {
      const allRows = [];
      const batchResults = [];
      for (const batch of payload.batches) {
        throwIfCancelled();
      let result;
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        throwIfCancelled();
        const executionState = { submissionStarted: false };
        try {
          result = await runBatch(
            batch,
            payload.countries,
            payload.policy,
            payload.lowPricePolicy || "REPRICE",
            payload.submit !== false,
            payload.skipKeys || [],
            executionState,
          );
          break;
        } catch (error) {
          lastError = error;
          chrome.storage.local
            .set({
              temuPricingLastError: {
                at: new Date().toISOString(),
                batchNumber: batch.batchNumber,
                attempt,
                message: error.message,
                stack: error.stack || null,
              },
            })
            .catch(() => {});
          if (runState.cancelled || error.code === "CANCELLED") {
            error.code = "CANCELLED";
            break;
          }
          if (
            executionState.submissionStarted ||
            /登录|重新登录/.test(error.message)
          ) {
            error.code = executionState.submissionStarted
              ? "UNKNOWN_SUBMIT_STATE"
              : "AUTH_REQUIRED";
            break;
          }
          if (attempt < 3) {
            progress(
              `第 ${batch.batchNumber} 批失败：${error.message}；${[3, 8][attempt - 1]} 秒后重试（${attempt}/3）`,
            );
            const staleDrawer = findDrawer();
            if (staleDrawer) {
              await closeDrawer(staleDrawer);
            }
            await sleep([3000, 8000][attempt - 1]);
          }
        }
      }

      if (!result) {
        return {
          ok: false,
          code: lastError?.code || "BATCH_FAILED",
          error: lastError?.message || "批次处理失败",
          message: `自动核价停止：${lastError?.message || "批次处理失败"}`,
          rows: allRows,
          submittedCount: batchResults.reduce(
            (sum, item) => sum + item.submittedCount,
            0,
          ),
          batchResults,
        };
      }
      allRows.push(...result.rows);
      batchResults.push({
        batchNumber: batch.batchNumber,
        submittedCount: result.submittedCount,
        rows: result.rows.length,
        requestedSkcIds: result.requestedSkcIds || [],
        returnedSkcIds: result.returnedSkcIds || [],
        noPendingSkcIds: result.noPendingSkcIds || [],
        drawerSkcIds: result.drawerSkcIds || [],
        expectedGroups: result.expectedGroups ?? null,
        queryLog: result.queryLog || [],
        missingSkcIds: result.missingSkcIds,
        note: result.note || null,
      });
      if (activeAutomationRun) {
        activeAutomationRun.cancelAllowed = true;
      }
    }

      const requestedSkcIds = [
        ...new Set(batchResults.flatMap((item) => item.requestedSkcIds || [])),
      ];
      const returnedSkcIds = [
        ...new Set(batchResults.flatMap((item) => item.returnedSkcIds || [])),
      ];
      const noPendingSkcIds = [
        ...new Set(batchResults.flatMap((item) => item.noPendingSkcIds || [])),
      ];
      return {
        ok: true,
        rows: allRows,
        requestedSkcCount: requestedSkcIds.length,
        returnedSkcCount: returnedSkcIds.length,
        noPendingSkcCount: noPendingSkcIds.length,
        requestedSkcIds,
        returnedSkcIds,
        noPendingSkcIds,
        submittedCount: batchResults.reduce(
          (sum, result) => sum + result.submittedCount,
          0,
        ),
        batchResults,
      };
    } finally {
      if (activeAutomationRun === runState) {
        activeAutomationRun = null;
      }
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "INSPECT_PAGE") {
      try {
        sendResponse(inspectPage());
      } catch (error) {
        sendResponse({
          ok: false,
          authenticated: false,
          error: error.message,
        });
      }
      return false;
    }

    if (message?.type === "START_AUTOMATION") {
      if (activeAutomationRun) {
        sendResponse({
          ok: false,
          code: "ALREADY_RUNNING",
          error: "已有自动核价任务正在执行",
          message: "自动核价未启动：已有任务正在执行",
        });
        return false;
      }
      runAutomation(message.payload)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            ok: false,
            code: error.code || "AUTOMATION_FAILED",
            error: error.message,
            message: `自动核价停止：${error.message}`,
            inspection: inspectPage(),
          });
        });
      return true;
    }

    if (message?.type === "STOP_AUTOMATION") {
      if (!activeAutomationRun) {
        sendResponse({ ok: false, message: "当前没有正在执行的任务" });
        return false;
      }
      if (!activeAutomationRun.cancelAllowed) {
        sendResponse({
          ok: false,
          code: "SUBMIT_IN_PROGRESS",
          message: "正在提交当前批次，不能安全中断，请等待提交结果",
        });
        return false;
      }
      activeAutomationRun.cancelled = true;
      progress("已收到暂停请求，正在安全停止任务…");
      sendResponse({ ok: true, message: "已请求暂停" });
      return false;
    }

    return false;
  });
})();
