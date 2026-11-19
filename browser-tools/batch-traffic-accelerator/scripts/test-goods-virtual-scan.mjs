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
          awaitPromise: true,
          returnByValue: true,
          expression: `(async () => {
            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const container = [...document.querySelectorAll("div")]
              .filter((element) => {
                const style = getComputedStyle(element);
                return (
                  element.scrollHeight > 5000 &&
                  element.clientHeight > 200 &&
                  /(auto|scroll)/.test(style.overflowY) &&
                  element.querySelector("tbody tr")
                );
              })
              .sort((left, right) => right.scrollHeight - left.scrollHeight)[0];
            if (!container) return { error: "virtual container not found" };
            const originalTop = container.scrollTop;
            const pairs = new Map();
            const spus = new Set();
            const collect = () => {
              for (const row of document.querySelectorAll("tbody tr")) {
                const text = String(row.innerText || "");
                const spu = text.match(/SPU ID：\\s*(\\d+)/)?.[1];
                const skc = text.match(/SKC ID：\\s*(\\d+)/)?.[1];
                if (spu && skc) {
                  spus.add(spu);
                  pairs.set(spu + ":" + skc, { spu, skc });
                }
              }
            };
            collect();
            for (
              let top = 0;
              top <= container.scrollHeight;
              top += 1000
            ) {
              container.scrollTop = top;
              container.dispatchEvent(new Event("scroll", { bubbles: true }));
              await delay(100);
              collect();
            }
            container.scrollTop = originalTop;
            return {
              count: pairs.size,
              spuCount: spus.size,
              first: [...pairs.values()].slice(0, 3),
              last: [...pairs.values()].slice(-3),
              scrollHeight: container.scrollHeight
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
