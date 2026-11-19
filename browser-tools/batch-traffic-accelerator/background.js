const APP_KEY = "traffic_spec_app_state";
const EXECUTION_LEASE_KEY = "traffic_spec_execution_lease";
const SCHEMA_VERSION = 17;
const DEFAULT_STATE = {
  schemaVersion: SCHEMA_VERSION,
  config: {
    productSource: "goodsList",
    skuKeyword: "",
    specName: "",
    searchMode: "sku",
    categoryPath: "",
    idType: "SPU",
    region: "eu",
    duration: "30",
    taskIntervalSeconds: 15,
    accelerationMode: "custom",
    tierStrategy: "maxTraffic",
    fallbackReferencePrice: false,
    navigationGuard: true,
    dryRun: false
  },
  stations: [],
  pairs: [],
  cacheMeta: null,
  storeBinding: null,
  taskQueue: [],
  queueState: {
    status: "idle",
    currentTaskId: null,
    currentIndex: -1,
    logs: []
  },
  operationLock: null,
  importDiagnostics: null,
  lastScan: null,
  logs: []
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(APP_KEY);
  if (!stored[APP_KEY]) {
    await chrome.storage.local.set({ [APP_KEY]: DEFAULT_STATE });
  }
  await chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SCAN_PROGRESS") {
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "OPEN_PANEL") {
    openPanelForTab(sender?.tab)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_APP_STATE") {
    getAppState()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SAVE_APP_STATE") {
    saveAppState(message.state)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "ACQUIRE_EXECUTION_LEASE") {
    acquireExecutionLease(message.ownerId, message.ttlMs)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "RENEW_EXECUTION_LEASE") {
    renewExecutionLease(message.ownerId, message.ttlMs)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "RELEASE_EXECUTION_LEASE") {
    releaseExecutionLease(message.ownerId)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "FORCE_PAUSE_QUEUE") {
    forcePauseQueue()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function openPanelForTab(tab) {
  if (!tab?.id) throw new Error("没有可用的目标标签页");
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "sidepanel/panel.html",
    enabled: true
  });
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    if (!tab.windowId) throw error;
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
}

