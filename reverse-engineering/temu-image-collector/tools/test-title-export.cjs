const fs = require("fs");
const path = require("path");

const [, , wsUrl, downloadDir] = process.argv;
if (!wsUrl || !downloadDir) {
  console.error(
    "Usage: node tools/test-title-export.cjs <page-ws-url> <download-dir>",
  );
  process.exit(1);
}

const TEST_URL = "https://www.temu.com/mall.html?tec_title_export_test=1";
const IMAGE_URL = "https://img.kwcdn.com/tec-test/product.png";
const TEST_TITLE = "Warm & Fluffy <Fleece> Lounge Pants, Cozy 冬季 Sweatpants";
const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TEST_HTML = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8"><title>标题导出测试</title></head>
  <body>
    <article data-tooltip="goodContainer-123456789012">
      <a href="https://www.temu.com/test-product-g-123456789012.html" aria-label="Warm &amp; Fluffy &lt;Fleece&gt; Lounge Pants, Cozy 冬季 Sweatpants">
        <img class="goods-img-external" src="${IMAGE_URL}" alt="item picture">
      </a>
    </article>
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

async function waitFor(expression, timeoutMs = 20000) {
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

async function waitForZip(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const files = fs.existsSync(downloadDir)
      ? fs.readdirSync(downloadDir)
      : [];
    const zipName = files.find((name) => name.endsWith(".zip"));
    const partial = files.some(
      (name) => name.endsWith(".crdownload") || name.endsWith(".tmp"),
    );
    if (zipName && !partial) {
      const zipPath = path.join(downloadDir, zipName);
      const size = fs.statSync(zipPath).size;
      if (size > 0) return { zipPath, size };
    }
    await sleep(300);
  }
  throw new Error("Timed out waiting for downloaded ZIP");
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
      } else if (request.url.startsWith(IMAGE_URL)) {
        await send("Fetch.fulfillRequest", {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "Content-Type", value: "image/png" },
            { name: "Cache-Control", value: "no-store" },
            { name: "Access-Control-Allow-Origin", value: "*" },
          ],
          body: ONE_PIXEL_PNG,
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
  try {
    fs.mkdirSync(downloadDir, { recursive: true });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloadDir,
      eventsEnabled: true,
    });
    await send("Fetch.enable", {
      patterns: [
        { urlPattern: "https://www.temu.com/mall.html*", requestStage: "Request" },
        { urlPattern: "https://img.kwcdn.com/tec-test/*", requestStage: "Request" },
      ],
    });
    await send("Page.navigate", { url: TEST_URL });
    await waitFor(`Boolean(document.querySelector(".tec-select-button"))`);
    await evaluate(`(() => {
      document.querySelector(".tec-select-button").click();
      return true;
    })()`);
    await waitFor(
      `document.querySelector("#tec-start") && !document.querySelector("#tec-start").disabled`,
    );
    await evaluate(`(() => {
      const mode = document.querySelector("#tec-mode");
      mode.value = "simple";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector("#tec-start").click();
      return {
        selected: document.querySelector("#tec-summary").textContent,
        titleEnabled: document.querySelector("#tec-collect-title").checked
      };
    })()`);
    const download = await waitForZip();
    await waitFor(
      `document.querySelector("#tec-start") && document.querySelector("#tec-start").textContent === "开始采集"`,
      20000,
    );
    console.log(
      JSON.stringify(
        {
          testUrl: TEST_URL,
          expectedTitle: TEST_TITLE,
          ...download,
          progress: await evaluate(
            `document.querySelector("#tec-progress-text").textContent`,
          ),
        },
        null,
        2,
      ),
    );
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
