(function initSidePanel() {
  const core = globalThis.TemuAdSpendCore;
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  window.scrollTo(0, 0);
  const DEFAULT_SETTINGS = {
    intervalSec: 60,
    defaultSpendLimitCny: 0,
    defaultCostPerOrderLimitCny: 0,
    mode: "observe",
    pauseAuthorized: false
  };
  const elements = {
    connectionBadge: document.querySelector("#connectionBadge"),
    runState: document.querySelector("#runState"),
    intervalSec: document.querySelector("#intervalSec"),
    defaultSpendLimit: document.querySelector("#defaultSpendLimit"),
    defaultCostLimit: document.querySelector("#defaultCostLimit"),
    mode: document.querySelector("#mode"),
    pauseAuthorized: document.querySelector("#pauseAuthorized"),
    saveSettings: document.querySelector("#saveSettings"),
    startMonitor: document.querySelector("#startMonitor"),
    refreshNow: document.querySelector("#refreshNow"),
    relockPage: document.querySelector("#relockPage"),
    stopMonitor: document.querySelector("#stopMonitor"),
    settingsMessage: document.querySelector("#settingsMessage"),
    metricRecords: document.querySelector("#metricRecords"),
    metricSpend: document.querySelector("#metricSpend"),
    metricHits: document.querySelector("#metricHits"),
    metricLatency: document.querySelector("#metricLatency"),
    lastCheck: document.querySelector("#lastCheck"),
    runtimeError: document.querySelector("#runtimeError"),
    toggleSpuSection: document.querySelector("#toggleSpuSection"),
    spuSectionBody: document.querySelector("#spuSectionBody"),
    spuSearch: document.querySelector("#spuSearch"),
    spuCount: document.querySelector("#spuCount"),
    spuList: document.querySelector("#spuList"),
    pauseRecordSummary: document.querySelector("#pauseRecordSummary"),
    pauseRecordList: document.querySelector("#pauseRecordList"),
    auditList: document.querySelector("#auditList"),
    spuCardTemplate: document.querySelector("#spuCardTemplate"),
    pauseRecordTemplate: document.querySelector("#pauseRecordTemplate")
  };

  let state = {
    settings: { ...DEFAULT_SETTINGS },
    rules: {},
    runtime: {},
    pauseRecords: [],
    spuSectionExpanded: false,
    spuQuery: "",
    audits: []
  };

  loadState();
  initializePageLock();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    loadState();
    if (changes.lockedAdTab) checkPageConnection();
  });

  elements.saveSettings.addEventListener("click", saveSettings);
  elements.startMonitor.addEventListener("click", () =>
    sendToAdTab({ type: "startMonitor" })
  );
  elements.stopMonitor.addEventListener("click", () =>
    sendToAdTab({ type: "stopMonitor" })
  );
  elements.refreshNow.addEventListener("click", () =>
    sendToAdTab({ type: "refreshNow" })
  );
  elements.relockPage.addEventListener("click", initializePageLock);
  elements.toggleSpuSection.addEventListener("click", toggleSpuSection);
  elements.spuSearch.addEventListener("input", () => {
    state.spuQuery = elements.spuSearch.value.trim().toLowerCase();
    renderSpus(Array.isArray(state.runtime.spus) ? state.runtime.spus : []);
  });
  elements.spuList.addEventListener("click", handleSpuAction);
  elements.pauseRecordList.addEventListener("click", handlePauseRecordAction);

  async function loadState() {
    const stored = await chrome.storage.local.get([
      "settings",
      "rules",
      "runtime",
      "pauseRecords",
      "spuSectionExpanded",
      "audits"
    ]);
    state = {
      settings: { ...DEFAULT_SETTINGS, ...(stored.settings || {}) },
      rules: stored.rules || {},
      runtime: stored.runtime || {},
      pauseRecords: Array.isArray(stored.pauseRecords)
        ? stored.pauseRecords
        : [],
      spuSectionExpanded: Boolean(stored.spuSectionExpanded),
      spuQuery: state.spuQuery || "",
      audits: Array.isArray(stored.audits) ? stored.audits : []
    };
    render();
  }

  async function saveSettings() {
    const settings = {
      intervalSec: clampNumber(elements.intervalSec.value, 60, 30, 3600),
      defaultSpendLimitCny: clampNumber(
        elements.defaultSpendLimit.value,
        0,
        0,
        1_000_000
      ),
      defaultCostPerOrderLimitCny: clampNumber(
        elements.defaultCostLimit.value,
        0,
        0,
        1_000_000
      ),
      mode: elements.mode.value === "armed" ? "armed" : "observe",
      pauseAuthorized: elements.pauseAuthorized.checked
    };
    if (settings.mode === "armed" && !settings.pauseAuthorized) {
      showMessage("自动暂停模式必须勾选授权确认。", true);
      return;
    }
    await chrome.storage.local.set({ settings });
    showMessage("设置已保存，新的刷新间隔从下一次调度起生效。");
    await sendToAdTab({ type: "settingsChanged" }, false);
  }

  async function toggleSpuSection() {
    state.spuSectionExpanded = !state.spuSectionExpanded;
    applySpuSectionState();
    renderSpus(Array.isArray(state.runtime.spus) ? state.runtime.spus : []);
    await chrome.storage.local.set({
      spuSectionExpanded: state.spuSectionExpanded
    });
  }

  function applySpuSectionState() {
    const expanded = Boolean(state.spuSectionExpanded);
    elements.spuSectionBody.classList.toggle("hidden", !expanded);
    elements.toggleSpuSection.textContent = expanded ? "收起" : "展开";
    elements.toggleSpuSection.setAttribute(
      "aria-expanded",
      expanded ? "true" : "false"
    );
  }

  function clampNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  async function checkPageConnection() {
    const tab = await findAdTab();
    if (!tab?.id) {
      setBadge(elements.connectionBadge, "推广页锁定已丢失", "error");
      return;
    }
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "contentPing"
      });
      if (response?.ok) {
        setBadge(elements.connectionBadge, "已锁定推广页", "good");
      } else {
        setBadge(elements.connectionBadge, "页面扩展未加载", "error");
      }
    } catch (_) {
      setBadge(elements.connectionBadge, "页面扩展未加载", "error");
    }
  }

  async function findAdTab() {
    const stored = await chrome.storage.local.get("lockedAdTab");
    const locked = stored.lockedAdTab;
    if (locked?.tabId) {
      try {
        const tab = await chrome.tabs.get(locked.tabId);
        if (core.isAdListUrl(tab.url)) return tab;
      } catch (_) {
        // The locked tab has been closed.
      }
    }
    await chrome.storage.local.remove("lockedAdTab");
    return null;
  }

  async function initializePageLock() {
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    const current = tabs.find((tab) => core.isAdListUrl(tab.url));
    if (current?.id) {
      await chrome.storage.local.set({
        lockedAdTab: {
          tabId: current.id,
          url: current.url,
          title: current.title || "",
          lockedAt: new Date().toISOString()
        }
      });
      showMessage("已锁定当前 Temu 商品推广页面。");
    } else {
      await chrome.storage.local.remove("lockedAdTab");
      setBadge(elements.connectionBadge, "当前不是商品推广页", "error");
      return;
    }
    await checkPageConnection();
  }

  async function sendToAdTab(message, showOnError = true) {
    const tab = await findAdTab();
    if (!tab?.id) {
      if (showOnError) {
        showMessage("请先打开 Temu 商品推广页面。", true);
      }
      return null;
    }
    try {
      const response = await chrome.tabs.sendMessage(tab.id, message);
      if (!response?.ok) {
        throw new Error(response?.error || "页面操作失败");
      }
      if (!["settingsChanged", "restoreSpu"].includes(message.type)) {
        showMessage("操作已提交。");
      }
      return response.data;
    } catch (error) {
      if (showOnError) {
        showMessage(
          `页面无法执行：${String(error?.message || error)}。请刷新商品推广页后重试。`,
          true
        );
      }
      return null;
    }
  }

  function render() {
    const { settings, runtime, pauseRecords, audits } = state;
    elements.intervalSec.value = settings.intervalSec;
    elements.defaultSpendLimit.value = settings.defaultSpendLimitCny;
    elements.defaultCostLimit.value = settings.defaultCostPerOrderLimitCny;
    elements.mode.value = settings.mode;
    elements.pauseAuthorized.checked = Boolean(settings.pauseAuthorized);
    elements.spuSearch.value = state.spuQuery;

    setBadge(
      elements.runState,
      runtime.running ? "运行中" : "未运行",
      runtime.running
        ? settings.mode === "armed"
          ? "warn"
          : "good"
        : "neutral"
    );

    const spus = Array.isArray(runtime.spus) ? runtime.spus : [];
    const totalSpend = spus.reduce(
      (sum, summary) => sum + core.toNumber(summary.spendCny, 0),
      0
    );
    const hits = spus.filter((summary) => summary.rule?.hit).length;
    elements.metricRecords.textContent = runtime.totalAds ?? "—";
    elements.metricSpend.textContent = core.formatCny(totalSpend);
    elements.metricHits.textContent = `${hits}`;
    elements.metricLatency.textContent = Number.isFinite(runtime.lastFetchMs)
      ? `${runtime.lastFetchMs} ms`
      : "—";
    elements.lastCheck.textContent = runtime.lastCheckAt
      ? formatDateTime(runtime.lastCheckAt)
      : "尚未读取";

    if (runtime.lastError) {
      elements.runtimeError.classList.remove("hidden");
      elements.runtimeError.textContent = `${
        runtime.lastError.code || "MONITOR_ERROR"
      }：${runtime.lastError.message || "未知错误"}`;
    } else {
      elements.runtimeError.classList.add("hidden");
      elements.runtimeError.textContent = "";
    }

    applySpuSectionState();
    renderSpus(spus);
    renderPauseRecords(pauseRecords);
    renderAudits(audits);
  }

  function renderSpus(spus) {
    if (!state.spuSectionExpanded) {
      elements.spuCount.textContent = `${spus.length} 个 SPU`;
      elements.spuList.replaceChildren();
      return;
    }
    if (!spus.length) {
      elements.spuCount.textContent = "0 个 SPU";
      elements.spuList.innerHTML =
        '<p class="empty">打开 Temu 商品推广页后点击“立即读取”。</p>';
      return;
    }
    const query = state.spuQuery;
    const matching = query
      ? spus.filter(
          (summary) =>
            String(summary.spuId).includes(query) ||
            String(summary.title || "")
              .toLowerCase()
              .includes(query)
        )
      : spus;
    const visible = matching.slice(0, 100);
    elements.spuCount.textContent = query
      ? `匹配 ${matching.length} / 显示 ${visible.length}`
      : `显示 ${visible.length} / 共 ${matching.length}`;
    if (!visible.length) {
      elements.spuList.innerHTML = '<p class="empty">没有匹配的 SPU。</p>';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const summary of visible) {
      const card = elements.spuCardTemplate.content.firstElementChild.cloneNode(
        true
      );
      card.dataset.spuId = summary.spuId;
      if (summary.rule?.hit) card.classList.add("hit");
      card.querySelector(".spu-title").textContent =
        summary.title || "未命名商品";
      card.querySelector(".spu-id").textContent =
        `SPU ${summary.spuId} · ${summary.ads.length} 条推广`;
      const statusLabel = core.statusLabel(summary.status);
      const statusElement = card.querySelector(".status-pill");
      statusElement.textContent = statusLabel;
      statusElement.classList.add(
        summary.status === core.STATUS.PROMOTION
          ? "active"
          : summary.status === core.STATUS.MANUAL_PAUSE
            ? "paused"
            : "abnormal"
      );
      card.querySelector(".spend").textContent = core.formatCny(
        summary.spendCny
      );
      card.querySelector(".orders").textContent = String(summary.orderCount);
      card.querySelector(".cpa").textContent = core.formatCny(
        summary.costPerOrderCny
      );

      const hitMessage = card.querySelector(".hit-message");
      if (summary.rule?.hit) {
        hitMessage.classList.remove("hidden");
        hitMessage.textContent = `规则命中：${describeReasons(
          summary.rule.reasons
        )}。当前模式：${state.settings.mode === "armed" ? "自动暂停" : "仅告警"}。`;
      }

      const rule = state.rules[summary.spuId];
      card.querySelector(".rule-spend").value = rule
        ? rule.spendLimitCny
        : state.settings.defaultSpendLimitCny;
      card.querySelector(".rule-cost").value = rule
        ? rule.costPerOrderLimitCny
        : state.settings.defaultCostPerOrderLimitCny;
      fragment.appendChild(card);
    }
    elements.spuList.replaceChildren(fragment);
  }

  function renderAudits(audits) {
    if (!audits.length) {
      elements.auditList.innerHTML = '<p class="empty">暂无触发记录。</p>';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const audit of audits.slice(0, 30)) {
      const item = document.createElement("article");
      item.className = "audit-item";
      const detail = [
        `花费 ${core.formatCny(audit.spendCny)}`,
        `订单 ${audit.orderCount ?? 0}`,
        `每单 ${core.formatCny(audit.costPerOrderCny)}`
      ].join(" · ");
      item.innerHTML = `
        <strong>SPU ${escapeHtml(audit.spuId || "")}：${escapeHtml(
          auditResultLabel(audit.result)
        )}</strong>
        <div>${escapeHtml(detail)}</div>
        <div class="audit-time">${escapeHtml(
          formatDateTime(audit.at)
        )} · ${escapeHtml(describeReasons(audit.reasons || []))}</div>
      `;
      fragment.appendChild(item);
    }
    elements.auditList.replaceChildren(fragment);
  }

  function renderPauseRecords(records) {
    const sorted = [...records].sort(
      (left, right) =>
        new Date(right.pausedAt || 0).getTime() -
        new Date(left.pausedAt || 0).getTime()
    );
    const activeCount = sorted.filter(
      (record) => record.restoreStatus !== "restored"
    ).length;
    elements.pauseRecordSummary.textContent = activeCount
      ? `${activeCount} 条待恢复 / 共 ${sorted.length} 条`
      : `共 ${sorted.length} 条`;
    if (!sorted.length) {
      elements.pauseRecordList.innerHTML =
        '<p class="empty">扩展自动暂停推广后，会在这里记录 SPU ID。</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const record of sorted) {
      const card = elements.pauseRecordTemplate.content.firstElementChild.cloneNode(
        true
      );
      card.dataset.recordId = record.recordId || "";
      card.dataset.spuId = record.spuId || "";
      card.querySelector(".record-spu").textContent =
        `SPU ${record.spuId || "未知"}`;
      card.querySelector(".record-title").textContent =
        record.title || "未命名商品";
      const restoreStatus = record.restoreStatus || "available";
      const status = recordStatus(restoreStatus);
      const statusElement = card.querySelector(".record-status");
      statusElement.textContent = status.label;
      statusElement.className = `record-status ${status.kind}`;
      card.querySelector(".record-time").textContent =
        `暂停：${formatDateTime(record.pausedAt)}`;
      card.querySelector(".record-cost").textContent =
        `花费 ${core.formatCny(record.spendCny)} · 每单 ${core.formatCny(
          record.costPerOrderCny
        )}`;
      card.querySelector(".record-goods").textContent =
        `商品 ID：${(record.goodsIds || []).join("、") || "待读取"}`;
      card.querySelector(".record-reason").textContent =
        `触发规则：${describeReasons(record.reasons || []) || "历史记录"}`;

      const errorElement = card.querySelector(".record-error");
      if (record.lastError) {
        errorElement.classList.remove("hidden");
        errorElement.textContent = record.lastError;
      }

      const button = card.querySelector(".restore-record");
      const restoreRequestedRecently =
        restoreStatus === "restore_requested" &&
        Date.now() - new Date(record.restoreRequestedAt || 0).getTime() <
          30000;
      if (restoreStatus === "restored") {
        button.textContent = "已恢复投流";
        button.disabled = true;
      } else if (restoreRequestedRecently) {
        button.textContent = "恢复核验中";
        button.disabled = true;
      } else {
        button.textContent =
          restoreStatus === "restore_verify_failed"
            ? "重新核验并恢复"
            : restoreStatus === "restore_requested"
              ? "重新提交恢复"
            : "恢复被暂停的投流";
      }
      fragment.appendChild(card);
    }
    elements.pauseRecordList.replaceChildren(fragment);
  }

  async function handleSpuAction(event) {
    const card = event.target.closest(".spu-card");
    if (!card || !event.target.matches("button")) return;
    const spuId = card.dataset.spuId;
    const rules = { ...state.rules };
    if (event.target.matches(".reset-rule")) {
      delete rules[spuId];
      await chrome.storage.local.set({ rules });
      showMessage(`SPU ${spuId} 已恢复默认规则。`);
      return;
    }
    if (event.target.matches(".save-rule")) {
      const spendLimitCny = clampNumber(
        card.querySelector(".rule-spend").value,
        0,
        0,
        1_000_000
      );
      const costPerOrderLimitCny = clampNumber(
        card.querySelector(".rule-cost").value,
        0,
        0,
        1_000_000
      );
      rules[spuId] = {
        spendLimitCny,
        costPerOrderLimitCny,
        enabled: spendLimitCny > 0 || costPerOrderLimitCny > 0
      };
      await chrome.storage.local.set({ rules });
      await sendToAdTab({ type: "settingsChanged" }, false);
      showMessage(
        rules[spuId].enabled
          ? `SPU ${spuId} 专属规则已保存。`
          : `SPU ${spuId} 的两个上限均为 0，专属规则未启用。`
      );
    }
  }

  async function handlePauseRecordAction(event) {
    const button = event.target.closest(".restore-record");
    const card = event.target.closest(".pause-record");
    if (!button || !card || button.disabled) return;
    const spuId = card.dataset.spuId;
    const recordId = card.dataset.recordId;
    const confirmed = window.confirm(
      `确认恢复 SPU ${spuId} 的投流？\n\n恢复后推广可能继续产生花费。此操作只执行一次，请在恢复后确认推广状态。`
    );
    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "正在恢复...";
    const result = await sendToAdTab({
      type: "restoreSpu",
      spuId,
      recordId
    });
    if (result?.spuId) {
      showMessage(`SPU ${result.spuId} 已恢复并核验为推广中。`);
    }
  }

  function describeReasons(reasons) {
    return (reasons || [])
      .map((reason) =>
        reason === "spend" ? "今日花费达到上限" : "每单花费达到上限"
      )
      .join("、");
  }

  function auditResultLabel(result) {
    const labels = {
      TRIGGERED_OBSERVE_ONLY: "命中，仅告警",
      SKIPPED_NO_ACTIVE_TARGET: "命中，无在投推广",
      SKIPPED_ALREADY_ATTEMPTED: "今日已尝试，跳过",
      PAUSE_REQUEST_PENDING: "暂停请求中",
      PAUSE_ACCEPTED: "暂停请求已接受",
      PAUSED_VERIFIED: "暂停并核验成功",
      PAUSE_VERIFY_FAILED: "暂停后核验失败",
      PAUSE_RESULT_UNKNOWN: "暂停结果未知",
      PAUSE_FAILED: "暂停请求失败",
      PAUSE_REJECTED: "平台拒绝暂停",
      PAUSE_PARTIALLY_REJECTED: "部分推广暂停失败",
      RESTORE_REQUEST_PENDING: "恢复请求中",
      RESTORE_ACCEPTED: "恢复请求已接受",
      RESTORED_VERIFIED: "已恢复并核验",
      RESTORE_VERIFY_FAILED: "恢复后核验失败",
      RESTORE_RESULT_UNKNOWN: "恢复结果未知",
      RESTORE_FAILED: "恢复请求失败",
      RESTORE_REJECTED: "平台拒绝恢复",
      RESTORE_PARTIALLY_REJECTED: "部分推广恢复失败"
    };
    return labels[result] || result || "未知";
  }

  function recordStatus(status) {
    const labels = {
      available: { label: "已暂停", kind: "paused" },
      restore_requested: { label: "恢复中", kind: "pending" },
      restored: { label: "已恢复", kind: "restored" },
      restore_verify_failed: { label: "恢复待核验", kind: "warning" },
      restore_failed: { label: "恢复失败", kind: "error" }
    };
    return labels[status] || { label: status || "未知", kind: "warning" };
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("zh-CN", { hour12: false });
  }

  function showMessage(message, isError = false) {
    elements.settingsMessage.textContent = message;
    elements.settingsMessage.classList.toggle("error", isError);
  }

  function setBadge(element, text, kind) {
    element.textContent = text;
    element.className = `badge badge-${kind}`;
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
