/**
 * Service Worker：
 * 1) 注册 MAIN world 的注入脚本（绕开页面 CSP，能直接操作 DataTransfer / showDirectoryPicker）
 * 2) 提供截图能力（面板"截图留证"按钮）
 */

const MAIN_SCRIPT = {
  id: 'temu-image-bot-main',
  matches: ['https://agentseller.temu.com/*'],
  js: ['page/main.js'],
  runAt: 'document_idle',
  allFrames: false,
  world: 'MAIN',
};

const pluginNavigationTabs = new Set();

chrome.debugger.onEvent.addListener((source, method) => {
  if (!source || !source.tabId || !pluginNavigationTabs.has(source.tabId)) return;
  if (method === 'Page.javascriptDialogOpening') {
    chrome.debugger.sendCommand({ tabId: source.tabId }, 'Page.handleJavaScriptDialog', {
      accept: true,
    }).catch(() => {});
  }
});

chrome.debugger.onDetach.addListener((source) => {
  if (source && source.tabId) pluginNavigationTabs.delete(source.tabId);
});

async function registerMainScript() {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [MAIN_SCRIPT.id] });
    if (existing && existing.length) {
      await chrome.scripting.updateContentScripts([MAIN_SCRIPT]);
    } else {
      await chrome.scripting.registerContentScripts([MAIN_SCRIPT]);
    }
    console.log('[TEMU图片助手] MAIN world 脚本已注册');
  } catch (err) {
    console.error('[TEMU图片助手] 注册注入脚本失败', err);
  }
}

chrome.runtime.onInstalled.addListener(registerMainScript);
chrome.runtime.onStartup.addListener(registerMainScript);
registerMainScript(); // Service Worker 每次唤醒都确保注册存在

