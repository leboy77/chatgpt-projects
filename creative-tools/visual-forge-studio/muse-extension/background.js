"use strict";

const DEFAULT_MODEL_CONFIG = {
  provider: "mock",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-image-1",
  apiKey: "",
};

async function getModelConfig() {
  const stored = await chrome.storage.local.get({
    modelConfig: DEFAULT_MODEL_CONFIG,
  });
  return { ...DEFAULT_MODEL_CONFIG, ...(stored.modelConfig || {}) };
}

async function fetchGeneratedImage(url) {
  const parsed = new URL(url);
  const allowed =
    parsed.protocol === "https:" &&
    (parsed.hostname === "muse.ai" ||
      parsed.hostname.endsWith(".muse.ai") ||
      parsed.hostname.endsWith(".fbcdn.net") ||
      parsed.hostname.endsWith(".facebook.com") ||
      parsed.hostname.endsWith(".cdninstagram.com"));
  if (!allowed) {
    throw new Error("生成图片域名不在 Muse/图片 CDN 白名单内");
  }
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`生成图片下载失败：HTTP ${response.status}`);
  }
  const data = await response.arrayBuffer();
  if (data.byteLength > 30 * 1024 * 1024) {
    throw new Error("单张 Muse 生成图片超过 30MB");
  }
  const bytes = new Uint8Array(data);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)),
    );
  }
  return {
    data: btoa(chunks.join("")),
    type: response.headers.get("content-type") || "image/png",
  };
}

async function handleMessage(message, sender = {}) {
  switch (message?.type) {
    case "VF_HEALTH": {
      const config = await getModelConfig();
      return {
        ok: true,
        mode: "extension",
        provider: config.provider,
        model: config.provider === "mock" ? null : config.model,
        demo_mode: config.provider === "mock",
      };
    }
    case "VF_GET_DEFAULTS":
      return { modelConfig: await getModelConfig() };
    case "VF_SAVE_MODEL_SETTINGS":
      await chrome.storage.local.set({
        modelConfig: { ...DEFAULT_MODEL_CONFIG, ...message.modelConfig },
      });
      return { modelConfig: await getModelConfig() };
    case "VF_OPEN_OPTIONS":
      await chrome.runtime.openOptionsPage();
      return {};
    case "VF_FETCH_IMAGE":
      return fetchGeneratedImage(message.url);
    case "VF_COMMAND_FROM_MUSE": {
      await chrome.storage.session.set({
        pendingCommand: message.command || "",
      });
      try {
        if (sender.tab?.id) {
          await chrome.sidePanel.open({ tabId: sender.tab.id });
        }
      } catch {
        // The panel can still be opened from the toolbar action.
      }
      void chrome.runtime.sendMessage({
        type: "VF_PANEL_COMMAND",
        command: message.command || "",
      }).catch(() => {});
      return { queued: true };
    }
    case "VF_TAKE_PENDING_COMMAND": {
      const stored = await chrome.storage.session.get({
        pendingCommand: "",
      });
      await chrome.storage.session.remove("pendingCommand");
      return { command: stored.pendingCommand };
    }
    case "VF_CLEAR_PENDING_COMMAND":
      await chrome.storage.session.remove("pendingCommand");
      return {};
    default:
      throw new Error(`旧本机 API 消息已移除：${message?.type || "unknown"}`);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }
  if (!message.type.startsWith("VF_")) {
    return false;
  }
  handleMessage(message, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ widgetVersion: chrome.runtime.getManifest().version });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "VF_TOGGLE_WIDGET" });
  } catch {
    if (/^https:\/\/muse\.ai\//.test(tab.url || "")) {
      await chrome.tabs.reload(tab.id);
    } else {
      await chrome.tabs.create({ url: "https://muse.ai/" });
    }
  }
});
