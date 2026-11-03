(() => {
  if (window.__TRAFFIC_ACCELERATOR_CONTENT__) return;
  window.__TRAFFIC_ACCELERATOR_CONTENT__ = true;

  const HOST_PATTERN = /(^|\.)temu\.com$|kuajingmaihuo\.com$/;
  if (!HOST_PATTERN.test(location.hostname)) return;

  let pill = null;
  let checkTimer = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "PING") {
      sendResponse({ ok: true, context: readContext() });
      return false;
    }

    if (message?.type === "SCAN_PAGE") {
      const result = scanPage();
      sendResponse(result);
      return false;
    }

    return false;
  });

  function readContext() {
    return {
      title: document.title,
      url: location.href,
      isTrafficAnalysis: /流量分析|流量增长/.test(document.body?.innerText || ""),
      rowCount: findDataRows().length
    };
  }

  function ensurePill() {
    const context = readContext();
    if (!context.isTrafficAnalysis) return;
    if (pill?.isConnected) return;

    pill = document.createElement("button");
    pill.type = "button";
    pill.textContent = "⚡ 批量加速";
    pill.title = "打开批量流量加速助手";
    Object.assign(pill.style, {
      position: "fixed",
      right: "22px",
      bottom: "28px",
      zIndex: "2147483647",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      height: "40px",
      padding: "0 18px",
      border: "1px solid rgba(255,255,255,.45)",
      borderRadius: "999px",
      background: "linear-gradient(135deg, #644fff, #925cff)",
      boxShadow: "0 10px 28px rgba(87, 63, 221, .34)",
      color: "#fff",
      font: "600 13px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      letterSpacing: "0.2px",
      cursor: "pointer"
    });

    pill.addEventListener("click", async () => {
      pill.disabled = true;
      pill.textContent = "正在打开…";
      try {
        const response = await chrome.runtime.sendMessage({ type: "OPEN_PANEL" });
        if (!response?.ok) throw new Error(response?.error || "无法打开侧边栏");
      } catch (error) {
        console.warn("[批量流量加速]", error);
        pill.textContent = "请点击浏览器扩展图标";
        window.setTimeout(() => {
          pill.textContent = "⚡ 批量加速";
          pill.disabled = false;
        }, 2200);
        return;
      }
      pill.textContent = "⚡ 批量加速";
      pill.disabled = false;
    });

    document.body.appendChild(pill);
  }

  function schedulePillCheck() {
    clearTimeout(checkTimer);
    checkTimer = window.setTimeout(ensurePill, 700);
  }

  new MutationObserver(schedulePillCheck).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  schedulePillCheck();

  function findDataRows() {
    const candidates = [
      ".ant-table-tbody tr",
      "[role='row']",
      "table tbody tr"
    ];
    const seen = new Set();
    const rows = [];
    for (const selector of candidates) {
      for (const row of document.querySelectorAll(selector)) {
        if (seen.has(row)) continue;
        seen.add(row);
        if (!isVisible(row)) continue;
        if (row.closest("thead")) continue;
        if (row.getAttribute("aria-hidden") === "true") continue;
        if (row.classList.contains("ant-table-measure-row")) continue;
        if (row.querySelectorAll("td, [role='gridcell']").length < 3) continue;
        rows.push(row);
      }
      if (rows.length) break;
    }
    return rows;
  }

  function scanPage() {
    const context = readContext();
    const rows = findDataRows();
    const headers = readHeaders(rows[0]);
    const products = rows
      .map((row, index) => normalizeRow(row, headers, index))
      .filter(Boolean);

    return {
      ok: true,
      context,
      products,
      diagnostics: {
        rowCount: rows.length,
        headers,
        parser: "generic-table-v1"
      }
    };
  }

  function readHeaders(firstRow) {
    const table = firstRow?.closest("table");
    const headerCells = table
      ? [...table.querySelectorAll("thead th")]
      : [...document.querySelectorAll("[role='columnheader']")];
    return headerCells.map((cell) => normalizeText(cell.textContent));
  }

  function normalizeRow(row, headers, index) {
    const cells = [...row.querySelectorAll("td, [role='gridcell']")];
    if (!cells.length) return null;
    const values = cells.map((cell) => normalizeText(cell.innerText || cell.textContent));
    const text = values.join(" | ");
    if (!text.replaceAll("|", "").trim()) return null;

    const get = (keywords, fallbackIndex) => {
      const headerIndex = headers.findIndex((header) =>
        keywords.some((keyword) => header.includes(keyword))
      );
      return values[headerIndex >= 0 ? headerIndex : fallbackIndex] || "";
    };

    const title =
      get(["商品名称", "商品标题", "标题", "商品"], 0) ||
      values.find((value) => value.length > 12) ||
      `页面商品 ${index + 1}`;
    const productIdMatch = text.match(/(?:商品\s*ID|SPU)[^\d]*(\d{6,})/i);
    const skuMatch = text.match(/(?:SKU|货号)[^A-Z0-9]*([A-Z0-9][A-Z0-9_-]{3,})/i);
    const productId = productIdMatch?.[1] || `page-${index + 1}`;
    const sku = skuMatch?.[1] || productId;
    const exposure = parseMetric(get(["曝光"], -1));
    const visits = parseMetric(get(["访客", "访问", "点击"], -1));
    const conversion = parsePercent(get(["转化"], -1));
    const price = parseMoney(get(["价格", "售价"], -1));
    const stock = parseMetric(get(["库存"], -1));
    const status = get(["状态"], -1);

    return {
      id: `${productId}:${sku}`,
      productId,
      sku,
      title,
      image: "",
      exposure,
      visits,
      conversion,
      currentPrice: price,
      cost: 0,
      stock,
      rank: index + 1,
      active: /加速中|增长中/.test(status),
      status
    };
  }

  function parseMetric(value) {
    const match = String(value || "")
      .replaceAll(",", "")
      .match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function parsePercent(value) {
    const number = parseMetric(value);
    if (/%/.test(value)) return number;
    return number > 0 && number <= 1 ? number * 100 : number;
  }

  function parseMoney(value) {
    const numbers = String(value || "")
      .replaceAll(",", "")
      .match(/\d+(?:\.\d+)?/g);
    return numbers ? Number(numbers[numbers.length - 1]) : 0;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }
})();
