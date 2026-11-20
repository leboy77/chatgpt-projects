import { readFile } from "node:fs/promises";

const port = 52618;
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
  response.json(),
);
const target = targets.find(
  (item) => item.type === "page" && item.url.includes("temu.com/goods/list"),
);
if (!target) throw new Error("TEMU goods list page was not found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
const ready = new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

try {
  await ready;
  const source = await readFile("content/content.js", "utf8");
  await send("Runtime.evaluate", {
    expression: `(() => {
      delete window.__SPEC_TRAFFIC_ACCELERATOR__;
      window.chrome.runtime = {
        id: "content-test",
        onMessage: {
          addListener(handler) {
            window.__trafficSpecHandler = handler;
          }
        },
        sendMessage() {
          return Promise.resolve({ ok: true });
        }
      };
    })()`,
  });
  await send("Runtime.evaluate", { expression: source });
  const result = await send("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      window.__trafficSpecResult = null;
      window.__trafficSpecHandler(
        {
          type: "SCAN_GOODS",
          config: { skuKeyword: "DWRG", specName: "Mixed Color2" }
        },
        {},
        (result) => {
          window.__trafficSpecResult = result;
        }
      );
      const startedAt = Date.now();
      while (!window.__trafficSpecResult && Date.now() - startedAt < 75000) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return window.__trafficSpecResult;
    })()`,
  });
  const value = result.result.value;
  if (
    value &&
    value.ok === false &&
    /商品(?:数据)?数量校验失败|加载超时/.test(value.error || "")
  ) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          guarded: true,
          error: value.error
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  if (
    !value?.ok ||
    !value.pairs?.length ||
    (value.total != null && value.rawCount !== value.total) ||
    !value.pairs.some(
      (pair) =>
        pair.spu === "21000000016" && pair.skc === "220000000016",
    )
  ) {
    throw new Error(`Content script scan failed: ${JSON.stringify(value)}`);
  }
  console.log(
    JSON.stringify(
      {
        ok: value.ok,
        total: value.total,
        rawCount: value.rawCount,
        verified: value.verified,
        pairCount: value.pairs.length,
        pages: value.pages
      },
      null,
      2,
    ),
  );
} finally {
  socket.close();
}
