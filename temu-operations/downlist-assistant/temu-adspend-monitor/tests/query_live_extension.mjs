const endpoint = process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:53534";
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
  const value = await evaluate(`
    chrome.storage.local.get([
      "settings",
      "runtime",
      "preferredAdPageSize",
      "lockedAdTab"
    ]).then((stored) => ({
      settings: stored.settings,
      preferredAdPageSize: stored.preferredAdPageSize,
      lockedAdTab: stored.lockedAdTab,
      runtime: stored.runtime,
      uiMessage: document.querySelector("#settingsMessage")?.textContent || "",
      connectionBadge:
        document.querySelector("#connectionBadge")?.textContent || ""
    }))
  `);
  console.log(
    JSON.stringify(
      {
        settings: value.settings,
        uiMessage: value.uiMessage,
        connectionBadge: value.connectionBadge,
        lockedAdTab: value.lockedAdTab,
        preferredAdPageSize: value.preferredAdPageSize,
        runtime: {
          running: value.runtime?.running,
          totalAds: value.runtime?.totalAds,
          spus: value.runtime?.spus?.length,
          hitCount: (value.runtime?.spus || []).filter(
            (summary) => summary.rule?.hit
          ).length,
          hitSample: (value.runtime?.spus || [])
            .filter((summary) => summary.rule?.hit)
            .slice(0, 5)
            .map((summary) => ({
              spuId: summary.spuId,
              spendCny: summary.spendCny,
              orderCount: summary.orderCount,
              costPerOrderCny: summary.costPerOrderCny,
              status: summary.status,
              reasons: summary.rule?.reasons || []
            })),
          lastFetchMs: value.runtime?.lastFetchMs,
          pageSize: value.runtime?.pageSize,
          lastCheckAt: value.runtime?.lastCheckAt,
          lastError: value.runtime?.lastError
        }
      },
      null,
      2
    )
  );
} finally {
  socket.close();
}
