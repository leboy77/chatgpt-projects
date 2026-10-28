const endpoint = process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:51930";
const targets = await (await fetch(`${endpoint}/json/list`)).json();
const target = targets.find(
  (item) =>
    item.type === "iframe" &&
    String(item.url || "").startsWith("chrome-extension://") &&
    String(item.url || "").endsWith("/sidepanel.html")
);
if (!target) throw new Error("未找到扩展悬浮窗页面");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (!message.id || !pending.has(message.id)) return;
  const pendingRequest = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) {
    pendingRequest.reject(new Error(message.error.message));
  } else {
    pendingRequest.resolve(message.result);
  }
});

function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "evaluation failed");
  }
  return result.result?.value;
}

try {
  const before = await evaluate(`
    chrome.storage.local.get(["settings", "runtime"]).then((value) => ({
      settings: value.settings,
      running: value.runtime?.running || false,
      lastCheckAt: value.runtime?.lastCheckAt || null,
      lastError: value.runtime?.lastError || null
    }))
  `);
  if (before.settings?.mode === "armed") {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: "当前处于自动暂停模式；为避免真实暂停，未触发读取。",
          before
        },
        null,
        2
      )
    );
  } else {
    const clicked = await evaluate(`
      (() => {
        const button = [...document.querySelectorAll("button")]
          .find((item) => item.textContent.trim() === "立即读取");
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
    if (!clicked) throw new Error("未找到立即读取按钮");

    let after = null;
    for (let index = 0; index < 80; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      after = await evaluate(`
        chrome.storage.local.get("runtime").then((value) => value.runtime || {})
      `);
      if (
        after.lastCheckAt &&
        after.lastCheckAt !== before.lastCheckAt
      ) {
        break;
      }
      if (
        after.lastError?.at &&
        after.lastError.at !== before.lastError?.at
      ) {
        break;
      }
    }
    console.log(
      JSON.stringify(
        {
          clicked,
          before,
          after: {
            running: after?.running,
            totalAds: after?.totalAds,
            spus: after?.spus?.length,
            lastFetchMs: after?.lastFetchMs,
            lastCheckAt: after?.lastCheckAt,
            lastError: after?.lastError
          }
        },
        null,
        2
      )
    );
  }
} finally {
  socket.close();
}
