(function initTemuAdSpendMonitor() {
  if (globalThis.__temuAdSpendMonitorLoaded) return;
  globalThis.__temuAdSpendMonitorLoaded = true;

  const core = globalThis.TemuAdSpendCore;
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
  let running = false;
  let checkInFlight = false;

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
      "audits"
    ]);
    return {
      settings: { ...DEFAULT_SETTINGS, ...(stored.settings || {}) },
      rules: stored.rules || {},
      pauseLedger: stored.pauseLedger || {},
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
    const allRecords = [];
    let pageNumber = 1;
    let total = null;
    let hasMore = true;
    const pageSize = 20;

    while (hasMore && pageNumber <= 50) {
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
      allRecords.push(...records);
      total = core.toNumber(body?.total, total ?? records.length);
      hasMore = body?.has_more === true;
      pageNumber += 1;
      if (!records.length) break;
    }

    const unique = new Map();
    for (const record of allRecords) {
      const key = String(record.ad_id || `${record.goods_id}:${record.spu_id}`);
      unique.set(key, record);
    }
    const records = [...unique.values()];
    const expected = total === null ? records.length : total;
    return {
      records,
      total: expected,
      fetchMs: Math.round(performance.now() - startedAt),
      complete: records.length >= expected && !hasMore
    };
  }

  async function performCheck({ manual }) {
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
})();
