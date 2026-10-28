import fs from "node:fs/promises";
import { chromium } from "../../_spreadsheet_edit_dwrg/node_modules/playwright/index.mjs";

const endpoint = process.env.BIT_CDP_ENDPOINT || "http://127.0.0.1:50262";
const browser = await chromium.connectOverCDP(endpoint);
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes("ads.temu.com/ad-list.html"));
  if (!page) throw new Error("未找到商品推广页面");

  const pointerControls = await page.evaluate(() => {
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    return [...document.querySelectorAll("*")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.cursor === "pointer" &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 8 &&
          rect.height > 8
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: normalize(element.innerText).slice(0, 120),
          title: element.getAttribute("title") || "",
          ariaLabel: element.getAttribute("aria-label") || "",
          testid: element.getAttribute("data-testid") || "",
          className: String(element.className || "").slice(0, 180),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          html: element.outerHTML.slice(0, 1200)
        };
      })
      .filter((item) => item.y < 260 || item.text.includes("刷新"))
      .slice(0, 300);
  });

  const requests = [];
  const responseHandler = async (response) => {
    const request = response.request();
    const url = request.url();
    if (!/ads\.temu\.com\/api\//.test(url)) return;
    let responseBody = "";
    try {
      const contentType = response.headers()["content-type"] || "";
      if (/json|text/.test(contentType)) {
        responseBody = (await response.text()).slice(0, 100_000);
      }
    } catch (_) {
      // Response bodies can expire before they are read.
    }
    requests.push({
      method: request.method(),
      url,
      status: response.status(),
      resourceType: request.resourceType(),
      headers: Object.fromEntries(
        Object.entries(request.headers()).filter(
          ([name]) =>
            !["cookie", "authorization", "x-csrf-token", "x-xsrf-token"].includes(
              name.toLowerCase()
            )
        )
      ),
      postData: request.postData()?.slice(0, 20_000) || "",
      responseBody
    });
  };
  page.on("response", responseHandler);

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
  const refresh = page.locator("span._2ltxkdWJ").first();
  if ((await refresh.count()) === 0) {
    throw new Error("未找到页面数据区的“刷新”控件");
  }
  await refresh.click({ timeout: 5_000 });
  await page.waitForTimeout(12_000);
  page.off("response", responseHandler);

  await fs.writeFile(
    "test-artifacts/network-capture.json",
    JSON.stringify({ pointerControls, requests }, null, 2),
    "utf8"
  );
  console.log(
    JSON.stringify(
      {
        pointerControls,
        requests: requests.map((item) => ({
          method: item.method,
          url: item.url,
          status: item.status,
          responseLength: item.responseBody.length
        }))
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
