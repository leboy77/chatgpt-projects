import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const endpoint = process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:53534";
const browser = await chromium.connectOverCDP(endpoint);
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes("ads.temu.com/ad-list.html"));
  if (!page) throw new Error("未找到商品推广页面");
  await page.bringToFront();

  const captures = [];
  page.on("response", async (response) => {
    const request = response.request();
    if (!request.url().includes("/api/v1/coconut/ad/ads_detail")) return;
    let body = "";
    try {
      body = (await response.text()).slice(0, 2000);
    } catch (_) {
      body = "";
    }
    captures.push({
      method: request.method(),
      postData: request.postData() || "",
      headers: request.headers(),
      status: response.status(),
      body
    });
  });

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
  const id = 1;
  socket.send(
    JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: {
        expression: `(() => {
          const button = [...document.querySelectorAll("button")]
            .find((item) => item.textContent.trim() === "立即读取");
          if (!button) return false;
          button.click();
          return true;
        })()`,
        returnByValue: true
      }
    })
  );
  await page.waitForTimeout(18_000);
  socket.close();
  console.log(
    JSON.stringify(
      captures.map((capture) => ({
        method: capture.method,
        postData: capture.postData,
        requestHeaders: {
          accept: capture.headers.accept,
          contentType: capture.headers["content-type"],
          adRequestId: capture.headers["x-ad-request-id"],
          phanDataPresent: Boolean(capture.headers["x-phan-data"])
        },
        status: capture.status,
        responsePrefix: capture.body.slice(0, 500)
      })),
      null,
      2
    )
  );
} finally {
  await browser.close();
}