async function getAppState() {
  const stored = await chrome.storage.local.get(APP_KEY);
  const state = {
    ...DEFAULT_STATE,
    ...(stored[APP_KEY] || {}),
    config: {
      ...DEFAULT_STATE.config,
      ...(stored[APP_KEY]?.config || {})
    }
  };
  const storedSchemaVersion = stored[APP_KEY]?.schemaVersion || 0;
  if (storedSchemaVersion < 3) {
    state.config.dryRun = false;
    state.stations = (state.stations || []).map((station) => ({
      ...station,
      enabled: station.code === "DE"
    }));
    state.logs = [];
  }
  if (storedSchemaVersion < 4) {
    delete state.config.windowLabel;
  }
  if (storedSchemaVersion < 5) {
    state.stations = (state.stations || []).map((station) => ({
      ...station,
      enabled: Number.isFinite(station.targetPrice)
    }));
  }
  if (storedSchemaVersion < 9) {
    const placeholder = detectPlaceholderPriceBatch(state.stations || []);
    const preserveExplicitEnabled =
      Number(state.importDiagnostics?.explicitEnabled) > 0;
    state.stations = clearPlaceholderPrices(
      state.stations || [],
      preserveExplicitEnabled
    );
    state.taskQueue = (state.taskQueue || []).map((taskItem) => {
      const taskStations = clearPlaceholderPrices(
        taskItem.stations || [],
        preserveExplicitEnabled
      );
      return {
        ...taskItem,
        stations: taskStations,
        enabledStationCodes: taskStations
          .filter((station) => station.enabled)
          .map((station) => station.code),
        run: taskItem.run
          ? {
              ...taskItem.run,
              items: (taskItem.run.items || []).map((item) => ({
                ...item,
                targetPrice: [17, 18].includes(Number(item.targetPrice))
                  ? null
                  : item.targetPrice,
                otherPrice: [17, 18].includes(Number(item.otherPrice))
                  ? null
                  : item.otherPrice
              }))
            }
          : taskItem.run
      };
    });
    if (state.importDiagnostics) {
      state.importDiagnostics = {
        ...state.importDiagnostics,
        targetPricePresent: placeholder
          ? 0
          : state.importDiagnostics.targetPricePresent,
        parserPlaceholderCount: placeholder?.count || 0,
        parserPlaceholderPrice: placeholder?.price || null,
        finalEnabled: state.stations.filter((station) => station.enabled).length
      };
    }
  }
  if (storedSchemaVersion < 10) {
    state.taskQueue = (state.taskQueue || []).map((taskItem) => ({
      ...taskItem,
      run: taskItem.run
        ? {
            ...taskItem.run,
            items: (taskItem.run.items || []).map((item) => ({
              ...item,
              targetPrice: [17, 18].includes(Number(item.targetPrice))
                ? null
                : item.targetPrice,
              otherPrice: [17, 18].includes(Number(item.otherPrice))
                ? null
                : item.otherPrice
            }))
          }
        : taskItem.run
    }));
  }
  if (storedSchemaVersion < 11) {
    const parserPlaceholderPrice = Number(
      state.importDiagnostics?.parserPlaceholderPrice
    );
    if ([17, 18].includes(parserPlaceholderPrice)) {
      state.stations = (state.stations || []).map((station) => ({
        ...station,
        otherPrice:
          Number(station.otherPrice) === parserPlaceholderPrice
            ? null
            : station.otherPrice
      }));
      state.taskQueue = (state.taskQueue || []).map((taskItem) => ({
        ...taskItem,
        stations: (taskItem.stations || []).map((station) => ({
          ...station,
          otherPrice:
            Number(station.otherPrice) === parserPlaceholderPrice
              ? null
              : station.otherPrice
        })),
        run: taskItem.run
          ? {
              ...taskItem.run,
              items: (taskItem.run.items || []).map((item) => ({
                ...item,
                otherPrice:
                  Number(item.otherPrice) === parserPlaceholderPrice
                    ? null
                    : item.otherPrice
              }))
            }
          : taskItem.run
      }));
      state.importDiagnostics = {
        ...state.importDiagnostics,
        otherPricePresent: state.stations.filter(
          (station) =>
            station.otherPrice !== null &&
            station.otherPrice !== "" &&
            Number.isFinite(Number(station.otherPrice))
        ).length
      };
    }
  }
  if (storedSchemaVersion < 12) {
    state.config.fallbackReferencePrice = false;
    state.taskQueue = (state.taskQueue || []).map((taskItem) => ({
      ...taskItem,
      config: {
        ...(taskItem.config || {}),
        fallbackReferencePrice: false
      }
    }));
  }
  if (storedSchemaVersion < 13) {
    state.storeBinding = state.storeBinding || null;
  }
  if (storedSchemaVersion < 14) {
    const inferredSource =
      state.cacheMeta?.source === "import" ? "tableImport" : "goodsList";
    state.config.productSource =
      state.config.productSource || inferredSource;
    state.pairs = normalizeImportedPairs(
      state.pairs || [],
      state.config.idType
    );
    state.taskQueue = (state.taskQueue || []).map((taskItem) => {
      const taskSource =
        taskItem.config?.productSource ||
        (taskItem.cacheMeta?.source === "import"
          ? "tableImport"
          : inferredSource);
      const taskPairs = normalizeImportedPairs(
        taskItem.pairs || [],
        taskItem.config?.idType
      );
      return {
        ...taskItem,
        config: {
          ...(taskItem.config || {}),
          productSource: taskSource
        },
        pairs: taskPairs,
        run: taskItem.run
          ? {
              ...taskItem.run,
              groups: (taskItem.run.groups || []).map((group) => ({
                ...group,
                pair: normalizeImportedPairs(
                  group.pair ? [group.pair] : [],
                  taskItem.config?.idType
                )[0] || group.pair
              })),
              items: (taskItem.run.items || []).map((item) => {
                const pair = normalizeImportedPairs(
                  [
                    {
                      idType: item.idType,
                      spu: item.spu || "",
                      skc: item.skc || ""
                    }
                  ],
                  taskItem.config?.idType
                )[0];
                return { ...item, ...pair };
              })
            }
          : taskItem.run
      };
    });
  }
  if (storedSchemaVersion < 15) {
    if (state.cacheMeta?.source === "import") {
      state.config.productSource = "tableImport";
    }
    state.taskQueue = (state.taskQueue || []).map((taskItem) => {
      if (taskItem.cacheMeta?.source === "import") {
        taskItem.config = {
          ...(taskItem.config || {}),
          productSource: "tableImport"
        };
      }
      const repairedItems = (taskItem.run?.items || []).map((item) => {
        if (
          item.status === "exception" &&
          !item.submitted &&
          item.message === "缺少 SPU ID"
        ) {
          return {
            ...item,
            status: "pending",
            retryable: false,
            message: "ID 类型迁移完成，等待继续执行"
          };
        }
        return item;
      });
      const repairedGroups = (taskItem.run?.groups || []).map((group) => {
        const hasPending = repairedItems.some(
          (item) =>
            item.groupKey === group.key && item.status === "pending"
        );
        return hasPending
          ? { ...group, status: "pending" }
          : group;
      });
      return taskItem.run
        ? {
            ...taskItem,
            run: {
              ...taskItem.run,
              items: repairedItems,
              groups: repairedGroups,
              status: "paused",
              paused: true
            }
          }
        : taskItem;
    });
    if (state.taskQueue.length) {
      state.queueState = {
        ...(state.queueState || {}),
        status: "paused"
      };
    }
  }
  if (storedSchemaVersion < 16) {
    const queuedRuns = (state.taskQueue || [])
      .map((taskItem) => taskItem.run)
      .filter(Boolean);
    const repairedItemCount = queuedRuns.reduce(
      (total, run) =>
        total +
        (run.items || []).filter(
          (item) =>
            item.status === "pending" &&
            item.message === "ID 类型迁移完成，等待继续执行"
        ).length,
      0
    );
    const spuCount = (state.pairs || []).filter(
      (pair) => (pair.idType || "SPU") === "SPU"
    ).length;
    const skcCount = (state.pairs || []).length - spuCount;
    if (state.pairs?.length || state.taskQueue?.length) {
      const migrationMessage =
        `商品 ID 类型迁移完成：商品池 ${spuCount} 个 SPU / ${skcCount} 个 SKC` +
        (repairedItemCount
          ? `；${repairedItemCount} 个旧执行项已恢复为待处理`
          : "") +
        `；${state.taskQueue?.length || 0} 个任务保持暂停，请核对价格后手动继续。`;
      const migrationLog = {
        at: Date.now(),
        level: "success",
        message: migrationMessage
      };
      state.logs = [...(state.logs || []), migrationLog];
      state.queueState = {
        ...(state.queueState || {}),
        logs: [...(state.queueState?.logs || []), migrationLog]
      };
      state.taskQueue = (state.taskQueue || []).map((taskItem) =>
        taskItem.run
          ? {
              ...taskItem,
              run: {
                ...taskItem.run,
                logs: [...(taskItem.run.logs || []), migrationLog]
              }
            }
          : taskItem
      );
    }
  }
  if (storedSchemaVersion < 17) {
    let repairedCount = 0;
    state.taskQueue = (state.taskQueue || []).map((taskItem) => {
      if (!taskItem.run) return taskItem;
      const repairedItems = (taskItem.run.items || []).map((item) => {
        if (
          item.status === "exception" &&
          !item.submitted &&
          /没有找到商品 ID 类型选择框/.test(String(item.message || ""))
        ) {
          repairedCount += 1;
          return {
            ...item,
            status: "pending",
            retryable: false,
            stage: "查询商品",
            message: "选择器兼容修复完成，等待继续执行"
          };
        }
        return item;
      });
      const repairedGroups = (taskItem.run.groups || []).map((group) => {
        const hasPending = repairedItems.some(
          (item) =>
            item.groupKey === group.key && item.status === "pending"
        );
        return hasPending ? { ...group, status: "pending" } : group;
      });
      return {
        ...taskItem,
        status: "paused",
        run: {
          ...taskItem.run,
          items: repairedItems,
          groups: repairedGroups,
          status: "paused",
          paused: true
        }
      };
    });
    if (state.taskQueue.length) {
      state.queueState = {
        ...(state.queueState || {}),
        status: "paused"
      };
    }
    if (repairedCount) {
      const migrationLog = {
        at: Date.now(),
        level: "success",
        message:
          `流量分析商品 ID 类型选择器已兼容 SKU/SKC/SPU：` +
          `${repairedCount} 个未提交执行项已恢复为待处理，队列保持暂停。`
      };
      state.logs = [...(state.logs || []), migrationLog];
      state.queueState = {
        ...(state.queueState || {}),
        logs: [...(state.queueState?.logs || []), migrationLog]
      };
      state.taskQueue = state.taskQueue.map((taskItem) =>
        taskItem.run
          ? {
              ...taskItem,
              run: {
                ...taskItem.run,
                logs: [...(taskItem.run.logs || []), migrationLog]
              }
            }
          : taskItem
      );
    }
  }
  if (storedSchemaVersion < SCHEMA_VERSION) {
    state.schemaVersion = SCHEMA_VERSION;
    await chrome.storage.local.set({ [APP_KEY]: state });
  }
  return state;
}

