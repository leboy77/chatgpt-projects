const [, , wsUrl] = process.argv;
if (!wsUrl) {
  console.error("Usage: node tools/test-panel-drag.cjs <page-ws-url>");
  process.exit(1);
}

const TEST_URL = "https://www.temu.com/mall.html?tec_panel_drag_test=1";
const TEST_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <title>Temu 工具条拖动测试</title>
    <style>
      body { margin: 0; min-height: 1600px; font-family: sans-serif; background: #f4f4f4; }
      main { padding: 40px; }
    </style>
  </head>
  <body>
    <main>
      <h1>工具条拖动测试页</h1>
      <p>该页面通过本机 CDP 请求拦截生成，不会采集商品或访问账号数据。</p>
    </main>
  </body>
</html>`;

const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text,
    );
  }
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(expression);
      if (value) return value;
    } catch {
      // Navigation can temporarily destroy the JavaScript context.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function panelState() {
  return evaluate(`(() => {
    const panel = document.querySelector("#tec-panel");
    const header = panel?.querySelector(".tec-panel-head");
    if (!panel || !header) return null;
    const rect = panel.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    return {
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      },
      headerRect: {
        left: headerRect.left,
        top: headerRect.top,
        right: headerRect.right,
        bottom: headerRect.bottom,
        width: headerRect.width,
        height: headerRect.height
      },
      inlineStyle: {
        left: panel.style.left,
        top: panel.style.top,
        right: panel.style.right,
        bottom: panel.style.bottom
      },
      cursor: getComputedStyle(header).cursor,
      viewport: {
        width: innerWidth,
        height: innerHeight,
        clientWidth: document.documentElement.clientWidth
      }
    };
  })()`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

ws.addEventListener("message", async (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Fetch.requestPaused") {
    const { requestId, request } = message.params;
    try {
      if (request.url.startsWith(TEST_URL)) {
        await send("Fetch.fulfillRequest", {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "Content-Type", value: "text/html; charset=utf-8" },
            { name: "Cache-Control", value: "no-store" },
          ],
          body: Buffer.from(TEST_HTML, "utf8").toString("base64"),
        });
      } else {
        await send("Fetch.continueRequest", { requestId });
      }
    } catch (error) {
      console.error("Request interception failed:", error.message);
    }
    return;
  }
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
});

ws.addEventListener("open", async () => {
  const report = {
    testUrl: TEST_URL,
    initial: null,
    afterDrag: null,
    afterReload: null,
    afterOutOfBoundsDrag: null,
    afterDoubleClick: null,
    checks: {},
  };
  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Fetch.enable", {
      patterns: [{ urlPattern: TEST_URL, requestStage: "Request" }],
    });
    await send("Page.navigate", { url: TEST_URL });
    await waitFor(`Boolean(document.querySelector("#tec-panel .tec-panel-head"))`);
    await sleep(600);

    report.initial = await panelState();
    assert(report.initial.cursor === "move", "标题栏 cursor 不是 move");

    const startX =
      report.initial.headerRect.left + report.initial.headerRect.width / 2;
    const startY =
      report.initial.headerRect.top + report.initial.headerRect.height / 2;
    const targetPanelX = 36;
    const targetPanelY = 58;
    const offsetX = startX - report.initial.rect.left;
    const offsetY = startY - report.initial.rect.top;
    const endX = targetPanelX + offsetX;
    const endY = targetPanelY + offsetY;

    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: startX,
      y: startY,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: startX,
      y: startY,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: endX,
      y: endY,
      button: "left",
      buttons: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: endX,
      y: endY,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await sleep(500);
    report.afterDrag = await panelState();
    const draggedRect = report.afterDrag.rect;
    assert(
      Math.abs(draggedRect.left - targetPanelX) <= 2 &&
        Math.abs(draggedRect.top - targetPanelY) <= 2,
      `工具条未移动到目标位置：${JSON.stringify(draggedRect)}`,
    );
    assert(
      draggedRect.left >= 8 &&
        draggedRect.top >= 8 &&
        draggedRect.right <= report.afterDrag.viewport.width - 8 + 0.5 &&
        draggedRect.bottom <= report.afterDrag.viewport.height - 8 + 0.5,
      `拖动后工具条超出视口：${JSON.stringify(draggedRect)}`,
    );
    assert(
      report.afterDrag.inlineStyle.right === "auto" &&
        report.afterDrag.inlineStyle.bottom === "auto",
      "拖动后没有解除默认 right/bottom 定位",
    );

    await send("Page.reload", { ignoreCache: true });
    await waitFor(`Boolean(document.querySelector("#tec-panel .tec-panel-head"))`);
    await sleep(700);
    report.afterReload = await panelState();
    assert(
      Math.abs(report.afterReload.rect.left - draggedRect.left) <= 2 &&
        Math.abs(report.afterReload.rect.top - draggedRect.top) <= 2,
      `刷新后位置未恢复：${JSON.stringify(report.afterReload.rect)}`,
    );

    const reloadStartX =
      report.afterReload.headerRect.left +
      report.afterReload.headerRect.width / 2;
    const reloadStartY =
      report.afterReload.headerRect.top +
      report.afterReload.headerRect.height / 2;
    const reloadOffsetX = reloadStartX - report.afterReload.rect.left;
    const reloadOffsetY = reloadStartY - report.afterReload.rect.top;
    const outsideX =
      report.afterReload.viewport.width + 240 + reloadOffsetX;
    const outsideY =
      report.afterReload.viewport.height + 240 + reloadOffsetY;
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: reloadStartX,
      y: reloadStartY,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: reloadStartX,
      y: reloadStartY,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: outsideX,
      y: outsideY,
      button: "left",
      buttons: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: outsideX,
      y: outsideY,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await sleep(400);
    report.afterOutOfBoundsDrag = await panelState();
    const clampedRect = report.afterOutOfBoundsDrag.rect;
    assert(
      clampedRect.left >= 8 &&
        clampedRect.top >= 8 &&
        clampedRect.right <=
          report.afterOutOfBoundsDrag.viewport.width - 8 + 0.5 &&
        clampedRect.bottom <=
          report.afterOutOfBoundsDrag.viewport.height - 8 + 0.5,
      `越界拖动后未限制在视口内：${JSON.stringify(clampedRect)}`,
    );

    await evaluate(`document
      .querySelector("#tec-panel .tec-panel-head")
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }))`);
    await sleep(300);
    report.afterDoubleClick = await panelState();
    assert(
      !report.afterDoubleClick.inlineStyle.left &&
        !report.afterDoubleClick.inlineStyle.top &&
        !report.afterDoubleClick.inlineStyle.right &&
        !report.afterDoubleClick.inlineStyle.bottom,
      "双击后没有清除拖动定位",
    );
    const defaultMargin =
      report.afterDoubleClick.viewport.width <= 760 ? 10 : 18;
    const expectedRight =
      (defaultMargin === 10
        ? report.afterDoubleClick.viewport.clientWidth
        : report.afterDoubleClick.viewport.width) - defaultMargin;
    const expectedBottom =
      report.afterDoubleClick.viewport.height - defaultMargin;
    assert(
      Math.abs(report.afterDoubleClick.rect.right - expectedRight) <= 2 &&
        Math.abs(report.afterDoubleClick.rect.bottom - expectedBottom) <= 2,
      `双击后未恢复右下角：${JSON.stringify(report.afterDoubleClick.rect)}`,
    );

    report.checks = {
      titleBarDraggable: true,
      movedToRequestedPosition: true,
      remainedInsideViewport: true,
      persistedAcrossReload: true,
      clampedAfterOutOfBoundsDrag: true,
      doubleClickReset: true,
    };
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    try {
      await send("Fetch.disable");
    } catch {
      // Browser may already be closing.
    }
    ws.close();
  }
});

ws.addEventListener("error", (event) => {
  console.error("WebSocket error:", event.message || event.type);
  process.exitCode = 1;
});
