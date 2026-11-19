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
    window.__vfAutoAsked = false;
    window.__vfTimeoutAsked = false;
    window.__vfDeclineDirectAsked = false;
    window.__vfDeclineProductAsked = false;
    window.__vfTextOnlyMode = "";
    window.__vfTextOnlyRegenerateCount = 0;
    window.__vfPrompts = [];
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
      window.__vfPrompts.push(prompt);
      document.querySelector("#vf-fullflow-composer").value = "";
      if (prompt.includes("AUTO_CONTINUE_TEST") && !window.__vfAutoAsked) {
        window.__vfAutoAsked = true;
        const message = document.createElement("div");
        message.setAttribute("data-testid", "assistant-message");
        message.textContent = "是否需要我继续生成？";
        message.style.cssText = "margin:12px;padding:10px;background:#f2f4f7";
        document.body.insertBefore(
          message,
          document.querySelector(".vf-fullflow-mock"),
        );
        return;
      }
      if (prompt.includes("AUTO_TIMEOUT_TEST") && !window.__vfTimeoutAsked) {
        window.__vfTimeoutAsked = true;
        return;
      }
      if (prompt.includes("TEXT_ONLY_ONCE_TEST")) {
        window.__vfTextOnlyMode = "once";
        window.__vfTextOnlyRegenerateCount = 0;
        const message = document.createElement("div");
        message.setAttribute("data-testid", "assistant-message");
        message.textContent = "我已经完成处理，请查看本次结果。";
        message.style.cssText = "margin:12px;padding:10px;background:#fff3e8";
        document.body.insertBefore(
          message,
          document.querySelector(".vf-fullflow-mock"),
        );
        return;
      }
      if (prompt.trim() === "重新生成" && window.__vfTextOnlyMode) {
        window.__vfTextOnlyRegenerateCount += 1;
        const mode = window.__vfTextOnlyMode;
        window.__vfTextOnlyMode = "";
        if (mode === "twice" || window.__vfTextOnlyRegenerateCount > 1) {
          const message = document.createElement("div");
          message.setAttribute("data-testid", "assistant-message");
          message.textContent = "我暂时没有生成图片结果。";
          message.style.cssText =
            "margin:12px;padding:10px;background:#fff3e8";
          document.body.insertBefore(
            message,
            document.querySelector(".vf-fullflow-mock"),
          );
          return;
        }
      }
      const declineDirect =
        prompt.includes("DECLINE_TEST") && !window.__vfDeclineDirectAsked;
      const declineProduct =
        prompt.includes("PRODUCT_DECLINE_TEST") &&
        !window.__vfDeclineProductAsked;
      if (declineDirect || declineProduct) {
        if (declineDirect) window.__vfDeclineDirectAsked = true;
        if (declineProduct) window.__vfDeclineProductAsked = true;
        const message = document.createElement("div");
        message.setAttribute("data-testid", "assistant-message");
        message.textContent =
          "第 1 个颜色这次没做出来，生成失败了。你可以选一个：换一个新对话，或者先做第 2 个颜色。你看怎么安排？";
        message.style.cssText = "margin:12px;padding:10px;background:#fff3e8";
        document.body.insertBefore(
          message,
          document.querySelector(".vf-fullflow-mock"),
        );
        return;
      }
      if (prompt.includes("BATCH_FAIL_TEST")) {
        const error = document.createElement("span");
        error.textContent = "Delivery not confirmed";
        document.body.append(error);
        return;
      }
      if (prompt.includes("DOM_DETACH_TEST")) {
        window.__vfFullFlowSerial = (window.__vfFullFlowSerial || 0) + 1;
        const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="520">
          <rect width="420" height="520" fill="#e7e2d8"/>
          <path d="M95 110H325L285 475H135Z" fill="#21506D"/>
          <circle cx="210" cy="180" r="80" fill="rgba(255,150,80,.55)"/>
        </svg>\`;
        const image = new Image();
        image.src =
          "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        const wrapper = document.createElement("div");
        wrapper.setAttribute(
          "data-testid",
          "hatch-chat-attachment-presentation-image",
        );
        wrapper.append(image);
        document.body.append(wrapper);
        setTimeout(() => wrapper.remove(), 0);
        return;
      }
      if (prompt.includes("只返回一个可播放的视频附件")) {
        window.__vfVideoLastPrompt = prompt;
        window.__vfFullFlowSerial = (window.__vfFullFlowSerial || 0) + 1;
        const serial = window.__vfFullFlowSerial;
        const video = document.createElement("video");
        const payload = btoa("visualforge-video-" + serial).replaceAll("=", "");
        video.src = "data:video/mp4;base64," + payload;
        video.controls = true;
        video.muted = true;
        video.style.cssText = "width:300px;height:220px;display:block";
        const wrapper = document.createElement("div");
        wrapper.setAttribute(
          "data-testid",
          "hatch-chat-attachment-presentation-video",
        );
        wrapper.append(video);
        document.querySelector("#vf-fullflow-images").append(wrapper);
        return;
      }
      document
        .querySelector('[data-testid="assistant-message"]')
        ?.remove();
      const match = prompt.match(/(?:本次对话必须输出|本批必须输出) (\\d+) 张/);
      const count = match ? Number(match[1]) : 1;
      const color = prompt.match(/#[0-9A-F]{6}/i)?.[0] || "#8C1A2D";
      window.__vfFullFlowSerial = (window.__vfFullFlowSerial || 0) + 1;
      const serial = window.__vfFullFlowSerial;
      for (let index = 0; index < count; index += 1) {
        const imageSerial = serial * 10 + index + 1;
        const layoutSerial =
          imageSerial === 5 || imageSerial === 6 ? 2 : imageSerial;
        const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="520">
          <rect width="420" height="520" fill="#e7e2d8"/>
          <path d="M95 110H325L285 475H135Z" fill="\${color}"/>
          <path d="M150 110Q210 65 270 110" fill="none" stroke="#202a27" stroke-width="8"/>
          <circle cx="\${40 + (layoutSerial * 73) % 340}" cy="\${60 + (layoutSerial * 47) % 400}" r="\${22 + (layoutSerial * 7) % 70}" fill="rgba(255,150,80,.45)"/>
          <rect x="\${20 + (layoutSerial * 11) % 260}" y="\${80 + (layoutSerial * 9) % 350}" width="120" height="58" rx="16" fill="rgba(35,60,90,.38)"/>
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
        let immediateDownloadCalls = 0;
        const originalDownload = chrome.downloads?.download;
        if (chrome.downloads) {
          chrome.downloads.download = (_options, callback) => {
            immediateDownloadCalls += 1;
            setTimeout(() => callback?.(immediateDownloadCalls), 0);
            return immediateDownloadCalls;
          };
        }

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
        let autoContinueWorked = false;
        let autoTimeoutWorked = false;
        document.querySelector('[data-tab="prompts"]').click();
        const promptTemplateCount =
          document.querySelectorAll("[data-prompt-key]").length;
        const initialInterfaceScale = state.interfaceScale;
        document.querySelector("#vfFontIncrease").click();
        await wait(150);
        const increasedInterfaceScale = state.interfaceScale;
        const interfaceScaleCss = getComputedStyle(
          document.documentElement,
        ).getPropertyValue("--vf-ui-scale").trim();
        const interfaceScaleLabel =
          document.querySelector("#vfFontScaleValue").textContent;
        const storedInterfaceScale = (
          await chrome.storage.local.get("interfaceScale")
        ).interfaceScale;
        document.querySelector("#vfFontScaleValue").click();
        await wait(100);
        const resetInterfaceScale = state.interfaceScale;
        const manyPatternRefs = await Promise.all(
          Array.from({ length: 201 }, (_, index) =>
            makeFile(
              "pattern-" + String(index + 1).padStart(3, "0") + ".png",
              index % 2 ? "#335577" : "#773355",
              "refs/pattern-" + String(index + 1).padStart(3, "0") + ".png",
            ),
          ),
        );
        const manyPatternPlan = await buildPatternBatches(manyPatternRefs, 4);
        const patternBatchCoverage = {
          valid: manyPatternPlan.valid.length,
          batches: manyPatternPlan.batches.length,
          files: manyPatternPlan.batches.flatMap((batch) => batch.files).length,
        };
        document.querySelector('[data-tab="product"]').click();
        const savedModeTasks = [];
        const queueDispatchModes = [];
        clearMainFiles();
        setMainFiles([await makeFile("queued-color.png", "#222222")]);
        document.querySelector("#vfProductColors").value = "#8C1A2D, #1D2A44";
        document.querySelector("#vfColorRequestMode").value = "batch";
        document.querySelector("#vfColorBatchSize").value = "2";
        document.querySelector("#vfSaveColorTask").click();
        await waitFor(
          async () =>
            (await VisualForgeStore.listTasks()).some(
              (task) => task.module === "product_color",
            ),
          "Product color task was not saved",
        );
        savedModeTasks.push("product_color");

        document.querySelector('[data-tab="recolor"]').click();
        clearMainFiles();
        setMainFiles([await makeFile("queued-logo.png", "#203050")]);
        document.querySelector("#vfColors").value = "#D4684F, #1D2A44";
        document.querySelector("#vfSaveRecolorTask").click();
        await waitFor(
          async () =>
            (await VisualForgeStore.listTasks()).some(
              (task) => task.module === "logo_recolor",
            ),
          "Logo recolor task was not saved",
        );
        savedModeTasks.push("logo_recolor");

        document.querySelector('[data-tab="batch"]').click();
        clearMainFiles();
        setMainFiles([await makeFile("queued-logo-image.png", "#203050")]);
        document.querySelector("#vfLogoPrompt").value = "改为新的几何字母 Logo";
        document.querySelector("#vfLogoRequestMode").value = "batch";
        document.querySelector("#vfLogoRequestCount").value = "2";
        document.querySelector("#vfLogoOutputCount").value = "2";
        document.querySelector("#vfLogoRequestCount").dispatchEvent(
          new Event("change", { bubbles: true }),
        );
        document.querySelector("#vfSaveLogoImageTask").click();
        await waitFor(
          async () =>
            (await VisualForgeStore.listTasks()).some(
              (task) => task.module === "logo_image_generate",
            ),
          "Logo redesign task was not saved",
        );
        const logoTasksAfterSave = (await VisualForgeStore.listTasks()).filter(
          (task) => task.module === "logo_image_generate",
        );
        const firstLogoTask = logoTasksAfterSave[0];
        document.querySelector("#vfNewLogoImageTask").click();
        await waitFor(
          async () =>
            (
              await VisualForgeStore.listTasks()
            ).filter((task) => task.module === "logo_image_generate").length ===
            2,
          "New Logo redesign task was not created",
        );
        const logoTasksAfterNew = (await VisualForgeStore.listTasks()).filter(
          (task) => task.module === "logo_image_generate",
        );
        const secondLogoTask = logoTasksAfterNew.find(
          (task) => task.id !== firstLogoTask.id,
        );
        const logoTaskEvidence = {
          firstId: firstLogoTask.id,
          secondId: secondLogoTask?.id,
          requestCount:
            firstLogoTask.options?.request_count ||
            firstLogoTask.request_count,
          batchCount:
            firstLogoTask.options?.output_count ||
            firstLogoTask.output_count,
          summary: document.querySelector("#vfLogoRequestSummary").textContent,
        };
        await VisualForgeStore.deleteTask(secondLogoTask.id);
        state.currentTaskIds.logo_image_generate = firstLogoTask.id;
        await renderCopyTasks();
        savedModeTasks.push("logo_image_generate");

        document.querySelector('[data-tab="generate"]').click();
        document.querySelector('[data-generate-mode="pattern"]').click();
        setInputFiles("#vfPatternBase", [await makeFile("queued-base.png", "#eeeeee")]);
        setInputFiles("#vfPatternFolder", [
          await makeFile("queued-pattern-a.png", "#234A62", "refs/a.png"),
          await makeFile("queued-pattern-b.png", "#7B3450", "refs/b.png"),
        ]);
        await waitFor(
          () => !document.querySelector("#vfPatternBatchSummary").hidden,
          "Pattern task inputs were not ready",
        );
        document.querySelector("#vfPatternRequestMode").value = "batch";
        document.querySelector("#vfPatternBatchSize").value = "2";
        document.querySelector("#vfPatternCategory").value = "upper";
        document.querySelector("#vfSavePatternTask").click();
        await waitFor(
          async () =>
            (await VisualForgeStore.listTasks()).some(
              (task) => task.module === "pattern_transfer",
            ),
          "Pattern task was not saved",
        );
        savedModeTasks.push("pattern_transfer");

        document.querySelector('[data-tab="video"]').click();
        setInputFiles("#vfVideoMain", [
          await makeFile("queued-video-product.png", "#304860"),
        ]);
        document.querySelector("#vfVideoPresentation").value = "worn_no_face";
        document.querySelector("#vfVideoCategory").value = "upper";
        document.querySelector("#vfVideoDuration").value = "8";
        document.querySelector("#vfVideoAspect").value = "9:16";
        document.querySelector("#vfVideoRequestCount").value = "2";
        document.querySelector("#vfSaveVideoTask").click();
        await waitFor(
          async () =>
            (await VisualForgeStore.listTasks()).some(
              (task) => task.module === "product_video_generate",
            ),
          "Product video task was not saved",
        );
        savedModeTasks.push("product_video_generate");
        const allSavedTasks = await VisualForgeStore.listTasks();
        const categoryTaskEvidence = {
          pattern:
            allSavedTasks.find(
              (task) => task.module === "pattern_transfer",
            )?.options?.category || null,
          video:
            allSavedTasks.find(
              (task) => task.module === "product_video_generate",
            )?.options?.category || null,
        };
        const originalRunProductColors = runProductColors;
        const originalRunLogoJob = runLogoJob;
        const originalRunPatternTransfer = runPatternTransfer;
        const originalRunProductVideo = runProductVideo;
        runProductColors = async () => ({ id: "dispatch-product-color" });
        runLogoJob = async (runType) => ({ id: "dispatch-" + runType });
        runPatternTransfer = async () => ({ id: "dispatch-pattern" });
        runProductVideo = async () => ({ id: "dispatch-video" });
        for (const task of allSavedTasks) {
          const result = await executeStoredTask(task, { fromQueue: true });
          if (result) queueDispatchModes.push(task.module);
        }
        runProductColors = originalRunProductColors;
        runLogoJob = originalRunLogoJob;
        runPatternTransfer = originalRunPatternTransfer;
        runProductVideo = originalRunProductVideo;
        for (const task of allSavedTasks) {
          await VisualForgeStore.deleteTask(task.id);
        }
        state.currentTaskIds = {};
        state.currentCopyTaskId = null;
        await renderCopyTasks();
        document.querySelector('[data-tab="product"]').click();

        // 1. 单 Logo 多色
        document.querySelector('[data-tab="recolor"]').click();
        clearMainFiles();
        setMainFiles([await makeFile("brand-logo.png", "#203050")]);
        document.querySelector("#vfColors").value = "#D4684F, #1D2A44";
        document.querySelector('[data-run="recolor"]').click();
        results.logo = await waitForJob("logo_recolor");
        await waitIdle();

        // 2. 一张商品主图内的 Logo 交给 Muse 重新设计
        document.querySelector('[data-tab="batch"]').click();
        clearMainFiles();
        setMainFiles([await makeFile("product-with-logos.png", "#203050")]);
        document.querySelector("#vfLogoPrompt").value =
          "改成简洁的几何字母标志，深蓝色，只替换图中已有的 Logo";
        document.querySelector('[data-run="batch"]').click();
        results.logoBatch = await waitForJob("logo_image_generate");
        const logoDesignAsset = (results.logoBatch.outputs || []).find(
          (asset) => asset.variant_type === "logo_design",
        );
        if (!logoDesignAsset) {
          throw new Error("Logo redesign job did not produce a generated image");
        }
        await waitIdle();
        state.promptTemplates.logo_design_batch =
          "BATCH_FAIL_TEST 本次对话必须输出 {{output_count}} 张独立图片";
        document.querySelector("#vfLogoRequestMode").value = "batch";
        document.querySelector("#vfLogoRequestCount").value = "1";
        document.querySelector("#vfLogoOutputCount").value = "2";
        const logoFallbackStarted = Date.now();
        document.querySelector('[data-run="batch"]').click();
        results.logoBatchFallback = await waitForJob(
          "logo_image_generate",
          90000,
          logoFallbackStarted,
        );
        await waitIdle();

        // 3. 商品配色：真实调用内容脚本模拟 Muse，再走扩展内校色。
        document.querySelector('[data-tab="product"]').click();
        clearMainFiles();
        setMainFiles([await makeFile("product-master.png", "#222222")]);
        document.querySelector("#vfProductColors").value = "#8C1A2D, #1D2A44";
        document.querySelector('[data-run="product"]').click();
        results.productColor = await waitForJob("product_color_finalize", 90000);
        await waitIdle();
        state.promptTemplates.product_color_batch =
          "BATCH_FAIL_TEST 本次对话必须输出 {{color_count}} 张独立图片";
        document.querySelector("#vfProductColors").value = "#243B53, #8A3348";
        const colorFallbackStarted = Date.now();
        document.querySelector('[data-run="product"]').click();
        results.productColorFallback = await waitForJob(
          "product_color_finalize",
          90000,
          colorFallbackStarted,
        );
        await waitIdle();
        const linksOnlyStarted = Date.now();
        document.querySelector("#vfLinksOnlyExport").checked = true;
        document.querySelector("#vfProductColors").value = "#3B5B7A";
        document.querySelector('[data-run="product"]').click();
        results.productColorLinksOnly = await waitForJob(
          "product_color_finalize",
          90000,
          linksOnlyStarted,
        );
        await waitIdle();
        document.querySelector("#vfLinksOnlyExport").checked = false;
        const declineTab = await getMuseTab();
        const declineMaster = await serializeFile(
          state.files[0],
          "decline-master.png",
        );
        const directDeclineStarted = Date.now();
        let directDeclineError = "";
        try {
          await sendTabMessage(declineTab.id, {
            type: "VF_MUSE_GENERATE_COLOR",
            master: declineMaster,
            color: { hex: "#123456", name: "测试色" },
            template: "DECLINE_TEST 只输出一张商品图",
            index: 1,
            total: 1,
            region: "whole",
          });
        } catch (error) {
          directDeclineError = error.message;
        }
        const directDeclineElapsedMs = Date.now() - directDeclineStarted;
        const detachStarted = Date.now();
        const detachedImageResult = await sendTabMessage(declineTab.id, {
          type: "VF_MUSE_GENERATE_COLOR",
          master: declineMaster,
          color: { hex: "#21506D", name: "离屏测试" },
          template: "DOM_DETACH_TEST 只输出一张商品图",
          index: 1,
          total: 1,
          region: "whole",
        });
        const detachedImageElapsedMs = Date.now() - detachStarted;
        autoRegenerateTextOnlyInput.checked = true;
        const textOnlyStarted = Date.now();
        const textOnlyRetryResult = await sendTabMessage(declineTab.id, {
          type: "VF_MUSE_GENERATE_COLOR",
          master: declineMaster,
          color: { hex: "#6B3FA0", name: "文本重试测试" },
          template: "TEXT_ONLY_ONCE_TEST 只输出一张商品图",
          index: 1,
          total: 1,
          region: "whole",
        });
        const textOnlyRetryElapsedMs = Date.now() - textOnlyStarted;
        autoRegenerateTextOnlyInput.checked = false;

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
        document.querySelector("#vfPatternCategory").value = "upper";
        document.querySelector("#vfRunPattern").click();
        results.pattern = await waitForJob("pattern_batch_finalize", 90000);
        await waitIdle();
        state.promptTemplates.pattern_batch =
          "BATCH_FAIL_TEST 本批必须输出 {{batch_count}} 张独立图片";
        const patternFallbackStarted = Date.now();
        document.querySelector("#vfRunPattern").click();
        results.patternFallback = await waitForJob(
          "pattern_batch_finalize",
          90000,
          patternFallbackStarted,
        );
        await waitIdle();

        // 5. 产品视频：Muse 返回可播放视频，并以产品视频 Job 归档。
        document.querySelector('[data-tab="video"]').click();
        setInputFiles("#vfVideoMain", [
          await makeFile("video-product-main.png", "#233C55"),
        ]);
        document.querySelector("#vfVideoPresentation").value = "worn_no_face";
        document.querySelector("#vfVideoCategory").value = "upper";
        document.querySelector("#vfVideoPrompt").value =
          "街头棚拍，镜头缓慢环绕，重点展示上装印花";
        document.querySelector("#vfVideoRequestCount").value = "1";
        const videoStarted = Date.now();
        document.querySelector("#vfRunVideo").click();
        results.video = await waitForJob(
          "product_video_generate",
          90000,
          videoStarted,
        );
        const videoAsset = (results.video.outputs || []).find(
          (asset) => asset.variant_type === "product_video",
        );
        if (
          !videoAsset?.type?.startsWith("video/") ||
          !videoAsset.name.endsWith(".mp4")
        ) {
          throw new Error("Product video output was not archived as a video");
        }
        await waitIdle();

        // 6. 产品文生图，同时验证暂停和恢复。
        document.querySelector('[data-generate-mode="text"]').click();
        setInputFiles("#vfGenerateMain", [
          await makeFile("copy-main.png", "#335577"),
        ]);
        document.querySelector("#vfAutoContinue").checked = true;
        const autoContinueTab = await getMuseTab();
        const autoContinueMaster = await serializeFile(
          state.generateMain,
          "auto-continue-master.png",
        );
        const autoContinueResult = await sendTabMessage(autoContinueTab.id, {
          type: "VF_MUSE_GENERATE_COPY_VARIANT",
          master: autoContinueMaster,
          prompt: "AUTO_CONTINUE_TEST",
          direct: true,
          autoContinue: true,
          index: 1,
          total: 1,
        });
        autoContinueWorked = autoContinueResult?.name?.startsWith(
          "copy-variant-01",
        );
        const autoTimeoutResult = await sendTabMessage(autoContinueTab.id, {
          type: "VF_MUSE_GENERATE_COPY_VARIANT",
          master: autoContinueMaster,
          prompt: "AUTO_TIMEOUT_TEST",
          direct: true,
          autoContinue: true,
          autoContinueTimeout: true,
          autoContinueIdleMs: 2500,
          index: 1,
          total: 1,
        });
        autoTimeoutWorked = autoTimeoutResult?.name?.startsWith(
          "copy-variant-01",
        );
        document.querySelector("#vfPrompt").value =
          "变为橙灰迷彩绒毛裤，增加节日礼物氛围";
        const originalTabSend = chrome.tabs.sendMessage;
        const originalOpenFreshMuseWindow = openFreshMuseWindow;
        let capacityAttempts = 0;
        let capacityWindowsOpened = 0;
        chrome.tabs.sendMessage = (_tabId, _message, callback) => {
          capacityAttempts += 1;
          setTimeout(
            () =>
              callback(
                capacityAttempts === 1
                  ? {
                      ok: false,
                      error:
                        "VF_MUSE_CAPACITY: 当前对话图片太多，请新开一个窗口",
                    }
                  : { ok: true, data: { recovered: true } },
              ),
            0,
          );
        };
        openFreshMuseWindow = async () => {
          capacityWindowsOpened += 1;
          return { id: 999, windowId: 88 };
        };
        state.capacityRecoveryCount = 0;
        state.capacityRecoveryStartedAt = 0;
        const capacityRecoveryResult = await sendTabMessage(1, {
          type: "VF_CAPACITY_TEST",
        });
        chrome.tabs.sendMessage = originalTabSend;
        openFreshMuseWindow = originalOpenFreshMuseWindow;
        state.preferredMuseTabId = null;
        state.preferredMuseWindowId = null;
        state.capacityRecoveryCount = 0;
        state.capacityRecoveryStartedAt = 0;
        const customTemplate =
          VisualForgeCore.DEFAULT_COPY_PROMPT_TEMPLATE +
          " 本次使用自定义模板验收。";
        document.querySelector("#vfPromptTemplate").value = customTemplate;
        document.querySelector("#vfSavePromptTemplate").click();
        await waitFor(
          async () =>
            (await chrome.storage.local.get("copyPromptTemplate"))
              .copyPromptTemplate === customTemplate,
          "Prompt template was not persisted",
        );
        document.querySelector("#vfRequestCount").value = "2";
        document.querySelector("#vfCount").value = "2";
        document.querySelector("#vfStylePack").value = "yabi_moto";
        document.querySelector("#vfCopyCategory").value = "upper";
        document.querySelector("#vfSaveCopyTasks").click();
        await waitFor(
          async () => (await VisualForgeStore.listTasks()).length === 1,
          "Copy task list was not populated",
        );
        const savedTasks = await VisualForgeStore.listTasks();
        document.querySelector('[data-tab="tasks"]').click();
        document.querySelector("#vfAddCopyTask").click();
        await waitFor(
          async () => (await VisualForgeStore.listTasks()).length === 2,
          "Second product task was not duplicated",
        );
        await waitFor(
          () =>
            document
              .querySelector('[data-tab="generate"]')
              ?.classList.contains("is-active") &&
            document.querySelector("#vfPrompt").value ===
              savedTasks[0].base_prompt,
          "Duplicated task was not loaded",
        );
        document.querySelector("#vfPrompt").value =
          "完整直接提示词：保留商品全部细节，只把主图已有的 Logo 换成新的几何标志。";
        document.querySelector("#vfDirectPrompt").checked = true;
        document.querySelector("#vfRequestCount").value = "1";
        document.querySelector("#vfCount").value = "1";
        document.querySelector("#vfSaveCopyTasks").click();
        await waitFor(
          async () =>
            (await VisualForgeStore.listTasks()).some(
              (task) => task.direct_prompt === true,
            ),
          "Direct prompt task was not saved",
        );
        const queuedTasks = await VisualForgeStore.listTasks();
        await renderCopyTasks();
        await waitFor(
          async () => (await VisualForgeStore.listPromptMemories(20)).length === 2,
          "Prompt memory was not persisted",
        );
        const promptMemories = await VisualForgeStore.listPromptMemories(20);
        const generateStarted = Date.now();
        const originalGetSetting = VisualForgeStore.getSetting.bind(
          VisualForgeStore,
        );
        VisualForgeStore.getSetting = async (key, fallback = null) =>
          key === "archiveDirectory" ? null : originalGetSetting(key, fallback);
        document.querySelector('[data-tab="tasks"]').click();
        document.querySelector("#vfQueueCopyTasks").click();
        await waitFor(
          () =>
            !document.querySelector("#vfPauseTask").disabled &&
            document.querySelector("#vfGenerateProgress")?.textContent.includes(
              "产品裂变任务",
            ),
          "Copy generation did not start",
          10000,
        ).catch(async (error) => {
          const taskErrors = (await VisualForgeStore.listTasks())
            .map((task) => ({
              id: task.id,
              status: task.status,
              error: task.error || null,
            }))
            .filter((task) => task.error || task.status === "failed");
          throw new Error(
            error.message +
              " :: " +
              JSON.stringify({
                taskErrors,
                taskState: document.querySelector("#vfTaskState")?.textContent,
                toast: document.querySelector("#vfToast")?.textContent,
                progress: document.querySelector("#vfGenerateProgress")?.textContent,
                mainFiles: document.querySelector("#vfGenerateMain")?.files?.length,
              }),
          );
        });
        document.querySelector("#vfPauseTask").click();
        await wait(200);
        const pausedLabel = document.querySelector("#vfGenerateProgress")?.textContent;
        await wait(2800);
        const pausedLabelAfter = document.querySelector("#vfGenerateProgress")?.textContent;
        const pauseButtonText = document.querySelector("#vfPauseTask")?.textContent;
        document.querySelector("#vfPauseTask").click();
        const chainJobs = await waitFor(
          async () => {
            const jobs = (await VisualForgeJobs.list(50)).filter(
              (item) =>
                item.kind === "product_generate" &&
                new Date(item.created_at).getTime() >= generateStarted - 1000,
            );
            return jobs.length === 2 &&
              jobs.every((job) => ["succeeded", "failed"].includes(job.status))
              ? jobs
              : false;
          },
          "Product variation task did not finish",
          45000,
        ).catch(async (error) => {
          const taskErrors = (await VisualForgeStore.listTasks())
            .map((task) => ({
              status: task.status,
              error: task.error || null,
              direct: task.direct_prompt === true,
            }))
            .filter((task) => task.error || task.status === "failed");
          throw new Error(
            error.message +
              " :: " +
              JSON.stringify({
                taskErrors,
                taskState: document.querySelector("#vfTaskState")?.textContent,
                toast: document.querySelector("#vfToast")?.textContent,
                progress: document.querySelector("#vfGenerateProgress")?.textContent,
                queue: document.querySelector("#vfQueueSummary")?.textContent,
              }),
          );
        });
        const chainFailure = chainJobs.find((job) => job.status !== "succeeded");
        if (chainFailure) {
          throw new Error(
            "Copy task chain failed: " +
              (chainFailure.error || chainFailure.message),
          );
        }
        const archiveDeferred = chainJobs.every(
          (job) => job.status === "succeeded" && Boolean(job.archive_error),
        );
        VisualForgeStore.getSetting = originalGetSetting;
        await refreshArchiveStatus();
        const autoArchivedCount = await autoArchiveUnsavedJobs({
          notify: false,
        });
        const exportedJobs = await Promise.all(
          chainJobs.map((job) => VisualForgeJobs.get(job.id)),
        );
        results.generate = {
          status: "succeeded",
          outputs: exportedJobs.flatMap((job) => job.outputs || []),
          export_path: exportedJobs
            .map((job) => job.export_path)
            .filter(Boolean)
            .join("; "),
          archive_error: exportedJobs.find((job) => job.archive_error)?.archive_error || null,
        };
        results.pause = {
          pausedLabel,
          pausedLabelAfter,
          pauseButtonText,
        };
        const finalTasks = await waitFor(
          async () => {
            const tasks = await VisualForgeStore.listTasks();
            return tasks.length === 2 &&
              tasks.every((task) => task.status === "succeeded")
              ? tasks
              : false;
          },
          "Queued task statuses did not settle",
        );
        const queueSummary = await waitFor(
          () => {
            const text = document.querySelector("#vfQueueSummary")?.textContent || "";
            return text.includes("队列完成") ? text : false;
          },
          "Queue summary did not settle",
        );
        document.querySelector('[data-tab="tasks"]').click();
        await waitFor(
          () => document.querySelectorAll(".vf-copy-task").length === 2,
          "Task cards did not render for copy check",
        );
        const firstTaskCard = document.querySelector(".vf-copy-task");
        const copyCountInput = firstTaskCard.querySelector(".vf-copy-count");
        const copyButton = [...firstTaskCard.querySelectorAll("button")].find(
          (button) => button.textContent.startsWith("复制"),
        );
        copyCountInput.value = "3";
        copyCountInput.dispatchEvent(new Event("input", { bubbles: true }));
        copyButton.click();
        await waitFor(
          async () => (await VisualForgeStore.listTasks()).length === 5,
          "Task copy count was not applied",
        );
        const copiedTaskCount = (await VisualForgeStore.listTasks()).length;

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
        const linksOnlyGroup = String(
          results.productColorLinksOnly?.export_path || "",
        ).split(String.fromCharCode(92)).at(-1);
        const linksOnlyFiles = tree
          .filter((entry) => entry.path.startsWith(linksOnlyGroup + "/"))
          .map((entry) => entry.path.slice(linksOnlyGroup.length + 1));
        const generatedAssets = (results.generate.outputs || []).filter(
          (asset) => asset.variant_type === "product_variant",
        );
        const summarize = (job) => ({
          status: job.status,
          images: (job.outputs || []).filter(
            (asset) => asset.display !== false && asset.type?.startsWith("image/"),
          ).length,
          videos: (job.outputs || []).filter(
            (asset) => asset.display !== false && asset.type?.startsWith("video/"),
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
          generatedImages: generatedAssets.length,
          generatedHashes: new Set(
            generatedAssets.map((asset) => asset.sha256),
          ).size,
          savedTasks: queuedTasks.length,
          taskOutputCount: savedTasks[0]?.output_count,
          taskRequestCount: savedTasks[0]?.request_count,
          taskStylePack: savedTasks[0]?.style_pack,
          taskChainMode: savedTasks[0]?.chain_mode,
          taskBackgroundMode: savedTasks[0]?.background_mode,
          taskTotalRequests:
            Number(savedTasks[0]?.output_count || 1) *
            Number(savedTasks[0]?.request_count || 1),
          taskStatuses: finalTasks.map((task) => task.status).sort(),
          queueSummary,
          copiedTaskCount,
          archiveDeferred,
          autoArchivedCount,
          taskTemplatePersisted:
            savedTasks[0]?.prompt_template === customTemplate,
          queuedDirectPrompt: queuedTasks.some((task) => task.direct_prompt),
          promptMemories: promptMemories.length,
          promptTemplateCount,
          videoTemplateHasFaceRule:
            state.promptTemplates.video_showcase.includes("脸部不得入镜") &&
            VisualForgePromptTemplates
              .ensureVideoNoFaceConstraint("自定义视频")
              .includes("【真人出镜硬约束】"),
          categoryTaskEvidence,
          productCopyCategory: savedTasks[0]?.category || null,
          immediateDownloadCalls,
          capacityRecovery: {
            attempts: capacityAttempts,
            windowsOpened: capacityWindowsOpened,
            result: capacityRecoveryResult,
          },
          declineDetection: {
            directError: directDeclineError,
            directElapsedMs: directDeclineElapsedMs,
          },
          detachedImageRecovery: {
            name: detachedImageResult.name,
            elapsedMs: detachedImageElapsedMs,
          },
          textOnlyAutoRetry: {
            name: textOnlyRetryResult.name,
            elapsedMs: textOnlyRetryElapsedMs,
          },
          linksOnlyExport: {
            urlCount:
              results.productColorLinksOnly?.options?.muse_image_urls
                ?.filter(Boolean).length || 0,
            urlPrefix:
              results.productColorLinksOnly?.options?.muse_image_urls?.find(
                Boolean,
              )?.slice(0, 24) || "",
            exportMode: results.productColorLinksOnly?.options?.export_mode,
            files: linksOnlyFiles,
          },
          interfaceScale: {
            initial: initialInterfaceScale,
            increased: increasedInterfaceScale,
            reset: resetInterfaceScale,
            css: interfaceScaleCss,
            label: interfaceScaleLabel,
            stored: storedInterfaceScale,
          },
          patternBatchCoverage,
          savedModeTasks,
          logoTaskEvidence,
          queueDispatchModes,
          autoContinueWorked,
          autoTimeoutWorked,
          museReturnedCount: state.museReturnedImages.length,
          memoryHasImage: Boolean(promptMemories[0]?.main_image?.blob),
          historyCount: (await VisualForgeJobs.list(50)).length,
          tree,
        });
      })()`,
      true,
    );
    const payload = JSON.parse(report);
    const categoryPromptReport = JSON.parse(
      await evaluate(
        museClient,
        `JSON.stringify({
          prompts: window.__vfPrompts || []
        })`,
      ),
    );
    if (
      !categoryPromptReport.prompts.some((prompt) =>
        prompt.includes("商品类目：上装"),
      ) ||
      !categoryPromptReport.prompts.some((prompt) =>
        prompt.includes("商品类目是上装"),
      )
    ) {
      throw new Error(
        `Upper-garment category was not propagated to Muse: ${JSON.stringify(categoryPromptReport)}`,
      );
    }
    const videoPromptReport = JSON.parse(
      await evaluate(
        museClient,
        `JSON.stringify({
          prompt: window.__vfVideoLastPrompt || ""
        })`,
      ),
    );
    if (
      !videoPromptReport.prompt.includes("颈部以下") ||
      !videoPromptReport.prompt.includes("脸部必须完全位于画面外") ||
      !videoPromptReport.prompt.includes("正脸") ||
      !videoPromptReport.prompt.includes("侧脸")
    ) {
      throw new Error(
        `Product video face constraint was not sent to Muse: ${JSON.stringify(videoPromptReport)}`,
      );
    }
    const resizeReport = JSON.parse(
      await evaluate(
        museClient,
        `(async () => {
          const shell = document.querySelector("#vf-widget-shell");
          const handle = shell?.querySelector(
            '.vf-widget-resize[data-direction="se"]',
          );
          if (!shell || !handle) {
            return JSON.stringify({ found: false });
          }
          const before = shell.getBoundingClientRect();
          const startX = before.right - 2;
          const startY = before.bottom - 2;
          handle.dispatchEvent(new PointerEvent("pointerdown", {
            bubbles: true,
            pointerId: 77,
            pointerType: "mouse",
            clientX: startX,
            clientY: startY,
          }));
          handle.dispatchEvent(new PointerEvent("pointermove", {
            bubbles: true,
            pointerId: 77,
            pointerType: "mouse",
            clientX: startX + 80,
            clientY: startY + 50,
          }));
          await new Promise((resolve) => setTimeout(resolve, 80));
          handle.dispatchEvent(new PointerEvent("pointerup", {
            bubbles: true,
            pointerId: 77,
            pointerType: "mouse",
            clientX: startX + 80,
            clientY: startY + 50,
          }));
          const after = shell.getBoundingClientRect();
          const saved = JSON.parse(
            localStorage.getItem("visualForgeWidgetSize") || "null",
          );
          return JSON.stringify({
            found: true,
            handles: shell.querySelectorAll(".vf-widget-resize").length,
            beforeWidth: before.width,
            beforeHeight: before.height,
            afterWidth: after.width,
            afterHeight: after.height,
            saved,
          });
        })()`,
        true,
      ),
    );
    if (
      !resizeReport.found ||
      resizeReport.handles !== 8 ||
      resizeReport.afterWidth <= resizeReport.beforeWidth ||
      resizeReport.afterHeight <= resizeReport.beforeHeight ||
      !resizeReport.saved
    ) {
      throw new Error(
        `Widget resize failed: ${JSON.stringify(resizeReport)}`,
      );
    }
    if (
      !(payload.interfaceScale.increased > payload.interfaceScale.initial) ||
      Math.abs(payload.interfaceScale.reset - 1.1) > 0.001 ||
      payload.interfaceScale.css !== String(payload.interfaceScale.increased) ||
      payload.interfaceScale.stored !== payload.interfaceScale.increased
    ) {
      throw new Error(
        `Interface font scaling failed: ${JSON.stringify(payload.interfaceScale)}`,
      );
    }
    if (
      !payload.declineDetection.directError.includes("明确未完成") ||
      payload.declineDetection.directElapsedMs < 15000 ||
      payload.declineDetection.directElapsedMs >= 30000
    ) {
      throw new Error(
        `Muse decline fast-fail failed: ${JSON.stringify(payload.declineDetection)}`,
      );
    }
    if (
      !payload.detachedImageRecovery.name.startsWith("variant-01-21506D") ||
      payload.detachedImageRecovery.elapsedMs >= 20000
    ) {
      throw new Error(
        `Detached Muse image recovery failed: ${JSON.stringify(payload.detachedImageRecovery)}`,
      );
    }
    if (
      !payload.textOnlyAutoRetry.name.startsWith(
        "variant-01-6B3FA0",
      ) ||
      payload.textOnlyAutoRetry.elapsedMs < 20000 ||
      payload.textOnlyAutoRetry.elapsedMs >= 45000
    ) {
      throw new Error(
        `Text-only auto regenerate failed: ${JSON.stringify(payload.textOnlyAutoRetry)}`,
      );
    }
    if (
      payload.capacityRecovery.attempts !== 2 ||
      payload.capacityRecovery.windowsOpened !== 1 ||
      payload.capacityRecovery.result?.recovered !== true
    ) {
      throw new Error(
        `Capacity recovery failed: ${JSON.stringify(payload.capacityRecovery)}`,
      );
    }
    if (
      payload.linksOnlyExport.exportMode !== "links_only" ||
      payload.linksOnlyExport.urlCount !== 1 ||
      !payload.linksOnlyExport.urlPrefix ||
      !payload.linksOnlyExport.files.includes("图片链接.txt") ||
      !payload.linksOnlyExport.files.includes("图片链接.json") ||
      payload.linksOnlyExport.files.some((name) =>
        /\.(?:png|webp|jpe?g)$/i.test(name),
      )
    ) {
      throw new Error(
        `Links-only export failed: ${JSON.stringify(payload.linksOnlyExport)}`,
      );
    }
    for (const name of [
      "logo",
      "logoBatch",
      "logoBatchFallback",
      "productColor",
      "productColorFallback",
      "productColorLinksOnly",
      "pattern",
      "patternFallback",
      "video",
      "generate",
    ]) {
      if (payload.results[name]?.status !== "succeeded") {
        throw new Error(`${name} did not succeed: ${JSON.stringify(payload)}`);
      }
      if (!payload.results[name]?.archive || payload.results[name]?.archiveError) {
        throw new Error(`${name} archive failed: ${JSON.stringify(payload)}`);
      }
    }
    if (payload.results.video?.videos !== 1) {
      throw new Error(
        `Product video did not produce one archived video: ${JSON.stringify(payload.results.video)}`,
      );
    }
    if (
      payload.results.pause?.pauseButtonText !== "▶" ||
      payload.results.pause?.pausedLabel !== payload.results.pause?.pausedLabelAfter
    ) {
      throw new Error(`Pause behavior failed: ${JSON.stringify(payload.results.pause)}`);
    }
    if (
      payload.generatedImages !== 5 ||
      payload.generatedHashes !== 5
    ) {
      throw new Error(
        `Generated image variations are not distinct: ${JSON.stringify(payload)}`,
      );
    }
    if (payload.savedTasks !== 2) {
      throw new Error(`Task list was not persisted: ${JSON.stringify(payload)}`);
    }
    if (
      payload.taskStatuses?.length !== 2 ||
      payload.taskStatuses.some((status) => status !== "succeeded")
    ) {
      throw new Error(`Queued tasks did not all finish: ${JSON.stringify(payload)}`);
    }
    if (payload.copiedTaskCount !== 5) {
      throw new Error(`Task copy count failed: ${JSON.stringify(payload)}`);
    }
    if (
      !payload.queueSummary.includes("成功 2") ||
      !payload.queueSummary.includes("失败 0") ||
      !payload.queueSummary.includes("自动保存") ||
      !payload.queueSummary.includes("未保存")
    ) {
      throw new Error(`Queue summary failed: ${JSON.stringify(payload)}`);
    }
    if (!payload.archiveDeferred) {
      throw new Error(
        `Missing archive permission blocked generation: ${JSON.stringify(payload)}`,
      );
    }
    if (payload.autoArchivedCount !== 2) {
      throw new Error(
        `Unsaved jobs were not auto-archived: ${JSON.stringify(payload)}`,
      );
    }
    if (
      payload.taskOutputCount !== 2 ||
      payload.taskRequestCount !== 2 ||
      payload.taskTotalRequests !== 4 ||
      payload.taskStylePack !== "yabi_moto" ||
      payload.taskChainMode !== "original" ||
      payload.taskBackgroundMode !== "match" ||
      !payload.taskTemplatePersisted ||
      !payload.queuedDirectPrompt ||
      payload.promptMemories !== 2 ||
      !payload.memoryHasImage ||
      payload.promptTemplateCount !== 8 ||
      !payload.videoTemplateHasFaceRule ||
      payload.categoryTaskEvidence.pattern !== "upper" ||
      payload.categoryTaskEvidence.video !== "upper" ||
      payload.productCopyCategory !== "upper" ||
      payload.immediateDownloadCalls < 10 ||
      payload.savedModeTasks.length !== 5 ||
      payload.queueDispatchModes.length !== 5 ||
      !payload.autoContinueWorked ||
      !payload.autoTimeoutWorked ||
      payload.museReturnedCount < 5
    ) {
      throw new Error(
        `Prompt template or memory was not persisted: ${JSON.stringify(payload)}`,
      );
    }
    if (
      payload.logoTaskEvidence.firstId === payload.logoTaskEvidence.secondId ||
      payload.logoTaskEvidence.requestCount !== 2 ||
      payload.logoTaskEvidence.batchCount !== 2 ||
      !payload.logoTaskEvidence.summary.includes("2 次请求") ||
      !payload.logoTaskEvidence.summary.includes("每批 2 张")
    ) {
      throw new Error(
        `Logo redesign task settings failed: ${JSON.stringify(payload.logoTaskEvidence)}`,
      );
    }
    if (payload.historyCount < 7) {
      throw new Error(`History is incomplete: ${payload.historyCount}`);
    }
    if (
      payload.patternBatchCoverage.valid !== 201 ||
      payload.patternBatchCoverage.files !== 201 ||
      payload.patternBatchCoverage.batches < 51
    ) {
      throw new Error(
        `Pattern references were truncated before batching: ` +
          JSON.stringify(payload.patternBatchCoverage),
      );
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
    const copyTaskDirectories = payload.tree.filter(
      (entry) =>
        entry.kind === "directory" &&
        entry.path.startsWith("产品裂变_"),
    );
    if (copyTaskDirectories.length !== 2) {
      throw new Error(
        `Expected two queued product variation archives, got ${copyTaskDirectories.length}`,
      );
    }
    const videoDirectories = payload.tree.filter(
      (entry) =>
        entry.kind === "directory" &&
        entry.path.startsWith("产品视频_"),
    );
    if (
      videoDirectories.length !== 1 ||
      !payload.tree.some(
        (entry) =>
          entry.kind === "file" &&
          entry.path.startsWith(videoDirectories[0].path + "/") &&
          entry.path.endsWith(".mp4"),
      )
    ) {
      throw new Error(
        `Product video archive was incomplete: ${JSON.stringify(videoDirectories)}`,
      );
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
