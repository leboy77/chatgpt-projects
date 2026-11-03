(function initTemuCommon(global) {
  const IMAGE_TASK_URL = "https://agentseller.temu.com/material/image-task";
  const PRODUCT_LIST_URL = "https://agentseller.temu.com/goods/list";

  function normalizeText(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeHeader(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[\s_\-/]/g, "");
  }

  function parseSpuIdText(value) {
    const candidates = String(value ?? "").match(/\d+/g) || [];
    const values = [];
    const seen = new Set();
    let duplicates = 0;
    let ignored = 0;

    for (const candidate of candidates) {
      if (!/^\d{8,20}$/.test(candidate)) {
        ignored += 1;
        continue;
      }
      if (seen.has(candidate)) {
        duplicates += 1;
        continue;
      }
      seen.add(candidate);
      values.push(candidate);
    }

    return { values, duplicates, ignored };
  }

  function clampTimeoutMs(value, minSeconds, maxSeconds, fallbackMs) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallbackMs;
    return Math.max(
      minSeconds * 1000,
      Math.min(maxSeconds * 1000, Math.round(number))
    );
  }

  function buildTaskRowsFromAoa(aoa, columns, lookupType) {
    const serialColumn = Number.isInteger(columns?.serial) ? columns.serial : 0;
    const inputColumn = Number.isInteger(columns?.input) ? columns.input : -1;
    const statusColumn = Number.isInteger(columns?.status) ? columns.status : 2;
    const seenInput = new Set();
    const rows = [];

    if (inputColumn < 0) return rows;

    for (let rowIndex = 1; rowIndex < aoa.length; rowIndex += 1) {
      const sourceRow = aoa[rowIndex] || [];
      const inputId = normalizeText(sourceRow[inputColumn]).replace(/\.0$/, "");
      const serial = normalizeText(sourceRow[serialColumn]);
      const inputStatus = normalizeText(sourceRow[statusColumn]);
      // 模板会预填序号；未填写 SPU/SKC 的预留行不能作为异常任务导入。
      if (!inputId) continue;

      const row = {
        originalRowIndex: rowIndex,
        sourceRowIndex: rowIndex + 1,
        serial: serial || String(rows.length + 1),
        inputId,
        lookupType,
        inputStatus,
        status: inputStatus || "待处理",
        skip: false,
        active: false,
        spu: lookupType === "SPU" ? inputId : "",
        skc: lookupType === "SKC" ? inputId : "",
        goodsCode: "",
        category: "",
        imagePath: "",
        imageSource: "",
        imageReused: false,
        downlistOutcome: "",
        verified: false,
        error: ""
      };

      if (!/^\d{8,20}$/.test(inputId)) {
        row.skip = true;
        row.status = `${lookupType}格式异常`;
        row.error = `无效 ${lookupType}：${inputId}`;
      } else if (seenInput.has(inputId)) {
        row.skip = true;
        row.status = "重复，已跳过";
      } else if (statusIsSuccessful(inputStatus)) {
        row.skip = true;
        row.status = "表内已成功，跳过";
      } else {
        seenInput.add(inputId);
      }
      rows.push(row);
    }

    return rows;
  }

  function sanitizeWindowsName(value) {
    return String(value ?? "")
      .replace(/[\\/:*?"<>|\r\n\t]/g, "")
      .replace(/[. ]+$/g, "")
      .trim();
  }

  function deriveCategoryCode(goodsCode, override) {
    const explicit = sanitizeWindowsName(normalizeText(override).toUpperCase());
    if (explicit) return explicit;

    const code = sanitizeWindowsName(normalizeText(goodsCode).toUpperCase());
    if (!code) return "";

    const firstSegment = code.split(/[-_]/)[0];
    const withoutTrailingDigits = firstSegment.replace(/\d+$/g, "");
    return sanitizeWindowsName(withoutTrailingDigits || firstSegment);
  }

  function inferImageExtension(url) {
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      if (pathname.endsWith(".png")) return "png";
      if (pathname.endsWith(".webp")) return "webp";
      if (pathname.endsWith(".gif")) return "gif";
    } catch (_) {
      // fall through
    }
    return "jpeg";
  }

  function stripImageQuery(url) {
    try {
      const parsed = new URL(url);
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch (_) {
      return String(url || "").split("?")[0];
    }
  }

  function statusIsSuccessful(status) {
    return /下架成功|成功.*下架|已完成/.test(normalizeText(status));
  }

  function formatDateTime(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "_",
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join("");
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  global.TemuCommon = {
    IMAGE_TASK_URL,
    PRODUCT_LIST_URL,
    normalizeText,
    normalizeHeader,
    parseSpuIdText,
    clampTimeoutMs,
    buildTaskRowsFromAoa,
    sanitizeWindowsName,
    deriveCategoryCode,
    inferImageExtension,
    stripImageQuery,
    statusIsSuccessful,
    formatDateTime,
    sleep
  };
})(globalThis);
