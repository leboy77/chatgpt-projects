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
    sanitizeWindowsName,
    deriveCategoryCode,
    inferImageExtension,
    stripImageQuery,
    statusIsSuccessful,
    formatDateTime,
    sleep
  };
})(globalThis);
