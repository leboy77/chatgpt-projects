(() => {
  if (window.__SPEC_TRAFFIC_ACCELERATOR__) return;
  window.__SPEC_TRAFFIC_ACCELERATOR__ = true;

  const HOST_PATTERN = /(^|\.)temu\.com$|kuajingmaihuo\.com$/;
  if (!HOST_PATTERN.test(location.hostname)) return;
  const QUERY_ID_TYPE_VALUES = new Set(["SPU", "SKC", "SKU"]);

  let pill = null;
  let pillTimer = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });

  async function handleMessage(message) {
    switch (message?.type) {
      case "PING":
        return { context: readContext() };
      case "GET_STORE_CONTEXT":
        return { store: readStoreContext() };
      case "SCAN_GOODS":
        return scanGoods(message.config, message.operationId);
      case "SCAN_TRAFFIC":
        return scanTraffic(message.config);
      case "RUN_TRAFFIC_ITEM":
        return runTrafficItem(message.config);
      case "RUN_PRODUCT_STATIONS":
        return runProductStations(message.config);
      case "FILL_TRAFFIC_PRICES":
        return fillTrafficPrices(message.config);
      case "PREVIEW_ACCELERATION_TIERS":
        return previewAccelerationTiers(message.config);
      case "OPEN_TARGET_ROW":
        return openTargetRow(message.config);
      case "OPEN_MORE_PRICES":
        return openMorePrices();
      default:
        return { ignored: true };
    }
  }

  function readContext() {
    const href = location.href;
    const kind = href.includes("/goods/list")
      ? "goods"
      : href.includes("/flux-analysis")
        ? "traffic"
        : "other";
    return {
      kind,
      storeName: readStoreContext().storeName,
      title: document.title,
      href,
      host: location.hostname,
      hasTrafficModal: hasVisibleText("调整申报价"),
      bodyText: visibleBodyText().slice(0, 180)
    };
  }

  function readStoreContext() {
    const selectors = [
      '[class*="account-info_mallInfo"]',
      '[class*="account-info_accountInfo"]'
    ];
    for (const selector of selectors) {
      const element = [...document.querySelectorAll(selector)].find(isVisible);
      const storeName = normalizeText(element?.innerText);
      if (storeName) {
        return {
          storeName,
          host: location.hostname,
          region: location.hostname.includes("-eu.")
            ? "eu"
            : location.hostname.includes("-us.")
              ? "us"
              : "global"
        };
      }
    }
    return {
      storeName: "",
      host: location.hostname,
      region: location.hostname.includes("-eu.")
        ? "eu"
        : location.hostname.includes("-us.")
          ? "us"
          : "global"
    };
  }

  async function scanGoods(config, operationId) {
    if (!location.pathname.includes("/goods/list")) {
      throw new Error("请先打开 TEMU 商品管理 > 商品列表");
    }
    const pageText = visibleBodyText();
    if (/确认提交本页|放弃调整价格|继续调整/.test(pageText)) {
      throw new Error(
        "当前商品页存在未完成的批量调价窗口，请新开一个正常商品列表标签页后再检索"
      );
    }

    let specInput = findInputByPlaceholder("请输入规格名称");
    if (!specInput) {
      const expand = findExactText("展开");
      if (expand) {
        expand.click();
        await sleep(500);
        specInput = findInputByPlaceholder("请输入规格名称");
      }
    }

    const searchMode =
      config.searchMode === "category" ? "category" : "sku";
    const skuType = await waitFor(
      () =>
        [...document.querySelectorAll("input")].find(
          (input) => isVisible(input) && /^SKU\(/.test(input.value || "")
        ),
      20000,
      "货号查询类型"
    );
    if (
      (searchMode === "sku" || String(config.skuKeyword || "").trim()) &&
      skuType.value !== "SKU(模糊查询)"
    ) {
      skuType.click();
      const fuzzyOption = await waitFor(
        () => findExactText("SKU(模糊查询)"),
        2500,
        "SKU 模糊查询选项"
      );
      fuzzyOption.click();
      await sleep(200);
    }

    const typeRect = skuType.getBoundingClientRect();
    const skuInput = [...document.querySelectorAll("input")]
      .filter(
        (input) =>
          isVisible(input) && input.placeholder.includes("多个查询")
      )
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        const leftDistance =
          Math.abs(leftRect.top - typeRect.top) +
          Math.abs(leftRect.left - typeRect.left);
        const rightDistance =
          Math.abs(rightRect.top - typeRect.top) +
          Math.abs(rightRect.left - typeRect.left);
        return leftDistance - rightDistance;
      })[0];
    if (!skuInput) throw new Error("没有找到货号关键词输入框");

    if (searchMode === "category") {
      await applyCategoryPath(config.categoryPath);
    }

    const desiredSkuKeyword = String(config.skuKeyword || "");
    const desiredSpecName = String(config.specName || "");
    const skuAlreadyApplied =
      normalizeText(skuInput.value) === normalizeText(desiredSkuKeyword);
    const specAlreadyApplied =
      !specInput ||
      normalizeText(specInput.value) === normalizeText(desiredSpecName);
    setNativeValue(skuInput, desiredSkuKeyword);
    if (specInput) {
      setNativeValue(specInput, desiredSpecName);
    }
    await sleep(120);
    const pageSizeSelected = await setGoodsPageSize(200);
    await waitForGoodsDataReady({
      timeout: 30000,
      minimumWaitMs: 800,
      context: "商品列表分页设置"
    });

    const queryButton = await waitFor(
      () => findButton("查询"),
      15000,
      "商品查询按钮"
    );
    const beforeQuerySignature = collectIdPairs()
      .map((pair) => `${pair.spu}:${pair.skc}`)
      .join("|");
    const filtersAlreadyApplied =
      searchMode === "sku" && skuAlreadyApplied && specAlreadyApplied;
    if (!filtersAlreadyApplied) {
      const pageBeforeQuery = activePageNumber();
      queryButton.click();
      if (pageBeforeQuery && pageBeforeQuery !== "1") {
        await waitFor(
          () => activePageNumber() === "1",
          6000,
          "商品查询回到第 1 页"
        ).catch(() => {});
      }
      await sleep(350);
      await waitForGoodsDataReady({
        previousSignature: beforeQuerySignature,
        timeout: 45000,
        minimumWaitMs: 8000,
        context: "商品查询结果"
      });
    } else {
      await waitForGoodsDataReady({
        timeout: 15000,
        minimumWaitMs: 800,
        context: "当前商品查询结果"
      });
    }

    const pairs = new Map();
    const productKeys = new Set();
    const pages = [];
    const resultTotal = readTotalCount();
    const pageSize = readPageSize();
    const scanStartedAt = Date.now();
    for (let page = 1; page <= 50; page++) {
      const pageResult = await collectVirtualizedGoodsPage({
        page,
        operationId,
        scanStartedAt
      });
      const pagePairs = pageResult.pairs;
      for (const pair of pagePairs) {
        productKeys.add(pair.spu || pair.skc);
      }
      const rawCount = productKeys.size;
      pages.push({
        page,
        count: rawCount,
        pairCount: pagePairs.length,
        virtualized: pageResult.virtualized
      });
      for (const pair of pagePairs) {
        pairs.set(`${pair.spu}:${pair.skc}`, pair);
      }
      await reportScanProgress(operationId, {
        page,
        currentPairs: rawCount,
        uniquePairs: pairs.size,
        elapsedMs: Date.now() - scanStartedAt
      });

      const next = findNextPage();
      if (!next) break;
      const before = activePageNumber();
      const beforeSignature = collectIdPairs()
        .map((pair) => `${pair.spu}:${pair.skc}`)
        .join("|");
      next.click();
      await waitForGoodsDataReady({
        previousSignature: beforeSignature,
        previousPage: before,
        timeout: 30000,
        minimumWaitMs: 1800,
        context: `商品列表第 ${page + 1} 页`
      });
    }

    const rawCount = productKeys.size;
    const finalTotal = readTotalCount();
    if (finalTotal != null && rawCount !== finalTotal) {
      throw new Error(
        `商品数据数量校验失败：平台显示 ${finalTotal} 条，实际读取 ${rawCount} 条。已停止缓存，请等待页面加载完成后重试。`
      );
    }

    return {
      context: readContext(),
      pairs: [...pairs.values()],
      pages,
      total: finalTotal,
      rawCount,
      uniqueCount: pairs.size,
      pageSize: pageSize || (pageSizeSelected ? 200 : null),
      verified: finalTotal != null,
      specFilterApplied: Boolean(specInput),
      requestedSpecName: config.specName || "",
      warning: specInput
        ? ""
        : "当前商品列表没有商品规格筛选框，已扫描全部匹配商品；目标规格将在流量分析阶段处理"
    };
  }

  function scanTraffic(config) {
    const rows = [];
    for (const row of document.querySelectorAll("tbody tr")) {
      const value = normalizeText(row.innerText);
      const spu = value.match(/SPU ID：\s*(\d+)/)?.[1];
      const skc = value.match(/SKC ID：\s*(\d+)/)?.[1];
      const station = value.match(/经营站点：\s*([^\s]+站)/)?.[1];
      if (!spu && !skc) continue;
      const eligible = /该商品已获得开启流量加速器机会/.test(value);
      const canOpen = Boolean(findLinkIn(row, "立即开启"));
      rows.push({
        spu,
        skc,
        station,
        eligible,
        canOpen,
        statusText: eligible
          ? "可立即开启"
          : canOpen
            ? "可开启"
            : "没有获取加速资格"
      });
    }

    const targetRows = rows.filter(
      (row) => !config?.station || row.station === config.station
    );
    return {
      context: readContext(),
      rows,
      targetRows,
      eligibleCount: targetRows.filter((row) => row.eligible).length
    };
  }

  async function openTargetRow(config) {
    const maxAttempts = config.navigationGuard === false ? 1 : 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const target = await findTargetRow(config);
      if (!target) {
        throw new Error(
          `没有获取加速资格：${config.station || "目标站点"} / ${
            config.spu || "目标商品"
          }`
        );
      }
      const link = findLinkIn(target, "立即开启");
      if (!link) throw new Error("商品行没有“立即开启”操作");
      link.scrollIntoView({ block: "center" });
      link.click();
      try {
        await waitFor(
          () => hasVisibleText("流量加速器"),
          attempt === 1 ? 4500 : 7000,
          "流量加速弹窗"
        );
        return { opened: true, attempts: attempt };
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        await sleep(1200);
        if (hasVisibleText("流量加速器")) {
          return { opened: true, attempts: attempt };
        }
      }
    }
    throw new Error("流量加速入口未响应（已自动补点一次）");
  }

  async function runTrafficItem(config) {
    try {
      assertNoRateLimit();
      await queryTrafficItem(config);
      return await processTrafficStation(config);
    } catch (error) {
      const retryable = isTransientFailure(error.message);
      return {
        status: retryable ? "failed" : "exception",
        retryable,
        message: error.message,
        submitted: false,
        stage: "查询商品"
      };
    }
  }

  async function runProductStations(config) {
    const stations = Array.isArray(config.stations) ? config.stations : [];
    if (!stations.length) {
      return { results: [], rateLimited: false };
    }

    let query = null;
    try {
      assertNoRateLimit();
      query = await queryTrafficItem(config);
    } catch (error) {
      const retryable = isTransientFailure(error.message);
      return {
        rateLimited: isRateLimitMessage(error.message),
        results: stations.map((station) => ({
          code: station.code,
          status: retryable ? "failed" : "exception",
          retryable,
          submitted: false,
          message: error.message,
          stage: "查询商品"
        }))
      };
    }

    const results = [];
    let rateLimited = false;
    for (const station of stations) {
      const stationConfig = {
        ...config,
        code: station.code,
        station: station.station,
        targetPrice: station.targetPrice,
        otherPrice: station.otherPrice,
        tierPrice: station.tierPrice
      };
      const result = await processTrafficStation(stationConfig);
      results.push({ code: station.code, ...result });
      if (isRateLimitMessage(result.message)) {
        rateLimited = true;
        break;
      }
    }

    return { results, rateLimited, query };
  }

  async function processTrafficStation(config) {
    let submitted = false;
    let stage = "识别加速资格";
    try {
      const row = await findTargetRow(config);
      if (!row) {
        return {
          status: "exception",
          message: `没有获取加速资格（未找到${config.station}商品行）`,
          submitted: false,
          stage
        };
      }

      const rowText = normalizeText(row.innerText);
      if (!findLinkIn(row, "立即开启")) {
        if (/流量加速中|加速中|查看效果/.test(rowText)) {
          return {
            status: "success",
            message: "该商品已在流量加速中",
            submitted: false,
            stage
          };
        }
        return {
          status: "exception",
          message: "没有获取加速资格",
          submitted: false,
          stage
        };
      }

      stage = "打开流量加速器";
      try {
        await openTargetRow(config);
      } catch (openError) {
        await queryTrafficItem(config);
        const refreshed = await findTargetRow(config);
        if (
          refreshed &&
          !findLinkIn(refreshed, "立即开启") &&
          /流量加速中|加速中|查看效果/.test(normalizeText(refreshed.innerText))
        ) {
          return {
            status: "success",
            message: "平台状态已更新为流量加速中",
            submitted: false,
            stage: "状态核对"
          };
        }
        throw openError;
      }
      stage = "选择加速时效";
      assertNoRateLimit();
      await selectDuration(config.duration);

      if (config.dryRun !== false) {
        await abortTrafficFlow();
        return {
          status: "success",
          message: "预检通过，未提交；可从表格关闭“仅检查”后真实执行",
          submitted: false,
          stage
        };
      }

      if (config.accelerationMode === "reduceThenTier") {
        let fallbackReason = "";
        const continueDiscountAvailable = Boolean(findLink("去获取"));
        if (continueDiscountAvailable) {
          stage = "尝试继续让价";
          try {
            await openMorePrices();
            assertNoRateLimit();
            const filled = await fillTrafficPrices({ ...config, dryRun: false });
            if (filled.canSubmit) {
              stage = "确认继续让价";
              const priceConfirm = findVisibleButtonIn(
                findPriceModalRoot(),
                "确认"
              );
              if (!priceConfirm) {
                throw new Error("申报价弹窗没有找到“确认”");
              }
              priceConfirm.click();
              await waitFor(
                () => !findPriceModalRoot(),
                10000,
                "继续让价确认"
              );
              stage = "提交前价格回读";
              const persisted = await verifyTrafficPricesPersisted(
                filled.rows
              );
              if (!persisted.verified) {
                throw new Error(
                  `平台保存价格与填写价格不一致：${JSON.stringify(
                    persisted.mismatches.slice(0, 5)
                  )}${persisted.error ? `；${persisted.error}` : ""}`
                );
              }

              stage = "提交流量加速";
              assertNoRateLimit();
              const accelerate = findVisibleButton("立即加速");
              if (!accelerate) {
                throw new Error("流量加速器没有找到“立即加速”");
              }
              accelerate.click();
              const finalConfirm = await waitFor(
                () =>
                  [...document.querySelectorAll("button")]
                    .filter(
                      (button) =>
                        isVisible(button) &&
                        normalizeText(button.textContent) === "确认"
                    )
                    .at(-1),
                8000,
                "最终确认弹窗"
              );
              submitted = true;
              finalConfirm.click();
              await waitFor(
                () =>
                  /流量加速成功|加速器开启成功|已成功开启/.test(
                    visibleBodyText()
                  ),
                18000,
                "平台加速结果"
              );
              if (!(await verifyTargetStationActive(config))) {
                throw new Error("平台提示成功，但未确认站点进入流量加速中");
              }
              return {
                status: "success",
                message: `继续让价并提交成功；已回读 ${filled.rows.length} 个价格并确认站点加速状态`,
                submitted: true,
                stage: "提交完成",
                rows: filled.rows,
                strategy: "continueDiscount"
              };
            }
            fallbackReason = `继续让价价格异常 ${filled.errors.length} 个`;
            await closePriceModal();
          } catch (error) {
            await closePriceModal().catch(() => {});
            if (isTransientFailure(error.message)) throw error;
            fallbackReason = `继续让价不可用：${error.message}`;
          }
        } else {
          fallbackReason = "当前商品没有继续让价入口";
        }

        stage = "自动匹配现有档位";
        const tier = await selectAccelerationTier(config);
        if (!tier.selected) {
          await abortTrafficFlow();
          return {
            status: "exception",
            message: tier.message,
            submitted: false,
            stage,
            tiers: tier.tiers
          };
        }

        stage = "提交流量加速";
        assertNoRateLimit();
        const accelerate = findVisibleButton("立即加速");
        if (!accelerate) throw new Error("流量加速器没有找到“立即加速”");
        accelerate.click();
        const finalConfirm = await waitFor(
          () =>
            [...document.querySelectorAll("button")]
              .filter(
                (button) =>
                  isVisible(button) &&
                  normalizeText(button.textContent) === "确认"
              )
              .at(-1),
          8000,
          "最终确认弹窗"
        );
        submitted = true;
        finalConfirm.click();
        await waitFor(
          () => /流量加速成功|加速器开启成功|已成功开启/.test(visibleBodyText()),
          18000,
          "平台加速结果"
        );
        if (!(await verifyTargetStationActive(config))) {
          throw new Error("平台提示成功，但未确认站点进入流量加速中");
        }
        return {
          status: "success",
          message: `${fallbackReason}，已自动匹配第 ${
            tier.selected.index
          } 档（${formatPriceRange(tier.selected.prices)}）并提交，已确认站点加速状态${
            tier.usedFallback ? "；当前档位低于目标价格，已按允许回退规则继续" : ""
          }`,
          submitted: true,
          stage: "提交完成",
          tiers: tier.tiers,
          strategy: "tierFallback"
        };
      }

      if (config.accelerationMode === "priceTier") {
        stage = "读取并匹配流量档位";
        const tier = await selectAccelerationTier(config);
        if (!tier.selected) {
          await abortTrafficFlow();
          return {
            status: "exception",
            message: tier.message,
            submitted: false,
            stage,
            tiers: tier.tiers
          };
        }

        stage = "提交流量加速";
        assertNoRateLimit();
        const accelerate = findVisibleButton("立即加速");
        if (!accelerate) throw new Error("流量加速器没有找到“立即加速”");
        accelerate.click();

        const finalConfirm = await waitFor(
          () =>
            [...document.querySelectorAll("button")]
              .filter(
                (button) =>
                  isVisible(button) &&
                  normalizeText(button.textContent) === "确认"
              )
              .at(-1),
          8000,
          "最终确认弹窗"
        );
        submitted = true;
        finalConfirm.click();

        await waitFor(
          () => /流量加速成功|加速器开启成功|已成功开启/.test(visibleBodyText()),
          18000,
          "平台加速结果"
        );
        if (!(await verifyTargetStationActive(config))) {
          throw new Error("平台提示成功，但未确认站点进入流量加速中");
        }
        return {
          status: "success",
          message: `已匹配第 ${tier.selected.index} 档（对应申报价 ${formatPriceRange(
            tier.selected.prices
          )}）并提交，已确认站点加速状态`,
          submitted: true,
          stage: "提交完成",
          tiers: tier.tiers
        };
      }

      stage = "打开申报价设置";
      await openMorePrices();
      assertNoRateLimit();
      stage = "填写并校验申报价";
      const filled = await fillTrafficPrices({ ...config, dryRun: false });
      if (!filled.canSubmit) {
        await abortTrafficFlow();
        return {
          status: "exception",
          message: `申报价异常 ${filled.errors.length} 个，未提交`,
          submitted: false,
          stage,
          rows: filled.rows
        };
      }

      stage = "确认申报价";
      const priceConfirm = findVisibleButtonIn(
        findPriceModalRoot(),
        "确认"
      );
      if (!priceConfirm) throw new Error("申报价弹窗没有找到“确认”");
      priceConfirm.click();
      await waitFor(
        () => !findPriceModalRoot(),
        10000,
        "申报价确认"
      );
      stage = "提交前价格回读";
      const persisted = await verifyTrafficPricesPersisted(filled.rows);
      if (!persisted.verified) {
        throw new Error(
          `平台保存价格与填写价格不一致：${JSON.stringify(
            persisted.mismatches.slice(0, 5)
          )}${persisted.error ? `；${persisted.error}` : ""}`
        );
      }

      stage = "提交流量加速";
      assertNoRateLimit();
      const accelerate = findVisibleButton("立即加速");
      if (!accelerate) throw new Error("流量加速器没有找到“立即加速”");
      accelerate.click();

      const finalConfirm = await waitFor(
        () =>
          [...document.querySelectorAll("button")]
            .filter(
              (button) =>
                isVisible(button) &&
                normalizeText(button.textContent) === "确认"
            )
            .at(-1),
        8000,
        "最终确认弹窗"
      );
      submitted = true;
      finalConfirm.click();

      await waitFor(
        () => /流量加速成功|加速器开启成功|已成功开启/.test(visibleBodyText()),
        18000,
        "平台加速结果"
      );
      if (!(await verifyTargetStationActive(config))) {
        throw new Error("平台提示成功，但未确认站点进入流量加速中");
      }

      return {
        status: "success",
        message: `平台已返回流量加速成功；已回读 ${filled.rows.length} 个价格并确认站点加速状态`,
        submitted: true,
        stage: "提交完成",
        rows: filled.rows
      };
    } catch (error) {
      if (!submitted) {
        await abortTrafficFlow().catch(() => {});
      }
      const retryable =
        submitted || isTransientFailure(error.message);
      return {
        status: retryable ? "failed" : "exception",
        retryable,
        message: error.message,
        submitted,
        stage
      };
    }
  }

  async function queryTrafficItem(config) {
    if (!location.pathname.includes("/flux-analysis")) {
      throw new Error("请先打开经营分析 > 流量分析 > 商品流量");
    }

    let expectedType = config.idType === "SKC" ? "SKC" : "SPU";
    function findQueryIdTypeInput() {
      return [...document.querySelectorAll("input")].find(
        (input) =>
          isVisible(input) &&
          input.readOnly &&
          QUERY_ID_TYPE_VALUES.has(normalizeText(input.value))
      );
    }

    const typeInput = findQueryIdTypeInput();
    if (!typeInput) {
      throw new Error("没有找到商品 ID 类型选择框（兼容 SPU/SKC/SKU）");
    }
    if (normalizeText(typeInput.value) !== expectedType) {
      typeInput.click();
      const option = await waitFor(
        () =>
          [...document.querySelectorAll("[role='option'], li, div, span")]
            .filter(
              (element) =>
                isVisible(element) &&
                normalizeText(element.textContent) === expectedType
            )
            .at(-1),
        3000,
        `${expectedType} 查询类型`
      );
      option.click();
      await waitFor(
        () => normalizeText(findQueryIdTypeInput()?.value) === expectedType,
        2500,
        "商品 ID 类型切换"
      );
    }

    const searchInput = [...document.querySelectorAll("input")].find(
      (input) =>
        isVisible(input) &&
        input.placeholder === "多个查询请空格或逗号依次输入"
    );
    if (!searchInput) throw new Error("没有找到商品 ID 查询框");
    let id = expectedType === "SKC" ? config.skc : config.spu;
    let fallbackUsed = false;
    if (!id) {
      const alternateId =
        expectedType === "SKC" ? config.spu : config.skc;
      if (alternateId) {
        id = alternateId;
        fallbackUsed = true;
      }
    }
    if (!id) throw new Error(`缺少 ${expectedType} ID`);
    setNativeValue(searchInput, id);

    const queryButton = findVisibleButton("查询");
    if (!queryButton) throw new Error("没有找到流量分析查询按钮");
    queryButton.click();
    await sleep(config.idType === "SKC" ? 2200 : 800);
    assertNoRateLimit();
    await waitFor(
      () => {
        const body = visibleBodyText();
        if (body.includes("暂无数据") || body.includes("暂无查询结果")) {
          return true;
        }
        return [...document.querySelectorAll("tbody tr")].some((row) => {
          const value = normalizeText(row.innerText);
          if (config.idType === "SKC") {
            return value.includes("首次加入站点日期");
          }
          return value.includes(id);
        });
      },
      15000,
      "流量分析查询结果"
    );
    await sleep(700);
    assertNoRateLimit();
    return { id, idType: expectedType, fallbackUsed };
  }

  async function findTargetRow(config) {
    const id = config.idType === "SKC" ? config.skc : config.spu;
    for (let page = 1; page <= 30; page++) {
      const rows = [...document.querySelectorAll("tbody tr")];
      const target = rows.find((row) => {
        const value = normalizeText(row.innerText);
        const idMatch =
          config.idType === "SKC" ||
          !id ||
          value.includes(id);
        const stationMatch =
          !config.station || value.includes(`经营站点： ${config.station}`);
        return idMatch && stationMatch && value.includes("首次加入站点日期");
      });
      if (target) return target;

      const next = findNextPage();
      if (!next) break;
      const before = rows.map((row) => normalizeText(row.innerText)).join("|");
      next.click();
      try {
        await waitFor(
          () =>
            [...document.querySelectorAll("tbody tr")]
              .map((row) => normalizeText(row.innerText))
              .join("|") !== before,
          8000,
          "流量分析下一页"
        );
      } catch {
        break;
      }
    }
    return null;
  }

  async function verifyTargetStationActive(config, timeout = 12000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const row = await findTargetRow(config);
      if (row) {
        const value = normalizeText(row.innerText);
        if (
          /流量加速中|加速中|查看效果/.test(value) &&
          !findLinkIn(row, "立即开启")
        ) {
          return true;
        }
      }
      await sleep(500);
    }
    return false;
  }

  async function selectDuration(duration) {
    const labels = {
      long: "长期持续加速",
      30: "持续30天",
      14: "持续14天",
      7: "持续7天"
    };
    const expected = labels[duration] || labels[30];
    const option = [...document.querySelectorAll("label")].find(
      (label) =>
        isVisible(label) &&
        normalizeText(label.innerText).startsWith(expected)
    );
    if (!option) throw new Error(`没有找到“${expected}”选项`);
    if (option.getAttribute("data-checked") !== "true") {
      option.click();
      await waitFor(
        () => option.getAttribute("data-checked") === "true",
        3000,
        "加速时效选择"
      );
    }
    return expected;
  }

  async function abortTrafficFlow() {
    if (hasVisibleText("调整申报价")) {
      const cancel = findVisibleButton("取消");
      if (cancel) {
        cancel.click();
        await sleep(350);
      }
    }
    if (hasVisibleText("流量加速时效")) {
      const abandon = findVisibleButton("放弃加速机会");
      if (abandon) {
        abandon.click();
        await sleep(350);
        const confirm = findVisibleButton("确认");
        if (confirm && /确认选择|放弃加速/.test(visibleBodyText())) {
          confirm.click();
          await sleep(500);
        }
      }
    }
  }

  async function closePriceModal() {
    const modal = findPriceModalRoot();
    if (!modal) return;
    const cancel = findVisibleButtonIn(modal, "取消");
    if (!cancel) throw new Error("申报价弹窗没有找到“取消”");
    cancel.click();
    await waitFor(
      () => !findPriceModalRoot(),
      5000,
      "关闭申报价弹窗"
    );
  }

  async function openMorePrices() {
    const link = findLink("去获取");
    if (!link) throw new Error("弹窗中没有找到“去获取”");
    link.scrollIntoView({ block: "center" });
    link.click();
    await waitFor(() => findPriceModalRoot(), 8000, "调整申报价弹窗");
    return { opened: true };
  }

  async function selectAccelerationTier(config, applySelection = true) {
    const hybridMode = config.accelerationMode === "reduceThenTier";
    const targetPrice = optionalPrice(config.tierPrice);
    const skuLabels = hybridMode ? readTierSkuLabels() : [];
    const requiredPrices = hybridMode
      ? buildPerSkuTargetPrices(skuLabels, config)
      : null;
    if (!hybridMode && (targetPrice == null || targetPrice <= 0)) {
      return {
        selected: null,
        tiers: [],
        message: "自动档位匹配缺少有效的目标价"
      };
    }
    if (hybridMode && !skuLabels.length) {
      return {
        selected: null,
        tiers: [],
        message: "没有读取到档位对应的 SKU 信息"
      };
    }
    if (hybridMode && requiredPrices.missing.length) {
      return {
        selected: null,
        tiers: [],
        message: `档位匹配缺少价格：${requiredPrices.missing
          .slice(0, 3)
          .join("、")}`
      };
    }
    if (hybridMode && requiredPrices.targetSpecMissing) {
      return {
        selected: null,
        tiers: [],
        message: `当前 SKU 列表中没有找到目标规格“${config.specName}”`
      };
    }

    const tiers = [...document.querySelectorAll('[class*="flux-shift-table_item__"]')]
      .filter(
        (item) =>
          isVisible(item) &&
          !/beforeItem/.test(String(item.className)) &&
          normalizeText(item.innerText).includes("对应申报价格")
      )
      .map((item, index) => {
        const priceContainer = [...item.querySelectorAll('[class*="rightCnt"]')]
          .find((element) => isVisible(element));
        const prices = parseCurrencyValues(priceContainer?.innerText || item.innerText);
        return {
          index: index + 1,
          item,
          prices,
          minimumPrice: prices.length ? Math.min(...prices) : null,
          maximumPrice: prices.length ? Math.max(...prices) : null,
          averagePrice:
            prices.reduce((sum, price) => sum + price, 0) / prices.length,
          active: /itemActive/.test(String(item.className))
        };
      })
      .filter((tier) => tier.prices.length);

    if (!tiers.length) {
      return {
        selected: null,
        tiers: [],
        message: "流量加速器没有返回可读取的加速档位"
      };
    }

    const eligible = tiers.filter((tier) =>
      tier.prices.every((price, index) => {
        const required = hybridMode
          ? requiredPrices.values[index]
          : targetPrice;
        return (
          Number.isFinite(required) &&
          required <= price + 0.001
        );
      })
    );
    const usedFallback = hybridMode && !eligible.length;
    const candidates = usedFallback ? tiers : eligible;
    if (!candidates.length) {
      const maximum = Math.max(...tiers.map((tier) => tier.maximumPrice));
      return {
        selected: null,
        tiers: tiers.map(publicTier),
        message: hybridMode
          ? `目标规格和其他规格价格均高于当前档位（最高 ${formatPrice(
              maximum
            )}），没有满足条件的加速档位`
          : `目标价 ${formatPrice(
              targetPrice
            )} 高于所有档位的对应申报价（最高 ${formatPrice(
              maximum
            )}），没有满足条件的加速档位`
      };
    }

    const selected =
      config.tierStrategy === "minDiscount"
        ? candidates.reduce((best, tier) =>
            tier.averagePrice > best.averagePrice ? tier : best
          )
        : candidates.reduce((best, tier) =>
            tier.averagePrice < best.averagePrice ? tier : best
          );

    if (applySelection) {
      selected.item.scrollIntoView({ block: "center" });
      selected.item.click();
      await waitFor(
        () => /itemActive/.test(String(selected.item.className)),
        3500,
        `第 ${selected.index} 档选中`
      );
    }

    return {
      selected: publicTier(selected),
      tiers: tiers.map(publicTier),
      skuLabels,
      requiredPrices: requiredPrices?.values || null,
      usedFallback,
      continueDiscountAvailable: Boolean(findLink("去获取")),
      message: usedFallback
        ? "没有满足目标价格的档位，已按策略回退到现有最高流量档位"
        : "档位匹配完成"
    };
  }

  async function previewAccelerationTiers(config) {
    return selectAccelerationTier(config, false);
  }

  function publicTier(tier) {
    return {
      index: tier.index,
      prices: tier.prices,
      minimumPrice: tier.minimumPrice,
      maximumPrice: tier.maximumPrice,
      averagePrice: Number(tier.averagePrice.toFixed(2)),
      active: tier.active
    };
  }

  function readTierSkuLabels() {
    const infoItem = [...document.querySelectorAll('[class*="flux-shift-table_infoItem"]')]
      .filter((element) => isVisible(element))
      .sort(
        (left, right) =>
          right.querySelectorAll('[class*="skuItem__"]').length -
          left.querySelectorAll('[class*="skuItem__"]').length
      )[0];
    if (!infoItem) return [];
    return [...infoItem.querySelectorAll('[class*="skuItem__"]')]
      .filter(isVisible)
      .map((element) => normalizeText(element.innerText))
      .filter((label) => label && !label.startsWith("¥"));
  }

  function buildPerSkuTargetPrices(skuLabels, config) {
    const targetSpec = normalizeSpec(config.specName);
    const targetPrice = optionalPrice(config.targetPrice);
    const otherPrice = optionalPrice(config.otherPrice);
    const missing = [];
    let targetSpecMissing = Boolean(targetSpec);
    const values = skuLabels.map((label) => {
      const matchesTarget =
        Boolean(targetSpec) && normalizeSpec(label).includes(targetSpec);
      if (matchesTarget) targetSpecMissing = false;
      const value = matchesTarget ? targetPrice : otherPrice;
      if (value == null || value <= 0) {
        missing.push(`${label}：${matchesTarget ? "指定规格价格" : "其他规格价格"}`);
      }
      return value;
    });
    return { values, missing: [...new Set(missing)], targetSpecMissing };
  }

  function parseCurrencyValues(text) {
    return [...String(text || "").matchAll(/[¥￥]\s*([\d,]+(?:\.\d+)?)/g)]
      .map((match) => Number(match[1].replaceAll(",", "")))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  function formatPrice(value) {
    return `¥${Number(value).toFixed(2)}`;
  }

  function formatPriceRange(prices) {
    if (!prices.length) return "未知";
    const minimum = Math.min(...prices);
    const maximum = Math.max(...prices);
    return minimum === maximum
      ? formatPrice(minimum)
      : `${formatPrice(minimum)}–${formatPrice(maximum)}`;
  }

  async function fillTrafficPrices(config) {
    const modal = findPriceModalRoot();
    if (!modal) throw new Error("请先点击“去获取”打开调整申报价弹窗");
    const rows = [...modal.querySelectorAll("tbody tr")].filter(isVisible);
    if (!rows.length) throw new Error("调整申报价弹窗中没有规格行");

    const targetSpec = normalizeSpec(config.specName);
    const hasTargetSpec = Boolean(targetSpec);
    const targetPrice = optionalPrice(config.targetPrice);
    const otherPrice = optionalPrice(config.otherPrice);
    const filled = [];

    for (const row of rows) {
      const cells = [...row.querySelectorAll("td")];
      const skc = normalizeText(cells[0]?.innerText);
      const sku = normalizeText(cells[1]?.innerText);
      const input = row.querySelector("input");
      if (!skc || !sku || !input) continue;

      const refText = normalizeText(cells[3]?.innerText);
      const refMatch = refText.match(
        /参考申报价格：\s*¥?\s*(\d+(?:\.\d+)?)/
      );
      const referencePrice = refMatch ? Number(refMatch[1]) : null;
      const matchesTarget =
        hasTargetSpec &&
        (normalizeSpec(skc) === targetSpec ||
          normalizeSpec(sku).includes(targetSpec));
      const configuredPrice = matchesTarget ? targetPrice : otherPrice;
      const missingPrice =
        configuredPrice == null || !Number.isFinite(configuredPrice);
      const price = missingPrice ? null : configuredPrice;
      const overLimit =
        config.guardReferencePrice &&
        price != null &&
        referencePrice != null &&
        price > referencePrice;

      setNativeValue(input, price == null ? "" : String(price));
      filled.push({
        skc,
        sku,
        target: matchesTarget,
        price,
        referencePrice,
        missingPrice,
        useFallback: false,
        overLimit,
        valid:
          !missingPrice &&
          Number.isFinite(price) &&
          price > 0 &&
          !overLimit
      });
    }

    await sleep(700);
    const liveRows = [...modal.querySelectorAll("tbody tr")].filter(isVisible);
    for (const item of filled) {
      const liveRow = liveRows.find((row) =>
        normalizeText(row.innerText).includes(normalizeText(item.sku))
      );
      const actualPrice = optionalPrice(liveRow?.querySelector("input")?.value);
      item.actualPrice = actualPrice;
      item.readbackMismatch =
        actualPrice == null ||
        item.price == null ||
        Math.abs(actualPrice - item.price) > 0.001;
      if (item.readbackMismatch) item.valid = false;
    }
    return {
      rows: filled,
      errors: filled.filter((item) => !item.valid),
      canSubmit: filled.length > 0 && filled.every((item) => item.valid),
      readbackVerified: filled.length > 0 && filled.every(
        (item) => !item.readbackMismatch
      ),
      currency: /日常申报价格（CNY）/.test(normalizeText(modal.innerText))
        ? "CNY"
        : null,
      dryRun: Boolean(config.dryRun)
    };
  }

  async function verifyTrafficPricesPersisted(expectedRows) {
    try {
      await sleep(500);
      await openMorePrices();
      const modal = findPriceModalRoot();
      if (!modal) {
        return {
          verified: false,
          mismatches: [],
          error: "重新打开申报价弹窗失败"
        };
      }
      const liveRows = [...modal.querySelectorAll("tbody tr")].filter(
        isVisible
      );
      const mismatches = [];
      for (const expected of expectedRows) {
        const liveRow = liveRows.find((row) =>
          normalizeText(row.innerText).includes(
            normalizeText(expected.sku)
          )
        );
        const actualPrice = optionalPrice(
          liveRow?.querySelector("input")?.value
        );
        if (
          actualPrice == null ||
          Math.abs(actualPrice - expected.price) > 0.001
        ) {
          mismatches.push({
            sku: expected.sku,
            expected: expected.price,
            actual: actualPrice
          });
        }
      }
      await closePriceModal();
      return {
        verified: mismatches.length === 0,
        mismatches,
        currency: /日常申报价格（CNY）/.test(normalizeText(modal.innerText))
          ? "CNY"
          : null
      };
    } catch (error) {
      await closePriceModal().catch(() => {});
      return {
        verified: false,
        mismatches: [],
        error: error.message
      };
    }
  }

  function collectIdPairs() {
    const result = [];
    for (const row of document.querySelectorAll("tbody tr")) {
      if (!isVisible(row)) continue;
      const value = normalizeText(row.innerText);
      const spu = value.match(/SPU ID：\s*(\d+)/)?.[1];
      const skc = value.match(/SKC ID：\s*(\d+)/)?.[1];
      if (spu && skc) result.push({ spu, skc });
    }
    return result;
  }

  async function reportScanProgress(operationId, progress) {
    if (!operationId) return;
    try {
      await chrome.runtime.sendMessage({
        type: "SCAN_PROGRESS",
        operationId,
        progress
      });
    } catch {
      // Progress is best-effort and must not interrupt scanning.
    }
  }

  async function setGoodsPageSize(targetSize) {
    const input = [...document.querySelectorAll("input")].find(
      (item) =>
        isVisible(item) &&
        item.readOnly &&
        item.closest('[class*="PGT_sizeSelect_"]') &&
        ["10", "20", "50", "100", "200"].includes(normalizeText(item.value))
    );
    if (!input) return false;
    const current = Number(input.value);
    if (current >= targetSize) return true;
    input.click();
    const option = await waitFor(
      () =>
        [...document.querySelectorAll("[role='option']")].find(
          (item) =>
            isVisible(item) &&
            normalizeText(item.textContent) === String(targetSize)
        ),
      3000,
      "商品列表每页数量"
    );
    option.click();
    await waitFor(
      () => Number(input.value) >= targetSize,
      3000,
      "商品列表每页数量切换"
    );
    await sleep(600);
    return true;
  }

  async function waitForGoodsDataReady(options = {}) {
    const timeout = options.timeout || 30000;
    const minimumWaitMs = options.minimumWaitMs || 1000;
    const startedAt = Date.now();
    let stableSignature = "";
    let stableSince = 0;
    let lastCount = 0;
    let lastTotal = null;
    let lastPage = "";
    let lastLoading = false;

    while (Date.now() - startedAt < timeout) {
      lastLoading = isGoodsDataLoading();
      lastPage = activePageNumber();
      lastTotal = readTotalCount();
      const pagePairs = collectIdPairs();
      lastCount = pagePairs.length;
      const signature = pagePairs
        .map((pair) => `${pair.spu}:${pair.skc}`)
        .join("|");
      const stableKey = signature || (lastTotal === 0 ? "__empty__" : "");
      const pageChanged =
        !options.previousPage || !lastPage || lastPage !== options.previousPage;
      const signatureChanged =
        !options.previousSignature ||
        signature !== options.previousSignature ||
        pageChanged;

      if (!lastLoading && stableKey && stableKey === stableSignature) {
        const stableFor = Date.now() - stableSince;
        if (
          stableFor >= 1200 &&
          Date.now() - startedAt >= minimumWaitMs &&
          (signatureChanged || Date.now() - startedAt >= 4000)
        ) {
          return {
            signature,
            count: lastCount,
            total: lastTotal,
            page: lastPage
          };
        }
      } else {
        stableSignature = stableKey;
        stableSince = Date.now();
      }
      await sleep(200);
    }

    throw new Error(
      `${options.context || "商品数据"}加载超时：平台显示 ${
        lastTotal == null ? "未知" : lastTotal
      } 条，实际读取 ${lastCount} 条${
        lastLoading ? "，页面仍在加载" : ""
      }`
    );
  }

  function isGoodsDataLoading() {
    return /正在获取商品数据|请勿关闭此页面|正在加载商品列表|数据加载中/.test(
      visibleBodyText()
    );
  }

  async function collectVirtualizedGoodsPage(options) {
    const container = [...document.querySelectorAll("div")]
      .filter((element) => {
        const style = getComputedStyle(element);
        return (
          element.scrollHeight > element.clientHeight + 100 &&
          element.clientHeight > 200 &&
          /(auto|scroll)/.test(style.overflowY) &&
          element.querySelector("tbody tr")
        );
      })
      .sort((left, right) => right.scrollHeight - left.scrollHeight)[0];

    const pagePairs = new Map();
    const collect = () => {
      for (const pair of collectIdPairs()) {
        pagePairs.set(`${pair.spu}:${pair.skc}`, pair);
      }
    };
    if (!container) {
      collect();
      return {
        pairs: [...pagePairs.values()],
        virtualized: false,
        scrollHeight: 0
      };
    }

    const originalTop = container.scrollTop;
    const startedAt = Date.now();
    const step = Math.max(900, Math.floor(container.clientHeight * 1.8));
    try {
      container.scrollTop = 0;
      container.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(250);
      collect();
      for (
        let top = step;
        top <= container.scrollHeight;
        top += step
      ) {
        container.scrollTop = Math.min(
          container.scrollHeight,
          top
        );
        container.dispatchEvent(new Event("scroll", { bubbles: true }));
        await sleep(120);
        collect();
        if (top % (step * 5) < step) {
          await reportScanProgress(options.operationId, {
            page: options.page,
            currentPairs: pagePairs.size,
            uniquePairs: pagePairs.size,
            elapsedMs: Date.now() - options.scanStartedAt
          });
        }
        if (Date.now() - startedAt > 180000) {
          throw new Error("商品虚拟滚动读取超时");
        }
      }
    } finally {
      container.scrollTop = originalTop;
      container.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
    return {
      pairs: [...pagePairs.values()],
      virtualized: true,
      scrollHeight: container.scrollHeight
    };
  }

  function readPageSize() {
    const input = [...document.querySelectorAll("input")].find(
      (item) =>
        isVisible(item) &&
        item.readOnly &&
        item.closest('[class*="PGT_sizeSelect_"]') &&
        ["10", "20", "50", "100", "200"].includes(normalizeText(item.value))
    );
    return input ? Number(normalizeText(input.value)) : null;
  }

  async function applyCategoryPath(categoryPath) {
    const path = normalizeText(categoryPath)
      .split(/\s*(?:>|＞|\/)\s*/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!path.length) throw new Error("类目检索需要填写商品类目路径");

    const label = [...document.querySelectorAll("div, label, span")].find(
      (element) =>
        isVisible(element) &&
        normalizeText(element.textContent) === "商品分类"
    );
    const row = label?.parentElement;
    const input = row?.querySelector(
      "input[readonly][placeholder='请选择']"
    );
    if (!input) throw new Error("没有找到“商品分类”筛选框");
    input.click();

    for (const segment of path) {
      const option = await waitFor(
        () =>
          [...document.querySelectorAll("[role='option'], li")]
            .filter(
              (element) =>
                isVisible(element) &&
                normalizeText(element.textContent) === segment
            )
            .at(-1),
        5000,
        `商品类目“${segment}”`
      );
      const labelTarget = option.querySelector(
        '[class*="CSD_labelWrapper_"]'
      );
      const target = labelTarget || option;
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
      await sleep(120);
      target.dispatchEvent(
        new MouseEvent("mouseover", {
          bubbles: true,
          clientX: target.getBoundingClientRect().left + 4,
          clientY: target.getBoundingClientRect().top + 4
        })
      );
      await sleep(180);
      target.click();
      await sleep(350);
    }

    input.blur();
    await sleep(500);
    return path;
  }

  function readTotalCount() {
    const text = visibleBodyText();
    const pagerMatches = [
      ...text.matchAll(/共有?\s*(\d+)\s*条/g)
    ];
    if (pagerMatches.length) {
      return Number(pagerMatches.at(-1)[1]);
    }
    const fallback = text.match(/全部\s*(\d+)/);
    return fallback ? Number(fallback[1]) : null;
  }

  function findNextPage() {
    return [...document.querySelectorAll("li, button, a")].find((element) => {
      const className = String(element.className || "");
      return (
        className.includes("PGT_next_") &&
        !className.includes("PGT_disabled_")
      );
    });
  }

  function activePageNumber() {
    return (
      normalizeText(
        document.querySelector(
          '[class*="PGT_pagerItemActive_"], [class*="pagerItemActive"]'
        )?.textContent
      ) || ""
    );
  }

  function findInputByPlaceholder(placeholder) {
    return [...document.querySelectorAll("input")].find(
      (input) => input.placeholder === placeholder && isVisible(input)
    );
  }

  function findButton(text) {
    return [...document.querySelectorAll("button, [role='button']")].find(
      (button) =>
        normalizeText(button.textContent) === text && isVisible(button)
    );
  }

  function findVisibleButton(text) {
    return [...document.querySelectorAll("button, [role='button']")]
      .filter(
        (button) =>
          isVisible(button) && normalizeText(button.textContent) === text
      )
      .at(-1);
  }

  function findVisibleButtonIn(root, text) {
    if (!root) return null;
    return [...root.querySelectorAll("button, [role='button']")]
      .filter(
        (button) =>
          isVisible(button) && normalizeText(button.textContent) === text
      )
      .at(-1);
  }

  function findPriceModalRoot() {
    const heading = findExactText("调整申报价");
    if (!heading) return null;
    let modal = heading;
    for (let depth = 0; modal && depth < 14; depth++) {
      const visibleRows = [...modal.querySelectorAll("tbody tr")].filter(
        isVisible
      );
      if (visibleRows.length >= 2) return modal;
      modal = modal.parentElement;
    }
    return null;
  }

  function findLink(text, root = document) {
    return [...root.querySelectorAll("a, [role='link'], button")].find(
      (element) =>
        normalizeText(element.textContent) === text && isVisible(element)
    );
  }

  function findLinkIn(root, text) {
    return (
      findLink(text, root) ||
      [...root.querySelectorAll("*")].find(
        (element) =>
          normalizeText(element.textContent) === text && isVisible(element)
      )
    );
  }

  function findExactText(text) {
    return [...document.querySelectorAll("div, span, a, button, li")].find(
      (element) =>
        normalizeText(element.textContent) === text &&
        isVisible(element) &&
        ![...element.children].some(
          (child) => normalizeText(child.textContent) === text
        )
    );
  }

  function hasVisibleText(text) {
    return Boolean(findExactText(text));
  }

  function normalizeSpec(value) {
    return normalizeText(value).toLowerCase().replace(/\s+/g, "");
  }

  function findRateLimitMessage() {
    const match = visibleBodyText().match(
      /.{0,30}(请求频繁|操作频繁|系统繁忙|操作过快|稍后重试|请勿重复).{0,50}/
    );
    return match ? normalizeText(match[0]) : "";
  }

  function isRateLimitMessage(message) {
    return /请求频繁|操作频繁|系统繁忙|操作过快|稍后重试|请勿重复/.test(
      String(message || "")
    );
  }

  function assertNoRateLimit() {
    const message = findRateLimitMessage();
    if (message) throw new Error(message);
  }

  function isTransientFailure(message) {
    return /请求频繁|操作频繁|系统繁忙|操作过快|稍后重试|请勿重复|超时|网络|未响应|通信|加载失败|timeout|ERR_|请重试/.test(
      String(message || "")
    );
  }

  function optionalPrice(value) {
    if (value == null || String(value).trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function setNativeValue(input, value) {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;
    setter.call(input, String(value));
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: String(value)
      })
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  }

  async function waitFor(fn, timeout, description) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const value = fn();
      if (value) return value;
      await sleep(120);
    }
    throw new Error(`${description}加载超时`);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function visibleBodyText() {
    return normalizeText(document.body?.innerText || "");
  }

  function ensurePill() {
    const context = readContext();
    if (!["goods", "traffic"].includes(context.kind)) return;
    if (pill?.isConnected) {
      pill.textContent =
        context.kind === "goods" ? "⚡ 指定规格筛选" : "⚡ 指定规格加速";
      return;
    }

    pill = document.createElement("button");
    pill.type = "button";
    pill.textContent =
      context.kind === "goods" ? "⚡ 指定规格筛选" : "⚡ 指定规格加速";
    Object.assign(pill.style, {
      position: "fixed",
      right: "22px",
      bottom: "28px",
      zIndex: "2147483647",
      height: "40px",
      padding: "0 18px",
      border: "1px solid rgba(255,255,255,.55)",
      borderRadius: "999px",
      background: "linear-gradient(135deg, #644fff, #925cff)",
      boxShadow: "0 10px 28px rgba(87, 63, 221, .34)",
      color: "#fff",
      font: "600 13px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      cursor: "grab",
      touchAction: "none",
      userSelect: "none"
    });

    const savedPosition = (() => {
      try {
        return JSON.parse(localStorage.getItem("traffic_spec_pill_position"));
      } catch {
        return null;
      }
    })();
    if (
      savedPosition &&
      Number.isFinite(savedPosition.left) &&
      Number.isFinite(savedPosition.top)
    ) {
      pill.style.left = `${savedPosition.left}px`;
      pill.style.top = `${savedPosition.top}px`;
      pill.style.right = "auto";
      pill.style.bottom = "auto";
    }
    pill.title = "点击打开插件，可拖动位置";

    let dragging = false;
    let moved = false;
    let skipClickUntil = 0;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    pill.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const rect = pill.getBoundingClientRect();
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      pill.style.cursor = "grabbing";
      pill.setPointerCapture?.(event.pointerId);
    });
    pill.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 5) moved = true;
      const maxLeft = Math.max(8, window.innerWidth - pill.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - pill.offsetHeight - 8);
      const left = Math.min(maxLeft, Math.max(8, startLeft + deltaX));
      const top = Math.min(maxTop, Math.max(8, startTop + deltaY));
      pill.style.left = `${left}px`;
      pill.style.top = `${top}px`;
      pill.style.right = "auto";
      pill.style.bottom = "auto";
    });
    pill.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = false;
      pill.style.cursor = "grab";
      if (moved) {
        skipClickUntil = Date.now() + 250;
        const rect = pill.getBoundingClientRect();
        localStorage.setItem(
          "traffic_spec_pill_position",
          JSON.stringify({ left: rect.left, top: rect.top })
        );
      }
    });

    pill.addEventListener("click", async () => {
      if (Date.now() < skipClickUntil) return;
      pill.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({ type: "OPEN_PANEL" });
        if (!result?.ok) throw new Error(result?.error || "无法打开侧边栏");
      } catch (error) {
        console.warn("[指定规格加速]", error);
        pill.textContent = "打开失败，请点扩展图标";
        setTimeout(ensurePill, 1800);
      } finally {
        pill.disabled = false;
      }
    });
    document.body.appendChild(pill);
  }

  new MutationObserver(() => {
    clearTimeout(pillTimer);
    pillTimer = setTimeout(ensurePill, 600);
  }).observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(ensurePill, 700);
})();
