"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = Number(process.argv[2] || 9333);

async function target() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await response.json();
  return targets.find((item) => item.type === "page");
}

async function cdp(url) {
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
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    close() {
      socket.close();
    },
  };
}

async function main() {
  const page = await target();
  if (!page) throw new Error("No Muse page found");
  const client = await cdp(page.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Page.navigate", {
    url: "https://muse.ai/",
  });
  await new Promise((resolve) => setTimeout(resolve, 2500));

  const parserSource = fs.readFileSync(
    path.join(root, "command-parser.js"),
    "utf8",
  );
  const contentSource = fs.readFileSync(
    path.join(root, "content.js"),
    "utf8",
  );
  const masterSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="500">
      <rect width="400" height="500" fill="#e7e2d8"/>
      <path d="M95 110H305L270 455H125Z" fill="#1d2a44"/>
    </svg>
  `;
  const generatedSvg = masterSvg.replace("#1d2a44", "#8c1a2d");
  const mock = `
    document.querySelectorAll(".vf-test-muse").forEach((node) => node.remove());
    document.body.insertAdjacentHTML("beforeend", \`
      <form class="vf-test-muse" style="position:fixed;left:20px;bottom:20px;z-index:9">
        <textarea id="vf-test-composer" style="width:300px;height:80px"></textarea>
        <input id="vf-test-file" type="file" accept="image/*">
        <button id="vf-test-send" type="button" aria-label="Send message">Send</button>
        <div id="vf-test-images"></div>
      </form>
    \`);
    document.querySelector("#vf-test-send").addEventListener("click", () => {
      const prompt = document.querySelector("#vf-test-composer").value;
      const match = prompt.match(/本批必须输出 (\\d+) 张/);
      const count = match ? Number(match[1]) : 1;
      for (let index = 0; index < count; index += 1) {
        const image = new Image();
        image.src = ${JSON.stringify(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(generatedSvg)}`,
      )};
        image.style.cssText = "width:300px;height:380px;display:block";
        const wrapper = document.createElement("div");
        wrapper.setAttribute(
          "data-testid",
          "hatch-chat-attachment-presentation-image",
        );
        wrapper.append(image);
        document.querySelector("#vf-test-images").append(wrapper);
      }
    });
    window.__vfCalls = [];
    window.__vfListeners = [];
    window.chrome = window.chrome || {};
    window.chrome.runtime = {
      lastError: null,
      getURL(path) {
        return "about:blank";
      },
      sendMessage(message, callback) {
        window.__vfCalls.push(message);
        setTimeout(() => callback?.({ ok: true, data: {} }), 0);
      },
      onMessage: {
        addListener(listener) {
          window.__vfListeners.push(listener);
        }
      }
    };
    document.querySelector("#vf-muse-toast")?.remove();
    delete window.__VF_MUSE_BRIDGE_LOADED__;
  `;
  await client.send("Runtime.evaluate", {
    expression: `${mock}\n${parserSource}\n${contentSource}`,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));

  const commandCheck = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const editor = document.querySelector("#vf-test-composer");
      editor.value = "/vf product-colors #8C1A2D";
      editor.focus();
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true
      });
      const delivered = editor.dispatchEvent(event);
      return JSON.stringify({
        prevented: !delivered,
        value: editor.value,
        calls: window.__vfCalls
      });
    })()`,
    returnByValue: true,
  });
  const commandResult = JSON.parse(commandCheck.result.value);
  if (!commandResult.prevented || commandResult.value) {
    throw new Error("Muse command was not intercepted and cleared");
  }

  const masterBase64 = Buffer.from(masterSvg).toString("base64");
  const generationCheck = await client.send("Runtime.evaluate", {
    expression: `new Promise((resolve) => {
      const listener = window.__vfListeners.at(-1);
      listener(
        {
          type: "VF_MUSE_GENERATE_COLOR",
          master: {
            name: "master.svg",
            type: "image/svg+xml",
            data: ${JSON.stringify(masterBase64)}
          },
          color: { hex: "#8C1A2D", name: "酒红" },
          index: 1,
          total: 1
        },
        {},
        resolve
      );
    })`,
    awaitPromise: true,
    returnByValue: true,
  });
  const generation = generationCheck.result.value;
  if (!generation?.ok || !generation.data?.name.includes("8C1A2D")) {
    throw new Error(generation?.error || "Muse generation bridge failed");
  }

  const patternCheck = await client.send("Runtime.evaluate", {
    expression: `new Promise((resolve) => {
      const listener = window.__vfListeners.at(-1);
      listener(
        {
          type: "VF_MUSE_GENERATE_PATTERN",
          base: {
            name: "white-base.svg",
            type: "image/svg+xml",
            data: ${JSON.stringify(masterBase64)}
          },
          reference: {
            name: "camo.svg",
            type: "image/svg+xml",
            data: ${JSON.stringify(masterBase64)}
          },
          backgroundMode: "match",
          index: 1,
          total: 1
        },
        {},
        resolve
      );
    })`,
    awaitPromise: true,
    returnByValue: true,
  });
  const pattern = patternCheck.result.value;
  if (!pattern?.ok || !pattern.data?.name.startsWith("pattern-01")) {
    throw new Error(pattern?.error || "Pattern transfer bridge failed");
  }

  const batchCheck = await client.send("Runtime.evaluate", {
    expression: `new Promise((resolve) => {
      const listener = window.__vfListeners.at(-1);
      listener(
        {
          type: "VF_MUSE_GENERATE_PATTERN_BATCH",
          base: {
            name: "white-base.svg",
            type: "image/svg+xml",
            data: ${JSON.stringify(masterBase64)}
          },
          archive: {
            name: "batch-01.zip",
            type: "application/zip",
            data: ${JSON.stringify(
              Buffer.from("reference archive").toString("base64"),
            )}
          },
          backgroundMode: "keep",
          references: [
            { name: "camo.svg", relative_path: "refs/camo.svg" },
            { name: "winter.svg", relative_path: "refs/winter.svg" }
          ],
          index: 1,
          total: 2
        },
        {},
        resolve
      );
    })`,
    awaitPromise: true,
    returnByValue: true,
  });
  const batch = batchCheck.result.value;
  if (!batch?.ok || batch.data?.outputs?.length !== 2) {
    throw new Error(batch?.error || "Pattern batch bridge failed");
  }
  console.log(
    JSON.stringify(
      {
        commandIntercepted: commandResult.prevented,
        generatedFile: generation.data.name,
        generatedBytes: Math.round(generation.data.data.length * 0.75),
        patternFile: pattern.data.name,
        batchFiles: batch.data.outputs.map((item) => item.name),
      },
      null,
      2,
    ),
  );
  client.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

