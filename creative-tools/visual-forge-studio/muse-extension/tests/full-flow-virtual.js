"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

const extensionDir = path.resolve(__dirname, "..");
const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];
const browserPath = edgeCandidates.find((candidate) => fs.existsSync(candidate));

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForTargets(port, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) return response.json();
    } catch {
      // Browser is still starting.
    }
    await delay(200);
  }
  throw new Error("Timed out waiting for the browser debugging endpoint");
}

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const listeners = new Map();
  const exceptions = [];
  let nextId = 1;
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(
        message.params?.exceptionDetails?.exception?.description ||
          message.params?.exceptionDetails?.text ||
          "Unknown page exception",
      );
    }
    for (const listener of listeners.get(message.method) || []) {
      void listener(message.params);
    }
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error("CDP connection failed"));
  });
  return {
    exceptions,
    on(method, listener) {
      const handlers = listeners.get(method) || [];
      handlers.push(listener);
      listeners.set(method, handlers);
    },
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text,
    );
  }
  return result.result.value;
}

async function createPage(port, url) {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
    { method: "PUT" },
  );
  if (!response.ok) throw new Error(`Could not create page: ${response.status}`);
  return response.json();
}

async function browserClose(port) {
  try {
    const version = await (
      await fetch(`http://127.0.0.1:${port}/json/version`)
    ).json();
    const client = await connect(version.webSocketDebuggerUrl);
    await client.send("Browser.close");
    client.close();
  } catch {
    // The browser may already be closing.
  }
}

function mockMuseExpression() {
  return `(() => {
    document.querySelectorAll(".vf-fullflow-mock").forEach((node) => node.remove());
    document.body.insertAdjacentHTML("beforeend", \`
      <form class="vf-fullflow-mock" style="position:fixed;left:20px;bottom:20px;z-index:2147483647;background:white;padding:10px">
        <textarea id="vf-fullflow-composer" style="width:320px;height:80px"></textarea>
        <input id="vf-fullflow-file" type="file" accept="image/*">
        <button id="vf-fullflow-send" type="button" aria-label="Send message">Send</button>
        <div id="vf-fullflow-images"></div>
      </form>
    \`);
    document.querySelector("#vf-fullflow-send").addEventListener("click", () => {
      const prompt = document.querySelector("#vf-fullflow-composer").value;
      const match = prompt.match(/本批必须输出 (\\d+) 张/);
      const count = match ? Number(match[1]) : 1;
      const color = prompt.match(/#[0-9A-F]{6}/i)?.[0] || "#8C1A2D";
      for (let index = 0; index < count; index += 1) {
        const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="520">
          <rect width="420" height="520" fill="#e7e2d8"/>
          <path d="M95 110H325L285 475H135Z" fill="\${color}"/>
          <path d="M150 110Q210 65 270 110" fill="none" stroke="#202a27" stroke-width="8"/>
        </svg>\`;
        const image = new Image();
        image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        image.style.cssText = "width:300px;height:380px;display:block";
        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-testid", "hatch-chat-attachment-presentation-image");
        wrapper.append(image);
        document.querySelector("#vf-fullflow-images").append(wrapper);
      }
    });
    return true;
  })()`;
}

