(function visualForgeMuseBridge() {
  "use strict";

  if (window.__VF_MUSE_BRIDGE_LOADED__) return;
  window.__VF_MUSE_BRIDGE_LOADED__ = true;

  const parser = window.MuseBridgeCommands;
  if (!parser) {
    console.error("Visual Forge command parser failed to load");
    return;
  }

  let toastTimer = 0;
  let widgetFrame = null;
  let widgetShell = null;
  let widgetLauncher = null;
  let widgetReady = false;
  let pendingWidgetCommand = "";
  const widgetPositionKey = "visualForgeWidgetPosition";

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
      #vf-widget-drag-handle {
        position: absolute;
        top: 0;
        left: 0;
        width: calc(100% - 118px);
        height: 64px;
        z-index: 2;
        cursor: grab;
        touch-action: none;
      }
      #vf-widget-drag-handle:active { cursor: grabbing; }
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

  function generatedImages() {
    return [...document.images].filter((image) => {
      if (!isVisible(image)) return false;
      const presentation = image.closest(
        '[data-testid="hatch-chat-attachment-presentation-image"], ' +
          'button[aria-label^="Open generated image"]',
      );
      if (!presentation) return false;
      const width = image.naturalWidth || image.clientWidth;
      const height = image.naturalHeight || image.clientHeight;
      const source = image.currentSrc || image.src || "";
      return (
        width >= 220 &&
        height >= 220 &&
        source &&
        !/avatar|favicon|logo/i.test(source)
      );
    });
  }

  function deliveryFailureCount() {
    return [...document.querySelectorAll("span, p, div")]
      .filter(
        (element) =>
          element.children.length === 0 &&
          /Delivery not confirmed/i.test(element.textContent || "") &&
          isVisible(element),
      ).length;
  }

  async function waitForMuseImage(
    existingImages,
    deliveryBaseline = 0,
    timeoutMs = 240000,
  ) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (deliveryFailureCount() > deliveryBaseline) {
        throw new Error(
          "Muse 未确认收到消息（Delivery not confirmed），本任务可重试",
        );
      }
      const candidate = generatedImages()
        .filter((image) => !existingImages.has(image))
        .sort(
          (left, right) =>
            right.naturalWidth * right.naturalHeight -
            left.naturalWidth * left.naturalHeight,
        )[0];
      if (candidate?.complete && candidate.naturalWidth >= 220) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return candidate.currentSrc || candidate.src;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    throw new Error("等待 Muse 生成图片超过 4 分钟");
  }

  async function waitForMuseImages(
    existingImages,
    expectedCount,
    deliveryBaseline = 0,
    timeoutMs = 300000,
  ) {
    const deadline = Date.now() + timeoutMs;
    let stableSource = "";
    let stableSince = 0;
    while (Date.now() < deadline) {
      if (deliveryFailureCount() > deliveryBaseline) {
        throw new Error(
          "Muse 未确认收到批量消息（Delivery not confirmed），将降级为逐张重试",
        );
      }
      const images = generatedImages()
        .filter((image) => !existingImages.has(image))
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
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    throw new Error(
      `等待 Muse 批量生成超时，未获得完整的 ${expectedCount} 张独立图片`,
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

  function productColorPrompt(color, index, total, region = "whole") {
    const name = color.name ? `${color.name}，` : "";
    const regionName = {
      whole: "商品主体",
      lower: "下装（裤子或裙装）",
      upper: "上装（外套或上衣）",
    }[region] || "商品主体";
    return [
      "第一张附件是商品参考图，第二张附件是目标颜色色卡，色卡只用于取色，不要出现在结果里。",
      "保持人物姿态、产品裁切、背景、服装版型、口袋、腰带、缝线、面料纹理、褶皱和光影不变。",
      `只把${regionName}的颜色改为 ${colorDescription(color.hex)} ${color.hex}（${name}目标色号），与第二张色卡一致。`,
      "目标颜色必须清晰可见，不能保留原来的主色；衣服的印花、logo和五金细节不能变色。",
      `这是第 ${index}/${total} 个颜色，输出一张与原图相同比例和构图的单张商品图。`,
      "不要生成拼图、色卡、文字或水印，不要改变其他产品和非目标区域。",
    ].join("");
  }

  function patternTransferPrompt(backgroundMode, index, total) {
    const backgroundInstruction =
      backgroundMode === "match"
        ? "背景可以根据印花风格做协调改造，但必须保留商品主体与地面的自然接触阴影和相同拍摄角度。"
        : "严格保持白底商品图原有的背景、地面、光线、阴影、构图和裁切不变。";
    return [
      "第一张附件是白底商品主图，第二张附件是印花风格参考图。",
      "只从第二张图提取印花、图案、配色和视觉风格，把印花自然套到第一张图的商品主体上。",
      "必须保留白底商品原有的轮廓、版型、褶皱、绒毛/面料纹理、缝线、口袋、拉链、五金、高光和明暗层次，不能把商品变成平面贴图。",
      "参考图中的人物、裤子、背景、文案、标签、边框、水印和UI元素都不要放进结果，只参考印花风格。",
      backgroundInstruction,
      `这是第 ${index}/${total} 张参考图，只输出一张单张商品图。`,
      "No collage, no watermark, no reference labels, no added text, exact product identity.",
    ].join("");
  }

  function patternBatchPrompt(
    backgroundMode,
    references,
    batchIndex,
    total,
  ) {
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
    return [
      "第一张附件是白底商品主图，第二张附件是一个 ZIP，里面有按文件名排序的多张印花参考图。",
      `请解压 ZIP，按下面给出的顺序逐张处理：\n${names}`,
      `这是总第 ${batchIndex} 批，本批必须输出 ${references.length} 张相互独立的商品图，一张参考图对应一张输出。`,
      "每张图只提取对应参考图中的印花、图案、配色和视觉风格，并把印花自然套到第一张白底商品的对应位置。",
      "必须保留白底商品原有的轮廓、版型、褶皱、绒毛/面料纹理、缝线、口袋、拉链、五金、高光和明暗层次。",
      "参考图中的人物、背景、文案、标签、边框、水印和UI元素都不要放进结果，只参考印花风格。",
      backgroundInstruction,
      "严禁拼图、九宫格、四宫格、色卡、对比页或将多个商品放进同一张图；必须返回多个独立图片附件，并按输入文件名顺序排列。",
      `当前任务共 ${total} 张参考图。No collage, no grid, exactly ${references.length} separate images.`,
    ].join("\n");
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

  async function generateColor(master, color, index, total, region) {
    if (!findMuseComposer()) {
      throw new Error("未找到 Muse 对话输入框，请先完成 Muse 登录");
    }
    const swatch = await createColorSwatch(color);
    attachFilesToMuse([master, swatch]);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const existingImages = new Set(generatedImages());
    const deliveryBaseline = deliveryFailureCount();
    replaceMuseComposerText(productColorPrompt(color, index, total, region));
    await new Promise((resolve) => setTimeout(resolve, 250));
    submitMuseComposer();
    const generatedUrl = await waitForMuseImage(
      existingImages,
      deliveryBaseline,
    );
    const blob = await fetchMuseImage(generatedUrl);
    return normalizeGeneratedImage(
      blob,
      `variant-${String(index).padStart(2, "0")}-${color.hex.slice(1)}.webp`,
    );
  }

  async function generatePattern(message) {
    const base = base64ToFile(message.base);
    const reference = base64ToFile(message.reference);
    if (!findMuseComposer()) {
      throw new Error("未找到 Muse 对话输入框，请先完成 Muse 登录");
    }
    attachFilesToMuse([base, reference]);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const existingImages = new Set(generatedImages());
    const deliveryBaseline = deliveryFailureCount();
    replaceMuseComposerText(
      patternTransferPrompt(
        message.backgroundMode,
        message.index,
        message.total,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
    submitMuseComposer();
    const generatedUrl = await waitForMuseImage(
      existingImages,
      deliveryBaseline,
    );
    const blob = await fetchMuseImage(generatedUrl);
    const referenceName = String(message.reference?.name || "pattern")
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w-]+/g, "-")
      .slice(0, 50);
    return normalizeGeneratedImage(
      blob,
      `pattern-${String(message.index).padStart(2, "0")}-${referenceName}.webp`,
    );
  }

  async function generatePatternBatch(message) {
    const base = base64ToFile(message.base);
    const archive = base64ToFile(message.archive);
    if (!findMuseComposer()) {
      throw new Error("未找到 Muse 对话输入框，请先完成 Muse 登录");
    }
    attachFilesToMuse([base, archive]);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const existingImages = new Set(generatedImages());
    const deliveryBaseline = deliveryFailureCount();
    replaceMuseComposerText(
      patternBatchPrompt(
        message.backgroundMode,
        message.references,
        message.index,
        message.total,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    submitMuseComposer();
    const images = await waitForMuseImages(
      existingImages,
      message.references.length,
      deliveryBaseline,
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
      });
      references.push(reference);
    }
    return { outputs, references };
  }

  async function handleMuseGeneration(message) {
    const master = base64ToFile(message.master);
    const file = await generateColor(
      master,
      message.color,
      message.index,
      message.total,
      message.region,
    );
    return {
      name: file.name,
      type: file.type,
      data: arrayBufferToBase64(await file.arrayBuffer()),
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
      sendResponse({ ok: true, data: { muse: true } });
      return false;
    }
    if (message?.type === "VF_MUSE_GENERATE_COLOR") {
      handleMuseGeneration(message)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) =>
          sendResponse({ ok: false, error: error.message }),
        );
      return true;
    }
    if (message?.type === "VF_MUSE_GENERATE_PATTERN") {
      generatePattern(message)
        .then(async (file) =>
          sendResponse({
            ok: true,
            data: {
              name: file.name,
              type: file.type,
              data: arrayBufferToBase64(await file.arrayBuffer()),
            },
          }),
        )
        .catch((error) =>
          sendResponse({ ok: false, error: error.message }),
        );
      return true;
    }
    if (message?.type === "VF_MUSE_GENERATE_PATTERN_BATCH") {
      generatePatternBatch(message)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) =>
          sendResponse({ ok: false, error: error.message }),
        );
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
})();
