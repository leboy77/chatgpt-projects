const fs = require("fs");
const path = require("path");

const [, , wsUrl, downloadDir] = process.argv;
if (!wsUrl || !downloadDir) {
  console.error(
    "Usage: node tools/test-recommendation-filter.cjs <page-ws-url> <download-dir>",
  );
  process.exit(1);
}

const TEST_URL = "https://www.temu.com/mall.html?tec_recommendation_filter_test=1";
const IMAGE_PREFIX = "https://img.kwcdn.com/tec-rec/";
const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function productCard(id, title, withAd = false) {
  return `<article data-tooltip="goodContainer-${id}">
    <a href="https://www.temu.com/test-${id}-g-${id}.html" aria-label="${title}">
      <img class="goods-img-external" src="${IMAGE_PREFIX}${id}.png" alt="">
    </a>
    ${withAd ? '<div class="ad-badge">AD</div>' : ""}
  </article>`;
}

const TEST_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <title>推荐区过滤测试</title>
    <style>
      .grid { display: grid; grid-template-columns: repeat(2, 240px); gap: 20px; }
      article { display: block; height: 260px; }
      article a { display: block; height: 220px; }
      .goods-img-external { height: 200px; width: 200px; }
      .ad-badge { height: 20px; width: 23px; }
      h2 { margin: 24px 0 8px; }
    </style>
  </head>
  <body>
    <div class="js-goods-list" id="recommendations">
      <div>Top picks for you</div>
      <div class="grid">
        ${productCard("111111111111", "Recommended AD product", true)}
        ${productCard("222222222222", "Recommended organic product", false)}
      </div>
    </div>
    <div class="js-goods-list" id="normal-products">
      <h2>Products</h2>
      <div class="grid">
        ${productCard("333333333333", "Normal collectable product", false)}
        ${productCard("444444444444", "Normal AD product", true)}
      </div>
    </div>
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
      } else if (request.url.startsWith(IMAGE_PREFIX)) {
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
        {
          urlPattern: "https://www.temu.com/mall.html*",
          requestStage: "Request",
        },
        {
          urlPattern: "https://img.kwcdn.com/tec-rec/*",
          requestStage: "Request",
        },
      ],
    });
    await send("Page.navigate", { url: TEST_URL });
    await waitFor(
      `document.querySelector("#tec-summary")?.textContent.includes("已忽略推荐/广告 3 个")`,
    );
    const beforeStart = await evaluate(`(() => ({
      summary: document.querySelector("#tec-summary").textContent,
      collectableIds: [...document.querySelectorAll(".tec-select-button")]
        .map((button) => button.dataset.tecId),
      recommendationButtons:
        document.querySelectorAll("#recommendations .tec-select-button").length,
      advertisedButtons:
        document.querySelectorAll("article:has(.ad-badge) .tec-select-button").length
    }))()`);
    await evaluate(`document.querySelector("#tec-select-all").click()`);
    await waitFor(
      `document.querySelector("#tec-summary").textContent.includes("已选 1 个")`,
    );
    const afterSelectAll = await evaluate(
      `document.querySelector("#tec-summary").textContent`,
    );
    await evaluate(`(() => {
      const mode = document.querySelector("#tec-mode");
      mode.value = "simple";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector("#tec-start").click();
      return true;
    })()`);
    const download = await waitForZip();
    await waitFor(
      `document.querySelector("#tec-start")?.textContent === "开始采集"`,
    );
    console.log(
      JSON.stringify(
        {
          testUrl: TEST_URL,
          beforeStart,
          afterSelectAll,
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
