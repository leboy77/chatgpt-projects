"use strict";

const modelProvider = document.querySelector("#modelProvider");
const modelBaseUrl = document.querySelector("#modelBaseUrl");
const modelName = document.querySelector("#modelName");
const apiKey = document.querySelector("#apiKey");
const status = document.querySelector("#status");
const save = document.querySelector("#save");
const test = document.querySelector("#test");

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("is-error", isError);
  status.classList.add("is-visible");
}

async function load() {
  try {
    const config = await VisualForgeModel.loadConfig();
    modelProvider.value = config.provider;
    modelBaseUrl.value = config.baseUrl;
    modelName.value = config.model;
    apiKey.value = config.apiKey;
  } catch (error) {
    showStatus(error.message, true);
  }
}

save.addEventListener("click", async () => {
  save.disabled = true;
  try {
    const value = {
      provider: modelProvider.value,
      baseUrl: modelBaseUrl.value,
      model: modelName.value,
      apiKey: apiKey.value,
    };
    if (value.provider === "openai") {
      const granted = await VisualForgeModel.ensureHostPermission(value.baseUrl);
      if (!granted) throw new Error("未获得图片模型域名访问权限");
    }
    const result = await VisualForgeModel.saveConfig(value);
    modelBaseUrl.value = result.baseUrl;
    showStatus("图片模型配置已保存");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    save.disabled = false;
  }
});

test.addEventListener("click", async () => {
  test.disabled = true;
  try {
    const config = await VisualForgeModel.loadConfig();
    if (config.provider === "mock") {
      showStatus("当前为扩展内置演示模型，不需要远程授权");
    } else {
      const origin = `${new URL(config.baseUrl).origin}/*`;
      const granted = await chrome.permissions.contains({ origins: [origin] });
      showStatus(
        granted
          ? `配置完整：${config.model} · 已授权 ${origin}`
          : `缺少域名权限：${origin}`,
        !granted,
      );
    }
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    test.disabled = false;
  }
});

void load();

