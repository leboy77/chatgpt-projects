import fs from "node:fs/promises";

const endpoint = process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:53534";
const mode = process.env.LIVE_SAFETY_MODE || "prepare";
const shouldResume = process.env.LIVE_SAFETY_START !== "false";
const backupPath = "test-artifacts/live-safety-backup.json";

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
  const task = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) task.reject(new Error(message.error.message));
  else task.resolve(message.result);
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
  if (mode === "prepare") {
    const stored = await evaluate(
      `chrome.storage.local.get(["settings", "runtime"])`
    );
    await fs.mkdir("test-artifacts", { recursive: true });
    await fs.writeFile(
      backupPath,
      JSON.stringify(
        {
          settings: stored.settings || {},
          running: Boolean(stored.runtime?.running)
        },
        null,
        2
      ),
      "utf8"
    );
    await evaluate(`
      Promise.all([
        chrome.storage.local.get("settings").then(({ settings }) =>
          chrome.storage.local.set({
            settings: { ...(settings || {}), mode: "observe" }
          })
        ),
        chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(
          ([tab]) => tab?.id
            ? chrome.tabs.sendMessage(tab.id, { type: "stopMonitor" })
            : null
        )
      ])
    `);
    console.log(
      JSON.stringify(
        {
          mode,
          runningBefore: Boolean(stored.runtime?.running),
          settingsBefore: stored.settings
        },
        null,
        2
      )
    );
  } else {
    const backup = JSON.parse(await fs.readFile(backupPath, "utf8"));
    await evaluate(`
      chrome.storage.local.set({ settings: ${JSON.stringify(
        backup.settings || {}
      )} })
    `);
    if (backup.running && shouldResume) {
      await evaluate(`
        chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(
          ([tab]) => tab?.id
            ? chrome.tabs.sendMessage(tab.id, { type: "startMonitor" })
            : null
        )
      `);
    }
    console.log(
      JSON.stringify(
        {
          mode,
          restoredSettings: backup.settings,
          restoredRunning: backup.running
        },
        null,
        2
      )
    );
  }
} finally {
  socket.close();
}
