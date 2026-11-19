(function attachMuseResponse(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VisualForgeMuseResponse = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMuseResponse() {
  "use strict";

  const SINGLE_TIMEOUT_MS = 90 * 1000;
  const BATCH_TIMEOUT_MS = 120 * 1000;
  const VIDEO_TIMEOUT_MS = 10 * 60 * 1000;
  const BLOCKED_GRACE_MS = 15 * 1000;
  const AUTO_CONTINUE_TOTAL_TIMEOUT_MS = 30 * 60 * 1000;
  const CAPACITY_ERROR_PREFIX = "VF_MUSE_CAPACITY:";
  const MUSE_FRESH_THREAD_URL = "https://muse.ai/thread/new";
  const TEXT_ONLY_ERROR_PREFIX = "VF_MUSE_TEXT_ONLY_FAILED:";
  const TEXT_ONLY_GRACE_MS = 20 * 1000;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isContinueQuestion(value) {
    const text = normalizeText(value);
    if (!text || text.length > 500) return false;
    return (
      /(?:是否|要不要|需要|确认).{0,18}(?:继续|继续生成|继续处理)/i.test(
        text,
      ) ||
      /(?:continue|proceed|keep going)[^.!?]{0,40}[?？]/i.test(text)
    );
  }

  function isGenerationBlocked(value) {
    const text = normalizeText(value);
    if (!text || text.length > 1200) return false;
    return (
      /(?:这次|本次|这个|当前)?.{0,8}(?:没|没有|未).{0,8}(?:做出来|做成|完成|生成|成功)/i.test(
        text,
      ) ||
      /(?:生成|处理|重绘|出图|改色).{0,10}(?:失败|不行|没成功|未成功)/i.test(
        text,
      ) ||
      /(?:暂时|目前|这次|这边).{0,12}(?:做不了|不能做|无法生成|无法完成)/i.test(
        text,
      ) ||
      /(?:换(?:一个|个)?新对话|你可以选一个|你看怎么安排|你看哪个|先做第\s*\d+\s*个|先发第\s*\d+\s*个|重新发我)/i.test(
        text,
      ) ||
      /(?:failed|couldn't|could not|unable to).{0,40}(?:generate|create|complete|render)/i.test(
        text,
      ) ||
      isCapacityBlocked(text)
    );
  }

  function isCapacityBlocked(value) {
    const text = normalizeText(value);
    if (!text || text.length > 1200) return false;
    return (
      /(?:图片|图像|生成结果|附件).{0,12}(?:太多|过多|数量超限|已满)/i.test(
        text,
      ) ||
      /(?:生成|请求|对话).{0,12}(?:达到上限|超过上限|额度不足|容量不足|队列已满)/i.test(
        text,
      ) ||
      /(?:请|需要|建议).{0,12}(?:新开|新建|换).{0,8}(?:对话|窗口|会话)/i.test(
        text,
      ) ||
      /(?:对话|聊天|上下文|会话|记录).{0,24}(?:太长|过长|超出|超过|上限|限制)/i.test(
        text,
      ) ||
      /(?:conversation|context|chat).{0,30}(?:too long|limit|exceeded|full)/i.test(
        text,
      ) ||
      /(?:too many images|image limit|generation limit|quota exceeded|capacity exceeded|too many requests)/i.test(
        text,
      )
    );
  }

  function isProgressText(value) {
    const text = normalizeText(value);
    if (!text) return true;
    return /(?:正在|开始|稍等|处理中|生成中|排队中|请稍候|generating|processing|please wait)/i.test(
      text,
    );
  }

  function textOnlyRetryAction(
    retryUsed,
    elapsedMs,
    graceMs = TEXT_ONLY_GRACE_MS,
  ) {
    if (Number(elapsedMs) < Number(graceMs)) return "wait";
    return retryUsed === true ? "fail" : "retry";
  }

  function classify(value) {
    if (isGenerationBlocked(value)) return "blocked";
    if (isContinueQuestion(value)) return "continue";
    return "neutral";
  }

  function timeoutMs(kind, autoContinueEnabled = false) {
    if (autoContinueEnabled) return AUTO_CONTINUE_TOTAL_TIMEOUT_MS;
    if (kind === "video") return VIDEO_TIMEOUT_MS;
    return kind === "batch" ? BATCH_TIMEOUT_MS : SINGLE_TIMEOUT_MS;
  }

  return {
    AUTO_CONTINUE_TOTAL_TIMEOUT_MS,
    BATCH_TIMEOUT_MS,
    BLOCKED_GRACE_MS,
    CAPACITY_ERROR_PREFIX,
    MUSE_FRESH_THREAD_URL,
    TEXT_ONLY_ERROR_PREFIX,
    TEXT_ONLY_GRACE_MS,
    SINGLE_TIMEOUT_MS,
    VIDEO_TIMEOUT_MS,
    classify,
    isCapacityBlocked,
    isContinueQuestion,
    isGenerationBlocked,
    isProgressText,
    normalizeText,
    textOnlyRetryAction,
    timeoutMs,
  };
});
