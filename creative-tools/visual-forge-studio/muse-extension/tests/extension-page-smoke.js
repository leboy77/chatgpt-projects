"use strict";

const port = Number(process.argv[2] || 9335);

async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error("Cannot reach Edge DevTools");
  return response.json();
}

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
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
  const targets = await listTargets();
  const worker = targets.find(
    (target) =>
      target.type === "service_worker" &&
      /chrome-extension:\/\/[^/]+\/background\.js$/.test(target.url),
  );
  const extensionPage = targets.find(
    (target) =>
      target.type === "page" &&
      /^chrome-extension:\/\/[^/]+\/(?:sidepanel|directory|options)\.html/.test(
        target.url,
      ),
  );
  const extensionUrl = worker?.url || extensionPage?.url;
  if (!extensionUrl) throw new Error("Visual Forge extension was not loaded");
  const extensionId = new URL(extensionUrl).hostname;
  const url = `chrome-extension://${extensionId}/sidepanel.html`;
  let page = (await listTargets()).find(
    (target) => target.type === "page" && target.url === url,
  );
  if (!page) {
    const created = await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
      { method: "PUT" },
    );
    page = await created.json();
  }
  const client = await connect(page.webSocketDebuggerUrl);
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const result = await client.send("Runtime.evaluate", {
    expression: `(async () => {
      async function imageFile(name, color, width = 128, height = 128, inset = 30) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.fillStyle = color;
        context.fillRect(inset, inset, width - inset * 2, height - inset * 2);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        return new File([blob], name, { type: "image/png" });
      }

      const ready = {
        connection: document.querySelector("#vfConnection span")?.textContent,
        directory: document.querySelector("#vfExportPath")?.textContent,
        pickerAvailable: typeof showDirectoryPicker === "function",
        store: Boolean(window.VisualForgeStore),
        jobs: Boolean(window.VisualForgeJobs),
      };

      const logo = await imageFile("logo.png", "#ff0000", 64, 64, 16);
      let job = await VisualForgeJobs.create(
        "logo_recolor",
        {
          colors: ["#00AA00", "#0000AA"],
          remove_background: "false",
          trim: true,
        },
        [logo]
      );
      const deadline = Date.now() + 15000;
      while (["queued", "running"].includes(job.status) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        job = await VisualForgeJobs.get(job.id);
      }
      const logoImages = (job.outputs || []).filter(
        (asset) => asset.display !== false && asset.type?.startsWith("image/"),
      );

      const master = await imageFile("master.png", "#203050", 128, 128, 32);
      const variant = await imageFile("variant.png", "#AA2222", 128, 128, 32);
      let colorJob = await VisualForgeJobs.create(
        "product_color_finalize",
        {
          colors: [{ hex: "#AA2222", name: "测试红" }],
          pass_limit: 3,
          review_limit: 5,
          region: "whole",
          sheet_columns: 4,
        },
        [master, variant]
      );
      while (["queued", "running"].includes(colorJob.status) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        colorJob = await VisualForgeJobs.get(colorJob.id);
      }
      const corrected = (colorJob.outputs || []).find(
        (asset) => asset.variant_type === "corrected",
      );

      let generateJob = await VisualForgeJobs.create(
        "product_generate",
        {
          prompt: "极简陶瓷杯",
          count: 2,
          size: "512x512",
          quality: "high",
        },
        []
      );
      while (["queued", "running"].includes(generateJob.status) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        generateJob = await VisualForgeJobs.get(generateJob.id);
      }
      const generatedImages = (generateJob.outputs || []).filter(
        (asset) => asset.variant_type === "product_variant",
      );

      const patternBase = await imageFile("pattern-base.png", "#eeeeee", 160, 160, 28);
      const patternA = await imageFile("pattern-a.png", "#335577", 160, 160, 20);
      const patternB = await imageFile("pattern-b.png", "#773355", 160, 160, 20);
      let patternJob = await VisualForgeJobs.create(
        "pattern_batch_finalize",
        {
          references: [{ name: "pattern-a.png" }, { name: "pattern-b.png" }],
          background_mode: "keep",
          batch_index: 1,
        },
        [patternBase, patternA, patternB]
      );
      while (["queued", "running"].includes(patternJob.status) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        patternJob = await VisualForgeJobs.get(patternJob.id);
      }
      const patterns = (patternJob.outputs || []).filter(
        (asset) => asset.variant_type === "pattern_transfer",
      );

      return JSON.stringify({
        ...ready,
        logoStatus: job.status,
        logoError: job.error,
        logoImages: logoImages.length,
        logoArchiveError: job.archive_error,
        colorStatus: colorJob.status,
        colorError: colorJob.error,
        colorDelta: corrected?.delta_e,
        colorQuality: corrected?.qa_status,
        generateStatus: generateJob.status,
        generateError: generateJob.error,
        generatedImages: generatedImages.length,
        patternStatus: patternJob.status,
        patternError: patternJob.error,
        patterns: patterns.length,
      });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text,
    );
  }
  const payload = JSON.parse(result.result.value);
  if (!payload.store || !payload.jobs || !payload.pickerAvailable) {
    throw new Error(`Extension modules missing: ${JSON.stringify(payload)}`);
  }
  if (payload.logoStatus !== "succeeded" || payload.logoImages !== 2) {
    throw new Error(`Logo job failed: ${JSON.stringify(payload)}`);
  }
  if (payload.colorStatus !== "succeeded" || !Number.isFinite(payload.colorDelta)) {
    throw new Error(`Product color job failed: ${JSON.stringify(payload)}`);
  }
  if (payload.generateStatus !== "succeeded" || payload.generatedImages !== 2) {
    throw new Error(`Product generation failed: ${JSON.stringify(payload)}`);
  }
  if (payload.patternStatus !== "succeeded" || payload.patterns !== 2) {
    throw new Error(`Pattern job failed: ${JSON.stringify(payload)}`);
  }
  if (client.exceptions.length) {
    throw new Error(`Page exceptions: ${client.exceptions.join(" | ")}`);
  }
  await client.send("Page.reload", { ignoreCache: true });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const reloadResult = await client.send("Runtime.evaluate", {
    expression: `(async () => JSON.stringify({
      connection: document.querySelector("#vfConnection span")?.textContent,
      jobs: (await VisualForgeJobs.list(20)).length,
      cards: document.querySelectorAll(".vf-job").length
    }))()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (reloadResult.exceptionDetails) {
    throw new Error(
      reloadResult.exceptionDetails.exception?.description ||
        reloadResult.exceptionDetails.text,
    );
  }
  const reloadPayload = JSON.parse(reloadResult.result.value);
  if (
    reloadPayload.connection !== "扩展演示模型" ||
    reloadPayload.jobs < 4 ||
    reloadPayload.cards < 4
  ) {
    throw new Error(`History did not survive reload: ${JSON.stringify(reloadPayload)}`);
  }
  const optionsUrl = `chrome-extension://${extensionId}/options.html`;
  const optionsResponse = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(optionsUrl)}`,
    { method: "PUT" },
  );
  const optionsPage = await optionsResponse.json();
  const optionsClient = await connect(optionsPage.webSocketDebuggerUrl);
  await optionsClient.send("Runtime.enable");
  await new Promise((resolve) => setTimeout(resolve, 700));
  const optionsResult = await optionsClient.send("Runtime.evaluate", {
    expression: `(async () => {
      document.querySelector("#modelProvider").value = "mock";
      document.querySelector("#save").click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return JSON.stringify({
        hasProvider: Boolean(document.querySelector("#modelProvider")),
        hasApiKey: Boolean(document.querySelector("#apiKey")),
        hasLegacyLocalApi: document.body.innerText.includes("127.0.0.1:8765"),
        saveStatus: document.querySelector("#status")?.textContent,
      });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (optionsResult.exceptionDetails) {
    throw new Error(
      optionsResult.exceptionDetails.exception?.description ||
        optionsResult.exceptionDetails.text,
    );
  }
  const optionsPayload = JSON.parse(optionsResult.result.value);
  if (
    !optionsPayload.hasProvider ||
    !optionsPayload.hasApiKey ||
    optionsPayload.hasLegacyLocalApi ||
    !optionsPayload.saveStatus.includes("已保存")
  ) {
    throw new Error(`Options page failed: ${JSON.stringify(optionsPayload)}`);
  }
  console.log(JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(reloadPayload, null, 2));
  console.log(JSON.stringify(optionsPayload, null, 2));
  client.close();
  optionsClient.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
