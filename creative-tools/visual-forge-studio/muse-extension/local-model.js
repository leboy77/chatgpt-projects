(function attachLocalModel(root) {
  "use strict";

  const DEFAULT_CONFIG = {
    provider: "mock",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-image-1",
    apiKey: "",
  };

  function normalizeBaseUrl(value) {
    let url;
    try {
      url = new URL(String(value || DEFAULT_CONFIG.baseUrl).trim());
    } catch {
      throw new Error("图片模型 API 地址无效");
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("图片模型 API 只支持 HTTP 或 HTTPS");
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("图片模型 API 地址不能包含账号、查询参数或锚点");
    }
    return url.href.replace(/\/+$/, "");
  }

  async function loadConfig() {
    const stored = await chrome.storage.local.get({ modelConfig: DEFAULT_CONFIG });
    return {
      ...DEFAULT_CONFIG,
      ...(stored.modelConfig || {}),
    };
  }

  async function saveConfig(value) {
    const config = {
      provider: ["mock", "openai"].includes(value.provider)
        ? value.provider
        : "mock",
      baseUrl: normalizeBaseUrl(value.baseUrl),
      model: String(value.model || "gpt-image-1").trim() || "gpt-image-1",
      apiKey: String(value.apiKey || "").trim(),
    };
    if (config.provider === "openai" && !config.apiKey) {
      throw new Error("使用远程图片模型时必须填写 API Key");
    }
    await chrome.storage.local.set({ modelConfig: config });
    return config;
  }

  function originPattern(baseUrl) {
    const url = new URL(normalizeBaseUrl(baseUrl));
    return `${url.origin}/*`;
  }

  async function ensureHostPermission(baseUrl) {
    const origins = [originPattern(baseUrl)];
    const contains = await chrome.permissions.contains({ origins });
    if (contains) return true;
    return chrome.permissions.request({ origins });
  }

  function base64ToBlob(base64, type = "image/png") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type });
  }

  async function createProvider(config = null) {
    const settings = config || (await loadConfig());
    if (settings.provider === "mock") {
      return {
        name: "mock",
        model: null,
        async generate(prompt, size) {
          return root.VisualForgeCore.mockImage(prompt, size);
        },
      };
    }
    if (settings.provider !== "openai") {
      throw new Error(`不支持的图片模型类型：${settings.provider}`);
    }
    return {
      name: "openai",
      model: settings.model,
      async generate(prompt, size, quality) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 180000);
        let payload;
        try {
          const response = await fetch(`${settings.baseUrl}/images/generations`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${settings.apiKey}`,
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify({
              model: settings.model,
              prompt,
              n: 1,
              size,
              quality,
            }),
            signal: controller.signal,
          });
          const text = await response.text();
          try {
            payload = JSON.parse(text);
          } catch {
            throw new Error(`图片接口返回非 JSON：${text.slice(0, 300)}`);
          }
          if (!response.ok) {
            throw new Error(
              `图片接口返回 HTTP ${response.status}：` +
                JSON.stringify(payload).slice(0, 500),
            );
          }
        } catch (error) {
          if (error.name === "AbortError") {
            throw new Error("图片接口请求超时");
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }
        const item = payload?.data?.[0];
        if (!item) throw new Error("图片接口响应中没有 data[0]");
        if (item.b64_json) {
          return base64ToBlob(item.b64_json, "image/png");
        }
        if (item.url) {
          const response = await fetch(item.url);
          if (!response.ok) {
            throw new Error(`生成图片下载失败：HTTP ${response.status}`);
          }
          return response.blob();
        }
        throw new Error("图片接口响应中没有 b64_json 或 url");
      },
    };
  }

  root.VisualForgeModel = {
    DEFAULT_CONFIG,
    createProvider,
    ensureHostPermission,
    loadConfig,
    normalizeBaseUrl,
    saveConfig,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

