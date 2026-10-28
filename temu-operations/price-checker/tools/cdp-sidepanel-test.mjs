#!/usr/bin/env node

import fs from "node:fs/promises";

const [webSocketUrl, pageUrl, screenshotPath] = process.argv.slice(2);
if (!webSocketUrl || !pageUrl || !screenshotPath) {
  console.error(
    "Usage: node tools/cdp-sidepanel-test.mjs <webSocketDebuggerUrl> <pageUrl> <screenshotPath>",
  );
  process.exit(2);
}

const socket = new WebSocket(webSocketUrl);
let nextId = 1;
const pending = new Map();
const exceptions = [];

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") {
    exceptions.push(
      message.params?.exceptionDetails?.exception?.description ||
        message.params?.exceptionDetails?.text ||
        "Unknown runtime exception",
    );
  }
  if (!message.id || !pending.has(message.id)) {
    return;
  }
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) {
    reject(new Error(JSON.stringify(message.error)));
  } else {
    resolve(message.result);
  }
});

socket.addEventListener("open", async () => {
  try {
    await send("Page.enable");
    await send("Runtime.enable");

    const mockSource = `
      Object.defineProperty(globalThis, "chrome", {
        configurable: true,
        value: {
          runtime: {
            getURL: (path) => "http://127.0.0.1:8765/dist/extension/" + path
          },
          storage: {
            local: {
              get: async () => ({}),
              set: async () => undefined
            }
          },
          downloads: {
            download: async () => 1
          },
          tabs: {
            query: async () => [{
              id: 1,
              url: "https://agentseller.temu.com/newon/product-select"
            }],
            sendMessage: async () => ({
              ok: true,
              mode: "READ_ONLY_INSPECTION",
              url: "https://agentseller.temu.com/newon/product-select",
              authenticated: true,
              filtersDetected: false,
              reviewDialogDetected: false
            })
          }
        }
      });
    `;
    await send("Page.addScriptToEvaluateOnNewDocument", { source: mockSource });
    await send("Page.navigate", { url: pageUrl });
    await wait(900);
    await send("Emulation.setDeviceMetricsOverride", {
      width: 430,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const result = await send("Runtime.evaluate", {
      expression: `
        (async () => {
          const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const productCode = document.querySelector("#product-code");
          const pasted = document.querySelector("#pasted-skc");
          productCode.value = "Y2-18";
          pasted.value = Array.from(
            { length: 1000 },
            (_, index) => "74123456" + String(index).padStart(4, "0")
          ).join("\\n");
          document.querySelector("#import-pasted").click();
          await delay(250);

          const country = document.querySelector('[data-country-code="US"]');
          country.checked = true;
          country.dispatchEvent(new Event("change", { bubbles: true }));
          const price = document.querySelector('[data-country-price="US"]');
          price.value = "55";
          price.dispatchEvent(new Event("input", { bubbles: true }));
          await delay(100);
          document.querySelector("#inspect-page").click();
          await delay(150);

          return {
            validCount: document.querySelector("#valid-count")?.textContent,
            batchCount: document.querySelector("#batch-count")?.textContent,
            chips: document.querySelectorAll(".batch-chip").length,
            inspectDisabled: document.querySelector("#inspect-page")?.disabled,
            status: document.querySelector("#global-status")?.textContent,
            login: document.querySelector("#diagnostic-login")?.textContent,
            overflow:
              document.documentElement.scrollWidth >
              document.documentElement.clientWidth
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });

    const screenshot = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
    });
    await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

    if (result.exceptionDetails) {
      exceptions.push(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text,
      );
    }

    console.log(
      JSON.stringify(
        {
          pageResult: result.result?.value,
          exceptions,
          screenshotPath,
        },
        null,
        2,
      ),
    );
    socket.close();
  } catch (error) {
    console.error(error.message);
    socket.close();
    process.exitCode = 1;
  }
});

socket.addEventListener("error", () => {
  console.error("WebSocket connection failed");
  process.exitCode = 1;
});
