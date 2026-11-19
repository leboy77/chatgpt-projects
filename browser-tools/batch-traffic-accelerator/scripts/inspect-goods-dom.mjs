const port = Number(process.argv[2] || 52618);
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
  (response) => response.json(),
);
const target = targets.find(
  (item) =>
    item.type === "page" &&
    item.url.includes("agentseller.temu.com/goods/list"),
);
if (!target) throw new Error("Goods page not found");

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
          returnByValue: true,
          expression: `(() => {
            const rows = [...document.querySelectorAll("tbody tr")];
            const pairs = rows.map((row) => {
              const text = String(row.innerText || "");
              const spu = text.match(/SPU ID：\\s*(\\d+)/)?.[1] || "";
              const skc = text.match(/SKC ID：\\s*(\\d+)/)?.[1] || "";
              return { spu, skc };
            }).filter((pair) => pair.spu && pair.skc);
            const scrollables = [...document.querySelectorAll("div")]
              .filter((element) => {
                const style = getComputedStyle(element);
                return (
                  element.scrollHeight > element.clientHeight + 100 &&
                  element.clientHeight > 200 &&
                  /(auto|scroll)/.test(style.overflowY) &&
                  element.querySelector("tbody tr")
                );
              })
              .map((element) => ({
                className: String(element.className),
                clientHeight: element.clientHeight,
                scrollHeight: element.scrollHeight,
                scrollTop: element.scrollTop
              }));
            return {
              rowCount: rows.length,
              pairCount: pairs.length,
              uniquePairCount: new Set(
                pairs.map((pair) => pair.spu + ":" + pair.skc)
              ).size,
              pagerText:
                [...document.querySelectorAll("*")]
                  .filter((element) => /共有\\s*\\d+\\s*条/.test(element.textContent || ""))
                  .map((element) => String(element.innerText || "").trim())
                  .filter(Boolean)
                  .slice(-5),
              scrollables
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
