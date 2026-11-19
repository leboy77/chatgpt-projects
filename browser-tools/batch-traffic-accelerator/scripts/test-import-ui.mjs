import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const profile = await mkdtemp(path.join(tmpdir(), "traffic-import-"));
const port = 9339;
const browser = spawn(
  edge,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--disable-background-networking",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true },
);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForPage(timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
        (response) => response.json(),
      );
      const page = targets.find((target) => target.type === "page");
      if (page) return page;
    } catch {
      // Browser is still starting.
    }
    await delay(200);
  }
  throw new Error("Timed out waiting for browser");
}
function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return {
    ready,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

try {
  const page = await waitForPage();
  const cdp = connect(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Page.navigate", {
    url: "http://127.0.0.1:8899/sidepanel/panel.html",
  });
  await delay(1200);

  const input = await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#importFile")`,
  });
  await cdp.send("DOM.setFileInputFiles", {
    objectId: input.result.objectId,
    files: [
      "C:\\Users\\QZJLKJ\\Downloads\\7414\\Temu全球核价助手_导入模板_v2 (2).xlsx",
    ],
  });
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#importFile").dispatchEvent(new Event("change", { bubbles: true }))`,
  });
  await delay(1800);

  const result = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      summary: document.querySelector("#importSummary").textContent.trim(),
      stationRows: document.querySelectorAll(".station-row").length,
      enabledRows: document.querySelectorAll(".station-row:not(.is-disabled)").length,
      toast: document.querySelector("#toast").textContent.trim()
    })`,
  });
  const value = result.result.value;
  if (value.stationRows !== 59 || !value.summary.includes("59 个站点")) {
    throw new Error(`Unexpected import result: ${JSON.stringify(value)}`);
  }
  console.log(JSON.stringify(value, null, 2));

  const autoEnableFile = path.join(profile, "auto-enable.csv");
  await writeFile(
    autoEnableFile,
    [
      "国家代码,国家名称,分组,启用(是/否),其他规格价格(RMB),指定规格价格(RMB),档位匹配价格(RMB),提交方式,备注",
      "DE,德国,欧盟,否,111,RMB 120,,指定规格批量加速,指定价格自动启用",
      "FR,法国,欧盟,否,17,,,指定规格批量加速,只有其他规格价格不启用",
      "IT,意大利,欧盟,否,125,,120,自动档位匹配,档位价格自动启用",
    ].join("\r\n"),
    "utf8",
  );
  const secondInput = await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#importFile")`,
  });
  await cdp.send("DOM.setFileInputFiles", {
    objectId: secondInput.result.objectId,
    files: [autoEnableFile],
  });
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#importFile").dispatchEvent(new Event("change", { bubbles: true }))`,
  });
  await delay(1200);
  const autoEnableResult = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      summary: document.querySelector("#importSummary").textContent.trim(),
      stationRows: document.querySelectorAll(".station-row").length,
      enabledRows: document.querySelectorAll(".station-row:not(.is-disabled)").length,
      toast: document.querySelector("#toast").textContent.trim(),
      diagnostics: document.querySelector("#importDiagnostics").textContent.trim()
    })`,
  });
  const autoEnable = autoEnableResult.result.value;
  if (
    autoEnable.stationRows !== 3 ||
    autoEnable.enabledRows !== 2 ||
    !autoEnable.summary.includes("2 个自动启用站点") ||
    !autoEnable.toast.includes("自动启用 2 个") ||
    !autoEnable.diagnostics.includes("指定规格价格 1") ||
    !autoEnable.diagnostics.includes("其他规格价格 3") ||
    !autoEnable.diagnostics.includes("档位匹配价格 1") ||
    !autoEnable.diagnostics.includes("最终启用 2")
  ) {
    throw new Error(
      `Unexpected auto-enable result: ${JSON.stringify(autoEnable)}`,
    );
  }
  console.log(JSON.stringify({ autoEnable }, null, 2));

  const placeholderFile =
    "C:\\Users\\QZJLKJ\\Downloads\\7414\\指定规格流量加速_标准导入模板 (3).xlsx";
  const thirdInput = await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#importFile")`,
  });
  await cdp.send("DOM.setFileInputFiles", {
    objectId: thirdInput.result.objectId,
    files: [placeholderFile],
  });
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#importFile").dispatchEvent(new Event("change", { bubbles: true }))`,
  });
  await delay(1200);
  const placeholderResult = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      stationRows: document.querySelectorAll(".station-row").length,
      enabledRows: document.querySelectorAll(".station-row:not(.is-disabled)").length,
      diagnostics: document.querySelector("#importDiagnostics").textContent.trim(),
      firstStation: document.querySelector(".station-row")?.innerText.replace(/\\s+/g, " ").trim()
    })`,
  });
  const placeholder = placeholderResult.result.value;
  if (
    placeholder.stationRows !== 59 ||
    placeholder.enabledRows !== 0 ||
    !placeholder.diagnostics.includes("商品 ID 43 SPU / 0 SKC") ||
    !placeholder.diagnostics.includes("最终启用 0") ||
    !placeholder.firstStation.includes("参考价")
  ) {
    throw new Error(
      `Legacy placeholder cleanup failed: ${JSON.stringify(placeholder)}`,
    );
  }
  console.log(JSON.stringify({ placeholder }, null, 2));

  const productIdFile = path.join(profile, "product-ids.csv");
  await writeFile(
    productIdFile,
    [
      "货号,SPU ID,SKC ID,启用(是/否),备注",
      "A2,43693414092,,,SPU 行",
      "A2,,592709466180,是,SKC 行",
    ].join("\r\n"),
    "utf8",
  );
  const productInput = await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#productImportFile")`,
  });
  await cdp.send("DOM.setFileInputFiles", {
    objectId: productInput.result.objectId,
    files: [productIdFile],
  });
  await cdp.send("Runtime.evaluate", {
    expression: `document.querySelector("#productImportFile").dispatchEvent(new Event("change", { bubbles: true }))`,
  });
  await delay(1200);
  const productIdResult = await cdp.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `({
      pairCount: document.querySelector("#pairCount").textContent.trim(),
      source: document.querySelector("#sourceLabel").textContent.trim(),
      rows: [...document.querySelectorAll(".pair-row")].slice(0, 2).map((row) =>
        row.innerText.replace(/\\s+/g, " ").trim()
      )
    })`,
  });
  const productIds = productIdResult.result.value;
  if (
    productIds.pairCount !== "2" ||
    !productIds.source.includes("SPU 1") ||
    !productIds.source.includes("SKC 1") ||
    !productIds.rows[0].includes("43693414092") ||
    !productIds.rows[1].includes("592709466180")
  ) {
    throw new Error(
      `Unexpected product ID import: ${JSON.stringify(productIds)}`,
    );
  }
  console.log(JSON.stringify({ productIds }, null, 2));
  cdp.close();
} finally {
  browser.kill();
  await delay(400);
  await rm(profile, { recursive: true, force: true });
}
