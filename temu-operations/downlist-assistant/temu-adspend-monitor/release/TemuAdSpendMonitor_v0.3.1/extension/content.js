(function initTemuAdSpendMonitor() {
  if (globalThis.__temuAdSpendMonitorLoaded) return;
  const core = globalThis.TemuAdSpendCore;
  if (!core?.isAdListUrl(location.href)) return;
  globalThis.__temuAdSpendMonitorLoaded = true;

  const DEFAULT_SETTINGS = {
    intervalSec: 60,
    defaultSpendLimitCny: 0,
    defaultCostPerOrderLimitCny: 0,
    mode: "observe",
    pauseAuthorized: false
  };
  const pendingRequests = new Map();
  let bridgePromise = null;
  let monitorTimer = null;
  let pageGuardTimer = null;
  let floatingHost = null;
  let floatingPanelApi = null;
  let running = false;
  let checkInFlight = false;
  let pageGuardNotified = false;

  globalThis.__temuAdSpendStopFloatingPanel = () => {
    clearInterval(pageGuardTimer);
    clearTimeout(monitorTimer);
    floatingHost?.remove();
    floatingHost = null;
    floatingPanelApi = null;
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data;
    if (
      !message ||
      message.source !== "temu-adspend-page-bridge" ||
      message.type !== "result"
    ) {
      return;
    }
    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    pendingRequests.delete(message.requestId);
    clearTimeout(pending.timeout);
    if (message.ok) {
      pending.resolve(message.data);
    } else {
      const error = new Error(message.error || "页面请求失败");
      error.code = message.code || "PAGE_REQUEST_FAILED";
      pending.reject(error);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type) return false;
    let task = null;
    if (message.type === "contentPing") {
      sendResponse({
        ok: true,
        url: location.href,
        title: document.title,
        running
      });
      return false;
    }
    if (message.type === "startMonitor") task = startMonitor();
    if (message.type === "stopMonitor") task = stopMonitor();
    if (message.type === "refreshNow") task = performCheck({ manual: true });
    if (message.type === "restoreSpu") {
      task = restoreSpu(message.spuId, message.recordId);
    }
    if (message.type === "toggleFloatingPanel") {
      task = toggleFloatingPanel();
    }
    if (message.type === "settingsChanged") task = handleSettingsChanged();
    if (!task) return false;

    task
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) =>
        sendResponse({
          ok: false,
          code: error?.code || "MONITOR_ERROR",
          error: String(error?.message || error)
        })
      );
    return true;
  });

  initialize();

  async function initialize() {
    startPageGuard();
    registerPageLock();
    await mountFloatingPanel();
    const stored = await chrome.storage.local.get(["settings", "runtime"]);
    if (!stored.settings) {
      await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
    if (stored.runtime?.running) {
      running = true;
      scheduleNext(1000);
    }
    ensurePageBridge().catch(() => {});
  }

  async function getState() {
    const stored = await chrome.storage.local.get([
      "settings",
      "rules",
      "pauseLedger",
      "pauseRecords",
      "audits"
    ]);
    return {
      settings: { ...DEFAULT_SETTINGS, ...(stored.settings || {}) },
      rules: stored.rules || {},
      pauseLedger: stored.pauseLedger || {},
      pauseRecords: Array.isArray(stored.pauseRecords)
        ? stored.pauseRecords
        : [],
      audits: Array.isArray(stored.audits) ? stored.audits : []
    };
  }

  async function handleSettingsChanged() {
    if (running) {
      clearTimeout(monitorTimer);
      scheduleNext(500);
    }
    return { running };
  }

  async function startMonitor() {
    assertAdListPage();
    if (running) {
      scheduleNext(200);
      return { running: true };
    }
    running = true;
    await chrome.storage.local.set({
      runtime: {
        ...(await getRuntime()),
        running: true,
        lastError: null
      }
    });
    scheduleNext(250);
    return { running: true };
  }

  async function stopMonitor() {
    running = false;
    clearTimeout(monitorTimer);
    monitorTimer = null;
    const runtime = await getRuntime();
    await chrome.storage.local.set({
      runtime: { ...runtime, running: false }
    });
    return { running: false };
  }

  function scheduleNext(delayMs) {
    clearTimeout(monitorTimer);
    if (!running) return;
    monitorTimer = setTimeout(async () => {
      if (!core.isAdListUrl(location.href)) {
        await handlePageLoss();
        return;
      }
      try {
        await performCheck({ manual: false });
      } finally {
        if (running) {
          const { settings } = await getState();
          const intervalMs =
            Math.max(30, Math.min(3600, core.toNumber(settings.intervalSec, 60))) *
            1000;
          scheduleNext(intervalMs);
        }
      }
    }, Math.max(250, delayMs));
  }

  async function getRuntime() {
    const stored = await chrome.storage.local.get("runtime");
    return stored.runtime || {};
  }

  async function ensurePageBridge() {
    assertAdListPage();
    if (!bridgePromise) {
      bridgePromise = chrome.runtime
        .sendMessage({ type: "injectPageBridge" })
        .then((response) => {
          if (!response?.ok) {
            throw new Error(response?.error || "页面桥接注入失败");
          }
          return true;
        })
        .catch((error) => {
          bridgePromise = null;
          throw error;
        });
    }
    return bridgePromise;
  }

  async function bridgeRequest(message, timeoutMs = 22000) {
    assertAdListPage();
    await ensurePageBridge();
    const requestId = `${Date.now()}-${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        const error = new Error("页面请求超时");
        error.code = "FETCH_TIMEOUT";
        reject(error);
      }, timeoutMs);
      pendingRequests.set(requestId, { resolve, reject, timeout });
      window.postMessage(
        {
          source: "temu-adspend-content",
          type: message.type,
          requestId,
          payload: message.payload,
          timeoutMs
        },
        location.origin
      );
    });
  }

  function buildAdsDetailPayload(pageNumber, pageSize) {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );
    return {
      ad_status: [],
      ad_advice_types: [],
      page_size: pageSize,
      page_number: pageNumber,
      specific_query_info: "",
      sort_by: 0,
      sort_type: "desc",
      start_time: start.getTime(),
      end_time: Date.now(),
      need_calculate_goods_summary: true,
      columns_type: 22,
      selected_roas_type: 1,
      filter_cooperative_ad_type: 0,
      ad_phase: -1
    };
  }

  async function fetchAllAds() {
    const startedAt = performance.now();
    const pageSize = 50;

    async function fetchPage(pageNumber) {
      const result = await bridgeRequest({
        type: "fetchAdsDetail",
        payload: buildAdsDetailPayload(pageNumber, pageSize)
      });
      const body = result?.body;
      if (
        body?.success !== true ||
        core.toNumber(body?.error_code, -1) !== 1000000
      ) {
        const error = new Error(
          body?.error_msg ||
            body?.message ||
            `推广明细接口失败，error_code=${body?.error_code ?? "未知"}`
        );
        error.code = "API_RESPONSE_FAILED";
        throw error;
      }
      const records = Array.isArray(body?.result?.ads_detail)
        ? body.result.ads_detail
        : [];
      return {
        records,
        total: core.toNumber(body?.total, records.length),
        hasMore: body?.has_more === true
      };
    }

    const firstPage = await fetchPage(1);
    const total = firstPage.total;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    if (pageCount > 200) {
      const error = new Error(
        `推广记录数量异常：${total} 条，超过单次安全读取范围`
      );
      error.code = "STORE_TOO_LARGE";
      throw error;
    }

    const allRecords = [...firstPage.records];
    const remainingPages = Array.from(
      { length: Math.max(0, pageCount - 1) },
      (_, index) => index + 2
    );
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(4, remainingPages.length) },
      async () => {
        while (nextIndex < remainingPages.length) {
          const pageNumber = remainingPages[nextIndex];
          nextIndex += 1;
          const page = await fetchPage(pageNumber);
          allRecords.push(...page.records);
        }
      }
    );
    await Promise.all(workers);

    const unique = new Map();
    for (const record of allRecords) {
      const key = String(record.ad_id || `${record.goods_id}:${record.spu_id}`);
      unique.set(key, record);
    }
    const records = [...unique.values()];
    return {
      records,
      total,
      fetchMs: Math.round(performance.now() - startedAt),
      complete: records.length >= total
    };
  }

  async function performCheck({ manual }) {
    assertAdListPage();
    if (checkInFlight) {
      return { skipped: true, reason: "CHECK_IN_FLIGHT" };
    }
    checkInFlight = true;
    const checkedAt = new Date().toISOString();
    try {
      const state = await getState();
      const fetched = await fetchAllAds();
      if (!fetched.complete) {
        const error = new Error(
          `推广明细分页不完整：已取 ${fetched.records.length}/${fetched.total}`
        );
        error.code = "PAGINATION_INCOMPLETE";
        throw error;
      }
      const summaries = core
        .aggregateBySpu(fetched.records)
        .map((summary) => ({
          ...summary,
          rule: core.evaluateRule(summary, state.settings, state.rules)
        }));

      const auditEvents = [];
      for (const summary of summaries.filter((item) => item.rule.hit)) {
        auditEvents.push(
          await handleTrigger(summary, state, checkedAt, auditEvents)
        );
      }

      const audits = [...auditEvents, ...state.audits].slice(0, 300);
      const statusMessage =
        state.settings.mode === "armed"
          ? "自动暂停已启用"
          : "观察模式（不会暂停）";
      await chrome.storage.local.set({
        audits,
        runtime: {
          running,
          lastCheckAt: checkedAt,
          lastError: null,
          lastFetchMs: fetched.fetchMs,
          totalAds: fetched.records.length,
          spus: summaries,
          statusMessage,
          manual,
          dataBackend: "page-main-fetch"
        }
      });
      return {
        checkedAt,
        totalAds: fetched.records.length,
        spus: summaries.length,
        fetchMs: fetched.fetchMs
      };
    } catch (error) {
      const runtime = await getRuntime();
      await chrome.storage.local.set({
        runtime: {
          ...runtime,
          running,
          lastError: {
            at: checkedAt,
            code: error?.code || "MONITOR_ERROR",
            message: String(error?.message || error)
          }
        }
      });
      throw error;
    } finally {
      checkInFlight = false;
    }
  }

  async function handleTrigger(summary, state, checkedAt, currentEvents) {
    const targets = core.activeTargets(summary);
    const key = core.pauseIdempotencyKey(summary, summary.rule);
    const baseEvent = {
      at: checkedAt,
      spuId: summary.spuId,
      spendCny: summary.spendCny,
      orderCount: summary.orderCount,
      costPerOrderCny: summary.costPerOrderCny,
      reasons: summary.rule.reasons,
      rule: summary.rule,
      mode: state.settings.mode
    };

    if (state.settings.mode !== "armed" || !state.settings.pauseAuthorized) {
      return { ...baseEvent, result: "TRIGGERED_OBSERVE_ONLY" };
    }
    if (!targets.length) {
      return {
        ...baseEvent,
        result: "SKIPPED_NO_ACTIVE_TARGET"
      };
    }
    if (state.pauseLedger[key]) {
      return {
        ...baseEvent,
        result: "SKIPPED_ALREADY_ATTEMPTED",
        previousResult: state.pauseLedger[key].result
      };
    }

    const targetGoodsIds = targets.map((ad) => ad.goodsId);
    await saveLedgerAttempt(key, {
      at: checkedAt,
      result: "PAUSE_REQUEST_PENDING",
      targetGoodsIds
    });
    try {
      const pauseResponse = await bridgeRequest({
        type: "modifyAds",
        payload: {
          modifyAdDtos: targetGoodsIds.map((goodsId) => ({
            goodsId,
            status: core.PAUSE_ACTION_STATUS
          }))
        }
      });
      const classification = core.classifyPauseResponse(
        pauseResponse,
        targetGoodsIds
      );
      if (!classification.ok) {
        await saveLedgerAttempt(key, {
          at: checkedAt,
          result: classification.code,
          message: classification.message,
          targetGoodsIds
        });
        return {
          ...baseEvent,
          result: classification.code,
          message: classification.message
        };
      }

      const pauseRecord = await upsertPauseRecord({
        recordId: key,
        spuId: summary.spuId,
        title: summary.title,
        goodsIds: targetGoodsIds,
        adIds: targets.map((ad) => ad.adId).filter(Boolean),
        pausedAt: checkedAt,
        dateKey: core.localDateKey(new Date(checkedAt)),
        spendCny: summary.spendCny,
        orderCount: summary.orderCount,
        costPerOrderCny: summary.costPerOrderCny,
        reasons: summary.rule.reasons,
        mode: state.settings.mode,
        pauseResult: "PAUSE_REQUEST_PENDING",
        pauseVerified: false,
        restoreStatus: "available",
        restoreRequestedAt: null,
        restoredAt: null,
        lastError: null
      });

      await new Promise((resolve) => setTimeout(resolve, 2500));
      const verification = await fetchAllAds();
      const verified = core.verifyPaused(
        verification.records,
        targetGoodsIds
      );
      const result = verified.verified
        ? "PAUSED_VERIFIED"
        : "PAUSE_VERIFY_FAILED";
      await saveLedgerAttempt(key, {
        at: checkedAt,
        result,
        targetGoodsIds,
        verification
      });
      await upsertPauseRecord({
        ...pauseRecord,
        recordId: key,
        pauseResult: result,
        pauseVerified: verified.verified,
        lastError: verified.verified
          ? null
          : "暂停请求已被接受，但重新读取后状态未全部变为手动暂停。"
      });
      return {
        ...baseEvent,
        result,
        verification
      };
    } catch (error) {
      const result =
        error?.code === "FETCH_TIMEOUT"
          ? "PAUSE_RESULT_UNKNOWN"
          : "PAUSE_FAILED";
      await saveLedgerAttempt(key, {
        at: checkedAt,
        result,
        targetGoodsIds,
        message: String(error?.message || error)
      });
      const existingRecord = await findPauseRecord(key);
      if (existingRecord) {
        await upsertPauseRecord({
          ...existingRecord,
          pauseResult: result,
          lastError: String(error?.message || error)
        });
      }
      return {
        ...baseEvent,
        result,
        message: String(error?.message || error)
      };
    }
  }

  async function saveLedgerAttempt(key, entry) {
    const stored = await chrome.storage.local.get("pauseLedger");
    const pauseLedger = stored.pauseLedger || {};
    pauseLedger[key] = entry;
    await chrome.storage.local.set({ pauseLedger });
  }

  async function restoreSpu(spuId, recordId) {
    assertAdListPage();
    const cleanSpuId = String(spuId || "").trim();
    if (!cleanSpuId) {
      throw createError("SPU_REQUIRED", "缺少需要恢复的 SPU ID");
    }

    const deadline = Date.now() + 6000;
    while (checkInFlight && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (checkInFlight) {
      throw createError("CHECK_IN_FLIGHT", "正在读取最新数据，请稍后再恢复");
    }
    checkInFlight = true;
    const requestedAt = new Date().toISOString();
    try {
      let record = await findPauseRecord(recordId, cleanSpuId);
      if (!record) {
        throw createError("PAUSE_RECORD_NOT_FOUND", "未找到该 SPU 的暂停记录");
      }
      if (record.restoreStatus === "restored") {
        throw createError("ALREADY_RESTORED", "该 SPU 已经恢复投流");
      }
      if (
        record.restoreStatus === "restore_requested" &&
        Date.now() - new Date(record.restoreRequestedAt || 0).getTime() < 30000
      ) {
        throw createError("RESTORE_IN_PROGRESS", "该 SPU 正在恢复，请等待核验");
      }

      let targetGoodsIds = Array.isArray(record.goodsIds)
        ? [...new Set(record.goodsIds.filter(Boolean))]
        : [];
      if (!targetGoodsIds.length) {
        const current = await fetchAllAds();
        targetGoodsIds = current.records
          .filter(
            (item) =>
              String(item.spu_id || "") === cleanSpuId &&
              core.toNumber(item.ad_show_status, -1) ===
                core.STATUS.MANUAL_PAUSE
          )
          .map((item) => String(item.goods_id || ""))
          .filter(Boolean);
      }
      if (!targetGoodsIds.length) {
        throw createError(
          "RESTORE_TARGET_NOT_FOUND",
          "没有找到可恢复的已暂停推广记录"
        );
      }

      record = await upsertPauseRecord({
        ...record,
        recordId: record.recordId,
        restoreStatus: "restore_requested",
        restoreRequestedAt: requestedAt,
        lastError: null
      });

      const restoreResponse = await bridgeRequest({
        type: "modifyAds",
        payload: {
          modifyAdDtos: targetGoodsIds.map((goodsId) => ({
            goodsId,
            status: core.RESTORE_ACTION_STATUS
          }))
        }
      });
      const classification = core.classifyRestoreResponse(
        restoreResponse,
        targetGoodsIds
      );
      if (!classification.ok) {
        await upsertPauseRecord({
          ...record,
          restoreStatus: "restore_failed",
          lastError: classification.message
        });
        throw createError(classification.code, classification.message);
      }

      await new Promise((resolve) => setTimeout(resolve, 2500));
      const verification = await fetchAllAds();
      const verified = core.verifyRestored(
        verification.records,
        targetGoodsIds
      );
      const restoreStatus = verified.verified
        ? "restored"
        : "restore_verify_failed";
      const restoredAt = verified.verified
        ? new Date().toISOString()
        : null;
      await upsertPauseRecord({
        ...record,
        restoreStatus,
        restoredAt,
        restoreVerification: verified,
        lastError: verified.verified
          ? null
          : "恢复请求已被接受，但重新读取后未全部变为推广中。"
      });
      await appendAudit({
        at: restoredAt || new Date().toISOString(),
        spuId: cleanSpuId,
        spendCny: record.spendCny,
        orderCount: record.orderCount,
        costPerOrderCny: record.costPerOrderCny,
        reasons: [],
        result: verified.verified
          ? "RESTORED_VERIFIED"
          : "RESTORE_VERIFY_FAILED",
        mode: "manual_restore"
      });
      if (!verified.verified) {
        throw createError(
          "RESTORE_VERIFY_FAILED",
          "恢复请求已被接受，但推广状态尚未统一变为“推广中”"
        );
      }
      return {
        spuId: cleanSpuId,
        recordId: record.recordId,
        restoredAt,
        verification: verified
      };
    } catch (error) {
      const record = await findPauseRecord(recordId, cleanSpuId);
      if (
        record &&
        !["restore_failed", "restore_verify_failed", "restored"].includes(
          record.restoreStatus
        )
      ) {
        await upsertPauseRecord({
          ...record,
          restoreStatus: "restore_failed",
          lastError: String(error?.message || error)
        });
      }
      throw error;
    } finally {
      checkInFlight = false;
    }
  }

  async function findPauseRecord(recordId, spuId) {
    const stored = await chrome.storage.local.get("pauseRecords");
    const records = Array.isArray(stored.pauseRecords)
      ? stored.pauseRecords
      : [];
    return (
      records.find(
        (record) =>
          (recordId && record.recordId === recordId) ||
          (!recordId && spuId && String(record.spuId) === String(spuId))
      ) || null
    );
  }

  async function upsertPauseRecord(nextRecord) {
    const stored = await chrome.storage.local.get("pauseRecords");
    const records = Array.isArray(stored.pauseRecords)
      ? stored.pauseRecords
      : [];
    const index = records.findIndex(
      (record) =>
        record.recordId === nextRecord.recordId ||
        (!nextRecord.recordId &&
          String(record.spuId) === String(nextRecord.spuId) &&
          record.dateKey === nextRecord.dateKey)
    );
    const record = {
      ...(index >= 0 ? records[index] : {}),
      ...nextRecord
    };
    if (index >= 0) {
      records[index] = record;
    } else {
      records.unshift(record);
    }
    await chrome.storage.local.set({
      pauseRecords: records.slice(0, 200)
    });
    return record;
  }

  async function appendAudit(event) {
    const stored = await chrome.storage.local.get("audits");
    const audits = Array.isArray(stored.audits) ? stored.audits : [];
    await chrome.storage.local.set({
      audits: [event, ...audits].slice(0, 300)
    });
  }

  function createError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function assertAdListPage() {
    if (!core.isAdListUrl(location.href)) {
      throw createError(
        "WRONG_PAGE",
        "当前页面已离开 Temu 商品推广页，监控已停止"
      );
    }
  }

  function startPageGuard() {
    clearInterval(pageGuardTimer);
    pageGuardTimer = setInterval(async () => {
      if (core.isAdListUrl(location.href)) {
        if (pageGuardNotified) {
          pageGuardNotified = false;
          registerPageLock();
        }
        if (!floatingHost?.isConnected) {
          await mountFloatingPanel();
        }
        return;
      }
      await handlePageLoss();
    }, 1000);
  }

  async function handlePageLoss() {
    if (pageGuardNotified) return;
    pageGuardNotified = true;
    running = false;
    clearTimeout(monitorTimer);
    monitorTimer = null;
    floatingHost?.remove();
    floatingHost = null;
    floatingPanelApi = null;
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timeout);
      const error = createError(
        "WRONG_PAGE",
        "页面已离开商品推广页，请求已取消"
      );
      pending.reject(error);
    }
    pendingRequests.clear();
    const runtime = await getRuntime();
    await chrome.storage.local.set({
      runtime: {
        ...runtime,
        running: false,
        locked: false,
        lastError: {
          at: new Date().toISOString(),
          code: "WRONG_PAGE",
          message: "当前页面已离开 Temu 商品推广页，监控已停止"
        }
      }
    });
  }

  function registerPageLock() {
    chrome.runtime
      .sendMessage({
        type: "registerAdPage",
        url: location.href
      })
      .catch(() => {});
  }

  async function toggleFloatingPanel() {
    if (!floatingHost?.isConnected) {
      await mountFloatingPanel();
    }
    floatingPanelApi?.toggle();
    return { visible: Boolean(floatingPanelApi?.isVisible()) };
  }

  async function mountFloatingPanel() {
    if (!core.isAdListUrl(location.href)) return;
    if (floatingHost?.isConnected) return;
    floatingHost?.remove();

    const host = document.createElement("div");
    host.id = "temu-adspend-floating-host";
    Object.assign(host.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      pointerEvents: "none"
    });
    document.documentElement.appendChild(host);
    floatingHost = host;

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .floating-panel {
          position: fixed;
          top: 72px;
          right: 18px;
          display: flex;
          flex-direction: column;
          width: min(380px, calc(100vw - 20px));
          height: min(620px, calc(100vh - 20px));
          overflow: hidden;
          border: 1px solid #ccd5e1;
          border-radius: 14px;
          background: #f3f5f8;
          box-shadow: 0 18px 55px rgba(15, 23, 42, .28);
          pointer-events: auto;
        }
        .floating-panel.hidden { display: none; }
        .floating-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex: 0 0 36px;
          padding: 0 10px 0 13px;
          color: #fff;
          background: linear-gradient(135deg, #18233b, #30476f);
          cursor: move;
          user-select: none;
          font: 600 12px/1.4 "Microsoft YaHei UI", sans-serif;
        }
        .floating-title {
          display: flex;
          align-items: center;
          gap: 7px;
          overflow: hidden;
          white-space: nowrap;
        }
        .floating-title::before {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #44d19a;
          box-shadow: 0 0 0 3px rgba(68, 209, 154, .18);
          content: "";
        }
        .minimize {
          width: 28px;
          height: 24px;
          border: 1px solid rgba(255, 255, 255, .28);
          border-radius: 7px;
          color: #fff;
          background: rgba(255, 255, 255, .06);
          cursor: pointer;
          font: 700 16px/1 sans-serif;
        }
        iframe {
          display: block;
          width: 100%;
          min-height: 0;
          flex: 1 1 auto;
          border: 0;
          background: #f3f5f8;
        }
        .launcher {
          position: fixed;
          right: 20px;
          bottom: 84px;
          display: none;
          align-items: center;
          gap: 7px;
          min-height: 38px;
          padding: 8px 13px;
          border: 0;
          border-radius: 999px;
          color: #fff;
          background: #f65f3f;
          box-shadow: 0 10px 30px rgba(246, 95, 63, .35);
          cursor: pointer;
          pointer-events: auto;
          font: 700 12px/1 "Microsoft YaHei UI", sans-serif;
        }
        .launcher::before {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #fff;
          content: "";
        }
        .launcher.visible { display: inline-flex; }
      </style>
      <section class="floating-panel">
        <header class="floating-header">
          <span class="floating-title">Temu 推广花费监控</span>
          <button class="minimize" type="button" title="最小化">−</button>
        </header>
        <iframe title="Temu 商品推广花费监控"></iframe>
      </section>
      <button class="launcher" type="button">花费监控</button>
    `;

    const panel = shadow.querySelector(".floating-panel");
    const header = shadow.querySelector(".floating-header");
    const minimize = shadow.querySelector(".minimize");
    const launcher = shadow.querySelector(".launcher");
    const iframe = shadow.querySelector("iframe");
    const positionKey = "temuAdSpendFloatingPosition";
    const minimizedKey = "temuAdSpendFloatingMinimized";

    function clampPosition(left, top) {
      const width = panel.getBoundingClientRect().width;
      const height = panel.getBoundingClientRect().height;
      return {
        left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - height - 8))
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

    function setMinimized(minimized, save = false) {
      panel.classList.toggle("hidden", minimized);
      launcher.classList.toggle("visible", minimized);
      if (save) {
        try {
          localStorage.setItem(minimizedKey, minimized ? "1" : "0");
        } catch (_) {
          // Minimized-state persistence is optional.
        }
      }
    }

    try {
      const saved = JSON.parse(localStorage.getItem(positionKey) || "null");
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        setPosition(saved.left, saved.top);
      }
    } catch (_) {
      // Use the default top-right position.
    }
    setMinimized(localStorage.getItem(minimizedKey) === "1");

    header.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".minimize")) return;
      const rect = panel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;
      header.setPointerCapture?.(event.pointerId);

      function onMove(moveEvent) {
        setPosition(
          startLeft + moveEvent.clientX - startX,
          startTop + moveEvent.clientY - startY
        );
      }

      function onUp() {
        const rectAfter = panel.getBoundingClientRect();
        setPosition(rectAfter.left, rectAfter.top, true);
        header.removeEventListener("pointermove", onMove);
        header.removeEventListener("pointerup", onUp);
        header.removeEventListener("pointercancel", onUp);
      }

      header.addEventListener("pointermove", onMove);
      header.addEventListener("pointerup", onUp);
      header.addEventListener("pointercancel", onUp);
    });

    minimize.addEventListener("click", () => setMinimized(true, true));
    launcher.addEventListener("click", () => setMinimized(false, true));
    window.addEventListener("resize", () => {
      const rect = panel.getBoundingClientRect();
      setPosition(rect.left, rect.top, true);
    });

    iframe.src = chrome.runtime.getURL("sidepanel.html");
    floatingPanelApi = {
      toggle() {
        setMinimized(!panel.classList.contains("hidden"), true);
      },
      isVisible() {
        return !panel.classList.contains("hidden");
      }
    };
  }
})();
