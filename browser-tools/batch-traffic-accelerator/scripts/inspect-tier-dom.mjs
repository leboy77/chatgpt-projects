const port = Number(process.argv[2] || 52618);
const requestedTargetId = process.argv[3];
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
  (response) => response.json(),
);
const target = requestedTargetId
  ? targets.find((item) => item.id === requestedTargetId)
  : targets.find(
      (item) =>
        item.type === "page" &&
        item.url.includes("agentseller-eu.temu.com/main/flux-analysis"),
    );
if (!target) throw new Error("Traffic page not found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

try {
  const id = nextId++;
  const result = await new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(
      JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: {
          awaitPromise: true,
          returnByValue: true,
          expression: `(async () => {
            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const exists = (text) =>
              [...document.querySelectorAll("a,button,span,div")].some(
                (element) =>
                  String(element.textContent || "").replace(/\\s+/g, " ").trim() === text &&
                  element.getBoundingClientRect().height > 0
              );
            const click = (selector, text) => {
              const element = [...document.querySelectorAll(selector)]
                .filter(
                  (item) =>
                    String(item.textContent || "").replace(/\\s+/g, " ").trim() === text &&
                    item.getBoundingClientRect().height > 0
                )
                .at(-1);
              element?.click();
              return Boolean(element);
            };
            if (!exists("流量加速器待开启")) {
              click("button", "重置");
              await delay(500);
              click("span", "流量加速器待开启");
              await delay(1800);
            }
            click("a", "立即开启");
            await delay(1800);
            const tierItems = [...document.querySelectorAll('[class*="flux-shift-table_item__"]')]
              .filter((item) => item.getBoundingClientRect().height > 0);
            const candidates = [...document.querySelectorAll('*')]
              .filter((element) => {
                const text = String(element.textContent || "").replace(/\\s+/g, " ").trim();
                return (
                  element.getBoundingClientRect().height > 0 &&
                  (text.includes("SKU信息") || /混合色-S|Mixed Color2-S/.test(text))
                );
              })
              .slice(0, 80)
              .map((element) => ({
                tag: element.tagName,
                className: String(element.className),
                text: String(element.innerText || "").replace(/\\s+/g, " ").slice(0, 600)
              }));
            return {
              hasTier: document.body.innerText.includes("流量加速时效"),
              hasContinue: document.body.innerText.includes("去获取"),
              tierItems: tierItems.map((item) => ({
                className: String(item.className),
                text: String(item.innerText || "").replace(/\\s+/g, " ")
              })),
              candidates
            };
          })()`
        }
      }),
    );
  });
  console.log(JSON.stringify(result.result.value, null, 2));
} finally {
  socket.close();
}
