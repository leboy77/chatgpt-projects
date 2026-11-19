const port = Number(process.argv[2] || 63002);
const targetId = process.argv[3];
const targetPrices = {
  target: Number(process.argv[4] || 23.37),
  other: Number(process.argv[5] || 24.17),
};
const confirmAndReopen = process.argv[6] === "confirm";
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
  (response) => response.json(),
);
const target = targetId
  ? targets.find((item) => item.id === targetId)
  : targets.find(
      (item) =>
        item.type === "page" && item.url.includes("/main/flux-analysis"),
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
            const clean = (value) =>
              String(value || "").replace(/\\s+/g, " ").trim();
            const findText = (selector, text) =>
              [...document.querySelectorAll(selector)]
                .filter(
                  (element) =>
                    visible(element) && clean(element.textContent) === text
                )
                .at(-1);
            let link = findText("a", "去获取") || findText("[role=link]", "去获取");
            link?.scrollIntoView({ block: "center" });
            link?.click();
            await delay(1200);
            const heading = [...document.querySelectorAll("*")].find(
              (element) =>
                visible(element) && clean(element.textContent) === "调整申报价"
            );
            if (!heading) return { error: "调整申报价 modal not found" };
            let modal = heading;
            for (let depth = 0; modal && depth < 12; depth++) {
              if (modal.querySelectorAll("tbody tr").length >= 2) break;
              modal = modal.parentElement;
            }
            const rows = [...modal.querySelectorAll("tbody tr")].filter(visible);
            const setNativeValue = (input, value) => {
              const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value"
              ).set;
              setter.call(input, String(value));
              input.dispatchEvent(
                new InputEvent("input", {
                  bubbles: true,
                  inputType: "insertText",
                  data: String(value)
                })
              );
              input.dispatchEvent(new Event("change", { bubbles: true }));
              input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
            };
            const before = rows.map((row) => ({
              text: clean(row.innerText).slice(0, 300),
              value: row.querySelector("input")?.value || ""
            }));
            for (const row of rows) {
              const input = row.querySelector("input");
              if (!input) continue;
              const rowText = clean(row.innerText);
              const isTarget = /Mixed color1/i.test(rowText);
              setNativeValue(
                input,
                isTarget
                  ? ${JSON.stringify(targetPrices.target)}
                  : ${JSON.stringify(targetPrices.other)}
              );
            }
            await delay(700);
            const after = rows.map((row) => ({
              text: clean(row.innerText).slice(0, 300),
              value: row.querySelector("input")?.value || ""
            }));
            const modalText = clean(modal.innerText);
            let reopened = null;
            if (${JSON.stringify(confirmAndReopen)}) {
              findText("button", "确认")?.click();
              await delay(1500);
              const more = findText("a", "去获取") || findText("[role=link]", "去获取");
              more?.click();
              await delay(1200);
              const reopenedHeading = [...document.querySelectorAll("*")].find(
                (element) =>
                  visible(element) && clean(element.textContent) === "调整申报价"
              );
              let reopenedModal = reopenedHeading;
              for (let depth = 0; reopenedModal && depth < 12; depth++) {
                if (reopenedModal.querySelectorAll("tbody tr").length >= 2) break;
                reopenedModal = reopenedModal.parentElement;
              }
              reopened = [...(reopenedModal?.querySelectorAll("tbody tr") || [])]
                .filter(visible)
                .map((row) => ({
                  text: clean(row.innerText).slice(0, 300),
                  value: row.querySelector("input")?.value || ""
                }));
              findText("button", "取消")?.click();
              await delay(500);
            } else {
              const cancel = findText("button", "取消");
              cancel?.click();
              await delay(500);
            }
            return {
              rowCount: rows.length,
              before,
              after,
              reopened,
              modalText: modalText.slice(0, 2000),
              currencyHints: ["CNY", "USD", "RMB", "¥", "$"].filter((item) =>
                modalText.includes(item)
              )
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
