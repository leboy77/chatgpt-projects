const port = Number(process.argv[2]);
const targetId = process.argv[3];
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
  (response) => response.json(),
);
const target = targets.find((item) => item.id === targetId);
if (!target) throw new Error(`Target not found: ${targetId}`);

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
            const visible = (element) => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            };
            const text = String(document.body.innerText || "");
            const pagerMatches = [...text.matchAll(/共有?\\s*(\\d+)\\s*条/g)];
            return {
              title: document.title,
              loading: /正在获取商品数据|请勿关闭此页面/.test(text),
              pagerTotal: pagerMatches.length
                ? Number(pagerMatches.at(-1)[1])
                : null,
              tail: text.slice(-300),
              inputs: [...document.querySelectorAll("input")]
                .filter(visible)
                .map((input) => ({
                  value: input.value,
                  placeholder: input.placeholder,
                  readOnly: input.readOnly
                })),
              rows: document.querySelectorAll("tbody tr").length
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