function detectPlaceholderPriceBatch(stations) {
  const targetPrices = numericTargetPrices(stations);
  const batch =
    targetPrices.length >= 3 &&
    targetPrices.every((price) => price === targetPrices[0])
      ? { count: targetPrices.length, price: targetPrices[0] }
      : null;
  return batch && [17, 18].includes(batch.price) ? batch : null;
}

function clearPlaceholderPrices(stations, preserveExplicitEnabled = false) {
  const batch = detectPlaceholderPriceBatch(stations);
  return stations.map((station) => ({
    ...station,
    targetPrice: batch ? null : station.targetPrice,
    otherPrice:
      batch && Number(station.otherPrice) === batch.price
        ? null
        : station.otherPrice,
    tierPrice:
      station.tierPrice !== null &&
      station.tierPrice !== "" &&
      Number.isFinite(Number(station.tierPrice))
      ? Number(station.tierPrice)
      : null,
    enabled:
      batch && !preserveExplicitEnabled
        ? Boolean(
          station.tierPrice !== null &&
            station.tierPrice !== "" &&
            Number.isFinite(Number(station.tierPrice))
        )
      : station.enabled
  }));
}

function numericTargetPrices(stations) {
  return stations
    .map((station) => station.targetPrice)
    .filter(
      (price) =>
        price !== null &&
        price !== "" &&
        Number.isFinite(Number(price))
    )
    .map(Number);
}

