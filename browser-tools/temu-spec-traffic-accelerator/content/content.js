(function installTemuSpecAcceleratorContentScript() {
  const Dom = globalThis.TemuAcceleratorDom;
  if (!Dom) {
    console.error("[流量加速器] DOM 工具未加载");
    return;
  }

  const CHANNEL = "temu-spec-accelerator-v1";
  const HOST_ID = "temu-spec-accelerator-host";
  const FLUX_PATH = "/main/flux-analysis";
  let panelFrame = null;
  let panelVisible = false;
  let mounting = false;

  const REGION_LABELS = {
    EU: "欧区",
    US: "美国",
    GLOBAL: "全球",
  };

  function isFluxPage() {
    return location.pathname.includes(FLUX_PATH);
  }

  function createPanel() {
    document.getElementById(HOST_ID)?.remove();

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.position = "fixed";
    host.style.right = "18px";
    host.style.bottom = "86px";
    host.style.zIndex = "2147483647";
    host.style.fontFamily =
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
      }
      .accelerator-shell {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
        color: #1f2937;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .toggle {
        border: 0;
        border-radius: 999px;
        padding: 11px 16px;
        background: linear-gradient(135deg, #ff6a00, #ff8f1f);
        color: #fff;
        font-size: 14px;
        font-weight: 700;
        line-height: 1;
        box-shadow: 0 8px 24px rgba(255, 106, 0, 0.32);
        cursor: pointer;
      }
      .toggle:hover {
        filter: brightness(1.04);
      }
      .panel {
        width: min(470px, calc(100vw - 32px));
        height: min(710px, calc(100vh - 130px));
        border: 1px solid rgba(15, 23, 42, 0.12);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 22px 70px rgba(15, 23, 42, 0.24);
        background: #fff;
      }
      .panel[hidden] {
        display: none;
      }
      iframe {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: #f8fafc;
      }
    `;

    const shell = document.createElement("div");
    shell.className = "accelerator-shell";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "toggle";
    toggle.textContent = "批量加速器";

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.hidden = true;
    panelFrame = document.createElement("iframe");
    panelFrame.src = chrome.runtime.getURL("panel/panel.html");
    panelFrame.title = "批量指定规格流量加速器";
    panel.appendChild(panelFrame);

    toggle.addEventListener("click", () => {
      panelVisible = !panelVisible;
      panel.hidden = !panelVisible;
      toggle.textContent = panelVisible ? "收起加速器" : "批量加速器";
    });

    shell.append(toggle, panel);
    shadow.appendChild(style);
    shadow.appendChild(shell);
    document.documentElement.appendChild(host);
  }

  function ensureMounted() {
    if (mounting) return;
    if (!isFluxPage()) {
      document.getElementById(HOST_ID)?.remove();
      return;
    }
    if (document.getElementById(HOST_ID)) return;
    mounting = true;
    try {
      createPanel();
    } finally {
      mounting = false;
    }
  }

  function serializeError(error) {
    if (error instanceof Dom.PageError) {
      return {
        code: error.code,
        message: error.message,
        details: error.details || null,
      };
    }
    return {
      code: "UNEXPECTED_ERROR",
      message: error?.message || String(error),
      details: null,
    };
  }

  async function handleCommand(name, payload) {
    switch (name) {
      case "PING":
        Dom.ensureFluxPage();
        return {
          pageRegion: Dom.getPageRegion(),
          path: location.pathname,
        };
      case "SWITCH_REGION": {
        const regionLabel = REGION_LABELS[payload?.region];
        if (!regionLabel) {
          throw new Dom.PageError("INVALID_REGION", "无效的区域参数");
        }
        return {
          region: payload.region,
          label: await Dom.switchRegion(regionLabel),
        };
      }
      case "LOOKUP_SKC": {
        const skcId = String(payload?.skcId || "").trim();
        if (!/^\d{6,20}$/.test(skcId)) {
          throw new Dom.PageError("INVALID_SKC", "SKC ID 格式不正确");
        }
        return Dom.lookupSkc(skcId, {
          allowSameResult: Boolean(payload?.allowSameResult),
        });
      }
      case "PROCESS_SITE": {
        const targetPriceCents = Number(payload?.targetPriceCents);
        const genericPriceCents = Number(payload?.genericPriceCents);
        if (
          !payload?.siteName ||
          !payload?.targetColorGroup ||
          !Number.isFinite(targetPriceCents) ||
          !Number.isFinite(genericPriceCents)
        ) {
          throw new Dom.PageError("INVALID_TASK", "任务参数不完整");
        }
        return Dom.processSite({
          siteName: payload.siteName,
          targetColorGroup: payload.targetColorGroup,
          targetPriceCents,
          genericPriceCents,
        });
      }
      default:
        throw new Dom.PageError(
          "UNKNOWN_COMMAND",
          `未知命令：${String(name)}`,
        );
    }
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== panelFrame?.contentWindow) return;
    if (event.data?.channel !== CHANNEL) return;
    if (event.data?.type !== "command") return;

    const { requestId, name, payload } = event.data;
    if (!requestId || !name) return;

    try {
      const result = await handleCommand(name, payload);
      panelFrame.contentWindow.postMessage(
        {
          channel: CHANNEL,
          type: "response",
          requestId,
          ok: true,
          result,
        },
        "*",
      );
    } catch (error) {
      console.error("[流量加速器] 页面命令失败", name, error);
      panelFrame.contentWindow.postMessage(
        {
          channel: CHANNEL,
          type: "response",
          requestId,
          ok: false,
          error: serializeError(error),
        },
        "*",
      );
    }
  });

  ensureMounted();
  setInterval(ensureMounted, 1000);
})();
