"use strict";

const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.argv[2] || 62185);
const action = process.argv[3] || "inspect";

async function targets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  return response.json();
}

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
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

async function main() {
  if (action === "reload-muse") {
    const muse = (await targets()).find(
      (target) =>
        target.type === "page" &&
        /^https:\/\/muse\.ai\//.test(target.url),
    );
    if (!muse) throw new Error("Muse page was not found");
    const museClient = await connect(muse.webSocketDebuggerUrl);
    await museClient.send("Page.reload", { ignoreCache: true });
    console.log("Muse page reload requested.");
    museClient.close();
    return;
  }
  if (action === "check-muse") {
    const muse = (await targets()).find(
      (target) =>
        target.type === "page" &&
        /^https:\/\/muse\.ai\//.test(target.url),
    );
    if (!muse) throw new Error("Muse page was not found");
    const museClient = await connect(muse.webSocketDebuggerUrl);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const checked = await museClient.send("Runtime.evaluate", {
      expression: `(() => {
        const launcher = document.querySelector("#vf-widget-launcher");
        if (launcher && launcher.style.display !== "none") launcher.click();
        const frame = document.querySelector("#vf-widget-frame");
        return JSON.stringify({
          bridgeLoaded: Boolean(window.__VF_MUSE_BRIDGE_LOADED__),
          root: Boolean(document.querySelector("#vf-widget-root")),
          launcher: Boolean(launcher),
          frameSrc: frame?.src || "",
          shellVisible: !document.querySelector("#vf-widget-shell")?.hidden,
          shellRect: (() => {
            const rect = document.querySelector("#vf-widget-shell")?.getBoundingClientRect();
            return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
          })(),
          editors: [...document.querySelectorAll("textarea, [contenteditable=true], [role=textbox]")]
            .filter((element) => !element.disabled && element.getBoundingClientRect().width > 20).length
        });
      })()`,
      returnByValue: true,
    });
    if (checked.exceptionDetails) {
      throw new Error(
        checked.exceptionDetails.exception?.description ||
          checked.exceptionDetails.text,
      );
    }
    console.log(checked.result.value);
    museClient.close();
    return;
  }
  if (action === "set-pattern-once") {
    const basePath = process.argv[4];
    const referencePath = process.argv[5];
    if (!basePath || !referencePath) {
      throw new Error("usage: extension-admin.js PORT set-pattern-once BASE_IMAGE REFERENCE_IMAGE");
    }
    const frame = (await targets()).find(
      (target) =>
        target.type === "iframe" &&
        /^chrome-extension:\/\/[^/]+\/sidepanel\.html\?embedded=1/.test(
          target.url,
        ),
    );
    const muse = (await targets()).find(
      (target) =>
        target.type === "page" &&
        /^https:\/\/muse\.ai\//.test(target.url),
    );
    if (!frame || !muse) throw new Error("Muse or widget target was not found");
    await fetch(`http://127.0.0.1:${port}/json/activate/${muse.id}`);
    const frameClient = await connect(frame.webSocketDebuggerUrl);
    await frameClient.send("Runtime.enable");
    const baseData = fs.readFileSync(basePath).toString("base64");
    const referenceData = fs.readFileSync(referencePath).toString("base64");
    await frameClient.send("Runtime.evaluate", {
      expression: `(() => {
        const baseBytes = Uint8Array.from(atob(${JSON.stringify(baseData)}), (value) => value.charCodeAt(0));
        const referenceBytes = Uint8Array.from(atob(${JSON.stringify(referenceData)}), (value) => value.charCodeAt(0));
        const baseFile = new File([baseBytes], ${JSON.stringify(path.basename(basePath))}, { type: "image/webp" });
        const referenceFile = new File([referenceBytes], ${JSON.stringify(path.basename(referencePath))}, { type: "image/webp" });
        Object.defineProperty(referenceFile, "webkitRelativePath", {
          value: ${JSON.stringify(path.basename(referencePath))},
          configurable: true
        });
        const baseTransfer = new DataTransfer();
        baseTransfer.items.add(baseFile);
        const baseInput = document.querySelector("#vfPatternBase");
        baseInput.files = baseTransfer.files;
        baseInput.dispatchEvent(new Event("change", { bubbles: true }));
        const referenceTransfer = new DataTransfer();
        referenceTransfer.items.add(referenceFile);
        const referenceInput = document.querySelector("#vfPatternFolder");
        referenceInput.files = referenceTransfer.files;
        referenceInput.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`,
      returnByValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await frameClient.send("Runtime.evaluate", {
      expression: `(() => {
        document.querySelector('[data-tab="generate"]').click();
        document.querySelector('[data-generate-mode="pattern"]').click();
        document.querySelector("#vfRunPattern").click();
        return true;
      })()`,
      returnByValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const state = await frameClient.send("Runtime.evaluate", {
      expression: `JSON.stringify({
        taskState: document.querySelector("#vfTaskState")?.textContent,
        progress: document.querySelector("#vfPatternProgress")?.textContent,
        toast: document.querySelector("#vfToast")?.textContent
      })`,
      returnByValue: true,
    });
    console.log(state.result.value);
    frameClient.close();
    return;
  }
  if (action === "run-copy-once") {
    const sourcePath = process.argv[4];
    const prompt = process.argv[5] || "冬季户外商业摄影，暖色阳光";
    const count = process.argv[6] || "4";
    if (!sourcePath) {
      throw new Error("usage: extension-admin.js PORT run-copy-once MASTER_IMAGE PROMPT COUNT");
    }
    const frame = (await targets()).find(
      (target) =>
        target.type === "iframe" &&
        /^chrome-extension:\/\/[^/]+\/sidepanel\.html\?embedded=1/.test(
          target.url,
        ),
    );
    const muse = (await targets()).find(
      (target) =>
        target.type === "page" &&
        /^https:\/\/muse\.ai\//.test(target.url),
    );
    if (!frame || !muse) throw new Error("Muse or widget target was not found");
    await fetch(`http://127.0.0.1:${port}/json/activate/${muse.id}`);
    const frameClient = await connect(frame.webSocketDebuggerUrl);
    const sourceData = fs.readFileSync(sourcePath).toString("base64");
    const sourceExt = path.extname(sourcePath).slice(1).toLowerCase() || "png";
    await frameClient.send("Runtime.evaluate", {
      expression: `(() => {
        document.querySelector('[data-tab="generate"]').click();
        document.querySelector('[data-generate-mode="text"]').click();
        const bytes = Uint8Array.from(atob(${JSON.stringify(sourceData)}), (value) => value.charCodeAt(0));
        const file = new File([bytes], ${JSON.stringify(path.basename(sourcePath))}, {
          type: ${JSON.stringify(`image/${sourceExt === "jpg" ? "jpeg" : sourceExt}`)}
        });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const input = document.querySelector("#vfGenerateMain");
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        document.querySelector("#vfPrompt").value = ${JSON.stringify(prompt)};
        document.querySelector("#vfCount").value = ${JSON.stringify(String(count))};
        document.querySelector("#vfSkuGenerate").value = "COPY-DEMO";
        document.querySelector('[data-run="generate"]').click();
        return true;
      })()`,
      returnByValue: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const state = await frameClient.send("Runtime.evaluate", {
      expression: `JSON.stringify({
        taskState: document.querySelector("#vfTaskState")?.textContent,
        toast: document.querySelector("#vfToast")?.textContent,
        preview: document.querySelector("#vfGeneratePreviewName")?.textContent
      })`,
      returnByValue: true,
    });
    console.log(state.result.value);
    frameClient.close();
    return;
  }
  if (action === "check-jobs") {
    const frame = (await targets()).find(
      (target) =>
        target.type === "iframe" &&
        /^chrome-extension:\/\/[^/]+\/sidepanel\.html\?embedded=1/.test(
          target.url,
        ),
    );
    if (!frame) throw new Error("Widget iframe was not found");
    const frameClient = await connect(frame.webSocketDebuggerUrl);
    const state = await frameClient.send("Runtime.evaluate", {
      expression: `(async () => JSON.stringify({
        taskState: document.querySelector("#vfTaskState")?.textContent,
        progress: document.querySelector("#vfPatternProgress")?.textContent,
        jobs: (await VisualForgeJobs.list(10)).map((job) => ({
          id: job.id,
          kind: job.kind,
          status: job.status,
          progress: job.progress,
          message: job.message,
          error: job.error,
          archive: job.export_path,
          archiveError: job.archive_error,
          createdAt: job.created_at
        }))
      }))()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log(state.result.value);
    frameClient.close();
    return;
  }
  if (action === "check-tasks") {
    const frame = (await targets()).find(
      (target) =>
        target.type === "iframe" &&
        /^chrome-extension:\/\/[^/]+\/sidepanel\.html\?embedded=1/.test(
          target.url,
        ),
    );
    if (!frame) throw new Error("Widget iframe was not found");
    const frameClient = await connect(frame.webSocketDebuggerUrl);
    const state = await frameClient.send("Runtime.evaluate", {
      expression: `(async () => {
        document.querySelector('[data-tab="tasks"]')?.click();
        const tasks = await VisualForgeStore.listTasks();
        return JSON.stringify({
          count: tasks.length,
          listVisible: !document.querySelector("#vfCopyTaskList")?.hidden,
          emptyHidden: document.querySelector("#vfCopyTaskEmpty")?.hidden,
          first: tasks[0] ? {
            direction: tasks[0].direction,
            prompt: tasks[0].base_prompt,
            hasImage: Boolean(tasks[0].main_image?.blob)
          } : null
        });
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log(state.result.value);
    frameClient.close();
    return;
  }
  if (action === "update-latest-pattern-path") {
    const oldName = process.argv[4];
    const newName = process.argv[5];
    if (!oldName || !newName) {
      throw new Error("usage: extension-admin.js PORT update-latest-pattern-path OLD_NAME NEW_NAME");
    }
    const frame = (await targets()).find(
      (target) =>
        target.type === "iframe" &&
        /^chrome-extension:\/\/[^/]+\/sidepanel\.html\?embedded=1/.test(
          target.url,
        ),
    );
    if (!frame) throw new Error("Widget iframe was not found");
    const frameClient = await connect(frame.webSocketDebuggerUrl);
    const updated = await frameClient.send("Runtime.evaluate", {
      expression: `(async () => {
        const jobs = await VisualForgeJobs.list(50);
        const job = jobs.find((item) => item.kind === "pattern_batch_finalize");
        if (!job) return JSON.stringify({ updated: false });
        job.export_path = job.export_path.replace(${JSON.stringify(oldName)}, ${JSON.stringify(newName)});
        if (job.options?.archive_group_name === ${JSON.stringify(oldName)}) {
          job.options.archive_group_name = ${JSON.stringify(newName)};
        }
        await VisualForgeStore.putJob(job);
        return JSON.stringify({ updated: true, jobId: job.id, exportPath: job.export_path });
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log(updated.result.value);
    frameClient.close();
    return;
  }
  if (action === "check-widget") {
    const frame = (await targets()).find(
      (target) =>
        target.type === "iframe" &&
        /^chrome-extension:\/\/[^/]+\/sidepanel\.html\?embedded=1/.test(
          target.url,
        ),
    );
    if (!frame) throw new Error("Visual Forge widget iframe was not found");
    const frameClient = await connect(frame.webSocketDebuggerUrl);
    const checked = await frameClient.send("Runtime.evaluate", {
      expression: `JSON.stringify({
        ready: document.readyState,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        browserNow: new Date().toString(),
        connection: document.querySelector("#vfConnection span")?.textContent,
        archive: document.querySelector("#vfExportPath")?.textContent,
        activeTab: document.querySelector("[data-tab].is-active")?.dataset.tab,
        activeGenerateMode: document.querySelector("[data-generate-mode].is-active")?.dataset.generateMode,
        files: [...document.querySelectorAll("#vfFiles .vf-file span:first-child")].map(
          (node) => node.textContent,
        ),
        productColors: document.querySelector("#vfProductColors")?.value,
        patternBase: document.querySelector("#vfPatternBaseName")?.textContent,
        patternFolder: document.querySelector("#vfPatternFolderName")?.textContent,
        patternSummary: document.querySelector("#vfPatternBatchSummary")?.textContent,
        patternFiles: document.querySelector("#vfPatternFolder")?.files?.length || 0,
        patternBaseFiles: document.querySelector("#vfPatternBase")?.files?.length || 0,
        patternMode: document.querySelector("#vfPatternRequestMode")?.value,
        patternBackground: document.querySelector("#vfPatternBackground")?.value,
        generateProgress: document.querySelector("#vfGenerateProgress")?.textContent,
        generateRetryDisabled: document.querySelector("#vfRetryFailedGenerate")?.disabled,
        prompt: document.querySelector("#vfPrompt")?.value,
        taskState: document.querySelector("#vfTaskState")?.textContent,
        toast: document.querySelector("#vfToast")?.textContent,
        jobsModule: Boolean(window.VisualForgeJobs),
        storeModule: Boolean(window.VisualForgeStore),
        archiveModule: Boolean(window.VisualForgeArchive)
      })`,
      returnByValue: true,
    });
    if (checked.exceptionDetails) {
      throw new Error(
        checked.exceptionDetails.exception?.description ||
          checked.exceptionDetails.text,
      );
    }
    console.log(checked.result.value);
    frameClient.close();
    return;
  }
  if (action === "capture-widget") {
    const outputPath = process.argv[4];
    if (!outputPath) {
      throw new Error("usage: extension-admin.js PORT capture-widget OUTPUT_PNG");
    }
    const musePage = (await targets()).find(
      (target) =>
        target.type === "page" &&
        /^https:\/\/muse\.ai\//.test(target.url),
    );
    if (!musePage) throw new Error("Muse page was not found");
    const pageClient = await connect(musePage.webSocketDebuggerUrl);
    await pageClient.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 960,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await pageClient.send("Runtime.evaluate", {
      expression: `(() => {
        window.scrollTo(0, 0);
        const launcher = document.querySelector("#vf-widget-launcher");
        const shell = document.querySelector("#vf-widget-shell");
        if (launcher) launcher.style.display = "none";
        if (shell) shell.hidden = false;
        return true;
      })()`,
    });
    await new Promise((resolve) => setTimeout(resolve, 800));
    const screenshot = await pageClient.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));
    console.log(outputPath);
    pageClient.close();
    return;
  }
  if (action === "check-directory") {
    const directoryPage = (await targets()).find(
      (target) =>
        target.type === "page" &&
        /^chrome-extension:\/\/[^/]+\/directory\.html/.test(target.url),
    );
    if (!directoryPage) throw new Error("Directory authorization page was not found");
    const directoryClient = await connect(directoryPage.webSocketDebuggerUrl);
    const checked = await directoryClient.send("Runtime.evaluate", {
      expression: `(async () => JSON.stringify({
        statusText: document.querySelector("#directoryStatus")?.textContent,
        message: document.querySelector("#status")?.textContent,
        chooseDisabled: document.querySelector("#chooseDirectory")?.disabled,
        state: await VisualForgeArchive.status()
      }))()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (checked.exceptionDetails) {
      throw new Error(
        checked.exceptionDetails.exception?.description ||
          checked.exceptionDetails.text,
      );
    }
    console.log(checked.result.value);
    directoryClient.close();
    return;
  }
  if (action === "authorize-directory") {
    const directoryPage = (await targets()).find(
      (target) =>
        target.type === "page" &&
        /^chrome-extension:\/\/[^/]+\/directory\.html/.test(target.url),
    );
    if (!directoryPage) throw new Error("Directory authorization page was not found");
    await fetch(`http://127.0.0.1:${port}/json/activate/${directoryPage.id}`);
    const directoryClient = await connect(directoryPage.webSocketDebuggerUrl);
    const rectResult = await directoryClient.send("Runtime.evaluate", {
      expression: `(() => {
        const rect = document.querySelector("#chooseDirectory").getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
      returnByValue: true,
    });
    const { x, y } = rectResult.result.value;
    await directoryClient.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await directoryClient.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const checked = await directoryClient.send("Runtime.evaluate", {
      expression: `(async () => JSON.stringify({
        statusText: document.querySelector("#directoryStatus")?.textContent,
        message: document.querySelector("#status")?.textContent,
        state: await VisualForgeArchive.status()
      }))()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (checked.exceptionDetails) {
      throw new Error(
        checked.exceptionDetails.exception?.description ||
          checked.exceptionDetails.text,
      );
    }
    console.log(checked.result.value);
    directoryClient.close();
    return;
  }
  if (action === "reload-extension-pages") {
    const pages = (await targets()).filter(
      (target) =>
        target.type === "page" &&
        target.url.startsWith("chrome-extension://"),
    );
    for (const extensionPage of pages) {
      const pageClient = await connect(extensionPage.webSocketDebuggerUrl);
      await pageClient.send("Page.reload", { ignoreCache: true });
      pageClient.close();
    }
    console.log(`Reloaded ${pages.length} extension page(s).`);
    return;
  }
  if (action === "check-options") {
    const optionsPage = (await targets()).find(
      (target) =>
        target.type === "page" &&
        /^chrome-extension:\/\/[^/]+\/options\.html/.test(target.url),
    );
    if (!optionsPage) throw new Error("Options page was not found");
    const optionsClient = await connect(optionsPage.webSocketDebuggerUrl);
    const checked = await optionsClient.send("Runtime.evaluate", {
      expression: `JSON.stringify({
        modelProvider: Boolean(document.querySelector("#modelProvider")),
        apiKey: Boolean(document.querySelector("#apiKey")),
        legacyApiBase: Boolean(document.querySelector("#apiBase")),
        title: document.querySelector("h1")?.textContent
      })`,
      returnByValue: true,
    });
    if (checked.exceptionDetails) {
      throw new Error(
        checked.exceptionDetails.exception?.description ||
          checked.exceptionDetails.text,
      );
    }
    console.log(checked.result.value);
    optionsClient.close();
    return;
  }
  const page = (await targets()).find(
    (target) => target.type === "page" && target.url.startsWith("chrome://extensions"),
  );
  if (!page) throw new Error("chrome://extensions page is not open");
  const client = await connect(page.webSocketDebuggerUrl);
  await client.send("Runtime.enable");
  const expression = `(() => {
    const manager = document.querySelector("extensions-manager");
    const list = manager?.shadowRoot?.querySelector("extensions-item-list");
    const items = [...(list?.shadowRoot?.querySelectorAll("extensions-item") || [])];
    return JSON.stringify(items.map((item) => {
      const root = item.shadowRoot;
      return {
        id: item.id,
        name: root?.querySelector("#name")?.textContent?.trim(),
        version: root?.querySelector("#version")?.textContent?.trim(),
        ids: [...(root?.querySelectorAll("[id]") || [])].map((node) => node.id)
      };
    }));
  })()`;
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text,
    );
  }
  const items = JSON.parse(result.result.value);
  console.log(JSON.stringify(items, null, 2));
  if (action === "reload") {
    const item = items.find((entry) => entry.name === "Visual Forge for Muse");
    if (!item) throw new Error("Visual Forge extension item was not found");
    const clicked = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const manager = document.querySelector("extensions-manager");
        const list = manager?.shadowRoot?.querySelector("extensions-item-list");
        const item = [...(list?.shadowRoot?.querySelectorAll("extensions-item") || [])]
          .find((node) => node.shadowRoot?.querySelector("#name")?.textContent?.trim() === "Visual Forge for Muse");
        const button = item?.shadowRoot?.querySelector("#dev-reload-button");
        if (!button) return false;
        button.click();
        return true;
      })()`,
      returnByValue: true,
    });
    if (!clicked.result.value) throw new Error("Reload button was not found");
    console.log("Visual Forge extension reload requested.");
  }
  client.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
