/**
 * 隔离世界桥：
 * - 兜底注入 MAIN world 脚本（background 注册失败时用）
 * - 转发页面 → 扩展的请求（截图）
 */

// 兜底注入：正常由 background 用 chrome.scripting 注册 MAIN world 脚本；
// 若 3 秒后页面上还没有面板，说明注册未生效，这里再用 <script> 兜底一次。
setTimeout(() => {
  try {
    if (document.getElementById('temu-image-bot-host')) return;
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('page/main.js');
    s.async = false;
    s.onload = () => s.remove();
    s.onerror = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  } catch (err) {
    // 页面 CSP 可能拦截，忽略即可
  }
}, 3000);

window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.__temuImageBot !== true) return;
  if (event.source !== window) return;

  if (data.type === 'CAPTURE_TAB') {
    chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' }).then((res) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'CAPTURE_TAB_RESULT',
        reqId: data.reqId,
        ...res,
      }, '*');
    }).catch((err) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'CAPTURE_TAB_RESULT',
        reqId: data.reqId,
        ok: false,
        error: String(err && err.message || err),
      }, '*');
    });
  }

  if (data.type === 'TYPE_TEXT') {
    chrome.runtime.sendMessage({
      type: 'TYPE_TEXT',
      text: data.text,
      clear: !!data.clear,
      clickX: data.clickX,
      clickY: data.clickY,
    }).then((res) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'TYPE_TEXT_RESULT',
        reqId: data.reqId,
        ...res,
      }, '*');
    }).catch((err) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'TYPE_TEXT_RESULT',
        reqId: data.reqId,
        ok: false,
        error: String(err && err.message || err),
      }, '*');
    });
  }

  if (data.type === 'REAL_CLICK') {
    chrome.runtime.sendMessage({ type: 'REAL_CLICK', x: data.x, y: data.y }).then((res) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'REAL_CLICK_RESULT',
        reqId: data.reqId,
        ...res,
      }, '*');
    }).catch((err) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'REAL_CLICK_RESULT',
        reqId: data.reqId,
        ok: false,
        error: String(err && err.message || err),
      }, '*');
    });
  }

  if (data.type === 'NAVIGATE_URL') {
    chrome.runtime.sendMessage({ type: 'NAVIGATE_URL', url: data.url }).then((res) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'NAVIGATE_URL_RESULT',
        reqId: data.reqId,
        ...res,
      }, '*');
    }).catch((err) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'NAVIGATE_URL_RESULT',
        reqId: data.reqId,
        ok: false,
        error: String(err && err.message || err),
      }, '*');
    });
  }

  if (data.type === 'FIND_CONFIRM_TAB') {
    chrome.runtime.sendMessage({ type: 'FIND_CONFIRM_TAB', productId: data.productId }).then((res) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'FIND_CONFIRM_TAB_RESULT',
        reqId: data.reqId,
        ...res,
      }, '*');
    }).catch((err) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'FIND_CONFIRM_TAB_RESULT',
        reqId: data.reqId,
        ok: false,
        error: String(err && err.message || err),
      }, '*');
    });
  }

  if (data.type === 'GET_TAB_INFO') {
    chrome.runtime.sendMessage({ type: 'GET_TAB_INFO' }).then((res) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'GET_TAB_INFO_RESULT',
        reqId: data.reqId,
        ...res,
      }, '*');
    }).catch((err) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'GET_TAB_INFO_RESULT',
        reqId: data.reqId,
        ok: false,
        error: String(err && err.message || err),
      }, '*');
    });
  }

  if (data.type === 'CLOSE_TAB') {
    chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: data.tabId }).then((res) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'CLOSE_TAB_RESULT',
        reqId: data.reqId,
        ...res,
      }, '*');
    }).catch((err) => {
      window.postMessage({
        __temuImageBot: true,
        type: 'CLOSE_TAB_RESULT',
        reqId: data.reqId,
        ok: false,
        error: String(err && err.message || err),
      }, '*');
    });
  }

  if (data.type === 'ENSURE_WINDOW') {
    chrome.runtime.sendMessage({ type: 'ENSURE_WINDOW', minHeight: data.minHeight, minWidth: data.minWidth })
      .then((res) => {
        window.postMessage({ __temuImageBot: true, type: 'ENSURE_WINDOW_RESULT', reqId: data.reqId, ...res }, '*');
      })
      .catch((err) => {
        window.postMessage({ __temuImageBot: true, type: 'ENSURE_WINDOW_RESULT', reqId: data.reqId, ok: false,
          error: String(err && err.message || err) }, '*');
      });
  }
});
