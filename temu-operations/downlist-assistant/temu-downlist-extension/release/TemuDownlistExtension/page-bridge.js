(function initTemuDownlistPageBridge() {
  if (window.__temuDownlistPageBridgeLoaded) return;
  window.__temuDownlistPageBridgeLoaded = true;

  const SOURCE_REQUEST = "temu-downlist-content";
  const SOURCE_RESPONSE = "temu-downlist-page-bridge";

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== SOURCE_REQUEST || data.type !== "extractRecord") {
      return;
    }

    let record = null;
    try {
      record = findRecord(data.queryType, String(data.id || ""));
    } catch (_) {
      record = null;
    }

    window.postMessage(
      {
        source: SOURCE_RESPONSE,
        type: "extractRecordResult",
        requestId: data.requestId,
        record: record
          ? {
              productId: record.productId || "",
              mainUrl: record.mainUrl || "",
              productSkcId: record.productSkcId || "",
              productCode: record.productCode || "",
              productImages: Array.isArray(record.productImages)
                ? record.productImages.slice(0, 10)
                : []
            }
          : null
      },
      location.origin
    );
  });

  function findRecord(queryType, id) {
    const pattern =
      queryType === "SKC"
        ? new RegExp(`货品SKC[：:]\\s*${id}`)
        : new RegExp(`SPU[：:]\\s*${id}`);

    const rows = [...document.querySelectorAll("tr")].filter((row) => {
      const text = (row.innerText || "").replace(/\s+/g, " ");
      return (
        pattern.test(text) &&
        /货号[：:]\s*[^\s]+/.test(text) &&
        /货品SKC[：:]/.test(text)
      );
    });

    for (const row of rows) {
      const record = extractReactRecord(row, id);
      if (record) return record;
    }

    const candidates = [...document.querySelectorAll("*")].filter((element) => {
      const text = (element.innerText || "").replace(/\s+/g, " ");
      return (
        text.length < 2500 &&
        pattern.test(text) &&
        /货号[：:]\s*[^\s]+/.test(text) &&
        /货品SKC[：:]/.test(text)
      );
    });
    candidates.sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return a.width * a.height - b.width * b.height;
    });
    for (const candidate of candidates.slice(0, 5)) {
      const record = extractReactRecord(candidate, id);
      if (record) return record;
    }
    return null;
  }

  function extractReactRecord(root, expectedId) {
    const nodes = [root, ...root.querySelectorAll("*")];
    for (const node of nodes) {
      const propKey = Object.keys(node).find((key) => key.startsWith("__reactProps$"));
      if (!propKey) continue;

      const seen = new Set();
      const queue = [{ value: node[propKey], depth: 0 }];
      while (queue.length) {
        const current = queue.shift();
        const value = current?.value;
        if (!value || typeof value !== "object" || current.depth > 7) continue;
        if (seen.has(value)) continue;
        seen.add(value);

        if (
          value.mainUrl &&
          String(value.productId || "") === String(expectedId)
        ) {
          return value;
        }
        if (seen.size > 1500) break;

        for (const key of Object.keys(value).slice(0, 80)) {
          if (
            key.startsWith("__react") ||
            ["return", "child", "sibling", "stateNode", "alternate"].includes(key)
          ) {
            continue;
          }
          let child;
          try {
            child = value[key];
          } catch (_) {
            continue;
          }
          if (child && typeof child === "object") {
            queue.push({ value: child, depth: current.depth + 1 });
          }
        }
      }
    }
    return null;
  }
})();
