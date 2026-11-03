(function initTemuContentScript() {
  if (globalThis.__temuDownlistContentLoaded) return;
  globalThis.__temuDownlistContentLoaded = true;

  const {
    normalizeText,
    stripImageQuery,
    sleep
  } = TemuCommon;
  let panelHost = null;
  let pageBridgePromise = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) return false;

    let task;
    if (message.type === "contentPing") {
      sendResponse({
        ok: true,
        url: location.href,
        title: document.title,
        ready: true
      });
      return false;
    }

    if (message.type === "searchAndExtract") {
      task = searchAndExtract(message);
    } else if (message.type === "deletePendingSpu") {
      task = deletePendingSpu(message);
    } else if (message.type === "downlistSkc") {
      task = downlistSkc(message);
    } else if (message.type === "testDownlistForm") {
      task = testDownlistForm(message);
    } else if (message.type === "verifyDownlisted") {
      task = verifyDownlisted(message);
    } else {
      return false;
    }

    task
      .then((result) => sendResponse({ ok: true, data: result }))
      .catch((error) =>
        sendResponse({
          ok: false,
          code: error.code || "CONTENT_SCRIPT_ERROR",
          error: error.message || String(error)
        })
      );
    return true;
  });

  function scriptError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rect.width > 1 &&
      rect.height > 1
    );
  }

  function allElements(root = document) {
    return [...root.querySelectorAll("*")];
  }

  function leafByExactText(text, root = document) {
    const expected = normalizeText(text);
    return allElements(root).filter(
      (element) =>
        element.children.length === 0 &&
        isVisible(element) &&
        normalizeText(element.textContent) === expected
    );
  }

  function clickableAncestor(element) {
    let cursor = element;
    for (let depth = 0; cursor && depth < 8; depth += 1) {
      const tag = cursor.tagName?.toLowerCase();
      const role = cursor.getAttribute?.("role");
      const style = getComputedStyle(cursor);
      if (
        tag === "button" ||
        tag === "a" ||
        role === "button" ||
        style.cursor === "pointer"
      ) {
        return cursor;
      }
      cursor = cursor.parentElement;
    }
    return element;
  }

  function dispatchMouseClick(element) {
    if (!element) return false;
    element.scrollIntoView({ block: "center", inline: "center" });
    for (const type of ["mousedown", "mouseup", "click"]) {
      element.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0
        })
      );
    }
    return true;
  }

  function clickExactText(text, root = document, options = {}) {
    const candidates = leafByExactText(text, root);
    if (!candidates.length) return false;
    const ordered = options.last ? candidates.reverse() : candidates;
    for (const candidate of ordered) {
      const clickable = clickableAncestor(candidate);
      if (clickable && isVisible(clickable)) {
        dispatchMouseClick(clickable);
        return true;
      }
    }
    return false;
  }

  function clickTextPrefix(prefix, root = document) {
    const expected = normalizeText(prefix);
    const candidates = allElements(root).filter(
      (element) =>
        element.children.length === 0 &&
        isVisible(element) &&
        normalizeText(element.textContent).startsWith(expected)
    );
    for (const candidate of candidates) {
      const clickable = clickableAncestor(candidate);
      if (clickable && isVisible(clickable)) {
        dispatchMouseClick(clickable);
        return true;
      }
    }
    return false;
  }

  function findInputByPlaceholder(fragment, root = document) {
    const needle = normalizeText(fragment);
    return allElements(root)
      .filter((element) => element.matches?.("input,textarea") && isVisible(element))
      .find((element) => normalizeText(element.placeholder).includes(needle));
  }

  function setNativeInputValue(input, value) {
    if (!input) return false;
    input.focus();
    input.select?.();
    try {
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, String(value));
    } catch (_) {
      // fall through
    }

    if (input.value !== String(value)) {
      const prototype =
        input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(input, String(value));
    }

    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: false,
        inputType: "insertText",
        data: String(value)
      })
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return input.value === String(value);
  }

  async function waitFor(check, timeoutMs = 15000, intervalMs = 160) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const result = check();
        if (result) return result;
      } catch (_) {
        // Keep waiting; React may temporarily detach nodes.
      }
      await sleep(intervalMs);
    }
    return null;
  }

  function visibleText() {
    return normalizeText(document.body?.innerText || "");
  }

  function hasNoResultsText() {
    return /暂无数据|暂无结果|未查询到|没有查询到|无符合条件/.test(visibleText());
  }

  async function ensureQueryType(queryType, timeoutMs = 5000) {
    const expectedType = normalizeText(queryType).toUpperCase();
    if (!["SPU", "SKC"].includes(expectedType)) {
      throw scriptError("QUERY_TYPE_INVALID", `不支持的查询类型：${queryType}`);
    }
    const getSelect = () =>
      allElements()
        .filter(
          (element) =>
            element.matches?.("input") &&
            isVisible(element) &&
            ["SPU", "SKC"].includes(normalizeText(element.value))
        )
        .find(Boolean);

    const select = getSelect();
    if (!select) throw scriptError("QUERY_TYPE_NOT_FOUND", "未找到 SPU/SKC 查询类型下拉框");
    if (normalizeText(select.value) === expectedType) return true;

    dispatchMouseClick(select.parentElement);
    const option = await waitFor(() => {
      return allElements()
        .filter(
          (element) =>
            element.matches?.('li[role="option"]') &&
            isVisible(element) &&
            normalizeText(element.textContent) === expectedType
        )
        .find(Boolean);
    }, timeoutMs);

    if (!option) {
      throw scriptError("QUERY_OPTION_NOT_FOUND", `查询类型未找到 ${expectedType} 选项`);
    }
    dispatchMouseClick(option);

    const changed = await waitFor(
      () => normalizeText(getSelect()?.value) === expectedType,
      timeoutMs
    );
    if (!changed) {
      throw scriptError(
        "QUERY_OPTION_CHANGE_FAILED",
        `查询类型未能切换为 ${expectedType}`
      );
    }
    return true;
  }

  async function activateAllTasksTab(timeoutMs = 7000) {
    const findTab = () =>
      allElements().find(
        (element) =>
          isVisible(element) &&
          String(element.className || "").includes("TAB_tabItem_") &&
          normalizeText(element.innerText).startsWith("全部")
      );

    let tab = await waitFor(findTab, Math.max(timeoutMs, 12000));
    if (!tab) {
      throw scriptError("ALL_TAB_NOT_FOUND", "页面任务栏尚未加载完成");
    }
    if (String(tab.className || "").includes("TAB_active_")) return true;

    dispatchMouseClick(tab);
    const activated = await waitFor(() => {
      const current = findTab();
      return current && String(current.className || "").includes("TAB_active_")
        ? current
        : null;
    }, timeoutMs);
    if (!activated) {
      throw scriptError("ALL_TAB_ACTIVATE_FAILED", "无法切换到“全部”任务栏");
    }
    await sleep(450);
    return true;
  }

  function findResultRow(queryType, queryId) {
    const idPattern =
      queryType === "SPU"
        ? new RegExp(`SPU[：:]\\s*${queryId}`)
        : new RegExp(`货品SKC[：:]\\s*${queryId}`);
    const candidates = allElements().filter((element) => {
      if (!isVisible(element)) return false;
      const text = normalizeText(element.innerText);
      return (
        text.length < 2500 &&
        idPattern.test(text) &&
        /SPU[：:]\s*\d+/.test(text) &&
        /货号[：:]\s*[^\s]+/.test(text) &&
        /货品SKC[：:]\s*\d+/.test(text)
      );
    });

    candidates.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
    });
    return candidates[0] || null;
  }

  function extractMainImage(row) {
    const images = [...row.querySelectorAll("img")]
      .filter((image) => {
        const source = image.currentSrc || image.src || "";
        return isVisible(image) && /img\d*\.kwcdn\.com\/product\//.test(source);
      })
      .map((image) => {
        const rect = image.getBoundingClientRect();
        return {
          source: image.currentSrc || image.src,
          area: rect.width * rect.height,
          x: rect.x
        };
      })
      .sort((left, right) => right.area - left.area || left.x - right.x);

    return images[0]?.source || "";
  }

  function extractFirstCarouselImage(row, spu, skc) {
    const documentRow = allElements().find(
      (element) =>
        element.matches?.("tr") &&
        isVisible(element) &&
        new RegExp(`SPU[：:]\\s*${spu}(?!\\d)`).test(normalizeText(element.innerText)) &&
        normalizeText(element.innerText).includes(String(skc)) &&
        normalizeText(element.innerText).includes("轮播图-")
    );
    const scope = documentRow || row.closest?.("tr") || row;
    const images = [...scope.querySelectorAll("img")].filter((candidate) => {
        const source = candidate.currentSrc || candidate.src || "";
        return isVisible(candidate) && /img\d*\.kwcdn\.com\/product\//.test(source);
      });
    const carouselImage =
      images.find(
        (image) => !image.closest('[class*="hooks_productInfo"]')
      ) || images[1] || null;
    return carouselImage?.currentSrc || carouselImage?.src || "";
  }

  function extractReactRecord(row, expectedId) {
    if (!row) return null;
    const nodes = [row, ...row.querySelectorAll("*")];
    for (const node of nodes) {
      const propKey = Object.keys(node).find((key) => key.startsWith("__reactProps$"));
      if (!propKey) continue;

      const seen = new Set();
      const queue = [{ value: node[propKey], depth: 0 }];
      while (queue.length) {
        const current = queue.shift();
        const value = current?.value;
        if (!value || typeof value !== "object" || current.depth > 7) continue;
        if (seen.has(value)) continue;
        seen.add(value);

        if (
          value.mainUrl &&
          String(value.productId || "") === String(expectedId)
        ) {
          return value;
        }
        if (seen.size > 1500) break;

        for (const key of Object.keys(value).slice(0, 80)) {
          if (
            key.startsWith("__react") ||
            ["return", "child", "sibling", "stateNode", "alternate"].includes(key)
          ) {
            continue;
          }
          let child;
          try {
            child = value[key];
          } catch (_) {
            continue;
          }
          if (child && typeof child === "object") {
            queue.push({ value: child, depth: current.depth + 1 });
          }
        }
      }
    }
    return null;
  }

  async function ensurePageBridge() {
    if (!pageBridgePromise) {
      pageBridgePromise = chrome.runtime
        .sendMessage({ type: "injectMainWorldBridge" })
        .then((response) => {
          if (!response?.ok) {
            throw new Error(response?.error || "页面数据桥接注入失败");
          }
          return true;
        })
        .catch((error) => {
          pageBridgePromise = null;
          throw error;
        });
    }
    return pageBridgePromise;
  }

  async function requestPageRecord(queryType, id) {
    await ensurePageBridge();
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => finish(null), 5000);

      function finish(record) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        resolve(record);
      }

      function onMessage(event) {
        if (event.source !== window || event.origin !== location.origin) return;
        const data = event.data;
        if (
          data?.source === "temu-downlist-page-bridge" &&
          data.type === "extractRecordResult" &&
          data.requestId === requestId
        ) {
          finish(data.record || null);
        }
      }

      window.addEventListener("message", onMessage);
      window.postMessage(
        {
          source: "temu-downlist-content",
          type: "extractRecord",
          requestId,
          queryType,
          id
        },
        location.origin
      );
    });
  }

  async function searchAndExtract({
    queryType,
    id,
    spuId,
    skc,
    preferCarouselFirst = false,
    timeoutMs = 22000
  }) {
    const expectedType = normalizeText(queryType || (spuId ? "SPU" : "SKC")).toUpperCase();
    const cleanId = normalizeText(id || spuId || skc);
    if (!["SPU", "SKC"].includes(expectedType)) {
      throw scriptError("QUERY_TYPE_INVALID", `不支持的查询类型：${expectedType}`);
    }
    if (!/^\d{8,20}$/.test(cleanId)) {
      throw scriptError("QUERY_ID_INVALID", `${expectedType} 格式异常：${cleanId || "空"}`);
    }
    if (!location.href.includes("/material/image-task")) {
      throw scriptError("WRONG_PAGE", "当前不是图片/视频更新任务页面");
    }

    await activateAllTasksTab();
    await ensureQueryType(expectedType);
    const input = findInputByPlaceholder("批量查询按照空格/逗号");
    if (!input) throw scriptError("QUERY_INPUT_NOT_FOUND", "未找到编号查询输入框");
    setNativeInputValue(input, cleanId);
    await sleep(180);

    if (!clickExactText("查询")) {
      throw scriptError("QUERY_BUTTON_NOT_FOUND", "未找到查询按钮");
    }

    const queryStartedAt = Date.now();
    await sleep(500);
    const outcome = await waitFor(() => {
      const row = findResultRow(expectedType, cleanId);
      if (row) return { type: "found", row };
      if (Date.now() - queryStartedAt >= 2500 && hasNoResultsText()) {
        return { type: "empty" };
      }
      return null;
    }, timeoutMs);

    if (!outcome) {
      throw scriptError("SEARCH_TIMEOUT", `查询 ${expectedType} ${cleanId} 超时`);
    }
    if (outcome.type === "empty") {
      return {
        found: false,
        queryType: expectedType,
        queryId: cleanId,
        reason: "NO_RESULT"
      };
    }

    let activeRow = outcome.row;
    const rowText = normalizeText(activeRow.innerText);
    const spu = rowText.match(/SPU[：:]\s*(\d+)/)?.[1] || "";
    const goodsCode = rowText.match(/货号[：:]\s*([^\s]+)/)?.[1] || "";
    const pageSkc =
      rowText.match(/货品SKC[：:]\s*(\d+)/)?.[1] || "";
    const bridgeRecord = await requestPageRecord(expectedType, cleanId);
    if (preferCarouselFirst) {
      const targetRow = activeRow.closest?.("tr") || activeRow;
      targetRow.scrollIntoView?.({ block: "center", inline: "center" });
      await sleep(500);
    }
    const carouselImage = preferCarouselFirst
      ? bridgeRecord?.productImages?.[0] ||
        await waitFor(
          () => extractFirstCarouselImage(activeRow, spu, pageSkc),
          7000,
          180
        )
      : "";
    const bridgeImageUrl = carouselImage || bridgeRecord?.mainUrl || "";
    const mediaOutcome = bridgeImageUrl
      ? {
          row: activeRow,
          record: bridgeRecord,
          url: stripImageQuery(bridgeImageUrl),
          source: carouselImage ? "carousel" : "main"
        }
      : await waitFor(
      () => {
        const latestRow = findResultRow(expectedType, cleanId);
        if (!latestRow) return null;
        const latestRecord = extractReactRecord(
          latestRow,
          expectedType === "SPU" ? cleanId : spu
        );
        const latestCarouselImage = preferCarouselFirst
          ? latestRecord?.productImages?.[0] ||
            extractFirstCarouselImage(latestRow, spu, pageSkc)
          : "";
        const url =
          latestCarouselImage ||
          latestRecord?.mainUrl ||
          extractMainImage(latestRow);
        return url
          ? {
              row: latestRow,
              record: latestRecord,
              url: stripImageQuery(url),
              source: latestCarouselImage ? "carousel" : "main"
            }
          : null;
      },
        7000,
        180
      );
    let record = null;
    let imageUrl = "";
    let imageSource = "main";
    if (mediaOutcome) {
      activeRow = mediaOutcome.row;
      record = mediaOutcome.record;
      imageUrl = mediaOutcome.url;
      imageSource = mediaOutcome.source || "main";
    }

    if (!spu || !goodsCode || !pageSkc) {
      throw scriptError(
        "EXTRACT_FAILED",
        `查询成功但字段不完整：SPU=${spu || "-"}，货号=${goodsCode || "-"}，SKC=${pageSkc || "-"}`
      );
    }
    if (expectedType === "SKC" && pageSkc !== cleanId) {
      throw scriptError(
        "SKC_MISMATCH",
        `输入 SKC ${cleanId}，页面返回 ${pageSkc}`
      );
    }
    if (expectedType === "SPU" && spu !== cleanId) {
      throw scriptError(
        "SPU_MISMATCH",
        `输入 SPU ${cleanId}，页面返回 ${spu}`
      );
    }
    if (!imageUrl) {
      throw scriptError("MAIN_IMAGE_MISSING", "查询结果中未找到主图");
    }

    return {
      found: true,
      queryType: expectedType,
      queryId: cleanId,
      skc: pageSkc,
      spu,
      goodsCode,
      mainImageUrl: stripImageQuery(imageUrl),
      imageSource,
      productId: record?.productId || Number(spu),
      productSkcId: record?.productSkcId || Number(pageSkc),
      rowText: normalizeText(activeRow.innerText)
    };
  }

  function findCustomerTextArea() {
    return findInputByPlaceholder("请用文字简单描述你遇到的问题");
  }

  function findFormModal() {
    const titleNodes = leafByExactText("发送下架商品信息");
    const title = titleNodes.find(Boolean);
    if (title) {
      let cursor = title;
      for (let depth = 0; cursor && depth < 8; depth += 1) {
        if (
          cursor.innerText?.includes("下架原因") &&
          cursor.querySelector?.('input[placeholder="请输入完整SKC ID"]')
        ) {
          return cursor;
        }
        cursor = cursor.parentElement;
      }
    }

    const input = findInputByPlaceholder("请输入完整SKC ID");
    if (!input) return null;
    let cursor = input;
    for (let depth = 0; cursor && depth < 8; depth += 1) {
      if (cursor.innerText?.includes("下架原因")) return cursor;
      cursor = cursor.parentElement;
    }
    return null;
  }

  function findReasonControl(modal) {
    const labels = leafByExactText("下架原因", modal);
    for (const label of labels) {
      let cursor = label;
      for (let depth = 0; cursor && depth < 5; depth += 1) {
        const controls = [
          ...cursor.querySelectorAll?.('input[readonly], [role="combobox"]') || []
        ].filter(isVisible);
        if (controls.length) return controls[controls.length - 1];
        cursor = cursor.parentElement;
      }
    }

    const readonlyInputs = [
      ...modal.querySelectorAll('input[readonly], [role="combobox"]')
    ].filter(isVisible);
    return readonlyInputs[readonlyInputs.length - 1] || null;
  }

  async function openDownlistForm() {
    let modal = findFormModal();
    if (modal) return modal;

    const hasCustomerWidget =
      leafByExactText("官方客服").length > 0 ||
      leafByExactText("智能客服Mumu").length > 0 ||
      Boolean(findCustomerTextArea());

    if (!hasCustomerWidget) {
      clickExactText("客服");
      await waitFor(
        () =>
          leafByExactText("官方客服").length > 0 ||
          Boolean(findCustomerTextArea()),
        6000
      );
    }

    if (!findCustomerTextArea()) {
      if (clickExactText("联系官方客服", document, { last: true })) {
        await waitFor(
          () =>
            Boolean(findCustomerTextArea()) ||
            leafByExactText("发商品").some(isVisible),
          15000
        );
      }
    }

    if (!leafByExactText("发商品").length) {
      const textarea = findCustomerTextArea();
      if (textarea) {
        setNativeInputValue(textarea, "商品下架");
        const sendButton = leafByExactText("发送")
          .map(clickableAncestor)
          .find(isVisible);
        if (sendButton) dispatchMouseClick(sendButton);
      } else {
        clickExactText("商品下架", document, { last: true });
      }

      await waitFor(
        () => leafByExactText("发商品").some(isVisible),
        15000
      );
    }

    if (!clickExactText("发商品", document, { last: true })) {
      throw scriptError("SEND_GOODS_LINK_NOT_FOUND", "未找到“发商品”入口");
    }

    modal = await waitFor(findFormModal, 8000);
    if (!modal) throw scriptError("DOWNLIST_FORM_NOT_OPEN", "下架商品表单未打开");
    return modal;
  }

  function countOccurrences(text, needle) {
    if (!needle) return 0;
    return String(text).split(needle).length - 1;
  }

  function findConfirmDialog() {
    const title = leafByExactText("确认下架？").find(Boolean);
    if (!title) return null;
    let cursor = title;
    for (let depth = 0; cursor && depth < 8; depth += 1) {
      if (
        normalizeText(cursor.innerText).includes("可能因各类因素影响") &&
        [...cursor.querySelectorAll("button")].some(isVisible)
      ) {
        return cursor;
      }
      cursor = cursor.parentElement;
    }
    return null;
  }

  async function selectLossReason(modal) {
    const control = findReasonControl(modal);
    if (!control) throw scriptError("REASON_CONTROL_NOT_FOUND", "未找到下架原因选择框");
    dispatchMouseClick(control.parentElement || control);

    const option = await waitFor(
      () =>
        allElements()
          .filter(
            (element) =>
              element.matches?.('li[role="option"]') &&
              isVisible(element) &&
              normalizeText(element.textContent) === "亏损下架"
          )
          .find(Boolean),
      5000
    );
    if (!option) throw scriptError("LOSS_REASON_NOT_FOUND", "下架原因中没有“亏损下架”");
    dispatchMouseClick(option);
    await sleep(220);
  }

  async function waitAndConfirmDialog() {
    const dialog = await waitFor(findConfirmDialog, 8000);
    if (!dialog) throw scriptError("CONFIRM_DIALOG_NOT_FOUND", "未出现二次确认窗口");

    const button = await waitFor(() => {
      const candidates = [...dialog.querySelectorAll("button,a")]
        .filter(isVisible)
        .filter((element) => /^确认/.test(normalizeText(element.innerText)));
      const candidate = candidates[candidates.length - 1];
      if (!candidate) return null;
      const disabled =
        candidate.disabled ||
        candidate.getAttribute("aria-disabled") === "true" ||
        /\(\d+s\)/.test(normalizeText(candidate.innerText));
      return disabled ? null : candidate;
    }, 12000);

    if (!button) throw scriptError("CONFIRM_BUTTON_DISABLED", "最终确认按钮不可用");
    dispatchMouseClick(button);
  }

  async function downlistSkc({ skc, authorized, resultTimeoutMs = 90000 }) {
    const cleanSkc = String(skc || "").trim();
    if (!authorized) {
      throw scriptError("DOWNLIST_NOT_AUTHORIZED", "未获得最终下架提交授权");
    }
    if (!/^\d{8,20}$/.test(cleanSkc)) {
      throw scriptError("SKC_INVALID", `SKC 格式异常：${cleanSkc || "空"}`);
    }

    const modal = await openDownlistForm();
    const input = findInputByPlaceholder("请输入完整SKC ID", modal);
    if (!input) throw scriptError("SKC_INPUT_NOT_FOUND", "下架表单中未找到 SKC 输入框");
    setNativeInputValue(input, cleanSkc);
    await selectLossReason(modal);

    const successText = `【SKC ID：${cleanSkc}】：您好，该商品已下架`;
    const busyText = "非常抱歉操作失败，系统忙碌中，请您稍后重试";
    const beforeText = document.body.innerText || "";
    const baselineSuccess = countOccurrences(beforeText, successText);
    const baselineBusy = countOccurrences(beforeText, busyText);
    const baselineLength = beforeText.length;

    if (!clickExactText("申请下架", modal, { last: true })) {
      throw scriptError("SUBMIT_BUTTON_NOT_FOUND", "未找到“申请下架”按钮");
    }
    await waitAndConfirmDialog();

    const outcome = await waitFor(() => {
      const text = document.body.innerText || "";
      if (countOccurrences(text, successText) > baselineSuccess) {
        return { outcome: "success", message: successText };
      }
      if (countOccurrences(text, busyText) > baselineBusy) {
        return { outcome: "busy", message: busyText };
      }
      return null;
    }, resultTimeoutMs, 300);

    if (outcome) return { skc: cleanSkc, ...outcome };

    const afterText = document.body.innerText || "";
    const delta = afterText.startsWith(beforeText)
      ? afterText.slice(baselineLength)
      : afterText.slice(-1200);
    return {
      skc: cleanSkc,
      outcome: "timeout",
      message: `等待平台结果超时。页面新增内容：${normalizeText(delta).slice(0, 500)}`
    };
  }

  async function testDownlistForm({ skc }) {
    const cleanSkc = String(skc || "").trim();
    const modal = await openDownlistForm();
    const input = findInputByPlaceholder("请输入完整SKC ID", modal);
    if (!input) throw scriptError("SKC_INPUT_NOT_FOUND", "下架表单中未找到 SKC 输入框");
    setNativeInputValue(input, cleanSkc);
    await selectLossReason(modal);
    const reasonControl = findReasonControl(modal);
    const result = {
      opened: true,
      skcValue: input.value,
      reasonValue: reasonControl?.value || ""
    };
    if (!clickExactText("取消", modal, { last: true })) {
      throw scriptError("CANCEL_BUTTON_NOT_FOUND", "下架表单未找到取消按钮");
    }
    result.cancelled = true;
    return result;
  }

  function findProductListTypeSelect() {
    return allElements()
      .filter(
        (element) =>
          element.matches?.("input") &&
          isVisible(element) &&
          ["SPU", "SKC"].includes(normalizeText(element.value))
      )
      .find(Boolean);
  }

  function findProductListRow(skc) {
    const candidates = allElements().filter((element) => {
      if (!isVisible(element)) return false;
      const text = normalizeText(element.innerText);
      return (
        text.length < 6000 &&
        text.includes(String(skc)) &&
        /SPU ID[：:]/.test(text) &&
        /SKC ID[：:]/.test(text)
      );
    });
    candidates.sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return a.width * a.height - b.width * b.height;
    });
    return candidates[0] || null;
  }

  async function ensureProductListType(queryType, timeoutMs = 5000) {
    const typeSelect = findProductListTypeSelect();
    if (!typeSelect) {
      throw scriptError("PRODUCT_QUERY_TYPE_NOT_FOUND", "商品列表未找到 SPU/SKC 查询类型");
    }
    if (normalizeText(typeSelect.value) === queryType) return true;

    dispatchMouseClick(typeSelect.parentElement);
    const option = await waitFor(
      () =>
        allElements()
          .filter(
            (element) =>
              element.matches?.('li[role="option"]') &&
              isVisible(element) &&
              normalizeText(element.textContent) === queryType
          )
          .find(Boolean),
      timeoutMs
    );
    if (!option) {
      throw scriptError("PRODUCT_QUERY_OPTION_NOT_FOUND", `商品列表未找到 ${queryType} 查询类型`);
    }
    dispatchMouseClick(option);

    const changed = await waitFor(
      () => normalizeText(findProductListTypeSelect()?.value) === queryType,
      timeoutMs
    );
    if (!changed) {
      throw scriptError("PRODUCT_QUERY_TYPE_FAILED", `商品列表查询类型未能切换为 ${queryType}`);
    }
    return true;
  }

  async function activateProductListTab(prefix, timeoutMs = 12000) {
    const findTab = () =>
      allElements().find(
        (element) =>
          isVisible(element) &&
          String(element.className || "").includes("TAB_tabItem_") &&
          normalizeText(element.innerText).startsWith(prefix)
      );
    const tab = await waitFor(findTab, timeoutMs);
    if (!tab) {
      throw scriptError("PRODUCT_LIST_TAB_NOT_FOUND", `商品列表未找到“${prefix}”分类`);
    }
    if (String(tab.className || "").includes("TAB_active_")) return true;
    dispatchMouseClick(tab);
    const activated = await waitFor(() => {
      const current = findTab();
      return current && String(current.className || "").includes("TAB_active_");
    }, 7000);
    if (!activated) {
      throw scriptError("PRODUCT_LIST_TAB_FAILED", `无法切换到“${prefix}”分类`);
    }
    await sleep(600);
    return true;
  }

  function findProductListRowsBySpu(spu) {
    const expected = String(spu);
    return allElements()
      .filter(
        (element) =>
          element.matches?.("tr") &&
          isVisible(element) &&
          new RegExp(`SPU ID[：:]\\s*${expected}(?!\\d)`).test(normalizeText(element.innerText)) &&
          /SKC ID[：:]\s*\d+/.test(normalizeText(element.innerText))
      );
  }

  function findDeleteConfirmModal() {
    const titles = leafByExactText("确认删除商品？");
    for (const title of titles) {
      let cursor = title;
      for (let depth = 0; cursor && depth < 8; depth += 1) {
        if (
          normalizeText(cursor.innerText).includes("确认删除") &&
          leafByExactText("确认删除", cursor).length
        ) {
          return cursor;
        }
        cursor = cursor.parentElement;
      }
    }
    return null;
  }

  async function deletePendingSpu({ spu, dryRun = false, timeoutMs = 150000 }) {
    const cleanSpu = String(spu || "").trim();
    if (!/^\d{8,20}$/.test(cleanSpu)) {
      throw scriptError("SPU_INVALID", `SPU 格式异常：${cleanSpu || "空"}`);
    }
    if (!location.href.includes("/goods/list")) {
      throw scriptError("WRONG_PAGE", "当前不是商品列表页面");
    }

    await activateProductListTab("未发布到站点");
    await ensureProductListType("SPU");
    const input = findInputByPlaceholder("多个查询请空格或逗号");
    if (!input) {
      throw scriptError("PRODUCT_QUERY_INPUT_NOT_FOUND", "商品列表未找到 SPU 查询输入框");
    }
    setNativeInputValue(input, cleanSpu);
    await sleep(150);
    if (!clickExactText("查询")) {
      throw scriptError("PRODUCT_QUERY_BUTTON_NOT_FOUND", "商品列表未找到查询按钮");
    }

    await sleep(600);
    const initialRows = await waitFor(
      () => {
        const rows = findProductListRowsBySpu(cleanSpu);
        if (rows.length) return rows;
        if (hasNoResultsText()) return [];
        return null;
      },
      Math.min(timeoutMs, 20000)
    );
    if (!initialRows?.length) {
      return {
        spu: cleanSpu,
        outcome: "not_found",
        deletedCount: 0,
        message: "“未发布到站点”中没有该 SPU"
      };
    }

    if (dryRun) {
      const rowText = normalizeText(initialRows[0].innerText);
      return {
        spu: cleanSpu,
        outcome: "ready",
        skc: rowText.match(/SKC ID[：:]\s*(\d+)/)?.[1] || "",
        rowText: rowText.slice(0, 1000)
      };
    }

    const deletedSkcs = [];
    for (let round = 0; round < 100; round += 1) {
      const row = findProductListRowsBySpu(cleanSpu)[0];
      if (!row) break;
      const rowText = normalizeText(row.innerText);
      const skc = rowText.match(/SKC ID[：:]\s*(\d+)/)?.[1] || "";
      const deleteCandidate = leafByExactText("删除", row).find(Boolean);
      if (!deleteCandidate) {
        throw scriptError(
          "PRODUCT_DELETE_BUTTON_NOT_FOUND",
          `SPU ${cleanSpu} / SKC ${skc || "-"} 未找到删除按钮`
        );
      }
      dispatchMouseClick(clickableAncestor(deleteCandidate));
      const modal = await waitFor(findDeleteConfirmModal, 8000);
      if (!modal) {
        throw scriptError(
          "PRODUCT_DELETE_CONFIRM_NOT_FOUND",
          `SPU ${cleanSpu} / SKC ${skc || "-"} 未出现删除确认框`
        );
      }
      if (!clickExactText("确认删除", modal, { last: true })) {
        throw scriptError("PRODUCT_DELETE_CONFIRM_FAILED", "未找到“确认删除”按钮");
      }

      const removed = await waitFor(() => {
        const currentModal = findDeleteConfirmModal();
        const nextRow = findProductListRowsBySpu(cleanSpu)[0];
        return !currentModal &&
          (!nextRow || !normalizeText(nextRow.innerText).includes(skc))
          ? true
          : null;
      }, 20000);
      if (!removed) {
        throw scriptError(
          "PRODUCT_DELETE_TIMEOUT",
          `SKC ${skc || "-"} 删除后列表未更新`
        );
      }
      deletedSkcs.push(skc || `第${round + 1}行`);
      await sleep(350);
    }

    const remaining = findProductListRowsBySpu(cleanSpu).length;
    if (remaining) {
      throw scriptError(
        "PRODUCT_DELETE_INCOMPLETE",
        `SPU ${cleanSpu} 仍有 ${remaining} 个待发布 SKC 未删除`
      );
    }
    return {
      spu: cleanSpu,
      outcome: "success",
      deletedCount: deletedSkcs.length,
      deletedSkcs
    };
  }

  async function verifyDownlisted({ skc, timeoutMs = 25000 }) {
    if (!location.href.includes("/goods/list")) {
      throw scriptError("WRONG_PAGE", "当前不是商品列表页面");
    }

    await ensureProductListType("SKC");

    const input = findInputByPlaceholder("多个查询请空格或逗号");
    if (!input) throw scriptError("PRODUCT_QUERY_INPUT_NOT_FOUND", "商品列表未找到查询输入框");
    setNativeInputValue(input, String(skc));
    await sleep(150);
    if (!clickExactText("查询")) {
      throw scriptError("PRODUCT_QUERY_BUTTON_NOT_FOUND", "商品列表未找到查询按钮");
    }

    await sleep(500);
    const foundRow = await waitFor(() => findProductListRow(skc), timeoutMs);
    if (!foundRow) {
      return { skc: String(skc), verified: false, reason: "ROW_NOT_FOUND" };
    }

    if (!clickTextPrefix("已下架/已终止")) {
      return {
        skc: String(skc),
        verified: false,
        reason: "STATUS_TAB_NOT_FOUND"
      };
    }
    await sleep(1800);

    const verified = Boolean(await waitFor(() => findProductListRow(skc), 10000));
    return {
      skc: String(skc),
      verified,
      rowText: normalizeText(findProductListRow(skc)?.innerText || "").slice(0, 1000)
    };
  }

  function mountPagePanel() {
    const hostId = "temu-downlist-panel-host";
    if (!location.pathname.includes("/material/image-task")) {
      panelHost?.remove();
      panelHost = null;
      return;
    }
    if (panelHost?.isConnected) return;
    document.getElementById(hostId)?.remove();

    const host = document.createElement("div");
    host.id = hostId;
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.inset = "0";
    host.style.pointerEvents = "none";
    document.documentElement.appendChild(host);
    panelHost = host;

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .panel {
          position: fixed;
          top: 68px;
          right: 14px;
          width: min(430px, calc(100vw - 28px));
          height: min(780px, calc(100vh - 86px));
          overflow: hidden;
          border: 1px solid #d7dce3;
          border-radius: 14px;
          background: #f5f6f8;
          box-shadow: 0 18px 60px rgba(15, 23, 42, .25);
          pointer-events: auto;
        }
        .panel[data-theme="ocean"] .titlebar { background: #123b66; }
        .panel[data-theme="forest"] .titlebar { background: #1b4d38; }
        .panel[data-theme="sunset"] .titlebar { background: #5a341f; }
        .panel.hidden { display: none; }
        .titlebar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 12px;
          color: #fff;
          background: #252b36;
          font: 600 12px/1.4 "Microsoft YaHei UI", sans-serif;
          cursor: move;
          user-select: none;
        }
        .titlebar span { opacity: .78; font-weight: 400; }
        .minimize {
          width: 28px;
          height: 24px;
          border: 1px solid rgba(255,255,255,.3);
          border-radius: 6px;
          color: #fff;
          background: transparent;
          cursor: pointer;
          font: 700 16px/1 sans-serif;
        }
        iframe {
          display: block;
          width: 100%;
          height: calc(100% - 43px);
          border: 0;
          background: #f5f6f8;
        }
        .launcher {
          position: fixed;
          right: 18px;
          bottom: 92px;
          display: none;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border: 0;
          border-radius: 999px;
          color: #fff;
          background: #e94f37;
          box-shadow: 0 10px 28px rgba(233,79,55,.35);
          cursor: pointer;
          pointer-events: auto;
          font: 600 12px/1 "Microsoft YaHei UI", sans-serif;
        }
        .launcher.visible { display: inline-flex; }
        :host([data-theme="ocean"]) .launcher { background: #1f6feb; }
        :host([data-theme="forest"]) .launcher { background: #16855b; }
        :host([data-theme="sunset"]) .launcher { background: #d97706; }
      </style>
      <section class="panel">
        <div class="titlebar">
          <div>Temu 下架助手 <span>SPU 查询 · 主图归档</span></div>
          <button class="minimize" title="最小化">−</button>
        </div>
        <iframe title="Temu 下架与主图归档"></iframe>
      </section>
      <button class="launcher">下架助手</button>
    `;

    const panel = shadow.querySelector(".panel");
    const launcher = shadow.querySelector(".launcher");
    const iframe = shadow.querySelector("iframe");
    const titlebar = shadow.querySelector(".titlebar");
    const minimize = shadow.querySelector(".minimize");
    const positionKey = "temuDownlistPanelPosition";

    function clampPosition(left, top) {
      const width = panel.getBoundingClientRect().width;
      const height = panel.getBoundingClientRect().height;
      return {
        left: Math.max(6, Math.min(left, window.innerWidth - width - 6)),
        top: Math.max(6, Math.min(top, window.innerHeight - height - 6))
      };
    }

    function setPosition(left, top, save = false) {
      const position = clampPosition(left, top);
      panel.style.left = `${position.left}px`;
      panel.style.top = `${position.top}px`;
      panel.style.right = "auto";
      if (save) {
        try {
          localStorage.setItem(positionKey, JSON.stringify(position));
        } catch (_) {
          // Position persistence is optional.
        }
      }
    }

    try {
      const saved = JSON.parse(localStorage.getItem(positionKey) || "null");
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        setPosition(saved.left, saved.top, false);
      }
    } catch (_) {
      // Use default top-right position.
    }

    titlebar.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".minimize")) return;
      const rect = panel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;
      titlebar.setPointerCapture?.(event.pointerId);

      function onMove(moveEvent) {
        setPosition(
          startLeft + moveEvent.clientX - startX,
          startTop + moveEvent.clientY - startY,
          false
        );
      }

      function onUp() {
        const rectAfter = panel.getBoundingClientRect();
        setPosition(rectAfter.left, rectAfter.top, true);
        titlebar.removeEventListener("pointermove", onMove);
        titlebar.removeEventListener("pointerup", onUp);
        titlebar.removeEventListener("pointercancel", onUp);
      }

      titlebar.addEventListener("pointermove", onMove);
      titlebar.addEventListener("pointerup", onUp);
      titlebar.addEventListener("pointercancel", onUp);
    });

    window.addEventListener("resize", () => {
      const rect = panel.getBoundingClientRect();
      setPosition(rect.left, rect.top, true);
    });

    window.addEventListener("message", (event) => {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (data?.source === "temu-downlist-frame" && data.type === "theme") {
        const theme = ["classic", "ocean", "forest", "sunset"].includes(data.theme)
          ? data.theme
          : "classic";
        host.dataset.theme = theme;
        panel.dataset.theme = theme;
      }
    });

    iframe.src = chrome.runtime.getURL("sidepanel.html");
    minimize.addEventListener("click", () => {
      panel.classList.add("hidden");
      launcher.classList.add("visible");
    });
    launcher.addEventListener("click", () => {
      panel.classList.remove("hidden");
      launcher.classList.remove("visible");
    });
  }

  mountPagePanel();
  setInterval(mountPagePanel, 1200);
})();