async function main() {
  if (!browserPath) throw new Error("No supported Chromium browser was found");
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "visualforge-e2e-"));
  const browser = spawn(
    browserPath,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      "about:blank",
    ],
    { stdio: "ignore", windowsHide: true },
  );
  let museClient;
  let frameClient;
  try {
    await waitForTargets(port);
    const museTarget = await createPage(port, "about:blank");
    museClient = await connect(museTarget.webSocketDebuggerUrl);
    await museClient.send("Runtime.enable");
    await museClient.send("Page.enable");
    const mockHtml = `<!doctype html>
      <html lang="zh-CN">
        <head><meta charset="utf-8"><title>Virtual Muse</title></head>
        <body>
          <main id="virtual-muse">Virtual Muse test workspace</main>
        </body>
      </html>`;
    await museClient.send("Fetch.enable", {
      patterns: [
        {
          urlPattern: "https://muse.ai/*",
          requestStage: "Request",
        },
      ],
    });
    museClient.on("Fetch.requestPaused", async (event) => {
      try {
        if (new URL(event.request.url).pathname === "/") {
          const body = Buffer.from(mockHtml).toString("base64");
          const rawResponse = Buffer.from(
            "HTTP/1.1 200 OK\r\n" +
              "Content-Type: text/html; charset=utf-8\r\n" +
              `Content-Length: ${Buffer.byteLength(mockHtml)}\r\n` +
              "Cache-Control: no-store\r\n" +
              "Connection: close\r\n\r\n" +
              mockHtml,
          ).toString("base64");
          void body;
          await museClient.send("Fetch.fulfillRequest", {
            requestId: event.requestId,
            responseCode: 200,
            responseHeaders: [
              { name: "Content-Type", value: "text/html; charset=utf-8" },
              { name: "Cache-Control", value: "no-store" },
            ],
            body: Buffer.from(mockHtml).toString("base64"),
          });
        } else {
          await museClient.send("Fetch.fulfillRequest", {
            requestId: event.requestId,
            responseCode: 204,
            responseHeaders: [],
            body: "",
          });
        }
      } catch {
        // The target may be closing.
      }
    });
    await museClient.send("Page.navigate", { url: "https://muse.ai/" });
    await delay(1800);
    await evaluate(museClient, mockMuseExpression());
    let widgetReady = false;
    const widgetDeadline = Date.now() + 10000;
    while (Date.now() < widgetDeadline) {
      widgetReady = await evaluate(
        museClient,
        `Boolean(document.querySelector("#vf-widget-frame"))`,
      );
      if (widgetReady) break;
      await delay(250);
    }
    if (!widgetReady) {
      throw new Error("Muse mock page did not receive the Visual Forge content script");
    }
    await evaluate(
      museClient,
      `(() => {
        const launcher = document.querySelector("#vf-widget-launcher");
        if (launcher && launcher.style.display !== "none") launcher.click();
        return true;
      })()`,
    );
    await fetch(`http://127.0.0.1:${port}/json/activate/${museTarget.id}`);

    let frameTarget;
    const frameDeadline = Date.now() + 10000;
    while (Date.now() < frameDeadline) {
      frameTarget = (await waitForTargets(port)).find(
        (target) =>
          target.type === "iframe" &&
          /\/sidepanel\.html\?embedded=1$/.test(target.url),
      );
      if (frameTarget) break;
      await delay(150);
    }
    if (!frameTarget) throw new Error("Side panel iframe did not load");
    frameClient = await connect(frameTarget.webSocketDebuggerUrl);
    await frameClient.send("Runtime.enable");
    await delay(800);

    const report = await evaluate(
      frameClient,
      `(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (predicate, message, timeout = 30000) => {
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            const value = await predicate();
            if (value) return value;
            await wait(100);
          }
          throw new Error(message);
        };
        const makeFile = async (name, color, relativePath = "") => {
          const canvas = document.createElement("canvas");
          canvas.width = 240;
          canvas.height = 300;
          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = color;
          context.fillRect(42, 48, 156, 204);
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
          const file = new File([blob], name, { type: "image/png" });
          if (relativePath) {
            Object.defineProperty(file, "webkitRelativePath", {
              value: relativePath,
              configurable: true,
            });
          }
          return file;
        };
        const clearMainFiles = () => {
          let button = document.querySelector("#vfFiles .vf-file button");
          while (button) {
            button.click();
            button = document.querySelector("#vfFiles .vf-file button");
          }
        };
        const setMainFiles = (files) => {
          const transfer = new DataTransfer();
          files.forEach((file) => transfer.items.add(file));
          const input = document.querySelector("#vfFileInput");
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const setInputFiles = (selector, files) => {
          const transfer = new DataTransfer();
          files.forEach((file) => transfer.items.add(file));
          const input = document.querySelector(selector);
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const waitForJob = async (kind, timeout = 60000, since = Date.now()) => {
          const started = since;
          let job = null;
          let lastJobs = [];
          await waitFor(async () => {
            lastJobs = await VisualForgeJobs.list(50);
            job = lastJobs.find(
              (item) =>
                item.kind === kind &&
                new Date(item.created_at).getTime() >= started - 1000,
            );
            return job && ["succeeded", "failed"].includes(job.status);
          }, "Task did not finish: " + kind, timeout).catch((error) => {
            throw new Error(
              error.message +
                " :: " +
                JSON.stringify({
                  started,
                  lastJobs: lastJobs.map((item) => ({
                    kind: item.kind,
                    status: item.status,
                    createdAt: item.created_at,
                    error: item.error,
                    message: item.message,
                  })),
                  taskState: document.querySelector("#vfTaskState")?.textContent,
                  toast: document.querySelector("#vfToast")?.textContent,
                  files: [...document.querySelectorAll("#vfFiles .vf-file")].map(
                    (node) => node.textContent,
                  ),
                }),
            );
          });
          if (job.status !== "succeeded") {
            throw new Error(kind + " failed: " + (job.error || job.message));
          }
          return job;
        };
        const waitIdle = () =>
          waitFor(
            () =>
              document.querySelector("#vfTaskState")?.textContent ===
                "当前没有运行中的任务" &&
              [...document.querySelectorAll("[data-run]")].every(
                (button) => !button.disabled,
              ),
            "The side panel did not return to idle",
            10000,
          );

        await chrome.storage.local.set({
          modelConfig: {
            provider: "mock",
            baseUrl: "https://api.openai.com/v1",
            model: "gpt-image-1",
            apiKey: "",
          },
        });
        const opfs = await navigator.storage.getDirectory();
        const virtualRoot = {
          name: "VirtualForgeE2E",
          queryPermission: async () => "granted",
          requestPermission: async () => "granted",
          getDirectoryHandle: (...args) => opfs.getDirectoryHandle(...args),
          getFileHandle: (...args) => opfs.getFileHandle(...args),
        };
        const originalSetting = VisualForgeStore.getSetting.bind(VisualForgeStore);
        VisualForgeStore.getSetting = async (key, fallback = null) =>
          key === "archiveDirectory" ? virtualRoot : originalSetting(key, fallback);
        await refreshArchiveStatus();

        const results = {};

        // 1. 单 Logo 多色
        document.querySelector('[data-tab="recolor"]').click();
        clearMainFiles();
        setMainFiles([await makeFile("brand-logo.png", "#203050")]);
        document.querySelector("#vfColors").value = "#D4684F, #1D2A44";
        document.querySelector('[data-run="recolor"]').click();
        results.logo = await waitForJob("logo_recolor");
        await waitIdle();

        // 2. 单色多 Logo
        document.querySelector('[data-tab="batch"]').click();
        clearMainFiles();
        setMainFiles([
          await makeFile("logo-a.png", "#203050"),
          await makeFile("logo-b.png", "#803050"),
        ]);
        document.querySelector("#vfBatchColor").value = "#D4684F";
        document.querySelector('[data-run="batch"]').click();
        results.logoBatch = await waitForJob("logo_color_batch");
        await waitIdle();

        // 3. 商品配色：真实调用内容脚本模拟 Muse，再走扩展内校色。
        document.querySelector('[data-tab="product"]').click();
        clearMainFiles();
        setMainFiles([await makeFile("product-master.png", "#222222")]);
        document.querySelector("#vfProductColors").value = "#8C1A2D, #1D2A44";
        document.querySelector('[data-run="product"]').click();
        results.productColor = await waitForJob("product_color_finalize", 90000);
        await waitIdle();

        // 4. 印花套图：两个参考图在一个虚拟任务目录内完成。
        document.querySelector('[data-tab="generate"]').click();
        document.querySelector('[data-generate-mode="pattern"]').click();
        setInputFiles("#vfPatternBase", [await makeFile("white-base.png", "#eeeeee")]);
        setInputFiles("#vfPatternFolder", [
          await makeFile("floral-a.png", "#234A62", "refs/floral-a.png"),
          await makeFile("floral-b.png", "#7B3450", "refs/floral-b.png"),
        ]);
        await waitFor(
          () => !document.querySelector("#vfPatternBatchSummary").hidden,
          "Pattern ZIP batches were not built",
        );
        document.querySelector("#vfRunPattern").click();
        results.pattern = await waitForJob("pattern_batch_finalize", 90000);
        await waitIdle();

        // 5. 产品文生图，同时验证暂停和恢复。
        document.querySelector('[data-generate-mode="text"]').click();
        document.querySelector("#vfPrompt").value = "极简白色陶瓷杯，哑光釉面";
        document.querySelector("#vfCount").value = "4";
        const generateStarted = Date.now();
        const baseProvider = await VisualForgeModel.createProvider();
        VisualForgeModel.createProvider = async () => ({
          ...baseProvider,
          async generate(prompt, size, quality) {
            await wait(600);
            return baseProvider.generate(prompt, size, quality);
          },
        });
        document.querySelector('[data-run="generate"]').click();
        await waitFor(
          () => !document.querySelector("#vfPauseTask").disabled,
          "Pause button did not become available",
          10000,
        );
        document.querySelector("#vfPauseTask").click();
        await wait(100);
        const pauseJob = (await VisualForgeJobs.list(10)).find(
          (job) => job.kind === "product_generate" && job.status === "running",
        );
        const pausedAt = pauseJob?.progress || 0;
        await wait(1200);
        const stillPaused = pauseJob
          ? await VisualForgeJobs.get(pauseJob.id)
          : null;
        document.querySelector("#vfPauseTask").click();
        results.generate = await waitForJob(
          "product_generate",
          90000,
          generateStarted - 1000,
        );
        results.pause = {
          pausedAt,
          progressWhilePaused: stillPaused?.progress,
          statusWhilePaused: stillPaused?.status,
        };

        const listTree = async (directory, prefix = "") => {
          const rows = [];
          for await (const [name, handle] of directory.entries()) {
            const item = prefix ? prefix + "/" + name : name;
            if (handle.kind === "directory") {
              rows.push({ path: item, kind: "directory" });
              rows.push(...await listTree(handle, item));
            } else {
              rows.push({ path: item, kind: "file" });
            }
          }
          return rows;
        };
        const tree = await listTree(opfs);
        const summarize = (job) => ({
          status: job.status,
          images: (job.outputs || []).filter(
            (asset) => asset.display !== false && asset.type?.startsWith("image/"),
          ).length,
          archive: job.export_path,
          archiveError: job.archive_error,
        });
        return JSON.stringify({
          directory: document.querySelector("#vfExportPath").textContent,
          model: document.querySelector("#vfConnection span").textContent,
          results: Object.fromEntries(
            Object.entries(results).map(([key, value]) => [
              key,
              key === "pause" ? value : summarize(value),
            ]),
          ),
          historyCount: (await VisualForgeJobs.list(50)).length,
          tree,
        });
      })()`,
      true,
    );
    const payload = JSON.parse(report);
    for (const name of ["logo", "logoBatch", "productColor", "pattern", "generate"]) {
      if (payload.results[name]?.status !== "succeeded") {
        throw new Error(`${name} did not succeed: ${JSON.stringify(payload)}`);
      }
      if (!payload.results[name]?.archive || payload.results[name]?.archiveError) {
        throw new Error(`${name} archive failed: ${JSON.stringify(payload)}`);
      }
    }
    if (
      payload.results.pause?.statusWhilePaused === "succeeded" ||
      payload.results.pause?.progressWhilePaused >
        payload.results.pause?.pausedAt + 30
    ) {
      throw new Error(`Pause behavior failed: ${JSON.stringify(payload.results.pause)}`);
    }
    if (payload.historyCount < 5) {
      throw new Error(`History is incomplete: ${payload.historyCount}`);
    }
    if (!payload.tree.some((entry) => entry.kind === "directory" && entry.path.startsWith("印花套图_"))) {
      throw new Error("Pattern archive root was not created");
    }
    if (!payload.tree.some((entry) => entry.path.includes("/生成图"))) {
      throw new Error("Pattern generated-image directory was not created");
    }
    if (!payload.tree.some((entry) => entry.path.includes("/拼图与清单"))) {
      throw new Error("Pattern summary directory was not created");
    }
    if (frameClient.exceptions.length) {
      throw new Error(`Side panel exceptions: ${frameClient.exceptions.join(" | ")}`);
    }
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    frameClient?.close();
    museClient?.close();
    await browserClose(port);
    await delay(500);
    if (!browser.killed) browser.kill();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