function normalizeImportedPairs(pairs, fallbackIdType) {
  return pairs.map((pair) => {
    const idType =
      pair.idType || (fallbackIdType === "SKC" ? "SKC" : "SPU");
    let spu = pair.spu || "";
    let skc = pair.skc || "";
    if (!spu && skc && idType === "SPU") {
      spu = skc;
      skc = "";
    } else if (!skc && spu && idType === "SKC") {
      skc = spu;
      spu = "";
    }
    return { ...pair, idType, spu: spu || "", skc: skc || "" };
  });
}

async function saveAppState(nextState) {
  const previous = await getAppState();
  const state = {
    ...previous,
    ...nextState,
    schemaVersion: SCHEMA_VERSION,
    config: {
      ...previous.config,
      ...(nextState?.config || {})
    },
    updatedAt: Date.now()
  };
  await chrome.storage.local.set({ [APP_KEY]: state });
  return state;
}

async function acquireExecutionLease(ownerId, ttlMs = 60000) {
  if (!ownerId) throw new Error("缺少执行实例标识");
  const now = Date.now();
  const timeout = Math.max(15000, Number(ttlMs) || 60000);
  const stored = await chrome.storage.local.get(EXECUTION_LEASE_KEY);
  const current = stored[EXECUTION_LEASE_KEY];
  if (
    current?.ownerId &&
    current.ownerId !== ownerId &&
    Number(current.expiresAt) > now
  ) {
    return {
      acquired: false,
      lease: current
    };
  }
  const lease = {
    ownerId,
    acquiredAt: now,
    renewedAt: now,
    expiresAt: now + timeout
  };
  await chrome.storage.local.set({ [EXECUTION_LEASE_KEY]: lease });
  return { acquired: true, lease };
}

async function renewExecutionLease(ownerId, ttlMs = 60000) {
  const now = Date.now();
  const timeout = Math.max(15000, Number(ttlMs) || 60000);
  const stored = await chrome.storage.local.get(EXECUTION_LEASE_KEY);
  const current = stored[EXECUTION_LEASE_KEY];
  if (!current || current.ownerId !== ownerId) {
    return { renewed: false, lease: current || null };
  }
  const lease = {
    ...current,
    renewedAt: now,
    expiresAt: now + timeout
  };
  await chrome.storage.local.set({ [EXECUTION_LEASE_KEY]: lease });
  return { renewed: true, lease };
}

async function releaseExecutionLease(ownerId) {
  const stored = await chrome.storage.local.get(EXECUTION_LEASE_KEY);
  const current = stored[EXECUTION_LEASE_KEY];
  if (!ownerId || current?.ownerId === ownerId) {
    await chrome.storage.local.remove(EXECUTION_LEASE_KEY);
    return { released: true };
  }
  return { released: false, lease: current };
}

async function forcePauseQueue() {
  const stored = await chrome.storage.local.get(APP_KEY);
  const state = stored[APP_KEY];
  if (!state?.taskQueue?.length) {
    return { paused: false, reason: "queue-empty" };
  }
  const at = Date.now();
  state.queueState = {
    ...(state.queueState || {}),
    status: "paused",
    logs: [
      ...(state.queueState?.logs || []),
      {
        at,
        level: "warning",
        message: "队列已由另一个插件页面请求暂停"
      }
    ].slice(-500)
  };
  state.taskQueue = state.taskQueue.map((taskItem) => {
    if (!taskItem.run || !["running", "queued"].includes(taskItem.status)) {
      return taskItem.status === "running"
        ? { ...taskItem, status: "paused" }
        : taskItem;
    }
    return {
      ...taskItem,
      status: "paused",
      run: {
        ...taskItem.run,
        status: "paused",
        paused: true,
        logs: [
          ...(taskItem.run.logs || []),
          {
            at,
            level: "warning",
            message: "任务已由另一个插件页面请求暂停"
          }
        ].slice(-1000)
      }
    };
  });
  await chrome.storage.local.set({ [APP_KEY]: state });
  chrome.runtime
    .sendMessage({ type: "QUEUE_FORCE_PAUSED", at })
    .catch(() => {});
  return { paused: true, at };
}
