(function visualForgeMuseBridge() {
  "use strict";

  if (window.__VF_MUSE_BRIDGE_LOADED__) return;
  window.__VF_MUSE_BRIDGE_LOADED__ = true;

  const parser = window.MuseBridgeCommands;
  const promptTemplates = window.VisualForgePromptTemplates;
  const museResponse = window.VisualForgeMuseResponse;
  if (!parser || !museResponse) {
    console.error("Visual Forge command parser failed to load");
    return;
  }

  let toastTimer = 0;
  let widgetFrame = null;
  let widgetShell = null;
  let widgetLauncher = null;
  let widgetReady = false;
  let pendingWidgetCommand = "";
  let autoContinuePreference = false;
  let autoContinueTimeoutEnabled = false;
  let autoRegenerateTextOnly = false;
  let autoContinueWatcher = null;
  let generatedImageObserver = null;
  const trackedGeneratedImages = [];
  const trackedGeneratedVideos = [];
  const trackedGeneratedVideoLinks = [];
  const TRACKED_GENERATED_IMAGE_LIMIT = 500;
  const TRACKED_GENERATED_VIDEO_LIMIT = 100;
  const widgetPositionKey = "visualForgeWidgetPosition";
  const widgetSizeKey = "visualForgeWidgetSize";
  const WIDGET_MIN_WIDTH = 340;
  const WIDGET_MIN_HEIGHT = 420;
  const WIDGET_EDGE_GAP = 8;

  function installWidget() {
    if (document.querySelector("#vf-widget-root")) return;
    const style = document.createElement("style");
    style.textContent = `
      #vf-widget-root { position: static; }
      #vf-widget-shell {
        position: fixed;
        right: 18px;
        bottom: 18px;
        width: min(420px, calc(100vw - 24px));
        height: min(760px, calc(100vh - 24px));
        overflow: hidden;
        z-index: 2147483645;
        border: 1px solid #e4e7ec;
        border-radius: 18px;
        background: #fff;
        box-shadow: 0 24px 70px rgba(16, 24, 40, .2);
      }
      #vf-widget-shell[hidden] { display: none !important; }
      #vf-widget-shell[data-resizing="true"] iframe { pointer-events: none; }
      #vf-widget-shell::after {
        content: "";
        position: absolute;
        right: 4px;
        bottom: 4px;
        width: 12px;
        height: 12px;
        z-index: 6;
        pointer-events: none;
        border-right: 2px solid rgba(8, 102, 255, .42);
        border-bottom: 2px solid rgba(8, 102, 255, .42);
        border-radius: 0 0 4px 0;
      }
      #vf-widget-drag-handle {
        position: absolute;
        top: 0;
        left: 0;
        width: calc(100% - 118px);
        height: 64px;
        z-index: 1;
        pointer-events: none;
      }
      .vf-widget-resize {
        position: absolute;
        z-index: 5;
        touch-action: none;
      }
      .vf-widget-resize[data-direction="n"],
      .vf-widget-resize[data-direction="s"] {
        left: 14px;
        right: 14px;
        height: 8px;
        cursor: ns-resize;
      }
      .vf-widget-resize[data-direction="n"] { top: -3px; }
      .vf-widget-resize[data-direction="s"] { bottom: -3px; }
      .vf-widget-resize[data-direction="e"],
      .vf-widget-resize[data-direction="w"] {
        top: 14px;
        bottom: 14px;
        width: 8px;
        cursor: ew-resize;
      }
      .vf-widget-resize[data-direction="e"] { right: -3px; }
      .vf-widget-resize[data-direction="w"] { left: -3px; }
      .vf-widget-resize[data-direction="ne"],
      .vf-widget-resize[data-direction="nw"],
      .vf-widget-resize[data-direction="se"],
      .vf-widget-resize[data-direction="sw"] {
        width: 18px;
        height: 18px;
      }
      .vf-widget-resize[data-direction="ne"] { top: -4px; right: -4px; cursor: nesw-resize; }
      .vf-widget-resize[data-direction="nw"] { top: -4px; left: -4px; cursor: nwse-resize; }
      .vf-widget-resize[data-direction="se"] { bottom: -4px; right: -4px; cursor: nwse-resize; }
      .vf-widget-resize[data-direction="sw"] { bottom: -4px; left: -4px; cursor: nesw-resize; }
      #vf-widget-frame { width: 100%; height: 100%; display: block; border: 0; background: #fff; }
      #vf-widget-launcher {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483646;
        width: 52px;
        height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 16px;
        color: #fff;
        background: #0866ff;
        box-shadow: 0 12px 30px rgba(8,102,255,.3);
        cursor: pointer;
        font: 700 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: .06em;
      }
      #vf-widget-launcher:hover { background: #0059e6; }
      @media (max-width: 500px) {
        #vf-widget-shell {
          inset: 8px;
          width: auto;
          height: auto;
          border-radius: 16px;
        }
      }
    `;
    document.documentElement.append(style);

    const root = document.createElement("div");
    root.id = "vf-widget-root";
    root.innerHTML = `
      <div id="vf-widget-shell" hidden>
        <div id="vf-widget-drag-handle" title="拖动 Visual Forge"></div>
        <div class="vf-widget-resize" data-direction="n" aria-hidden="true"></div>
        <div class="vf-widget-resize" data-direction="e" aria-hidden="true"></div>
        <div class="vf-widget-resize" data-direction="s" aria-hidden="true"></div>
        <div class="vf-widget-resize" data-direction="w" aria-hidden="true"></div>
        <div class="vf-widget-resize" data-direction="ne" aria-hidden="true"></div>
        <div class="vf-widget-resize" data-direction="nw" aria-hidden="true"></div>
        <div class="vf-widget-resize" data-direction="se" aria-hidden="true"></div>
        <div class="vf-widget-resize" data-direction="sw" aria-hidden="true"></div>
        <iframe
          id="vf-widget-frame"
          title="Visual Forge 商品视觉工具"
          src="${chrome.runtime.getURL("sidepanel.html?embedded=1")}"
        ></iframe>
      </div>
      <button id="vf-widget-launcher" type="button" title="打开 Visual Forge">VF</button>
    `;
    document.documentElement.append(root);
    widgetShell = root.querySelector("#vf-widget-shell");
    widgetLauncher = root.querySelector("#vf-widget-launcher");
    widgetFrame = root.querySelector("#vf-widget-frame");
    const dragHandle = root.querySelector("#vf-widget-drag-handle");

    const savedSize = readWidgetSize();
    if (savedSize) {
      applyWidgetRect({
        left: Number.isFinite(savedSize.left)
          ? savedSize.left
          : window.innerWidth - savedSize.width - 18,
        top: Number.isFinite(savedSize.top)
          ? savedSize.top
          : window.innerHeight - savedSize.height - 18,
        width: savedSize.width,
        height: savedSize.height,
      });
    }
    const saved = readWidgetPosition();
    if (saved) applyWidgetPosition(saved.left, saved.top);
    widgetLauncher.addEventListener("click", toggleWidget);
    let pointerDrag = null;
    dragHandle.addEventListener("pointerdown", (event) => {
      const rect = widgetShell.getBoundingClientRect();
      pointerDrag = {
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
      };
      try {
        dragHandle.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic test events may not own an active pointer.
      }
      event.preventDefault();
    });
    dragHandle.addEventListener("pointermove", (event) => {
      if (!pointerDrag) return;
      applyWidgetPosition(
        pointerDrag.left + event.clientX - pointerDrag.startX,
        pointerDrag.top + event.clientY - pointerDrag.startY,
      );
    });
    const finishPointerDrag = (event) => {
      if (!pointerDrag) return;
      pointerDrag = null;
      try {
        if (dragHandle.hasPointerCapture(event.pointerId)) {
          dragHandle.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Capture is best-effort.
      }
      const rect = widgetShell.getBoundingClientRect();
      try {
        localStorage.setItem(
          widgetPositionKey,
          JSON.stringify({ left: rect.left, top: rect.top }),
        );
      } catch {
        // Position persistence is optional.
      }
    };
    dragHandle.addEventListener("pointerup", finishPointerDrag);
    dragHandle.addEventListener("pointercancel", finishPointerDrag);

    root.querySelectorAll(".vf-widget-resize").forEach((handle) => {
      let pointerResize = null;
      handle.addEventListener("pointerdown", (event) => {
        const rect = widgetShell.getBoundingClientRect();
        pointerResize = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          direction: handle.dataset.direction || "se",
        };
        widgetShell.dataset.resizing = "true";
        try {
          handle.setPointerCapture(event.pointerId);
        } catch {
          // Synthetic test events may not own an active pointer.
        }
        event.preventDefault();
        event.stopPropagation();
      });
      handle.addEventListener("pointermove", (event) => {
        if (!pointerResize) return;
        applyWidgetRect(
          resizedWidgetRect(
            pointerResize,
            event.clientX - pointerResize.startX,
            event.clientY - pointerResize.startY,
          ),
        );
      });
      const finishResize = (event) => {
        if (!pointerResize) return;
        pointerResize = null;
        delete widgetShell.dataset.resizing;
        try {
          if (handle.hasPointerCapture(event.pointerId)) {
            handle.releasePointerCapture(event.pointerId);
          }
        } catch {
          // Capture is best-effort.
        }
        const rect = widgetShell.getBoundingClientRect();
        try {
          localStorage.setItem(
            widgetSizeKey,
            JSON.stringify({
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }),
          );
        } catch {
          // Size persistence is optional.
        }
      };
      handle.addEventListener("pointerup", finishResize);
      handle.addEventListener("pointercancel", finishResize);
    });
  }

  function readWidgetPosition() {
    try {
      const value = JSON.parse(
        localStorage.getItem(widgetPositionKey) || "null",
      );
      return Number.isFinite(value?.left) && Number.isFinite(value?.top)
        ? value
        : null;
    } catch {
      return null;
    }
  }

  function readWidgetSize() {
    try {
      const value = JSON.parse(
        localStorage.getItem(widgetSizeKey) || "null",
      );
      return Number.isFinite(value?.width) && Number.isFinite(value?.height)
        ? value
        : null;
    } catch {
      return null;
    }
  }

  function resizedWidgetRect(start, dx, dy) {
    let left = start.left;
    let top = start.top;
    let width = start.width;
    let height = start.height;
    const direction = start.direction;
    const maximumWidth = Math.max(WIDGET_MIN_WIDTH, window.innerWidth - 16);
    const maximumHeight = Math.max(WIDGET_MIN_HEIGHT, window.innerHeight - 16);
    if (direction.includes("e")) {
      width = Math.max(
        WIDGET_MIN_WIDTH,
        Math.min(start.width + dx, window.innerWidth - start.left - WIDGET_EDGE_GAP),
      );
    }
    if (direction.includes("w")) {
      left = Math.max(
        WIDGET_EDGE_GAP,
        Math.min(start.left + dx, start.left + start.width - WIDGET_MIN_WIDTH),
      );
      width = start.width + (start.left - left);
    }
    if (direction.includes("s")) {
      height = Math.max(
        WIDGET_MIN_HEIGHT,
        Math.min(start.height + dy, window.innerHeight - start.top - WIDGET_EDGE_GAP),
      );
    }
    if (direction.includes("n")) {
      top = Math.max(
        WIDGET_EDGE_GAP,
        Math.min(start.top + dy, start.top + start.height - WIDGET_MIN_HEIGHT),
      );
      height = start.height + (start.top - top);
    }
    return {
      left,
      top,
      width: Math.min(width, maximumWidth),
      height: Math.min(height, maximumHeight),
    };
  }

  function applyWidgetRect(rect) {
    if (!widgetShell) return;
    const width = Math.max(
      WIDGET_MIN_WIDTH,
      Math.min(Number(rect.width) || 420, window.innerWidth - 16),
    );
    const height = Math.max(
      WIDGET_MIN_HEIGHT,
      Math.min(Number(rect.height) || 760, window.innerHeight - 16),
    );
    const left = Math.max(
      WIDGET_EDGE_GAP,
      Math.min(Number(rect.left) || 0, window.innerWidth - width - WIDGET_EDGE_GAP),
    );
    const top = Math.max(
      WIDGET_EDGE_GAP,
      Math.min(Number(rect.top) || 0, window.innerHeight - height - WIDGET_EDGE_GAP),
    );
    widgetShell.style.left = `${left}px`;
    widgetShell.style.top = `${top}px`;
    widgetShell.style.width = `${width}px`;
    widgetShell.style.height = `${height}px`;
    widgetShell.style.right = "auto";
    widgetShell.style.bottom = "auto";
  }

  function applyWidgetPosition(left, top) {
    if (!widgetShell) return;
    const rect = widgetShell.getBoundingClientRect();
    const width = rect.width || Math.min(420, window.innerWidth - 24);
    const height = rect.height || Math.min(760, window.innerHeight - 24);
    const safeLeft = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const safeTop = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    widgetShell.style.left = `${safeLeft}px`;
    widgetShell.style.top = `${safeTop}px`;
    widgetShell.style.right = "auto";
    widgetShell.style.bottom = "auto";
  }

  function showWidget() {
    if (!widgetShell) installWidget();
    widgetShell.hidden = false;
    widgetLauncher.style.display = "none";
  }

  function hideWidget() {
    widgetShell.hidden = true;
    widgetLauncher.style.display = "flex";
  }

  function toggleWidget() {
    if (widgetShell.hidden) showWidget();
    else hideWidget();
  }

  function sendCommandToWidget(command) {
    showWidget();
    if (widgetReady && widgetFrame?.contentWindow) {
      widgetFrame.contentWindow.postMessage(
        { type: "VF_WIDGET_COMMAND", command },
        "*",
      );
    } else {
      pendingWidgetCommand = command;
    }
  }

  function installWidgetMessages() {
    window.addEventListener("message", (event) => {
      if (event.source !== widgetFrame?.contentWindow) return;
      const data = event.data || {};
      if (data.type === "VF_WIDGET_READY") {
        widgetReady = true;
        if (pendingWidgetCommand) {
          widgetFrame.contentWindow.postMessage(
            {
              type: "VF_WIDGET_COMMAND",
              command: pendingWidgetCommand,
            },
            "*",
          );
          pendingWidgetCommand = "";
        }
      } else if (data.type === "VF_WIDGET_HIDE") {
        hideWidget();
      } else if (data.type === "VF_WIDGET_DRAG_START") {
        const rect = widgetShell.getBoundingClientRect();
        window.__vfWidgetDrag = {
          left: rect.left,
          top: rect.top,
        };
        applyWidgetPosition(rect.left, rect.top);
      } else if (data.type === "VF_WIDGET_DRAG_MOVE") {
        const drag = window.__vfWidgetDrag;
        if (!drag) return;
        applyWidgetPosition(
          drag.left + (Number(data.dx) || 0),
          drag.top + (Number(data.dy) || 0),
        );
      } else if (data.type === "VF_WIDGET_DRAG_END") {
        delete window.__vfWidgetDrag;
        const rect = widgetShell.getBoundingClientRect();
        try {
          localStorage.setItem(
            widgetPositionKey,
            JSON.stringify({ left: rect.left, top: rect.top }),
          );
        } catch {
          // Dragging still works when storage is unavailable.
        }
      }
    });
  }

  function showToast(message, isError = false) {
    let toast = document.querySelector("#vf-muse-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "vf-muse-toast";
      toast.style.cssText = [
        "position:fixed",
        "top:18px",
        "left:50%",
        "transform:translate(-50%,-6px)",
        "z-index:2147483647",
        "max-width:min(420px,calc(100vw - 32px))",
        "padding:9px 14px",
        "border-radius:999px",
        "color:#fff",
        "background:rgba(11,13,18,.92)",
        "box-shadow:0 8px 28px rgba(16,24,40,.18)",
        'font:500 12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif',
        "opacity:0",
        "pointer-events:none",
        "transition:opacity 160ms ease,transform 160ms ease",
      ].join(";");
      document.documentElement.append(toast);
    }
    toast.textContent = message;
    toast.style.background = isError
      ? "rgba(180,35,24,.94)"
      : "rgba(11,13,18,.92)";
    toast.style.opacity = "1";
    toast.style.transform = "translate(-50%,0)";
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translate(-50%,-6px)";
    }, 4200);
  }

  function sendMessage(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "扩展后台未响应"));
          return;
        }
        resolve(response.data);
      });
    });
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 20 &&
      rect.height > 10
    );
  }

  function isDomDisplayed(element) {
    if (!element?.isConnected) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function editableText(element) {
    if (!element) return "";
    if ("value" in element) return String(element.value || "");
    return String(element.innerText || element.textContent || "");
  }

  function findMuseComposer() {
    if (
      document.activeElement?.matches?.(
        'textarea, [contenteditable="true"], [role="textbox"]',
      )
    ) {
      return document.activeElement;
    }
    return (
      [
        ...document.querySelectorAll(
          'textarea, [contenteditable="true"], [role="textbox"]',
        ),
      ].filter(
        (element) =>
          !element.disabled && !element.readOnly && isVisible(element),
      ).at(-1) || null
    );
  }

  function setNativeValue(element, value) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function clearComposer(element = findMuseComposer()) {
    if (!element) return;
    if ("value" in element) {
      setNativeValue(element, "");
      return;
    }
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("delete", false);
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "deleteContentBackward",
      }),
    );
  }

  function findMuseFileInput() {
    const composer = findMuseComposer();
    const form = composer?.closest("form");
    const inputs = [
      ...document.querySelectorAll('input[type="file"]'),
    ].filter(
      (input) =>
        !input.disabled &&
        (!input.accept || /image/i.test(input.accept)),
    );
    return (
      inputs.find((input) => form && form.contains(input)) ||
      inputs.at(-1) ||
      null
    );
  }

  function attachFilesToMuse(files) {
    const input = findMuseFileInput();
    if (!input) {
      throw new Error("未找到 Muse 图片上传入口，请确认已登录并打开对话");
    }
    const transfer = new DataTransfer();
    files.forEach((file) => {
      transfer.items.add(
        new File([file], file.name, {
          type: file.type || "image/png",
          lastModified: file.lastModified,
        }),
      );
    });
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function colorDescription(hex) {
    const red = parseInt(hex.slice(1, 3), 16) / 255;
    const green = parseInt(hex.slice(3, 5), 16) / 255;
    const blue = parseInt(hex.slice(5, 7), 16) / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const value = maximum;
    const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
    const lightness = (maximum + minimum) / 2;
    if (saturation < 0.12) {
      if (value < 0.18) return "黑色";
      if (value > 0.88) return "白色";
      return value < 0.5 ? "深灰色" : "浅灰色";
    }
    let hue = 0;
    if (maximum === red) hue = ((green - blue) / (maximum - minimum)) % 6;
    else if (maximum === green) {
      hue = (blue - red) / (maximum - minimum) + 2;
    } else {
      hue = (red - green) / (maximum - minimum) + 4;
    }
    hue = (hue * 60 + 360) % 360;
    const names = [
      [12, "红色"],
      [40, "橙色"],
      [68, "黄色"],
      [155, "绿色"],
      [195, "青色"],
      [250, "蓝色"],
      [290, "紫色"],
      [345, "玫红色"],
      [360, "红色"],
    ];
    const base = names.find(([limit]) => hue <= limit)[1];
    const tone = lightness < 0.3 ? "深" : lightness > 0.74 ? "浅" : "";
    return `${tone}${base}`;
  }

  async function createColorSwatch(color) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    context.fillStyle = color.hex;
    context.fillRect(0, 0, 512, 512);
    context.fillStyle =
      parseInt(color.hex.slice(1, 3), 16) * 0.299 +
        parseInt(color.hex.slice(3, 5), 16) * 0.587 +
        parseInt(color.hex.slice(5, 7), 16) * 0.114 >
      150
        ? "#111111"
        : "#ffffff";
    context.font =
      '600 46px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(color.hex, 256, 256);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("无法生成目标色卡");
    return new File([blob], `target-${color.hex.slice(1)}.png`, {
      type: "image/png",
    });
  }

  function replaceMuseComposerText(text) {
    const composer = findMuseComposer();
    if (!composer) throw new Error("未找到 Muse 对话输入框，请确认已登录");
    composer.focus();
    if ("value" in composer) {
      setNativeValue(composer, text);
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(composer);
      selection.removeAllRanges();
      selection.addRange(range);
      if (!document.execCommand("insertText", false, text)) {
        composer.textContent = text;
      }
      composer.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text,
        }),
      );
    }
  }

  function findMuseSendButton() {
    const composer = findMuseComposer();
    if (!composer) return null;
    const scope =
      composer.closest("form") ||
      composer.parentElement?.parentElement?.parentElement ||
      document;
    const selector = [
      '[data-testid*="send" i]',
      'button[aria-label*="send" i]',
      'button[aria-label*="发送"]',
      'button[title*="send" i]',
      'button[title*="发送"]',
      'button[type="submit"]',
    ].join(",");
    return (
      [...scope.querySelectorAll(selector)].filter(
        (button) =>
          isVisible(button) &&
          !button.disabled &&
          button.getAttribute("aria-disabled") !== "true",
      ).at(-1) || null
    );
  }

  function submitMuseComposer() {
    const button = findMuseSendButton();
    if (button) {
      button.click();
      return;
    }
    const composer = findMuseComposer();
    if (!composer) throw new Error("Muse 对话输入框已消失");
    composer.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  function isAutoContinueQuestion(text) {
    if (museResponse.isGenerationBlocked(text)) return false;
    return museResponse.isContinueQuestion(text);
  }

  function assistantResponseTextCounts() {
    const counts = new Map();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    let node = walker.nextNode();
    while (node) {
      const text = museResponse.normalizeText(node.nodeValue);
      const parent = node.parentElement;
      const style = parent ? window.getComputedStyle(parent) : null;
      if (
        text.length >= 2 &&
        text.length <= 1200 &&
        parent &&
        style?.display !== "none" &&
        style?.visibility !== "hidden" &&
        !parent.closest(
          "form, textarea, input, button, [contenteditable='true'], #vf-widget-root, " +
            "[data-message-author-role='user'], [data-testid*='user' i]",
        )
      ) {
        counts.set(text, (counts.get(text) || 0) + 1);
      }
      node = walker.nextNode();
    }
    return counts;
  }

  function assistantResponseBaseline() {
    return assistantResponseTextCounts();
  }

  function newAssistantResponseTexts(baseline) {
    if (!(baseline instanceof Map)) return [];
    const current = assistantResponseTextCounts();
    const added = [];
    for (const [text, count] of current) {
      const previous = baseline.get(text) || 0;
      for (let index = previous; index < count; index += 1) {
        added.push(text);
      }
    }
    return added;
  }

  function blockedResponseText(baseline) {
    return (
      newAssistantResponseTexts(baseline).find((text) =>
        museResponse.isGenerationBlocked(text),
      ) || ""
    );
  }

  async function sendRegenerateMessage() {
    const composer = findMuseComposer();
    if (!composer || editableText(composer).trim()) return null;
    const baseline = assistantResponseBaseline();
    replaceMuseComposerText("重新生成");
    await new Promise((resolve) => setTimeout(resolve, 250));
    submitMuseComposer();
    return baseline;
  }

  function substantiveNewResponseTexts(baseline) {
    return newAssistantResponseTexts(baseline).filter(
      (text) => !museResponse.isProgressText(text),
    );
  }

  async function handleTextOnlyResponse(
    state,
    responseBaseline,
    waitKind,
  ) {
    if (!autoRegenerateTextOnly) return responseBaseline;
    const texts = substantiveNewResponseTexts(responseBaseline);
    if (!texts.length) return responseBaseline;
    if (
      autoContinuePreference &&
      texts.some((text) => museResponse.isContinueQuestion(text))
    ) {
      return responseBaseline;
    }
    const signature = texts.join("|");
    if (signature !== state.signature) {
      state.signature = signature;
      state.since = Date.now();
    }
    const action = museResponse.textOnlyRetryAction(
      state.retryUsed,
      Date.now() - state.since,
      museResponse.TEXT_ONLY_GRACE_MS,
    );
    if (action === "wait") {
      return responseBaseline;
    }
    if (action === "retry") {
      const nextBaseline = await sendRegenerateMessage();
      if (!nextBaseline) {
        throw new Error(
          `${museResponse.TEXT_ONLY_ERROR_PREFIX}Muse 输入框已有草稿，无法自动回复“重新生成”`,
        );
      }
      state.retryUsed = true;
      state.signature = "";
      state.since = 0;
      showToast(`Muse ${waitKind}只返回文字，已自动回复“重新生成”`);
      return nextBaseline;
    }
    throw new Error(
      `${museResponse.TEXT_ONLY_ERROR_PREFIX}二次只返回文字且没有图片：` +
        texts.at(-1).slice(0, 90),
    );
  }

  function suspendAutoContinueForBlockedResponse() {
    if (!autoContinueWatcher) return;
    clearTimeout(autoContinueWatcher.idleTimer);
    autoContinueWatcher.observer?.disconnect();
    autoContinueWatcher.stopped = true;
    autoContinueWatcher = null;
  }

  function newAutoContinueQuestionKeys(seen) {
    const keys = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    let node = walker.nextNode();
    while (node) {
      const text = String(node.nodeValue || "").replace(/\s+/g, " ").trim();
      const parent = node.parentElement;
      if (
        isAutoContinueQuestion(text) &&
        parent &&
        isDomDisplayed(parent) &&
        !parent.closest(
          "form, textarea, input, [contenteditable='true'], #vf-widget-root, " +
            "[data-message-author-role='user'], [data-testid*='user' i]",
        )
      ) {
        const key = `${text}|${parent.getBoundingClientRect().top}|${parent.getBoundingClientRect().left}`;
        if (!seen.has(key)) keys.push({ key, text, parent });
      }
      node = walker.nextNode();
    }
    return keys;
  }

  function answerContinueQuestion(container) {
    const buttonSelectors = [
      "button",
      "[role='button']",
    ].join(",");
    const scope =
      container.closest(
        "[data-message-author-role='assistant'], [data-role='assistant'], article, li",
      ) || container.parentElement;
    const button = [...(scope?.querySelectorAll(buttonSelectors) || [])].find(
      (candidate) =>
        isVisible(candidate) &&
        /^(继续|继续生成|好的|是|yes|continue)$/i.test(
          String(candidate.textContent || "").trim(),
        ),
    );
    if (button) {
      button.click();
      return "button";
    }
    const composer = findMuseComposer();
    if (!composer) return "";
    if (editableText(composer).trim()) return "";
    replaceMuseComposerText("继续");
    submitMuseComposer();
    return "message";
  }

  function sendAutoContinueMessage() {
    const composer = findMuseComposer();
    if (!composer) return false;
    if (editableText(composer).trim()) return false;
    replaceMuseComposerText("继续");
    submitMuseComposer();
    return true;
  }

  function beginAutoContinueWatcher(
    enabled,
    timeoutEnabled = false,
    idleTimeoutMs = 5 * 60 * 1000,
    regenerateTextOnly = false,
  ) {
    autoContinueWatcher?.observer?.disconnect();
    autoContinueWatcher = null;
    autoContinuePreference = Boolean(enabled);
    autoContinueTimeoutEnabled = Boolean(timeoutEnabled);
    autoRegenerateTextOnly = Boolean(regenerateTextOnly);
    if (!enabled) return () => {};
    const watcher = {
      observer: null,
      seen: new Set(),
      stopped: false,
      lastReplyAt: 0,
      replies: 0,
      idleTimer: null,
    };
    for (const item of newAutoContinueQuestionKeys(watcher.seen)) {
      watcher.seen.add(item.key);
    }
    const canReply = () =>
      !watcher.stopped &&
      autoContinuePreference &&
      Date.now() - watcher.lastReplyAt >= 1800 &&
      watcher.replies < 20;
    const scheduleIdleReply = (delay = idleTimeoutMs) => {
      clearTimeout(watcher.idleTimer);
      if (!autoContinueTimeoutEnabled) return;
      watcher.idleTimer = setTimeout(() => {
        if (!canReply()) return;
        const sent = sendAutoContinueMessage();
        if (!sent) {
          scheduleIdleReply(15000);
          return;
        }
        watcher.lastReplyAt = Date.now();
        watcher.replies += 1;
        showToast("Muse 5 分钟无响应，已自动回复：继续");
        scheduleIdleReply();
      }, delay);
    };
    const scan = () => {
      if (
        !canReply()
      ) {
        return;
      }
      for (const item of newAutoContinueQuestionKeys(watcher.seen)) {
        watcher.seen.add(item.key);
        const action = answerContinueQuestion(item.parent);
        if (!action) continue;
        watcher.lastReplyAt = Date.now();
        watcher.replies += 1;
        showToast(`已自动回复 Muse：继续（${action === "button" ? "按钮" : "消息"}）`);
        scheduleIdleReply();
        break;
      }
    };
    watcher.observer = new MutationObserver(() => {
      setTimeout(scan, 220);
    });
    watcher.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    autoContinueWatcher = watcher;
    scheduleIdleReply();
    return () => {
      watcher.stopped = true;
      clearTimeout(watcher.idleTimer);
      watcher.observer?.disconnect();
      if (autoContinueWatcher === watcher) autoContinueWatcher = null;
    };
  }

  function isGeneratedPresentationImage(image) {
    if (!image?.closest) return false;
    const presentation = image.closest(
      '[data-testid="hatch-chat-attachment-presentation-image"], ' +
        'button[aria-label^="Open generated image"]',
    );
    if (!presentation) return false;
    const source = image.currentSrc || image.src || "";
    return Boolean(source) && !/avatar|favicon|logo/i.test(source);
  }

  function rememberGeneratedImages(node) {
    const images = [];
    if (node?.nodeType === Node.ELEMENT_NODE && node.tagName === "IMG") {
      images.push(node);
    }
    if (node?.querySelectorAll) {
      images.push(...node.querySelectorAll("img"));
    }
    for (const image of images) {
      if (
        isGeneratedPresentationImage(image) &&
        !trackedGeneratedImages.includes(image)
      ) {
        trackedGeneratedImages.push(image);
      }
    }
    if (trackedGeneratedImages.length > TRACKED_GENERATED_IMAGE_LIMIT) {
      trackedGeneratedImages.splice(
        0,
        trackedGeneratedImages.length - TRACKED_GENERATED_IMAGE_LIMIT,
      );
    }
  }

  function videoSource(video) {
    if (!video) return "";
    return (
      video.currentSrc ||
      video.src ||
      video.querySelector?.("source[src]")?.src ||
      ""
    );
  }

  function isGeneratedPresentationVideo(video) {
    if (!video?.closest) return false;
    const source = videoSource(video);
    if (!source || /avatar|favicon|logo/i.test(source)) return false;
    return (
      !video.isConnected ||
      isDomDisplayed(video) ||
      Boolean(
        video.closest(
          'article, [data-testid*="attachment" i], [data-testid*="message" i], ' +
            'button[aria-label*="generated video" i], [aria-label*="Open video" i]',
        ),
      )
    );
  }

  function isGeneratedVideoLink(anchor) {
    if (!anchor?.closest) return false;
    const href = anchor.currentSrc || anchor.href || "";
    if (!/\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(href)) return false;
    return Boolean(
      anchor.closest(
        'article, [data-testid*="attachment" i], [data-testid*="message" i], ' +
          'button[aria-label*="video" i]',
      ),
    );
  }

  function rememberGeneratedVideos(node) {
    const videos = [];
    const anchors = [];
    if (node?.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === "VIDEO") videos.push(node);
      if (node.tagName === "A") anchors.push(node);
    }
    if (node?.querySelectorAll) {
      videos.push(...node.querySelectorAll("video"));
      anchors.push(...node.querySelectorAll("a[href]"));
    }
    for (const video of videos) {
      if (!isGeneratedPresentationVideo(video)) continue;
      const source = videoSource(video);
      const poster = video.poster || "";
      if (
        source &&
        !trackedGeneratedVideos.some((item) => item.source === source)
      ) {
        trackedGeneratedVideos.push({ source, poster });
      }
    }
    for (const anchor of anchors) {
      const source = anchor.href || "";
      if (
        isGeneratedVideoLink(anchor) &&
        !trackedGeneratedVideoLinks.includes(source)
      ) {
        trackedGeneratedVideoLinks.push(source);
      }
    }
    if (trackedGeneratedVideos.length > TRACKED_GENERATED_VIDEO_LIMIT) {
      trackedGeneratedVideos.splice(
        0,
        trackedGeneratedVideos.length - TRACKED_GENERATED_VIDEO_LIMIT,
      );
    }
    if (trackedGeneratedVideoLinks.length > TRACKED_GENERATED_VIDEO_LIMIT) {
      trackedGeneratedVideoLinks.splice(
        0,
        trackedGeneratedVideoLinks.length - TRACKED_GENERATED_VIDEO_LIMIT,
      );
    }
  }

  function installGeneratedImageObserver() {
    if (generatedImageObserver || !document.body) return;
    for (const image of document.images) rememberGeneratedImages(image);
    rememberGeneratedVideos(document.body);
    generatedImageObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          rememberGeneratedImages(record.target);
          rememberGeneratedVideos(record.target);
          continue;
        }
        for (const node of record.addedNodes) {
          rememberGeneratedImages(node);
          rememberGeneratedVideos(node);
        }
      }
    });
    generatedImageObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "href", "poster"],
    });
  }

  function generatedImages() {
    const candidates = new Set([
      ...document.images,
      ...trackedGeneratedImages,
    ]);
    return [...candidates].filter((image) => {
      if (!isGeneratedPresentationImage(image)) return false;
      const presentation = image.closest(
        '[data-testid="hatch-chat-attachment-presentation-image"], ' +
          'button[aria-label^="Open generated image"]',
      );
      if (
        presentation?.isConnected &&
        !isDomDisplayed(presentation)
      ) {
        return false;
      }
      const width = image.naturalWidth || image.clientWidth;
      const height = image.naturalHeight || image.clientHeight;
      return width >= 220 && height >= 220;
    });
  }

  function generatedVideos() {
    const entries = [...trackedGeneratedVideos];
    for (const video of document.querySelectorAll("video")) {
      if (!isGeneratedPresentationVideo(video)) continue;
      const source = videoSource(video);
      if (source && !entries.some((item) => item.source === source)) {
        entries.push({ source, poster: video.poster || "" });
      }
    }
    for (const source of trackedGeneratedVideoLinks) {
      if (!entries.some((item) => item.source === source)) {
        entries.push({ source, poster: "" });
      }
    }
    return entries;
  }

  function deliveryFailureCount() {
    return [...document.querySelectorAll("span, p, div")]
      .filter(
        (element) =>
          element.children.length === 0 &&
          /Delivery not confirmed/i.test(element.textContent || "") &&
          isDomDisplayed(element),
      ).length;
  }

  async function waitForMuseImage(
    existingImages,
    deliveryBaseline = 0,
    timeoutMs = museResponse.timeoutMs(
      "single",
      autoContinueTimeoutEnabled,
    ),
    responseBaseline = null,
  ) {
    const deadline = Date.now() + timeoutMs;
    const existingSources = new Set(
      [...existingImages]
        .map((image) => image.currentSrc || image.src || "")
        .filter(Boolean),
    );
    let activeResponseBaseline = responseBaseline;
    let blockedText = "";
    let blockedAt = 0;
    const textOnlyState = {
      signature: "",
      since: 0,
      retryUsed: false,
    };
    while (Date.now() < deadline) {
      if (deliveryFailureCount() > deliveryBaseline) {
        throw new Error(
          "Muse 未确认收到消息（Delivery not confirmed），本任务可重试",
        );
      }
      const candidate = generatedImages()
        .filter(
          (image) =>
            !existingImages.has(image) &&
            !existingSources.has(image.currentSrc || image.src || ""),
        )
        .sort(
          (left, right) =>
            right.naturalWidth * right.naturalHeight -
            left.naturalWidth * left.naturalHeight,
        )[0];
      if (candidate?.complete && candidate.naturalWidth >= 220) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return candidate.currentSrc || candidate.src;
      }
      const currentBlockedText = blockedResponseText(activeResponseBaseline);
      const shouldFastFailBlocked =
        currentBlockedText &&
        (!autoRegenerateTextOnly ||
          museResponse.isCapacityBlocked(currentBlockedText));
      if (shouldFastFailBlocked && !blockedAt) {
        blockedText = currentBlockedText;
        blockedAt = Date.now();
        suspendAutoContinueForBlockedResponse();
        showToast("Muse 明确表示当前图片未生成，正在等待 15 秒补图");
      }
      if (
        blockedAt &&
        Date.now() - blockedAt >= museResponse.BLOCKED_GRACE_MS
      ) {
        const capacityPrefix = museResponse.isCapacityBlocked(blockedText)
          ? museResponse.CAPACITY_ERROR_PREFIX
          : "";
        throw new Error(
          `${capacityPrefix}Muse 明确未完成当前图片：${blockedText.slice(0, 90)}`,
        );
      }
      activeResponseBaseline = await handleTextOnlyResponse(
        textOnlyState,
        activeResponseBaseline,
        "单图",
      );
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    throw new Error(
      `等待 Muse 生成图片超时（${Math.round(timeoutMs / 1000)} 秒）`,
    );
  }

  async function waitForMuseImages(
    existingImages,
    expectedCount,
    deliveryBaseline = 0,
    timeoutMs = museResponse.timeoutMs(
      "batch",
      autoContinueTimeoutEnabled,
    ),
    filterExistingSources = false,
    responseBaseline = null,
  ) {
    const deadline = Date.now() + timeoutMs;
    const existingSources = filterExistingSources
      ? new Set(
          [...existingImages]
            .map((image) => image.currentSrc || image.src || "")
            .filter(Boolean),
        )
      : null;
    let stableSource = "";
    let stableSince = 0;
    let activeResponseBaseline = responseBaseline;
    let blockedText = "";
    let blockedAt = 0;
    const textOnlyState = {
      signature: "",
      since: 0,
      retryUsed: false,
    };
    while (Date.now() < deadline) {
      if (deliveryFailureCount() > deliveryBaseline) {
        throw new Error(
          "Muse 未确认收到批量消息（Delivery not confirmed），将降级为逐张重试",
        );
      }
      const images = generatedImages()
        .filter(
          (image) =>
            !existingImages.has(image) &&
            (!existingSources ||
              !existingSources.has(image.currentSrc || image.src || "")),
        )
        .sort(
          (left, right) =>
            right.naturalWidth * right.naturalHeight -
            left.naturalWidth * left.naturalHeight,
        );
      const complete = images.filter(
        (image) => image.complete && image.naturalWidth >= 220,
      );
      const signature = complete
        .map((image) => image.currentSrc || image.src)
        .join("|");
      if (complete.length >= expectedCount) {
        if (signature === stableSource) {
          if (Date.now() - stableSince >= 1800) {
            if (complete.length !== expectedCount) {
              throw new Error(
                `Muse 返回了 ${complete.length} 张图，预期 ${expectedCount} 张；` +
                  "为避免串图，本批不自动映射",
              );
            }
            return complete.slice(0, expectedCount);
          }
        } else {
          stableSource = signature;
          stableSince = Date.now();
        }
      }
      const currentBlockedText = blockedResponseText(activeResponseBaseline);
      const shouldFastFailBlocked =
        currentBlockedText &&
        (!autoRegenerateTextOnly ||
          museResponse.isCapacityBlocked(currentBlockedText));
      if (shouldFastFailBlocked && !blockedAt) {
        blockedText = currentBlockedText;
        blockedAt = Date.now();
        suspendAutoContinueForBlockedResponse();
        showToast("Muse 明确表示当前批次未生成，正在等待 15 秒补图");
      }
      if (
        blockedAt &&
        Date.now() - blockedAt >= museResponse.BLOCKED_GRACE_MS
      ) {
        const capacityPrefix = museResponse.isCapacityBlocked(blockedText)
          ? museResponse.CAPACITY_ERROR_PREFIX
          : "";
        throw new Error(
          `${capacityPrefix}Muse 明确未完成当前批次：${blockedText.slice(0, 90)}`,
        );
      }
      activeResponseBaseline = await handleTextOnlyResponse(
        textOnlyState,
        activeResponseBaseline,
        "批量",
      );
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    throw new Error(
      `等待 Muse 批量生成超时，未获得完整的 ${expectedCount} 张独立图片`,
    );
  }

  async function waitForMuseVideo(
    existingSources,
    deliveryBaseline = 0,
    timeoutMs = museResponse.timeoutMs(
      "video",
      autoContinueTimeoutEnabled,
    ),
    responseBaseline = null,
  ) {
    const deadline = Date.now() + timeoutMs;
    const baseline = new Set(existingSources || []);
    let stableSource = "";
    let stableSince = 0;
    let blockedText = "";
    let blockedAt = 0;
    while (Date.now() < deadline) {
      if (deliveryFailureCount() > deliveryBaseline) {
        throw new Error(
          "Muse 未确认收到视频请求（Delivery not confirmed），本任务可重试",
        );
      }
      const candidates = generatedVideos().filter(
        (item) => item.source && !baseline.has(item.source),
      );
      const source = candidates.at(-1)?.source || "";
      if (source) {
        if (source === stableSource) {
          if (Date.now() - stableSince >= 1800) return source;
        } else {
          stableSource = source;
          stableSince = Date.now();
        }
      }
      const currentBlockedText = blockedResponseText(responseBaseline);
      if (currentBlockedText && !blockedAt) {
        blockedText = currentBlockedText;
        blockedAt = Date.now();
        suspendAutoContinueForBlockedResponse();
        showToast("Muse 明确表示当前视频未生成，正在等待 15 秒补发");
      }
      if (
        blockedAt &&
        Date.now() - blockedAt >= museResponse.BLOCKED_GRACE_MS
      ) {
        const capacityPrefix = museResponse.isCapacityBlocked(blockedText)
          ? museResponse.CAPACITY_ERROR_PREFIX
          : "";
        throw new Error(
          `${capacityPrefix}Muse 明确未完成当前视频：${blockedText.slice(0, 90)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    throw new Error(
      `等待 Muse 生成视频超时（${Math.round(timeoutMs / 1000)} 秒）`,
    );
  }

  async function fetchMuseImage(url) {
    if (url.startsWith("data:")) {
      const [header, payload = ""] = url.split(",", 2);
      const type = header.match(/^data:([^;,]+)/)?.[1] || "image/png";
      if (header.includes(";base64")) {
        const binary = atob(payload);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new Blob([bytes], { type });
      }
      return new Blob([decodeURIComponent(payload)], { type });
    }
    try {
      const response = await fetch(url, {
        credentials: "include",
        cache: "force-cache",
      });
      if (response.ok) return response.blob();
    } catch {
      // Fall through to the extension service worker.
    }
    if (!url.startsWith("https://")) {
      throw new Error("无法读取 Muse 生成的 blob 图片");
    }
    const payload = await sendMessage("VF_FETCH_IMAGE", { url });
    const binary = atob(payload.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: payload.type || "image/png" });
  }

  async function fetchMuseVideo(url) {
    if (url.startsWith("data:")) {
      const [header, payload = ""] = url.split(",", 2);
      const type = header.match(/^data:([^;,]+)/)?.[1] || "video/mp4";
      if (header.includes(";base64")) {
        const binary = atob(payload);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new Blob([bytes], { type });
      }
      return new Blob([decodeURIComponent(payload)], { type });
    }
    try {
      const response = await fetch(url, {
        credentials: "include",
        cache: "force-cache",
      });
      if (response.ok) return response.blob();
    } catch {
      // Fall through to the extension service worker.
    }
    if (!url.startsWith("https://")) {
      throw new Error("无法读取 Muse 返回的视频 Blob");
    }
    const payload = await sendMessage("VF_FETCH_VIDEO", { url });
    const binary = atob(payload.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], {
      type: payload.type || "video/mp4",
    });
  }

  function videoMimeType(blob, source) {
    const type = String(blob?.type || "").toLowerCase();
    if (type.startsWith("video/")) return type;
    if (/\.webm(?:[?#]|$)/i.test(source)) return "video/webm";
    if (/\.mov(?:[?#]|$)/i.test(source)) return "video/quicktime";
    if (/\.m4v(?:[?#]|$)/i.test(source)) return "video/x-m4v";
    return "video/mp4";
  }

  function videoExtension(type, source = "") {
    if (/\.webm(?:[?#]|$)/i.test(source) || /webm/i.test(type)) return "webm";
    if (/\.mov(?:[?#]|$)/i.test(source) || /quicktime/i.test(type)) return "mov";
    if (/\.m4v(?:[?#]|$)/i.test(source) || /x-m4v/i.test(type)) return "m4v";
    return "mp4";
  }

  async function normalizeGeneratedImage(blob, filename) {
    try {
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(
        1,
        1800 / Math.max(bitmap.width, bitmap.height),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const output = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.95),
      );
      if (output) {
        return new File([output], filename, { type: "image/webp" });
      }
    } catch {
      // Preserve the original when browser decoding is unavailable.
    }
    return new File([blob], filename, { type: blob.type || "image/png" });
  }

  function withMuseSource(file, url) {
    try {
      Object.defineProperty(file, "museSourceUrl", {
        value: String(url || ""),
        configurable: true,
      });
    } catch {
      // Link-only export falls back when the browser cannot annotate File.
    }
    return file;
  }

  function productColorPrompt(color, index, total, region = "whole", template = "") {
    const name = color.name ? `${color.name}，` : "";
    const regionName = {
      whole: "商品主体",
      lower: "下装（裤子或裙装）",
      upper: "上装（外套或上衣）",
    }[region] || "商品主体";
    return promptTemplates.render(
      template || promptTemplates.DEFAULTS.product_color,
      {
        region_name: regionName,
        color_description: colorDescription(color.hex),
        color_hex: color.hex,
        color_name: name,
        index,
        total,
      },
    );
  }

  function productColorBatchPrompt(
    colors,
    total,
    region = "whole",
    template = "",
  ) {
    const regionName =
      {
        whole: "商品主体",
        lower: "下装（裤子或裙装）",
        upper: "上装（外套或上衣）",
      }[region] || "商品主体";
    const colorList = colors
      .map(
        (color, index) =>
          `${String(index + 1).padStart(2, "0")}. ${color.hex}` +
          `${color.name ? `（${color.name}）` : ""}` +
          `：${colorDescription(color.hex)}`,
      )
      .join("\n");
    return promptTemplates.render(
      template || promptTemplates.DEFAULTS.product_color_batch,
      {
        region_name: regionName,
        color_list: colorList,
        color_count: colors.length,
        total,
      },
    );
  }

  function patternTransferPrompt(
    backgroundMode,
    index,
    total,
    template = "",
    categoryValue = "auto",
  ) {
    const category = promptTemplates.productCategoryValues(
      categoryValue,
    );
    const backgroundInstruction =
      backgroundMode === "match"
        ? "背景可以根据印花风格做协调改造，但必须保留商品主体与地面的自然接触阴影和相同拍摄角度。"
        : "严格保持白底商品图原有的背景、地面、光线、阴影、构图和裁切不变。";
    const rendered = promptTemplates.render(
      template || promptTemplates.DEFAULTS.pattern_single,
      {
        background_instruction: backgroundInstruction,
        category_name: category.category_name,
        category_print_area: category.category_print_area,
        category_base_surface: category.category_base_surface,
        category_protected_area: category.category_protected_area,
        category_model_region: category.category_model_region,
        index,
        total,
      },
    );
    return promptTemplates.ensureProductCategoryConstraint(
      rendered,
      categoryValue,
    );
  }

  function patternBatchPrompt(
    backgroundMode,
    references,
    batchIndex,
    total,
    template = "",
    categoryValue = "auto",
  ) {
    const category = promptTemplates.productCategoryValues(
      categoryValue,
    );
    const names = references
      .map(
        (item, index) =>
          `${String(index + 1).padStart(2, "0")}. ` +
          `${item.relative_path || item.name}`,
      )
      .join("\n");
    const backgroundInstruction =
      backgroundMode === "match"
        ? "背景可以根据每张参考图的印花风格做协调改造，但必须保留商品主体与地面的自然接触阴影和相同拍摄角度。"
        : "严格保持白底商品图原有的背景、地面、光线、阴影、构图和裁切不变。";
    const rendered = promptTemplates.render(
      template || promptTemplates.DEFAULTS.pattern_batch,
      {
        reference_list: names,
        batch_index: batchIndex,
        batch_count: references.length,
        background_instruction: backgroundInstruction,
        category_name: category.category_name,
        category_print_area: category.category_print_area,
        category_base_surface: category.category_base_surface,
        category_protected_area: category.category_protected_area,
        category_model_region: category.category_model_region,
        total,
      },
    );
    return promptTemplates.ensureProductCategoryConstraint(
      rendered,
      categoryValue,
    );
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      chunks.push(
        String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)),
      );
    }
    return btoa(chunks.join(""));
  }

  function base64ToFile(file) {
    const binary = atob(file.data || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], file.name || "product.png", {
      type: file.type || "image/png",
    });
  }

  async function generateColor(master, color, index, total, region, template = "") {
    if (!findMuseComposer()) {
      throw new Error("未找到 Muse 对话输入框，请先完成 Muse 登录");
    }
    const swatch = await createColorSwatch(color);
    attachFilesToMuse([master, swatch]);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const responseBaseline = assistantResponseBaseline();
    const existingImages = new Set(generatedImages());
    const deliveryBaseline = deliveryFailureCount();
    replaceMuseComposerText(
      productColorPrompt(color, index, total, region, template),
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    submitMuseComposer();
    const generatedUrl = await waitForMuseImage(
      existingImages,
      deliveryBaseline,
      undefined,
      responseBaseline,
    );
    const blob = await fetchMuseImage(generatedUrl);
    return withMuseSource(
      await normalizeGeneratedImage(
        blob,
        `variant-${String(index).padStart(2, "0")}-${color.hex.slice(1)}.webp`,
      ),
      generatedUrl,
    );
  }

  async function generateColorBatch(
    master,
    colors,
    total,
    region,
    template = "",
  ) {
    if (!findMuseComposer()) {
      throw new Error("未找到 Muse 对话输入框，请先完成 Muse 登录");
    }
    const swatches = [];
    for (const color of colors) {
      swatches.push(await createColorSwatch(color));
    }
    attachFilesToMuse([master, ...swatches]);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const responseBaseline = assistantResponseBaseline();
    const existingImages = new Set(generatedImages());
    const deliveryBaseline = deliveryFailureCount();
    replaceMuseComposerText(
      productColorBatchPrompt(colors, total, region, template),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    submitMuseComposer();
    const images = await waitForMuseImages(
      existingImages,
      colors.length,
      deliveryBaseline,
      museResponse.timeoutMs("batch", autoContinueTimeoutEnabled),
      true,
      responseBaseline,
    );
    const outputs = [];
    for (let index = 0; index < images.length; index += 1) {
      const blob = await fetchMuseImage(
        images[index].currentSrc || images[index].src,
      );
      const file = await normalizeGeneratedImage(
        blob,
        `color-batch-${String(colors[index].hex.slice(1)).padStart(6, "0")}.webp`,
      );
      outputs.push({
        name: file.name,
        type: file.type,
        data: arrayBufferToBase64(await file.arrayBuffer()),
        url: images[index].currentSrc || images[index].src,
      });
    }
    return { outputs };
  }

  async function generatePattern(message) {
    const base = base64ToFile(message.base);
    const reference = base64ToFile(message.reference);
    if (!findMuseComposer()) {
      throw new Error("未找到 Muse 对话输入框，请先完成 Muse 登录");
    }
    attachFilesToMuse([base, reference]);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const responseBaseline = assistantResponseBaseline();
    const existingImages = new Set(generatedImages());
    const deliveryBaseline = deliveryFailureCount();
    replaceMuseComposerText(
      patternTransferPrompt(
        message.backgroundMode,
        message.index,
        message.total,
        message.template,
        message.category,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    submitMuseComposer();
    const generatedUrl = await waitForMuseImage(
      existingImages,
      deliveryBaseline,
      undefined,
      responseBaseline,
    );
    const blob = await fetchMuseImage(generatedUrl);
    const referenceName = String(message.reference?.name || "pattern")
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w-]+/g, "-")
      .slice(0, 50);
    return withMuseSource(
      await normalizeGeneratedImage(
        blob,
        `pattern-${String(message.index).padStart(2, "0")}-${referenceName}.webp`,
      ),
      generatedUrl,
    );
  }

  async function generateCopyVariant(message) {
    const master = base64ToFile(message.master);
    if (!findMuseComposer()) {
      throw new Error("未找到 Muse 对话输入框，请先完成 Muse 登录");
    }
    attachFilesToMuse([master]);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const responseBaseline = assistantResponseBaseline();
    const existingImages = new Set(generatedImages());
    const deliveryBaseline = deliveryFailureCount();
    replaceMuseComposerText(
      message.direct === true
        ? message.prompt
        : [
            "请严格基于第一张附件重新绘制，不要返回原图，也不要只更换背景。",
            message.prompt,
            "必须让商品主体按照“变为”后的描述发生可见变化，同时保留真实商品结构、版型、褶皱、绒毛、面料纹理和光影。",
          ].join("\n"),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    submitMuseComposer();
    const generatedUrl = await waitForMuseImage(
      existingImages,
      deliveryBaseline,
      undefined,
      responseBaseline,
    );
    const blob = await fetchMuseImage(generatedUrl);
    return withMuseSource(
      await normalizeGeneratedImage(
        blob,
        `copy-variant-${String(message.index).padStart(2, "0")}.webp`,
      ),
      generatedUrl,
    );
  }

  async function generateCopyBatch(message) {
    const master = base64ToFile(message.master);
    if (!findMuseComposer()) {
      throw new Error("未找到 Muse 对话输入框，请先完成 Muse 登录");
    }
    attachFilesToMuse([master]);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const responseBaseline = assistantResponseBaseline();
    const existingImages = new Set(generatedImages());
    const deliveryBaseline = deliveryFailureCount();
    replaceMuseComposerText(message.prompt);
    await new Promise((resolve) => setTimeout(resolve, 300));
    submitMuseComposer();
    const images = await waitForMuseImages(
      existingImages,
      message.count,
      deliveryBaseline,
      museResponse.timeoutMs("batch", autoContinueTimeoutEnabled),
      true,
      responseBaseline,
    );
    const outputs = [];
    for (let index = 0; index < images.length; index += 1) {
      const blob = await fetchMuseImage(images[index].currentSrc || images[index].src);
      const file = await normalizeGeneratedImage(
        blob,
        `copy-batch-${String(message.batch_index).padStart(2, "0")}-` +
          `${String(index + 1).padStart(2, "0")}.webp`,
      );
      outputs.push({
        name: file.name,
        type: file.type,
        data: arrayBufferToBase64(await file.arrayBuffer()),
        url: images[index].currentSrc || images[index].src,
      });
    }
    return { outputs };
  }

  function logoDesignPrompt(instruction, template = "") {
    return promptTemplates.render(
      template || promptTemplates.DEFAULTS.logo_design,
      { instruction: String(instruction || "").trim() },
    );
  }

  function logoDesignBatchPrompt(
    instruction,
    outputCount,
    requestIndex,
    template = "",
  ) {
    return promptTemplates.render(
      template || promptTemplates.DEFAULTS.logo_design_batch,
      {
        instruction: String(instruction || "").trim(),
        output_count: outputCount,
        request_index: requestIndex,
      },
    );
  }

  async function generateLogoDesign(message) {
    const master = base64ToFile(message.master);
    if (!findMuseComposer()) {
      throw new Error("未找到 Muse 对话输入框，请先完成 Muse 登录");
    }
    attachFilesToMuse([master]);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const responseBaseline = assistantResponseBaseline();
    const existingImages = new Set(generatedImages());
    const deliveryBaseline = deliveryFailureCount();
    replaceMuseComposerText(logoDesignPrompt(message.prompt, message.template));
    await new Promise((resolve) => setTimeout(resolve, 300));
    submitMuseComposer();
    const generatedUrl = await waitForMuseImage(
      existingImages,
      deliveryBaseline,
      undefined,
      responseBaseline,
    );
    const blob = await fetchMuseImage(generatedUrl);
    return withMuseSource(
      await normalizeGeneratedImage(blob, "logo-redesign.webp"),
      generatedUrl,
    );
  }

  async function generateLogoDesignBatch(message) {
    const master = base64ToFile(message.master);
    if (!findMuseComposer()) {
      throw new Error("未找到 Muse 对话输入框，请先完成 Muse 登录");
    }
    attachFilesToMuse([master]);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const responseBaseline = assistantResponseBaseline();
    const existingImages = new Set(generatedImages());
    const deliveryBaseline = deliveryFailureCount();
    replaceMuseComposerText(
      logoDesignBatchPrompt(
        message.prompt,
        message.count,
        message.request_index,
        message.template,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    submitMuseComposer();
    const images = await waitForMuseImages(
      existingImages,
      message.count,
      deliveryBaseline,
      museResponse.timeoutMs("batch", autoContinueTimeoutEnabled),
      true,
      responseBaseline,
    );
    const outputs = [];
    for (let index = 0; index < images.length; index += 1) {
      const blob = await fetchMuseImage(
        images[index].currentSrc || images[index].src,
      );
      const file = await normalizeGeneratedImage(
        blob,
        `logo-redesign-${String(message.request_index).padStart(2, "0")}-` +
          `${String(index + 1).padStart(2, "0")}.webp`,
      );
      outputs.push({
        name: file.name,
        type: file.type,
        data: arrayBufferToBase64(await file.arrayBuffer()),
        url: images[index].currentSrc || images[index].src,
      });
    }
    return { outputs };
  }

  async function generatePatternBatch(message) {
    const base = base64ToFile(message.base);
    const archive = base64ToFile(message.archive);
    if (!findMuseComposer()) {
      throw new Error("未找到 Muse 对话输入框，请先完成 Muse 登录");
    }
    attachFilesToMuse([base, archive]);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const responseBaseline = assistantResponseBaseline();
    const existingImages = new Set(generatedImages());
    const deliveryBaseline = deliveryFailureCount();
    replaceMuseComposerText(
      patternBatchPrompt(
        message.backgroundMode,
        message.references,
        message.index,
        message.total,
        message.template,
        message.category,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    submitMuseComposer();
    const images = await waitForMuseImages(
      existingImages,
      message.references.length,
      deliveryBaseline,
      museResponse.timeoutMs("batch", autoContinueTimeoutEnabled),
      true,
      responseBaseline,
    );
    const outputs = [];
    const references = [];
    for (let index = 0; index < images.length; index += 1) {
      const blob = await fetchMuseImage(images[index].currentSrc || images[index].src);
      const reference = message.references[index];
      const referenceName = String(reference?.name || `reference-${index + 1}`)
        .replace(/\.[^.]+$/, "")
        .replace(/[^\w-]+/g, "-")
        .slice(0, 50);
      const file = await normalizeGeneratedImage(
        blob,
        `pattern-${String(message.index).padStart(2, "0")}-` +
          `${String(index + 1).padStart(2, "0")}-${referenceName}.webp`,
      );
      outputs.push({
        name: file.name,
        type: file.type,
        data: arrayBufferToBase64(await file.arrayBuffer()),
        url: images[index].currentSrc || images[index].src,
      });
      references.push(reference);
    }
    return { outputs, references };
  }

  async function generateProductVideo(message) {
    const master = base64ToFile(message.master);
    if (!findMuseComposer()) {
      throw new Error("未找到 Muse 对话输入框，请先完成 Muse 登录");
    }
    attachFilesToMuse([master]);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const responseBaseline = assistantResponseBaseline();
    const existingVideos = new Set(
      generatedVideos().map((item) => item.source),
    );
    const deliveryBaseline = deliveryFailureCount();
    replaceMuseComposerText(
      promptTemplates.ensureVideoNoFaceConstraint(
        message.prompt ||
          promptTemplates.DEFAULTS.video_showcase,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    submitMuseComposer();
    const videoUrl = await waitForMuseVideo(
      existingVideos,
      deliveryBaseline,
      undefined,
      responseBaseline,
    );
    const blob = await fetchMuseVideo(videoUrl);
    const type = videoMimeType(blob, videoUrl);
    const extension = videoExtension(type, videoUrl);
    const requestIndex = Number(message.request_index || 1);
    const file = new File(
      [blob],
      `product-video-${String(requestIndex).padStart(2, "0")}.${extension}`,
      { type },
    );
    return withMuseSource(file, videoUrl);
  }

  async function handleMuseGeneration(message) {
    const master = base64ToFile(message.master);
    const file = await generateColor(
      master,
      message.color,
      message.index,
      message.total,
      message.region,
      message.template,
    );
    return {
      name: file.name,
      type: file.type,
      data: arrayBufferToBase64(await file.arrayBuffer()),
      url: file.museSourceUrl || "",
    };
  }

  function commandFromEditor(editor) {
    const text = editableText(editor).trim();
    return text.startsWith("/vf") ? parser.parse(text) : null;
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      const editor = event.target.closest?.(
        'textarea, [contenteditable="true"], [role="textbox"]',
      );
      const parsed = commandFromEditor(editor);
      if (!parsed) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const command = editableText(editor);
      clearComposer(editor);
      sendCommandToWidget(command);
      showToast("Visual Forge 已接收指令");
    },
    true,
  );

  document.addEventListener(
    "submit",
    (event) => {
      const editor = findMuseComposer();
      const parsed = commandFromEditor(editor);
      if (!parsed) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const command = editableText(editor);
      clearComposer(editor);
      sendCommandToWidget(command);
    },
    true,
  );

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "VF_TOGGLE_WIDGET") {
      toggleWidget();
      sendResponse({ ok: true, data: { visible: !widgetShell.hidden } });
      return false;
    }
    if (message?.type === "VF_PING") {
      if (typeof message.autoRegenerateTextOnly === "boolean") {
        autoRegenerateTextOnly = message.autoRegenerateTextOnly;
      }
      sendResponse({
        ok: true,
        data: { muse: true, autoContinue: autoContinuePreference },
      });
      return false;
    }
    if (message?.type === "VF_SET_AUTO_CONTINUE") {
      autoContinuePreference = message.enabled === true;
      autoContinueTimeoutEnabled = message.timeoutEnabled === true;
      if (!autoContinuePreference) {
        clearTimeout(autoContinueWatcher?.idleTimer);
        autoContinueWatcher?.observer?.disconnect();
        autoContinueWatcher = null;
      }
      sendResponse({
        ok: true,
        data: {
          enabled: autoContinuePreference,
          timeoutEnabled: autoContinueTimeoutEnabled,
        },
      });
      return false;
    }
    if (message?.type === "VF_SET_AUTO_REGENERATE") {
      autoRegenerateTextOnly = message.enabled === true;
      sendResponse({
        ok: true,
        data: { enabled: autoRegenerateTextOnly },
      });
      return false;
    }
    if (message?.type === "VF_MUSE_GENERATE_VIDEO") {
      const stopAutoContinue = beginAutoContinueWatcher(
        message.autoContinue === true,
        message.autoContinueTimeout === true,
        message.autoContinueIdleMs,
        false,
      );
      generateProductVideo(message)
        .then(async (file) =>
          sendResponse({
            ok: true,
            data: {
              name: file.name,
              type: file.type,
              data: arrayBufferToBase64(await file.arrayBuffer()),
              url: file.museSourceUrl || "",
            },
          }),
        )
        .catch((error) =>
          sendResponse({ ok: false, error: error.message }),
        )
        .finally(stopAutoContinue);
      return true;
    }
    if (message?.type === "VF_MUSE_GENERATE_COLOR") {
      const stopAutoContinue = beginAutoContinueWatcher(
        message.autoContinue === true,
        message.autoContinueTimeout === true,
        message.autoContinueIdleMs,
        message.autoRegenerateTextOnly === true,
      );
      handleMuseGeneration(message)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) =>
          sendResponse({ ok: false, error: error.message }),
        )
        .finally(stopAutoContinue);
      return true;
    }
    if (message?.type === "VF_MUSE_GENERATE_COLOR_BATCH") {
      const stopAutoContinue = beginAutoContinueWatcher(
        message.autoContinue === true,
        message.autoContinueTimeout === true,
        message.autoContinueIdleMs,
        message.autoRegenerateTextOnly === true,
      );
      generateColorBatch(
        base64ToFile(message.master),
        Array.isArray(message.colors) ? message.colors : [],
        message.total,
        message.region,
        message.template,
      )
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) =>
          sendResponse({ ok: false, error: error.message }),
        )
        .finally(stopAutoContinue);
      return true;
    }
    if (message?.type === "VF_MUSE_GENERATE_PATTERN") {
      const stopAutoContinue = beginAutoContinueWatcher(
        message.autoContinue === true,
        message.autoContinueTimeout === true,
        message.autoContinueIdleMs,
        message.autoRegenerateTextOnly === true,
      );
      generatePattern(message)
        .then(async (file) =>
          sendResponse({
            ok: true,
            data: {
              name: file.name,
              type: file.type,
              data: arrayBufferToBase64(await file.arrayBuffer()),
              url: file.museSourceUrl || "",
            },
          }),
        )
        .catch((error) =>
          sendResponse({ ok: false, error: error.message }),
        )
        .finally(stopAutoContinue);
      return true;
    }
    if (message?.type === "VF_MUSE_GENERATE_COPY_VARIANT") {
      const stopAutoContinue = beginAutoContinueWatcher(
        message.autoContinue === true,
        message.autoContinueTimeout === true,
        message.autoContinueIdleMs,
        message.autoRegenerateTextOnly === true,
      );
      generateCopyVariant(message)
        .then(async (file) =>
          sendResponse({
            ok: true,
            data: {
              name: file.name,
              type: file.type,
              data: arrayBufferToBase64(await file.arrayBuffer()),
              url: file.museSourceUrl || "",
            },
          }),
        )
        .catch((error) =>
          sendResponse({ ok: false, error: error.message }),
        )
        .finally(stopAutoContinue);
      return true;
    }
    if (message?.type === "VF_MUSE_GENERATE_COPY_BATCH") {
      const stopAutoContinue = beginAutoContinueWatcher(
        message.autoContinue === true,
        message.autoContinueTimeout === true,
        message.autoContinueIdleMs,
        message.autoRegenerateTextOnly === true,
      );
      generateCopyBatch(message)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) =>
          sendResponse({ ok: false, error: error.message }),
        )
        .finally(stopAutoContinue);
      return true;
    }
    if (message?.type === "VF_MUSE_GENERATE_LOGO_DESIGN") {
      const stopAutoContinue = beginAutoContinueWatcher(
        message.autoContinue === true,
        message.autoContinueTimeout === true,
        message.autoContinueIdleMs,
        message.autoRegenerateTextOnly === true,
      );
      generateLogoDesign(message)
        .then(async (file) =>
          sendResponse({
            ok: true,
            data: {
              name: file.name,
              type: file.type,
              data: arrayBufferToBase64(await file.arrayBuffer()),
              url: file.museSourceUrl || "",
            },
          }),
        )
        .catch((error) =>
          sendResponse({ ok: false, error: error.message }),
        )
        .finally(stopAutoContinue);
      return true;
    }
    if (message?.type === "VF_MUSE_GENERATE_LOGO_DESIGN_BATCH") {
      const stopAutoContinue = beginAutoContinueWatcher(
        message.autoContinue === true,
        message.autoContinueTimeout === true,
        message.autoContinueIdleMs,
        message.autoRegenerateTextOnly === true,
      );
      generateLogoDesignBatch(message)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) =>
          sendResponse({ ok: false, error: error.message }),
        )
        .finally(stopAutoContinue);
      return true;
    }
    if (message?.type === "VF_MUSE_GENERATE_PATTERN_BATCH") {
      const stopAutoContinue = beginAutoContinueWatcher(
        message.autoContinue === true,
        message.autoContinueTimeout === true,
        message.autoContinueIdleMs,
        message.autoRegenerateTextOnly === true,
      );
      generatePatternBatch(message)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) =>
          sendResponse({ ok: false, error: error.message }),
        )
        .finally(stopAutoContinue);
      return true;
    }
    if (message?.type === "VF_INSERT_SUMMARY") {
      const composer = findMuseComposer();
      if (!composer) {
        sendResponse({ ok: false, error: "没有找到 Muse 输入框" });
        return false;
      }
      composer.focus();
      if ("value" in composer) {
        const current = composer.value || "";
        setNativeValue(
          composer,
          `${current}${current ? "\n" : ""}${message.text || ""}`,
        );
      } else {
        document.execCommand("insertText", false, message.text || "");
      }
      sendResponse({ ok: true, data: { inserted: true } });
      return false;
    }
    return false;
  });

  installWidget();
  installWidgetMessages();
  installGeneratedImageObserver();
})();
