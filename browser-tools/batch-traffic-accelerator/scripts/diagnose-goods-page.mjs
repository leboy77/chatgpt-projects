const port = Number(process.argv[2] || 63002);
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
          awaitPromise: true,
          expression: `(async () => {
            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const visible = (element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== "none" &&
                style.visibility !== "hidden"
              );
            };
            const text = (element) =>
              String(element?.innerText || element?.textContent || "")
                .replace(/\\s+/g, " ")
                .trim();
            if (${JSON.stringify(process.argv[4] === "expand")}) {
              document.querySelector('[class*="fold-btn___"]')?.click();
              await delay(800);
            }
            return {
              title: document.title,
              url: location.href,
              bodyStart: document.body.innerText.slice(0, 1600),
              inputs: [...document.querySelectorAll("input")]
                .filter(visible)
                .map((input) => ({
                  placeholder: input.placeholder,
                  value: input.value,
                  type: input.type,
                  readOnly: input.readOnly,
                  className: String(input.className),
                  parentText: text(input.parentElement).slice(0, 200)
                }))
                .slice(0, 80),
              expandTexts: [...document.querySelectorAll("*")]
                .filter(
                  (element) =>
                    visible(element) &&
                    text(element) === "展开"
                )
                .slice(0, 20)
                .map((element) => ({
                  tag: element.tagName,
                  className: String(element.className),
                  parentText: text(element.parentElement).slice(0, 200)
                })),
              specTexts: [...document.querySelectorAll("*")]
                .filter(
                  (element) =>
                    visible(element) &&
                    /展开|收起|规格|SKU/.test(text(element)) &&
                    element.children.length < 5
                )
                .slice(0, 80)
                .map((element) => ({
                  tag: element.tagName,
                  className: String(element.className),
                  text: text(element).slice(0, 200)
                }))
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