// 截图（页面侧通过 content script 转发）
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'PING') {
    sendResponse({
      ok: true,
      version: chrome.runtime.getManifest().version,
      hasDebugger: typeof chrome.debugger,
      hasAttach: !!(chrome.debugger && chrome.debugger.attach),
      permissions: chrome.runtime.getManifest().permissions,
      tabId: sender.tab ? sender.tab.id : null,
    });
    return true;
  }
  // 保证窗口足够高，避免弹窗底部按钮被裁掉
  if (msg && msg.type === 'ENSURE_WINDOW') {
    (async () => {
      try {
        const win = await chrome.windows.getCurrent();
        const wantH = Math.max(win.height || 0, msg.minHeight || 1000);
        const wantW = Math.max(win.width || 0, msg.minWidth || 1400);
        if (win.height < (msg.minHeight || 1000) || win.width < (msg.minWidth || 1400)) {
          await chrome.windows.update(win.id, { state: 'normal', width: wantW, height: wantH });
          sendResponse({ ok: true, resized: true, width: wantW, height: wantH });
        } else {
          sendResponse({ ok: true, resized: false, width: win.width, height: win.height });
        }
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message || err) });
      }
    })();
    return true;
  }
  if (msg && msg.type === 'CAPTURE_TAB') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: '拿不到标签页 id' });
      return true;
    }
    chrome.tabs.update(tabId, { active: true }).then(() => {
      return chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
    }).then((dataUrl) => {
      sendResponse({ ok: true, dataUrl });
    }).catch((err) => {
      sendResponse({ ok: false, error: String(err && err.message || err) });
    });
    return true; // 异步返回
  }
  // 真实键盘文本输入（部分组件只信任 isTrusted 的输入事件，例如色值下拉框）
  if (msg && msg.type === 'TYPE_TEXT') {
    console.log('[TEMU图片助手] TYPE_TEXT 请求', JSON.stringify({ text: msg.text, tab: sender.tab && sender.tab.id }));
    const tabId = (sender.tab && sender.tab.id) != null ? sender.tab.id : msg.tabId;
    if (tabId == null) {
      sendResponse({ ok: false, error: '拿不到标签页 id' });
      return true;
    }
    if (!chrome.debugger || !chrome.debugger.attach) {
      sendResponse({ ok: false, error: '缺少 debugger 权限（' + typeof chrome.debugger + '）' });
      return true;
    }
    (async () => {
      try {
        await chrome.debugger.attach({ tabId }, '1.3');
        console.log('[TEMU图片助手] debugger 已附加', tabId);
      } catch (err) {
        const msg2 = '调试器附加失败：' + String(err && err.message || err);
        console.error('[TEMU图片助手]', msg2);
        sendResponse({ ok: false, error: msg2 });
        return;
      }
      try {
        if (msg.clear) {
          // 全选并删除：色值框只能用真实键盘事件替换，不能依赖页面内 select()。
          const ctrlA = {
            modifiers: 2,
            key: 'a',
            code: 'KeyA',
            windowsVirtualKeyCode: 65,
            nativeVirtualKeyCode: 65,
          };
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
            type: 'rawKeyDown', ...ctrlA,
          });
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
            type: 'keyUp', ...ctrlA,
          });
          const backspace = {
            key: 'Backspace',
            code: 'Backspace',
            windowsVirtualKeyCode: 8,
            nativeVirtualKeyCode: 8,
          };
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
            type: 'rawKeyDown', ...backspace,
          });
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
            type: 'keyUp', ...backspace,
          });
        }
        await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text: msg.text });
        if (Number.isFinite(msg.clickX) && Number.isFinite(msg.clickY)) {
          // 真实鼠标移到左边界白区再松开，触发平台的 trusted blur/click 提交流程。
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: msg.clickX, y: msg.clickY, button: 'none',
          });
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mousePressed', x: msg.clickX, y: msg.clickY, button: 'left', clickCount: 1,
          });
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: msg.clickX, y: msg.clickY, button: 'left', clickCount: 1,
          });
        }
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message || err) });
      } finally {
        try { await chrome.debugger.detach({ tabId }); } catch (err) { /* ignore */ }
      }
    })();
    return true;
  }
  if (msg && msg.type === 'REAL_CLICK') {
    const tabId = (sender.tab && sender.tab.id) != null ? sender.tab.id : msg.tabId;
    if (tabId == null) {
      sendResponse({ ok: false, error: '拿不到标签页 id' });
      return true;
    }
    (async () => {
      try {
        await chrome.debugger.attach({ tabId }, '1.3');
      } catch (err) {
        sendResponse({ ok: false, error: '调试器附加失败：' + String(err && err.message || err) });
        return;
      }
      try {
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('点击坐标无效');
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved', x, y, button: 'none',
        });
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed', x, y, button: 'left', clickCount: 1,
        });
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
        });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message || err) });
      } finally {
        try { await chrome.debugger.detach({ tabId }); } catch (err) { /* ignore */ }
      }
    })();
    return true;
  }
  if (msg && msg.type === 'NAVIGATE_URL') {
    const tabId = (sender.tab && sender.tab.id) != null ? sender.tab.id : msg.tabId;
    if (tabId == null || !msg.url) {
      sendResponse({ ok: false, error: '导航参数无效' });
      return true;
    }
    (async () => {
      let attached = false;
      try {
        await chrome.debugger.attach({ tabId }, '1.3');
        attached = true;
        pluginNavigationTabs.add(tabId);
        await chrome.debugger.sendCommand({ tabId }, 'Page.enable');
        await chrome.debugger.sendCommand({ tabId }, 'Page.navigate', { url: msg.url });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message || err) });
      } finally {
        if (attached) {
          setTimeout(async () => {
            pluginNavigationTabs.delete(tabId);
            try { await chrome.debugger.detach({ tabId }); } catch (err) { /* ignore */ }
          }, msg.keepMs || 12000);
        }
      }
    })();
    return true;
  }
  if (msg && msg.type === 'FIND_CONFIRM_TAB') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: ['https://agentseller.temu.com/newon/product-select*'] });
        const currentTabId = sender.tab && sender.tab.id;
        const hits = tabs.filter((tab) => tab.url && (!msg.productId || tab.url.includes(`productId=${msg.productId}`)));
        const preferred = hits.find((tab) => tab.id !== currentTabId) || hits[0];
        sendResponse(preferred
          ? { ok: true, url: preferred.url, tabId: preferred.id }
          : { ok: false, error: '没有找到商品信息确认页' });
      } catch (err) {
        sendResponse({ ok: false, error: String(err && err.message || err) });
      }
    })();
    return true;
  }
  if (msg && msg.type === 'GET_TAB_INFO') {
    sendResponse({
      ok: true,
      tabId: sender.tab ? sender.tab.id : null,
      windowId: sender.tab ? sender.tab.windowId : null,
    });
    return true;
  }
  if (msg && msg.type === 'CLOSE_TAB') {
    const tabId = Number(msg.tabId);
    if (!tabId) {
      sendResponse({ ok: false, error: '标签页 id 无效' });
      return true;
    }
    chrome.tabs.remove(tabId).then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
    return true;
  }
  return false;
});
