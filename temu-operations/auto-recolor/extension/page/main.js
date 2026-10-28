/**
 * TEMU 商品图片自动编辑助手 —— 主逻辑（运行在页面上下文 MAIN world）
 *
 * 流程：
 *   列表页按 SKC 查询 → 找 SPU → 直接打开编辑页
 *   → 新增 n 个色值(Mixed Color2..n+1) + 填货号
 *   → 每个新色值：正面图 1 张（主图文件夹顺序取用，不复用）
 *   → 每个新色值：背面图 X 张（首轮上传入库，后续从素材库选中复用）
 *   → 全部完成 → 自动提交 → 下一个 SKC
 *
 * 所有本地状态存在页面同源的 IndexedDB（任务状态 + 图片 File + 日志），
 * 因此刷新/跳转页面后能自动续跑。
 */
(() => {
  'use strict';

  if (window.__TEMU_IMG_BOT_V1__) return;
  window.__TEMU_IMG_BOT_V1__ = true;

  // ============================================================ 常量
  const LIST_URL = 'https://agentseller.temu.com/goods/list';
  const EDIT_URL = (spu) => `https://agentseller.temu.com/goods/edit?from=productList&productId=${spu}`;
  const BOT_HASH = 'temu-image-bot';
  const DB_NAME = 'temu-image-bot';
  const DB_STORE = 'kv';
  const VERSION = '0.10.11';
  const LEASE_KEY = 'temu-image-bot-task-lease-v2';
  const LEASE_MS = 25000;
  const LEGACY_TASK_ID = 'legacy';
  let currentTaskId = LEGACY_TASK_ID;
  let taskLibrary = [];
  let activeImageTarget = '';
  const TAB_INFO = { tabId: null, windowId: null };
  const TAB_ID = (() => {
    let id = sessionStorage.getItem('temu-image-bot-tab-id');
    if (!id) {
      id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('temu-image-bot-tab-id', id);
    }
    return id;
  })();
  // 皮肤预设：primary=主色，dark=是否深色底
  const THEMES = {
    classic: { label: '经典蓝', primary: '#2f6fed', dark: false },
    purple: { label: '星空紫', primary: '#7b5cf0', dark: false },
    green: { label: '森林绿', primary: '#16a34a', dark: false },
    orange: { label: '暖橙', primary: '#f97316', dark: false },
    pink: { label: '少女粉', primary: '#ec4899', dark: false },
    night: { label: '暗夜黑', primary: '#4b8bf5', dark: true },
    sky: { label: '天空蓝', primary: '#0284c7', dark: false },
    mint: { label: '薄荷绿', primary: '#0d9488', dark: false },
    coral: { label: '珊瑚红', primary: '#e11d48', dark: false },
    amber: { label: '琥珀金', primary: '#d97706', dark: false },
    cocoa: { label: '咖啡棕', primary: '#92400e', dark: false },
    graphite: { label: '石墨黑', primary: '#64748b', dark: true },
    rosewood: { label: '玫瑰豆沙', primary: '#b45369', dark: false },
    indigo: { label: '靛蓝', primary: '#4338ca', dark: false },
    olive: { label: '橄榄绿', primary: '#657a2d', dark: false },
    lagoon: { label: '泻湖青', primary: '#087f8c', dark: false },
    lavender: { label: '薰衣草', primary: '#9a62e8', dark: false },
    wine: { label: '酒红', primary: '#881337', dark: true },
    aurora: {
      label: '极光流彩', primary: '#2563eb', accent: '#14b8a6', dark: false,
      headerBg: 'linear-gradient(125deg,#0f766e 0%,#2563eb 52%,#7c3aed 100%)',
      actionBg: 'linear-gradient(135deg,#0f766e,#2563eb)',
      heroBg: 'radial-gradient(circle at 8% 0%,rgba(20,184,166,.20),transparent 42%),linear-gradient(180deg,#f0faff,#fff)',
      bodyImage: 'radial-gradient(circle at 12% 8%,rgba(37,99,235,.09),transparent 30%),radial-gradient(circle at 90% 22%,rgba(20,184,166,.12),transparent 34%)',
      bodySize: 'auto', bg: '#f8fbff', soft: '#edf7ff', cardBg: 'rgba(255,255,255,.82)',
    },
    sunset: {
      label: '落日霞光', primary: '#d25562', accent: '#f59e0b', dark: false,
      headerBg: 'linear-gradient(125deg,#7f1d3a 0%,#d25572 50%,#f59e0b 100%)',
      actionBg: 'linear-gradient(135deg,#c2415a,#f97316)',
      heroBg: 'radial-gradient(circle at 8% 0%,rgba(251,146,60,.22),transparent 45%),linear-gradient(180deg,#fff4ec,#fff)',
      bodyImage: 'radial-gradient(circle at 10% 6%,rgba(236,72,153,.09),transparent 26%),radial-gradient(circle at 90% 14%,rgba(245,158,11,.13),transparent 32%)',
      bodySize: 'auto', bg: '#fffaf5', soft: '#fff0e6', cardBg: 'rgba(255,252,247,.86)',
    },
    porcelain: {
      label: '青瓷雨纹', primary: '#3b7a70', accent: '#8bc7b5', dark: false,
      headerBg: 'linear-gradient(125deg,#245e59 0%,#4c8e82 56%,#91cbbb 100%)',
      actionBg: 'linear-gradient(135deg,#2f6f68,#69a99d)',
      heroBg: 'radial-gradient(circle at 12% 0%,rgba(139,199,181,.24),transparent 45%),linear-gradient(180deg,#f1faf7,#fff)',
      bodyImage: 'repeating-linear-gradient(135deg,rgba(59,122,112,.06) 0 1px,transparent 1px 18px),radial-gradient(circle at 90% 8%,rgba(139,199,181,.13),transparent 32%)',
      bodySize: 'auto', bg: '#f7fcfa', soft: '#eaf7f2', cardBg: 'rgba(252,255,254,.84)',
    },
    nebula: {
      label: '深海星云', primary: '#6d8cff', accent: '#22d3ee', dark: true,
      headerBg: 'linear-gradient(125deg,#0f172a 0%,#4338ca 52%,#0891b2 100%)',
      actionBg: 'linear-gradient(135deg,#4338ca,#0891b2)',
      heroBg: 'radial-gradient(circle at 15% 0%,rgba(34,211,238,.20),transparent 42%),linear-gradient(180deg,#141d33,#0f172a)',
      bodyImage: 'radial-gradient(circle at 20% 10%,rgba(109,140,255,.14),transparent 30%),radial-gradient(circle at 85% 18%,rgba(34,211,238,.11),transparent 28%),radial-gradient(circle at 50% 85%,rgba(124,58,237,.12),transparent 35%)',
      bodySize: 'auto', bg: '#0d1324', darkBg: '#0d1324', soft: '#151f36',
      darkSoft: '#151f36', cardBg: '#141d31', darkCardBg: '#141d31',
    },
    cream: {
      label: '奶油格纹', primary: '#9a6534', accent: '#e0a35c', dark: false,
      headerBg: 'linear-gradient(125deg,#7c4a24 0%,#b97842 52%,#e0ad67 100%)',
      actionBg: 'linear-gradient(135deg,#8b5a2f,#d19a55)',
      heroBg: 'radial-gradient(circle at 10% 0%,rgba(224,163,92,.20),transparent 42%),linear-gradient(180deg,#fff9eb,#fffdf8)',
      bodyImage: 'repeating-linear-gradient(0deg,rgba(154,101,52,.045) 0 1px,transparent 1px 34px),repeating-linear-gradient(90deg,rgba(154,101,52,.045) 0 1px,transparent 1px 34px)',
      bodySize: 'auto', bg: '#fffaf0', soft: '#f8eed8', cardBg: 'rgba(255,252,244,.88)',
    },
    sakura: {
      label: '雾粉樱云', primary: '#c14f7b', accent: '#a78bfa', dark: false,
      headerBg: 'linear-gradient(125deg,#9d174d 0%,#d75d89 55%,#b39aea 100%)',
      actionBg: 'linear-gradient(135deg,#be185d,#9f7aea)',
      heroBg: 'radial-gradient(circle at 12% 0%,rgba(244,114,182,.20),transparent 44%),linear-gradient(180deg,#fff1f7,#fff)',
      bodyImage: 'radial-gradient(circle at 12px 14px,rgba(193,79,123,.10) 0 2px,transparent 2.5px),radial-gradient(circle at 34px 38px,rgba(167,139,250,.09) 0 2px,transparent 2.5px)',
      bodySize: '48px 48px', bg: '#fff8fb', soft: '#fdebf4', cardBg: 'rgba(255,250,253,.86)',
    },
  };
  const DEFAULT_CONFIG = {
    artNo: 'DWRG',
    n: 4,
    x: 2,
    cropW: 1350,
    cropH: 1800,
    imageFit: 'crop',
    edgeColor: '#ffffff',
    autoSubmit: true,
    dryRun: false,
    semiAuto: false,
    sens: '否',
    dimL: 30,
    dimM: 20,
    dimS: 1,
    weight: 500,
    strictCheck: true,
    declPrice: 300,
    stock: 500,
    skuCategory: '单品',
    skuCodeBase: 'DWRG',
    skuCodeMode: 'fixed',
    skuTimeoutMin: 10,
  };
  const SUCCESS_STATUS_RE = /^提交成功/;
  const TIMEOUT_STATUS_RE = /^(?:超时跳过|卡死超时)/;
  const RETRYABLE_STATUS_RE = /^(失败|待确认)/;
  const PREP_ERROR_RE = /主图不足|没有导入主图|没有导入背面图|主图文件夹|背面图文件夹|SKC清单为空|SKC 清单为空|SPU清单为空|SPU 清单为空/;

  // ============================================================ 基础工具
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (min = 300, max = 800) => sleep(min + Math.random() * (max - min));
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const baseName = (fileName) => fileName.replace(/\.[^.]+$/, '');

  function naturalCompare(a, b) {
    return String(a).localeCompare(String(b), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  }

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  }

  function allVisible(root = document) {
    return [...root.querySelectorAll('*')].filter(visible);
  }

  /** 找文本完全相等（或包含）的最深元素 */
  function findText(text, { root = document, exact = true, maxDepth = Infinity } = {}) {
    const hits = allVisible(root).filter((el) => {
      const t = (el.innerText || '').trim();
      if (!t) return false;
      if (exact ? t !== text : !t.includes(text)) return false;
      if (maxDepth !== Infinity) {
        let d = 0;
        let p = el;
        while (p && d <= maxDepth) { p = p.parentElement; d += 1; }
        if (d > maxDepth) return false;
      }
      return true;
    });
    if (!hits.length) return null;
    // 取后代最少的（最深）那个
    hits.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
    return hits[0];
  }

  function clickable(el) {
    return el.closest('button,[role=button],a,label,li') || el.parentElement || el;
  }

  function describe(el) {
    if (!el) return 'null';
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 16);
    return `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0].slice(0, 24)}${t ? `「${t}」` : ''}`;
  }

  /** 深度滚动：element.scrollIntoView 对内部滚动容器有时不生效，这里再手动滚一遍 */
  async function deepScrollIntoView(el, ratio = 0.5) {
    try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (err) { /* ignore */ }
    // 迭代收敛：每次只滚“最近的那个可滚动祖先”，避免多层容器互相叠加导致过冲
    for (let i = 0; i < 6; i += 1) {
      const r = el.getBoundingClientRect();
      const delta = (r.top + r.height / 2) - window.innerHeight * ratio;
      if (Math.abs(delta) < 8) return;
      let scrolled = false;
      let p = el.parentElement;
      while (p) {
        const st = getComputedStyle(p);
        if (/(auto|scroll)/.test(st.overflowY) && p.scrollHeight > p.clientHeight + 4) {
          const before = p.scrollTop;
          p.scrollTop = Math.max(0, Math.min(p.scrollHeight - p.clientHeight, before + delta));
          if (Math.abs(p.scrollTop - before) > 0.5) { scrolled = true; break; }
        }
        p = p.parentElement;
      }
      if (!scrolled) window.scrollBy(0, delta);
      await sleep(150);
    }
  }

  /** 命中测试：忽略我们自己的面板（否则面板会挡住页面元素） */
  function hitTest(x, y) {
    const host = document.getElementById('temu-image-bot-host');
    const first = document.elementFromPoint(x, y);
    if (!host || !first || !host.contains(first)) return first;
    const prev = host.style.pointerEvents;
    host.style.pointerEvents = 'none';
    const second = document.elementFromPoint(x, y);
    host.style.pointerEvents = prev;
    return second;
  }

  async function clickAt(x, y) {
    const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0 };
    const host = document.getElementById('temu-image-bot-host');
    const first = document.elementFromPoint(x, y);
    const ownPanel = host && first && host.contains(first);
    if (ownPanel) host.style.pointerEvents = 'none';
    const target = (ownPanel ? document.elementFromPoint(x, y) : first) || document.body;
    target.dispatchEvent(new MouseEvent('mousedown', opts));
    target.dispatchEvent(new MouseEvent('mouseup', opts));
    target.dispatchEvent(new MouseEvent('click', opts));
    if (ownPanel) host.style.pointerEvents = '';
    await sleep(120);
  }

  /** 真实鼠标点击（必须：element.click() 对 beast-core 组件无效） */
  /** 点击目标若被弹层遮挡，先按 Esc 关掉遮挡层（TEMU 的消息抽屉会不定时弹出） */
  /** TEMU 的消息抽屉等弹层：它们不是我们要操作的弹窗，但会挡住点击 */
  function blockingPopovers() {
    return allVisible(document).filter((el) => /PT_popover|PP_popover/.test(el.className || '')
      && el.getBoundingClientRect().height > 120
      && !(el.innerText || '').includes('素材中心')
      && !/裁剪/.test(el.innerText || '')
      && !/是否敏感品/.test(el.innerText || ''));
  }

  async function dismissOverlays() {
    let closed = 0;
    for (const pop of blockingPopovers().slice(0, 3)) {
      const r = pop.getBoundingClientRect();
      await clickAt(r.right - 18, r.top + 25);   // 弹层右上角的关闭 X
      await sleep(400);
      closed += 1;
    }
    // 2) 模态提示框（例如“填写建议零售价对订单转化…”）：点“知道了/关闭/取消”
    const modals = allVisible(document).filter((el) => /modal|MDL_innerWrapper/.test(el.className || '')
      && el.getBoundingClientRect().height > 150
      && !/素材中心/.test(el.innerText || '')
      && !/裁剪/.test(el.innerText || '')
      && !/是否敏感品/.test(el.innerText || ''));
    for (const m of modals.slice(-2)) {
      const texts = ['知道了', '我知道了', '关闭', '稍后再说', '下次再说', '取消'];
      const btn = allVisible(m).find((el) => texts.includes((el.innerText || '').trim()));
      if (btn) {
        const r = btn.getBoundingClientRect();
        await clickAt(r.left + r.width / 2, r.top + r.height / 2);
        await sleep(500);
        closed += 1;
        continue;
      }
      // 找 MDL 右上角的关闭图标（class 里没有 close 字样，叫 MDL_iconWrapper）
      let root = m;
      for (let i = 0; i < 6 && root.parentElement; i += 1) {
        root = root.parentElement;
        if (/MDL_outerWrapper/.test(root.className || '')) break;
      }
      const icon = allVisible(root).find((el) => /MDL_iconWrapper/.test(el.className || ''));
      const close = icon || allVisible(m).filter((el) => /close/i.test(el.className || '')).pop();
      if (close) {
        const r = close.getBoundingClientRect();
        await clickAt(r.left + r.width / 2, r.top + r.height / 2);
        await sleep(500);
        closed += 1;
      }
    }
    return closed;
  }

  async function ensureClickable(el, { retries = 4 } = {}) {
    for (let i = 0; i < retries; i += 1) {
      await deepScrollIntoView(el);
      await sleep(300);
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      // 元素可能被窗口裁掉一截（弹窗比视口还高），这时用「可见部分」的中点判断
      const vTop = Math.max(r.top, 2);
      const vBottom = Math.min(r.bottom, window.innerHeight - 2);
      if (vBottom - vTop < 6) {
        log(`点击目标几乎不可见：${describe(el)} rect=${Math.round(r.left)},${Math.round(r.top)},`
          + `${Math.round(r.width)}x${Math.round(r.height)} 视口=${window.innerWidth}x${window.innerHeight}`);
        await dismissOverlays();
        await sleep(400);
        continue;
      }
      const hit = hitTest(r.left + r.width / 2, (vTop + vBottom) / 2);
      if (hit && (el.contains(hit) || hit.contains(el) || hit === el)) return true;
      log(`点击目标被遮挡：${describe(el)} rect=${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)} `
        + `视口=${window.innerWidth}x${window.innerHeight} 命中=${hit ? describe(hit) : '视口外'}；尝试关闭遮挡层`);
      const closed = await dismissOverlays();
      if (!closed) await pressEscape();
      await sleep(600);
    }
    return false;
  }

  async function realClick(el, { offsetY = 0 } = {}) {
    if (!el) throw new Error('点击目标为空');
    await ensureClickable(el);
    await deepScrollIntoView(el);
    await sleep(320);
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) throw new Error('点击目标不可见');
    const x = r.left + r.width / 2;
    const vTop = Math.max(r.top, 2);
    const vBottom = Math.min(r.bottom, window.innerHeight - 2);
    if (vBottom - vTop < 6) {
      throw new Error(`点击目标不在视口内（${describe(el)} rect=${Math.round(r.left)},${Math.round(r.top)},`
        + `${Math.round(r.width)}x${Math.round(r.height)} 视口=${window.innerWidth}x${window.innerHeight}）`);
    }
    const y = (vTop + vBottom) / 2 + offsetY;
    await clickAt(x, y);
  }

  async function clickText(text, opts = {}) {
    const el = await waitFor(() => findText(text, opts), { desc: `按钮「${text}」`, timeout: opts.timeout || 20000 });
    await realClick(clickable(el));
  }

  async function clickInDialog(dlg, text) {
    const el = await waitFor(() => {
      const hit = allVisible(dlg).filter((e) => (e.innerText || '').trim() === text);
      return hit.length ? hit[hit.length - 1] : null;
    }, { desc: `弹窗按钮「${text}」` });
    await realClick(clickable(el));
  }

  /** 原生 setter 写值（React 受控组件可识别），失败时退回 insertText */
  async function setInput(el, value, { allowRealTyping = true, settle = 350 } = {}) {
    if (!el) throw new Error('输入框为空');
    value = String(value);
    el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(settle);
    if (el.value === value) return true;

    // 有些组件（例如色值下拉）会立刻回滚程序化赋值，只接受真实按键
    if (allowRealTyping) {
      try {
        await typeTextReal(el, value);
        if (el.value === value) return true;
      } catch (err) {
        log(`真实输入回退失败：${err.message}`, 'error');
      }
    }

    // 兜底：模拟真实输入
    el.select && el.select();
    document.execCommand && document.execCommand('insertText', false, value);
    await sleep(Math.min(settle, 250));
    return el.value === value;
  }

  /** 输入框失焦后平台才会把值写进 React 表单；不提交失焦会造成“界面有值、提交仍为空”。 */
  async function commitInput(el, settle = 80) {
    if (!el) return;
    try {
      el.blur();
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    } catch (err) {
      /* ignore */
    }
    if (settle) await sleep(settle);
  }

  async function setInputCommitted(el, value, { settle = 20 } = {}) {
    await setInput(el, value, { allowRealTyping: false, settle: 30 });
    await commitInput(el, settle);
    return el.value === String(value);
  }

  function setInputQuick(el, value) {
    if (!el) return false;
    value = String(value);
    el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    return el.value === value;
  }

  async function pressEscape() {
    const opts = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', opts));
    document.body.dispatchEvent(new KeyboardEvent('keydown', opts));
    document.dispatchEvent(new KeyboardEvent('keydown', opts));
    await sleep(250);
  }

  async function waitFor(fn, {
    timeout = 30000,
    interval = 300,
    desc = '条件',
    checkQuality = true,
  } = {}) {
    const t0 = Date.now();
    let lastErr = null;
    while (Date.now() - t0 < timeout) {
      if (state.skcTimedOut) throw new Error('__SKC_TIMEOUT__');
      if (checkQuality) {
        const qualityDialog = imageQualityDialog();
        if (qualityDialog) {
          const error = new Error(`图片品质不合规；图片=${activeImageTarget || '当前色值图片'}`);
          error.code = 'IMAGE_QUALITY_REJECTED';
          error.imageName = activeImageTarget || '当前色值图片';
          throw error;
        }
      }
      try {
        const v = await fn();
        if (v) return v;
      } catch (err) {
        lastErr = err;
      }
      await sleep(interval);
    }
    throw new Error(`等待超时(${Math.round(timeout / 1000)}s)：${desc}${lastErr ? ' | ' + lastErr.message : ''}`);
  }

  // ============================================================ IndexedDB
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbDel(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ============================================================ 状态
  const state = {
    status: 'idle',            // draft | ready | running | paused | done | success | partial | failed
    phase: 'LIST_SEARCH',      // LIST_SEARCH | EDIT | DONE
    cursor: 0,
    retry: 0,
    config: { ...DEFAULT_CONFIG },
    skcs: [],
    queryType: 'SKC',
    runScopedSkcs: null,
    activeRetry: false,
    frontCursor: 0,
    frontCursorStart: 0,
    usedFrontStart: [],
    current: null,             // { skc, spu }
    backMaterialNames: [],     // 背面图在素材库中的实际名称（全局复用）
    backPlanNames: [],         // 当前任务固定使用的背面图文件名
    imagePlan: {},             // SKC/SPU -> { frontNames, backNames }
    usedFrontImages: [],       // 已用过的正面图文件名（跨商品不复用，停止/续跑都不丢）
    submitAttempt: null,       // 已点击提交、等待列表状态校验
    skcStatuses: {},           // SKC -> {status, at}
    xlsxMeta: null,            // 原 Excel 的工作表、行号、SKC/状态列
    skcTimedOut: false,
    timeoutNavigating: false,
    error: null,
    logs: [],
  };

  function windowLeaseKey() {
    return `${LEASE_KEY}:${TAB_INFO.windowId == null ? 'unknown' : TAB_INFO.windowId}`;
  }

  function taskLeaseKey() {
    return `${LEASE_KEY}:task:${currentTaskId}`;
  }

  function readLease() {
    try {
      const now = Date.now();
      const candidates = [taskLeaseKey(), windowLeaseKey()].map((key) => {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      }).filter(Boolean);
      return candidates.find((lease) => now - Number(lease.at || 0) < LEASE_MS) || null;
    } catch (err) {
      return null;
    }
  }

  function acquireTaskLease() {
    const now = Date.now();
    const lease = readLease();
    if (lease && lease.owner !== TAB_ID && now - Number(lease.at || 0) < LEASE_MS) return false;
    const value = JSON.stringify({ owner: TAB_ID, at: now, tabId: TAB_INFO.tabId, taskId: currentTaskId });
    localStorage.setItem(taskLeaseKey(), value);
    localStorage.setItem(windowLeaseKey(), value);
    return true;
  }

  function touchTaskLease() {
    const lease = readLease();
    if (!lease || lease.owner === TAB_ID || Date.now() - Number(lease.at || 0) >= LEASE_MS) {
      const value = JSON.stringify({ owner: TAB_ID, at: Date.now(), tabId: TAB_INFO.tabId, taskId: currentTaskId });
      localStorage.setItem(taskLeaseKey(), value);
      localStorage.setItem(windowLeaseKey(), value);
      return true;
    }
    return false;
  }

  function releaseTaskLease() {
    const lease = readLease();
    if (lease && lease.owner === TAB_ID) {
      try {
        localStorage.removeItem(taskLeaseKey());
        localStorage.removeItem(windowLeaseKey());
      } catch (err) { /* ignore */ }
    }
  }

  function leaseConflict() {
    const lease = readLease();
    return !!(lease && lease.owner !== TAB_ID && Date.now() - Number(lease.at || 0) < LEASE_MS);
  }

  function taskFileKey(name, taskId = currentTaskId) {
    return taskId === LEGACY_TASK_ID ? name : `task:${taskId}:${name}`;
  }

  function captureTaskState() {
    return {
      status: state.status,
      phase: state.phase,
      cursor: state.cursor,
      retry: state.retry,
      current: state.current,
      config: JSON.parse(JSON.stringify(state.config)),
      skcs: [...state.skcs],
      queryType: state.queryType || 'SKC',
      runScopedSkcs: state.runScopedSkcs ? [...state.runScopedSkcs] : null,
      activeRetry: !!state.activeRetry,
      skcStatuses: JSON.parse(JSON.stringify(state.skcStatuses || {})),
      xlsxMeta: state.xlsxMeta ? JSON.parse(JSON.stringify(state.xlsxMeta)) : null,
      frontCursor: state.frontCursor,
      frontCursorStart: state.frontCursorStart,
      usedFrontStart: [...(state.usedFrontStart || [])],
      backMaterialNames: [...(state.backMaterialNames || [])],
      backPlanNames: [...(state.backPlanNames || [])],
      imagePlan: JSON.parse(JSON.stringify(state.imagePlan || {})),
      usedFrontImages: [...(state.usedFrontImages || [])],
      submitAttempt: state.submitAttempt ? JSON.parse(JSON.stringify(state.submitAttempt)) : null,
      error: state.error,
      logs: state.logs.slice(-300),
    };
  }

  function applyTaskState(snapshot) {
    if (!snapshot) return;
    const fields = ['status', 'phase', 'cursor', 'retry', 'current', 'config', 'skcs', 'queryType', 'runScopedSkcs',
      'activeRetry',
      'skcStatuses', 'xlsxMeta', 'frontCursor', 'frontCursorStart', 'backMaterialNames',
      'backPlanNames', 'imagePlan',
      'usedFrontStart', 'usedFrontImages', 'submitAttempt', 'error', 'logs'];
    for (const key of fields) {
      if (snapshot[key] !== undefined) state[key] = JSON.parse(JSON.stringify(snapshot[key]));
    }
    if (snapshot.runScopedSkcs === undefined) state.runScopedSkcs = null;
    if (snapshot.activeRetry === undefined) state.activeRetry = false;
    if (snapshot.usedFrontStart === undefined) state.usedFrontStart = [];
    if (snapshot.queryType === undefined) state.queryType = 'SKC';
    if (snapshot.backPlanNames === undefined) state.backPlanNames = [];
    if (snapshot.imagePlan === undefined) state.imagePlan = {};
  }

  function currentTaskRecord() {
    return taskLibrary.find((task) => task.id === currentTaskId) || null;
  }

  async function saveTaskLibrary() {
    await dbSet('multiTasks', JSON.parse(JSON.stringify(taskLibrary)));
  }

  async function syncCurrentTaskRecord() {
    const record = currentTaskRecord();
    if (!record) return;
    const snap = captureTaskState();
    if (snap.status === 'idle' && record.status && record.status !== 'draft') {
      snap.status = record.status;
    }
    if (snap.status === 'done' && ['success', 'partial', 'failed'].includes(record.status)) {
      snap.status = record.status;
    }
    Object.assign(record, {
      artNo: state.config.artNo || record.artNo,
      status: snap.status === 'idle' ? 'draft' : snap.status,
      updatedAt: Date.now(),
      snapshot: snap,
    });
  }

  async function loadTaskLibrary() {
    const saved = await dbGet('multiTasks');
    taskLibrary = Array.isArray(saved) ? saved : [];
  }

  async function saveState() {
    await syncCurrentTaskRecord();
    await dbSet('task', JSON.parse(JSON.stringify({
      status: state.status,
      phase: state.phase,
      cursor: state.cursor,
      retry: state.retry,
      config: state.config,
      skcs: state.skcs,
      queryType: state.queryType,
      runScopedSkcs: state.runScopedSkcs,
      activeRetry: state.activeRetry,
      frontCursor: state.frontCursor,
      frontCursorStart: state.frontCursorStart,
      usedFrontStart: state.usedFrontStart,
      current: state.current,
      backMaterialNames: state.backMaterialNames,
      backPlanNames: state.backPlanNames,
      imagePlan: state.imagePlan,
      usedFrontImages: state.usedFrontImages,
      submitAttempt: state.submitAttempt,
      skcStatuses: state.skcStatuses,
      xlsxMeta: state.xlsxMeta,
      error: state.error,
      logs: state.logs.slice(-200),
    })));
    if (currentTaskRecord()) await saveTaskLibrary();
  }

  async function loadState() {
    const saved = await dbGet('task');
    if (saved) Object.assign(state, saved);
    return saved;
  }

  function log(msg, level = 'info') {
    const who = uiState.remark || uiState.shopName;
    const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}]${who ? '[' + who + ']' : ''} ${msg}`;
    state.logs.push({ t: Date.now(), level, line });
    if (state.logs.length > 400) state.logs.shift();
    if (level === 'error') console.error('[TEMU图片助手]', msg);
    else console.log('[TEMU图片助手]', msg);
    renderLog();
  }

  function assertRunning() {
    if (state.status === 'running' && state.skcTimedOut) throw new Error('__SKC_TIMEOUT__');
    if (state.status !== 'running') throw new Error('__ABORTED__');
  }

  function markSkuProgress(reason = '') {
    if (!state.current) return;
    state.current.lastProgressAt = Date.now();
    if (reason) state.current.lastProgress = reason;
  }

  function skuInactivityMs(now = Date.now()) {
    if (!state.current) return 0;
    const last = Number(state.current.lastProgressAt || state.current.startedAt || 0);
    return last ? Math.max(0, now - last) : 0;
  }

  function activeSkcs() {
    return Array.isArray(state.runScopedSkcs) && state.runScopedSkcs.length
      ? state.runScopedSkcs : state.skcs;
  }

  function classifySkcInfo(info) {
    const text = String(info && info.status || '').trim();
    if (SUCCESS_STATUS_RE.test(text)) return { kind: 'success', retryable: false };
    if (TIMEOUT_STATUS_RE.test(text)) return { kind: 'timeout', retryable: info.retryable !== false };
    if (RETRYABLE_STATUS_RE.test(text)) return { kind: 'failed', retryable: info.retryable !== false };
    return { kind: 'pending', retryable: false };
  }

  function taskStats(task) {
    const snapshot = task && task.id === currentTaskId ? captureTaskState() : (task && task.snapshot);
    const skcs = [...new Set((snapshot && snapshot.skcs) || [])];
    const statuses = (snapshot && snapshot.skcStatuses) || {};
    const out = {
      total: skcs.length,
      success: 0,
      failed: 0,
      timedOut: 0,
      pending: 0,
      retryable: 0,
      retrySkcs: [],
      details: [],
    };
    for (const skc of skcs) {
      const info = statuses[skc] || null;
      const cls = classifySkcInfo(info);
      out[cls.kind === 'timeout' ? 'timedOut' : cls.kind] += 1;
      if (cls.retryable) {
        out.retryable += 1;
        out.retrySkcs.push(skc);
      }
      out.details.push({
        skc,
        status: info ? info.status : '待处理',
        kind: cls.kind,
        retryable: cls.retryable,
        attempts: Number(info && info.attempts || 0),
        reason: (info && info.lastReason) || '',
        at: info && info.at || null,
      });
    }
    return out;
  }

  function queueStats() {
    const totals = {
      tasks: taskLibrary.length,
      success: 0,
      failed: 0,
      timedOut: 0,
      pending: 0,
      retryable: 0,
      retryTasks: 0,
    };
    for (const task of taskLibrary) {
      const stats = taskStats(task);
      totals.success += stats.success;
      totals.failed += stats.failed;
      totals.timedOut += stats.timedOut;
      totals.pending += stats.pending;
      totals.retryable += stats.retryable;
      if (stats.retryable) totals.retryTasks += 1;
    }
    return totals;
  }

  function finalTaskStatus(stats) {
    if (!stats.total || stats.success === stats.total) return 'success';
    if (stats.success > 0) return 'partial';
    if (stats.failed + stats.timedOut > 0) return 'failed';
    return 'done';
  }

  function rollbackCurrentFrontUsage() {
    state.frontCursor = Number(state.frontCursorStart || 0);
    state.usedFrontImages = Array.isArray(state.usedFrontStart)
      ? [...state.usedFrontStart] : [];
  }

  // ============================================================ 面板 UI
  let ui = {};
  let artNoSaveTimer = null;
  let panelReady = false;
  const uiState = {
    theme: { preset: 'classic', primary: '', dark: false, alpha: 1 },
    pos: null,
    collapsed: false,
    closed: false,
    remark: '',
    wizardDone: false,
    shopName: '',
    activeTab: 'task',
    view: 'home',
    panelSize: null,
    leaseBlocked: false,
  };

  async function saveUI() {
    await dbSet('ui', JSON.parse(JSON.stringify({
      theme: uiState.theme,
      pos: uiState.pos,
      collapsed: uiState.collapsed,
      closed: uiState.closed,
      remark: uiState.remark,
      wizardDone: uiState.wizardDone,
      activeTab: uiState.activeTab,
      view: uiState.view,
      panelSize: uiState.panelSize,
      currentTaskId,
    })));
  }

  async function loadUI() {
    const saved = await dbGet('ui');
    if (saved) {
      const savedTheme = saved.theme || {};
      Object.assign(uiState, saved);
      uiState.theme = {
        preset: savedTheme.preset || 'classic',
        primary: savedTheme.primary || '',
        dark: !!savedTheme.dark,
        alpha: savedTheme.alpha != null ? savedTheme.alpha : 1,
      };
      uiState.closed = !!saved.closed;
      uiState.view = saved.view === 'detail' || saved.view === 'log' ? saved.view : 'home';
      uiState.panelSize = saved.panelSize && typeof saved.panelSize.width === 'number'
        && typeof saved.panelSize.height === 'number' ? saved.panelSize : null;
    }
  }

  /** 颜色混合：ratio>0 变亮，ratio<0 变暗 */
  function mixColor(hex, ratio) {
    let c = String(hex || '#2f6fed').replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const num = parseInt(c, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    const target = ratio >= 0 ? 255 : 0;
    const k = Math.abs(ratio);
    r = Math.round(r + (target - r) * k);
    g = Math.round(g + (target - g) * k);
    b = Math.round(b + (target - b) * k);
    return `rgb(${r}, ${g}, ${b})`;
  }

  /** 从页面右上角读取店铺名 */
  function detectShopName() {
    try {
      const black = ['消息', '客服', '反馈', '规则中心', '运营对接', '课程&直播', '智能助手', 'NEW', '商家中心', '首页'];
      const cands = [...document.querySelectorAll('*')].filter((el) => {
        if (el.children.length) return false;
        const t = (el.innerText || '').trim();
        if (!t || t.length < 2 || t.length > 30) return false;
        if (black.includes(t) || /^\d+$/.test(t)) return false;
        if (el.closest('#temu-image-bot-host')) return false;
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.top < 90 && r.left > window.innerWidth * 0.7;
      });
      if (!cands.length) return '';
      cands.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
      return (cands[0].innerText || '').trim();
    } catch (err) {
      return '';
    }
  }

  function themeVars() {
    const t = uiState.theme;
    const preset = THEMES[t.preset] || THEMES.classic;
    const dark = !!t.dark;
    const customPrimary = !!t.primary;
    const primary = t.primary || preset.primary;
    const accent = preset.accent || primary;
    const defaultHeader = `linear-gradient(135deg,${primary},${mixColor(primary, dark ? 0.2 : -0.16)})`;
    const headerBg = customPrimary ? defaultHeader : (preset.headerBg || defaultHeader);
    const actionBg = customPrimary
      ? `linear-gradient(135deg,${primary},${mixColor(primary, dark ? 0.16 : -0.12)})`
      : (preset.actionBg || primary);
    const defaultHero = dark
      ? 'linear-gradient(180deg,var(--soft),var(--bg))'
      : 'linear-gradient(180deg,#f5f7fb,#fff)';
    const bg = dark ? (preset.darkBg || '#1e2126') : (preset.bg || '#ffffff');
    const soft = dark ? (preset.darkSoft || '#262b33') : (preset.soft || '#f4f6fa');
    return {
      '--primary': primary,
      '--primary-hover': mixColor(primary, dark ? 0.2 : -0.16),
      '--accent': accent,
      '--bg': bg,
      '--fg': dark ? '#e6e8ec' : '#222222',
      '--muted': dark ? '#98a1b0' : '#666666',
      '--border': dark ? '#343a45' : '#d8dbe3',
      '--soft': soft,
      '--btn-bg': dark ? '#2c313b' : '#f7f8fa',
      '--log-bg': dark ? '#0d0f13' : '#111111',
      '--log-fg': dark ? '#b9e6c1' : '#c8e1c8',
      '--header-bg': headerBg,
      '--action-bg': actionBg,
      '--action-hover': preset.actionHover || mixColor(primary, dark ? 0.24 : -0.18),
      '--hero-bg': customPrimary
        ? (dark ? 'linear-gradient(180deg,rgba(255,255,255,.04),transparent)' : 'linear-gradient(180deg,rgba(255,255,255,.72),transparent)')
        : (preset.heroBg || defaultHero),
      '--body-image': preset.bodyImage || 'none',
      '--body-size': preset.bodySize || 'auto',
      '--card-bg': dark ? (preset.darkCardBg || '#20252d') : (preset.cardBg || 'rgba(255,255,255,.82)'),
      '--settings-bg': dark ? 'rgba(18,22,29,.98)' : 'rgba(255,255,255,.97)',
      '--alpha': String(t.alpha != null ? t.alpha : 1),
    };
  }

  function applyTheme() {
    if (!ui.themeStyle) return;
    const vars = themeVars();
    ui.themeStyle.textContent = ':host{' + Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('') + '}';
    const preset = THEMES[uiState.theme.preset] || THEMES.classic;
    if (ui.themeBtns) {
      [...ui.themeBtns.children].forEach((b) => {
        b.style.outline = b.dataset.preset === uiState.theme.preset ? '2px solid var(--primary)' : 'none';
      });
    }
    if (ui.darkChk) ui.darkChk.checked = !!uiState.theme.dark;
    if (ui.themeName) ui.themeName.textContent = preset.label;
    if (ui.alphaRange) ui.alphaRange.value = String(uiState.theme.alpha != null ? uiState.theme.alpha : 1);
    if (ui.customColor && preset) ui.customColor.value = uiState.theme.primary || preset.primary;
    if (ui.remarkInput && document.activeElement !== ui.remarkInput) ui.remarkInput.value = uiState.remark || '';
  }

  function applyPos() {
    if (!ui.host) return;
    if (ui.box && uiState.panelSize) {
      ui.box.style.width = `${uiState.panelSize.width}px`;
      ui.box.style.height = `${uiState.panelSize.height}px`;
    }
    if (uiState.pos && typeof uiState.pos.left === 'number') {
      const rect = ui.box && ui.box.getBoundingClientRect();
      const width = (rect && rect.width) || 448;
      const left = Math.max(56 - width, Math.min(window.innerWidth - 56, uiState.pos.left));
      const top = Math.max(0, Math.min(window.innerHeight - 42, uiState.pos.top));
      ui.host.style.left = `${left}px`;
      ui.host.style.top = `${top}px`;
      ui.host.style.right = 'auto';
      ui.host.style.bottom = 'auto';
      uiState.pos = { left, top };
    }
    if (ui.box) ui.box.classList.toggle('closed', !!uiState.closed);
    if (ui.panelLauncher) ui.panelLauncher.classList.toggle('show', !!uiState.closed);
    const bd = ui.root && ui.root.querySelector('.bd');
    if (bd) bd.classList.toggle('open', !uiState.collapsed);
  }

  function showView(view) {
    const target = view === 'log' ? 'log' : 'task';
    uiState.view = view === 'log' ? 'log' : (view === 'detail' ? 'detail' : 'home');
    if (ui.panes) {
      ui.panes.forEach((pane) => pane.classList.toggle('active', pane.dataset.pane === target));
    }
    if (ui.taskPane) {
      ui.taskPane.classList.toggle('detail-mode', uiState.view === 'detail');
      ui.taskPane.classList.toggle('home-mode', uiState.view === 'home');
    }
    if (ui.footer) ui.footer.classList.toggle('hidden', uiState.view !== 'home');
    const record = currentTaskRecord();
    if (ui.detailTaskName) {
      ui.detailTaskName.textContent = record ? record.artNo || '未命名货号' : '任务设置';
    }
    renderTaskList();
    if (uiState.view === 'detail') renderPrepareChecklist();
    saveUI();
  }

  function buildPanel() {
    const host = document.createElement('div');
    host.id = 'temu-image-bot-host';
    // 层级放在页面弹窗(1000)之下，避免挡住 TEMU 弹窗按钮
    host.style.cssText = 'position:fixed;z-index:900;right:16px;bottom:16px;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style id="theme"></style>
      <style>
        *{box-sizing:border-box;font-family:-apple-system,"Microsoft YaHei",sans-serif}
        .box{display:flex;flex-direction:column;width:392px;min-width:360px;max-width:min(94vw,760px);
             min-height:320px;max-height:94vh;resize:none;overflow:hidden;
             background-color:var(--bg);background-image:var(--body-image);background-size:var(--body-size);
             border:1px solid var(--border);border-radius:10px;
             box-shadow:0 10px 30px rgba(0,0,0,.18);font-size:12px;color:var(--fg);
             opacity:var(--alpha)}
        .hd{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;
            background:var(--header-bg);color:#fff;border-radius:9px 9px 0 0;font-weight:600;cursor:move;
            position:relative;overflow:hidden;touch-action:none}
        .box.dragging{user-select:none;cursor:move}
        .hd::after{content:"";position:absolute;inset:-80% -20% auto auto;width:210px;height:150px;
             pointer-events:none;background:radial-gradient(circle,rgba(255,255,255,.34),transparent 68%);opacity:.7}
        .hd button{background:transparent;border:0;color:#fff;cursor:pointer;font-size:14px}
        .box.closed{display:none}
        .panelLauncher{display:none;width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,.45);
             background:var(--header-bg);color:#fff;font-size:20px;place-items:center;cursor:pointer;
             box-shadow:0 10px 28px rgba(15,23,42,.30)}
        .panelLauncher.show{display:grid}
        .resizer{position:absolute;z-index:22;touch-action:none;background:transparent}
        .resizer.ew{right:0;top:0;width:10px;height:100%;cursor:ew-resize}
        .resizer.ns{left:0;bottom:0;width:100%;height:10px;cursor:ns-resize}
        .resizer.nwse{right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize}
        .bd{padding:10px;max-height:70vh;overflow:auto;display:none}
        .bd.open{display:flex;flex-direction:column}
        .row{display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap}
        .row label{color:var(--muted)}
        input[type=text],input[type=number]{border:1px solid var(--border);background:var(--bg);color:var(--fg);
             border-radius:6px;padding:4px 6px;font-size:12px;outline:none;min-width:0}
        button.btn{border:1px solid var(--border);background:var(--btn-bg);border-radius:6px;padding:5px 9px;
             cursor:pointer;font-size:12px;white-space:nowrap}
        button.btn:hover{border-color:var(--primary)}
        button.pri{background:var(--action-bg);border-color:var(--primary);color:#fff}
        button.pri:hover{background:var(--action-hover)}
        button.danger{color:#c0392b;border-color:#e6b3ad}
        button:disabled{opacity:.45;cursor:not-allowed}
        .stat{background:var(--soft);border-radius:6px;padding:6px 8px;margin-bottom:6px;line-height:1.6}
        .hint{color:var(--muted);font-size:11px;margin:-2px 0 6px}
        .field{display:flex;flex-direction:column;gap:2px}
        .field > span{color:var(--muted);font-size:11px}
        .log{background:var(--log-bg);color:var(--log-fg);border-radius:6px;padding:6px;height:150px;overflow:auto;
             font-family:Consolas,monospace;font-size:11px;line-height:1.45;white-space:pre-wrap}
        .tag{display:inline-block;background:var(--soft);border-radius:4px;padding:1px 5px;margin-left:4px;color:var(--muted)}
        .warn{color:#c0392b}
        .ok{color:#1e8e3e}
        hr{border:0;border-top:1px solid var(--border);margin:8px 0}
        .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;background:#9aa1ad}
        .dot.run{background:#2ecc71}.dot.err{background:#e74c3c}.dot.done{background:#3498db}
        .swatches{display:flex;gap:4px;flex-wrap:wrap;max-width:270px}
        .swatches button{width:22px;height:22px;border-radius:50%;border:1px solid var(--border);cursor:pointer;padding:0}
        .wizard{display:none;background:var(--soft);border:1px dashed var(--primary);border-radius:8px;
                padding:8px;margin-bottom:8px;line-height:1.7}
        .wizard.show{display:block}
        .gear{background:transparent;border:0;color:#fff;cursor:pointer;font-size:13px}
        .box{width:448px;border-radius:16px;overflow:hidden;border-color:color-mix(in srgb,var(--border) 75%,transparent);
             box-shadow:0 22px 70px rgba(15,23,42,.28),0 3px 10px rgba(15,23,42,.12)}
        .hd{padding:11px 14px;background:var(--header-bg);border-radius:0}
        .brand{display:flex;align-items:center;gap:9px;min-width:0}
        .brandMark{width:28px;height:28px;border-radius:9px;background:rgba(255,255,255,.18);display:grid;place-items:center;
             font-size:13px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.22)}
        .brandText{display:flex;flex-direction:column;line-height:1.15;min-width:0}
        .brandText b{font-size:13px;white-space:nowrap}
        .brandText small{font-size:9px;opacity:.78;letter-spacing:.4px}
        .hdActions{display:flex;align-items:center;gap:3px}
        .hdActions button{width:27px;height:27px;border-radius:8px;background:rgba(255,255,255,.12)}
        .bd{padding:0;flex:1;min-height:0;overflow:hidden;max-height:none}
        .hero{padding:12px 14px 10px;background:var(--hero-bg)}
        .stat{padding:0;margin:0;background:transparent;font-size:12px;line-height:1.62}
        .progressTrack{height:7px;background:color-mix(in srgb,var(--border) 58%,transparent);border-radius:99px;overflow:hidden;margin-top:9px}
        .progressFill{height:100%;width:0;background:linear-gradient(90deg,var(--primary),var(--accent));
             border-radius:99px;transition:width .3s ease}
        .progressMeta{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:5px;color:var(--muted);font-size:10px}
        .leaseChip{padding:2px 7px;border-radius:99px;background:var(--soft);border:1px solid var(--border)}
        .leaseChip.alert{color:#b42318;border-color:#f1b7b2;background:#fff1f0}
        .tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:8px 12px 0;border-bottom:1px solid var(--border);background:var(--bg)}
        .tabs{display:none!important}
        .detailHeader{display:flex;align-items:center;gap:8px;margin-bottom:8px}
        .detailHeader b{flex:1;text-align:center;font-size:13px}
        .detailOnly{display:none!important}
        .setupOnly{display:none!important}
        .pane[data-pane=task].detail-mode .homeOnly{display:none!important}
        .pane[data-pane=task].detail-mode .detailOnly{display:flex!important}
        .pane[data-pane=task].detail-mode .setupOnly{display:block!important}
        .pane[data-pane=task].detail-mode .importGrid.setupOnly{display:grid!important}
        .pane[data-pane=task].detail-mode .prepareChecklist.setupOnly{display:grid!important}
        .pane[data-pane=task].detail-mode .row.setupOnly{display:flex!important}
        .pane[data-pane=task].detail-mode .wizard.setupOnly{display:none!important}
        .pane[data-pane=task].detail-mode .wizard.setupOnly.show{display:block!important}
        .tab{border:0;background:transparent;color:var(--muted);padding:8px 4px 9px;cursor:pointer;font-size:12px;font-weight:600;
             border-bottom:2px solid transparent}
        .tab.active{color:var(--primary);border-bottom-color:var(--primary)}
        .pane{display:none;padding:12px 14px;max-height:none;overflow:auto;flex:1;min-height:0}
        .pane.active{display:block}
        .sectionTitle{display:flex;align-items:center;justify-content:space-between;margin:2px 0 8px;font-weight:700;font-size:12px}
        .sectionTitle small{font-weight:400;color:var(--muted)}
        .importGrid{display:grid;grid-template-columns:1fr;gap:7px}
        .importCard{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid var(--border);
             border-radius:10px;background:linear-gradient(180deg,var(--card-bg),var(--soft))}
        .importCard .ico{width:28px;height:28px;border-radius:8px;background:color-mix(in srgb,var(--primary) 12%,var(--bg));
             color:var(--primary);display:grid;place-items:center;font-size:14px;flex:none}
        .importCard .copy{flex:1;min-width:0}
        .importCard .copy b{display:block;font-size:11px}
        .importCard .copy span{display:block;color:var(--muted);font-size:10px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .group{background:var(--card-bg);border:1px solid var(--border);border-radius:11px;padding:9px;margin-bottom:9px}
        .groupTitle{font-weight:700;font-size:11px;margin-bottom:7px;color:var(--fg)}
        .group .row:last-child{margin-bottom:0}
        .log{height:280px;border:1px solid #222;border-radius:10px}
        .logTools{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
        .footer{display:flex;gap:7px;align-items:center;padding:10px 14px;border-top:1px solid var(--border);
             background:color-mix(in srgb,var(--card-bg) 92%,transparent);backdrop-filter:blur(14px);z-index:3}
        .footer .grow{flex:1}
        .footer button{border-radius:9px;padding:8px 12px;font-weight:600}
        .footer.hidden{display:none}
        .settings{display:none;position:absolute;inset:44px 10px 72px;z-index:8;background:var(--settings-bg);border:1px solid var(--border);
             border-radius:12px;padding:12px;overflow:auto;box-shadow:0 18px 50px rgba(0,0,0,.22)}
        .settings.show{display:block}
        .box{position:relative}
        .emptyTip{padding:10px;border:1px dashed var(--border);border-radius:10px;color:var(--muted);line-height:1.65;background:var(--soft)}
        .taskList{display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto;margin-bottom:10px}
        .preparePanel{padding:11px 12px;margin:10px 0;border:1px solid color-mix(in srgb,var(--primary) 38%,var(--border));
             border-left:4px solid var(--primary);border-radius:12px;background:linear-gradient(135deg,color-mix(in srgb,var(--primary) 10%,var(--bg)),var(--card-bg))}
        .preparePanel.attention{box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 12%,transparent)}
        .preparePanel.ready{border-color:#86b99a;border-left-color:#16a34a;background:linear-gradient(135deg,#eaf8ef,var(--card-bg))}
        .prepareHead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}
        .prepareHead b{font-size:13px}.requiredBadge{font-size:9px;padding:1px 6px;border-radius:99px;background:#fee2e2;color:#b42318;margin-left:5px}
        .prepareInputRow{display:flex;align-items:flex-end;gap:9px}
        .prepareInputRow .field{min-width:0}.prepareArtField{flex:1}
        .prepareInputRow input{width:100%;padding:8px 10px!important;font-size:14px!important;font-weight:700}
        .prepareSelect{padding:7px 8px!important;border:1px solid var(--border)!important;border-radius:7px!important;
             background:var(--bg)!important;color:var(--fg)!important}
        .requiredMark{color:#dc2626}
        .prepareChecklist{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:9px 0}
        .prepareCheckItem{display:flex;align-items:center;gap:5px;padding:5px 7px;border:1px solid var(--border);
             border-radius:7px;background:var(--card-bg);font-size:10px;color:var(--muted)}
        .prepareCheckItem.ok{color:#166534;border-color:#bbf7d0;background:#f0fdf4}
        .prepareCheckItem.bad{color:#b42318;border-color:#fecaca;background:#fff7f7}
        button.prepareCta{display:block;width:100%;padding:11px 14px!important;border:0!important;border-radius:10px!important;
             color:#fff!important;background:linear-gradient(135deg,#f59e0b,#ea580c)!important;font-size:13px!important;
             font-weight:800!important;box-shadow:0 7px 20px rgba(234,88,12,.28)}
        button.prepareCta.attention{animation:preparePulse 1.8s ease-in-out infinite}
        button.prepareCta.ready{background:linear-gradient(135deg,#15803d,#22c55e)!important;box-shadow:0 7px 20px rgba(22,163,74,.24);animation:none}
        .prepareActionHint{font-size:10px;color:var(--muted);margin-top:6px;line-height:1.5;text-align:center}
        .prepareHint{font-size:10px;color:var(--muted);margin-top:6px;line-height:1.5}
        @keyframes preparePulse{0%,100%{transform:translateY(0);box-shadow:0 6px 16px color-mix(in srgb,var(--primary) 28%,transparent)}
             50%{transform:translateY(-1px);box-shadow:0 9px 22px color-mix(in srgb,var(--primary) 42%,transparent)}}
        .taskRow{display:flex;align-items:center;gap:8px;padding:8px 9px;border:1px solid var(--border);border-radius:9px;background:var(--card-bg);cursor:pointer}
        .taskRow.active{border-color:var(--primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--primary) 18%,transparent)}
        .taskRow .name{display:block;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .taskRow .taskCopy{flex:1;min-width:0}.taskRow .taskCounts{display:block;font-size:9px;color:var(--muted);margin-top:2px}
        .queueStats{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:10px}
        .queueStat{padding:7px 5px;border-radius:8px;background:var(--soft);text-align:center;border:1px solid var(--border)}
        .queueStat b{display:block;font-size:15px}.queueStat span{font-size:9px;color:var(--muted)}
        .taskBadge{font-size:10px;padding:2px 6px;border-radius:99px;background:var(--soft);color:var(--muted)}
        .taskBadge.ready{color:#166534;background:#dcfce7}.taskBadge.running{color:#fff;background:var(--primary)}
        .taskBadge.done{color:#1d4ed8;background:#dbeafe}.taskBadge.failed{color:#b42318;background:#fee2e2}
        .taskBadge.success{color:#166534;background:#dcfce7}.taskBadge.partial{color:#92400e;background:#fef3c7}
        button:disabled{opacity:.5;cursor:not-allowed}
        @media (max-width:520px){.box{width:calc(100vw - 20px)}}
      </style>
      <div class="box">
        <div class="hd">
          <span id="dragHandle" class="brand">
            <span class="brandMark">✦</span>
            <span class="brandText"><b>TEMU 图片工作台</b><small>AUTO COLOR STUDIO</small></span>
            <span id="whoChip" class="tag" style="background:rgba(255,255,255,.2);color:#fff"></span>
          </span>
          <span class="hdActions">
            <button class="gear" id="gear" title="设置">⚙</button>
            <button id="min" title="折叠">—</button>
            <button id="closePanel" title="关闭到悬浮按钮">×</button>
          </span>
        </div>
        <div class="bd open">
          <div class="hero">
            <div class="stat" id="stat">未开始</div>
            <div class="progressTrack"><div class="progressFill" id="progressFill"></div></div>
            <div class="progressMeta">
              <span id="progressText">等待开始</span>
              <span class="leaseChip" id="leaseChip">单任务模式</span>
            </div>
          </div>
          <div class="tabs">
            <button class="tab active" data-tab="task">任务</button>
            <button class="tab" data-tab="params">参数</button>
            <button class="tab" data-tab="log">记录</button>
          </div>
          <div class="pane active" data-pane="task">
          <div class="detailHeader detailOnly">
            <button class="btn" id="backHome">← 任务列表</button>
            <b id="detailTaskName">任务设置</b>
          </div>
          <div class="sectionTitle homeOnly">货号任务 <small>一个货号对应一个任务</small></div>
          <div class="taskList homeOnly" id="taskList"></div>
          <div class="preparePanel attention setupOnly" id="preparePanel">
            <div class="prepareHead">
              <span><b>任务基础设置</b><span class="requiredBadge">货号必填</span></span>
              <span class="taskBadge" id="activeTaskState">草稿</span>
            </div>
            <div class="prepareInputRow">
              <div class="field prepareArtField">
                <span>货号 <b class="requiredMark">*</b></span>
                <input type="text" id="artNo" value="DWRG" placeholder="例如 DWRG"
                       title="新增色值必须使用这个货号；写 DWRG{i} 会按顺序生成 DWRG2、DWRG3…">
              </div>
              <div class="field">
                <span>商品清单类型</span>
                <select id="queryType" class="prepareSelect">
                  <option value="SKC">SKC 清单</option>
                  <option value="SPU">SPU 清单</option>
                </select>
              </div>
            </div>
            <div class="prepareHint">货号会同步到任务名称和 SKU 货号默认值；切换清单类型后需要重新导入清单。</div>
          </div>
          <div class="prepareChecklist setupOnly" id="prepareChecklist"></div>
          <button class="btn prepareCta setupOnly" id="prepareTask">检查并保存准备</button>
          <div class="prepareActionHint setupOnly" id="prepareHint">按清单逐项完成资料后保存准备。</div>
          <div class="queueStats homeOnly" id="queueStats"></div>
          <div class="row homeOnly">
            <button class="btn" id="newTask">＋ 新建货号任务</button>
            <button class="btn danger" id="deleteTask">删除任务</button>
            <button class="btn" id="openLog">记录</button>
          </div>
          <div class="wizard setupOnly" id="wizard">
            <b>第一次使用？三步就能跑起来：</b><br>
            ① <span id="wz1">导入商品清单</span>（SKC 或 SPU，按表头自动识别）<br>
            ② <span id="wz2">导入主图文件夹</span> + <span id="wz3">导入背面图文件夹</span><br>
            ③ 填好下面的「新色值货号 / 新增色值数量 / 背面图张数」→ 点 <b>开始</b><br>
            <div class="row" style="margin-top:6px">
              <button class="btn" id="wzOk">我知道了，不再提示</button>
              <span class="hint">想先试跑就勾上「安全演练」</span>
            </div>
          </div>

          <div class="sectionTitle setupOnly">任务准备 <small>导入后即可开始</small></div>
          <div class="importGrid setupOnly">
            <div class="importCard">
              <span class="ico">▤</span>
              <span class="copy"><b id="listTypeTitle">SKC 清单</b><span id="skcInfo">未导入</span></span>
              <button class="btn" id="impSkc">选择 Excel</button>
              <input type="file" id="skcFile" accept=".xlsx,.xls,.csv,.txt" style="display:none">
            </div>
            <div class="importCard">
              <span class="ico">✦</span>
              <span class="copy"><b>主图文件夹</b><span id="frontInfo">未导入</span></span>
              <button class="btn" id="impFront">选择目录</button>
            </div>
            <div class="importCard">
              <span class="ico">▧</span>
              <span class="copy"><b>背面图文件夹</b><span id="backInfo">未导入</span></span>
              <button class="btn" id="impBack">选择目录</button>
            </div>
          </div>
          <div id="estimate" class="hint setupOnly" style="margin-top:9px"></div>
          <div class="row setupOnly">
            <button class="btn" id="expStatus">下载回写 Excel</button>
            <span class="tag" id="statusFileInfo">未导入状态表</span>
          </div>
          <div class="row setupOnly" style="margin-top:8px">
            <button class="btn" id="dlDelistTemplate" title="下载下架 SKC ID 的标准 Excel 模板">下载下架 SKC 模板</button>
            <span class="hint">下架用：先下载标准模板，按列填入要下架的 SKC ID</span>
          </div>
          <div class="emptyTip setupOnly" style="margin-top:8px">提交前自动核对图片、价格和 SKU；异常会记录原因并按规则处理。</div>
        </div>

          <div class="pane" data-pane="params">
          <div class="sectionTitle">商品与素材 <small>常用参数</small></div>
          <div class="group">
          <div class="row" style="align-items:flex-end">
            <div class="field">
              <span>新增色值数量</span>
              <input type="number" id="n" style="width:64px" min="1" max="7" value="4"
                     title="每个商品要新增几个颜色，1–7 个">
            </div>
            <div class="field">
              <span>每个色值的背面图张数</span>
              <input type="number" id="x" style="width:64px" min="1" max="10" value="2"
                     title="这 X 张背面图会被所有新增色值复用">
            </div>
          </div>
          <div class="hint">货号在上方“任务准备”区填写。数量想自动编号可在货号中写 <b>DWRG{i}</b>。</div>
          <div class="row" style="align-items:flex-end">
            <div class="field">
              <span>图片裁剪尺寸（宽 × 高）</span>
              <div class="row" style="margin:0">
                <input type="number" id="cropW" style="width:70px" value="1350" title="上传后统一裁成这个尺寸">
                <span>×</span>
                <input type="number" id="cropH" style="width:70px" value="1800">
              </div>
            </div>
            <div class="field">
              <span>提交方式</span>
              <div class="row" style="margin:0">
                <label><input type="checkbox" id="autoSubmit" checked> 处理完自动提交</label>
                <label><input type="checkbox" id="dryRun"> 安全演练（只做不提交）</label>
              </div>
            </div>
          </div>
          <div class="row">
            <div class="field">
              <span>卡死无进展超时（分钟）</span>
              <input type="number" id="skuTimeoutMin" min="3" max="120" value="10"
                     title="连续该时间没有任何有效进展才判定卡死；正常上传或处理较久不会仅因总耗时被跳过">
            </div>
            <span class="hint">只在连续无有效进展时触发；上传、裁剪、提交等有进展会重新计时。</span>
          </div>
          </div>
          <div class="groupTitle">平台属性与体积</div>
          <div class="group">
          <div class="row" style="align-items:flex-end">
            <div class="field">
              <span>敏感属性</span>
              <select id="sens" style="border:1px solid var(--border);background:var(--bg);color:var(--fg);border-radius:6px;padding:4px 6px">
                <option value="否">否</option>
                <option value="是">是</option>
              </select>
            </div>
            <div class="field">
              <span>体积（cm）长 × 次长 × 最短</span>
              <div class="row" style="margin:0">
                <input type="number" id="dimL" style="width:62px" value="30" title="最长边">
                <span>×</span>
                <input type="number" id="dimM" style="width:62px" value="20" title="次长边">
                <span>×</span>
                <input type="number" id="dimS" style="width:62px" value="1" title="最短边">
              </div>
            </div>
            <div class="field">
              <span>重量（g）</span>
              <input type="number" id="weight" style="width:86px" value="500">
            </div>
          </div>
          <div class="hint">新增色值的每个尺码都按这里的「敏感属性 / 体积 / 重量」统一填写；留空则照抄第一个色值。</div>
          </div>
          <div class="groupTitle">价格、库存与 SKU</div>
          <div class="group">
          <div class="row" style="align-items:flex-end">
            <div class="field">
              <span>备用申报价（元）</span>
              <input type="number" id="declPrice" style="width:86px" value="300" title="优先逐站点沿用混合色价格；仅当混合色某站点为空时才用这个备用值">
            </div>
            <div class="field">
              <span>库存</span>
              <input type="number" id="stock" style="width:86px" value="500" title="留空也按 500">
            </div>
            <div class="field">
              <span>SKU分类</span>
              <select id="skuCategory" style="border:1px solid var(--border);background:var(--bg);color:var(--fg);border-radius:6px;padding:4px 6px">
                <option value="单品">单品</option>
                <option value="同款多件装">同款多件装</option>
                <option value="混合套装">混合套装</option>
              </select>
            </div>
          </div>
          <div class="hint">说明：申报价格会优先按「尺码 + 站点」沿用混合色价格，只有混合色某个站点为空时才使用上面的备用申报价。</div>
          <div class="row" style="align-items:flex-end">
            <div class="field">
              <span>SKU货号（必填）</span>
              <input type="text" id="skuCodeBase" style="width:120px" value="DWRG">
            </div>
            <div class="field">
              <span>编号方式</span>
              <select id="skuCodeMode" style="border:1px solid var(--border);background:var(--bg);color:var(--fg);border-radius:6px;padding:4px 6px">
                <option value="fixed">全部相同（DWRG）</option>
                <option value="random">加随机后缀（DWRG-s-123）</option>
              </select>
            </div>
          </div>
          <div class="hint">包装清单与参考链接不填；原色值行不动，只填新增色值。</div>
          <div class="row">
            <label><input type="checkbox" id="strictCheck" checked> 提交前严格自检（缺字段不提交）</label>
            <span class="hint">不勾选：缺字段也提交，由平台提示</span>
          </div>
          <div class="row">
            <label title="敏感属性/体积重量与提交交给人工，其余全自动">
              <input type="checkbox" id="semiAuto"> 半自动模式：敏感属性/体积重量 + 提交由人工完成
            </label>
          </div>
          </div>
          </div>

          <div class="pane" data-pane="log">
          <div class="sectionTitle">运行记录 <small>实时日志与诊断</small></div>
          <div class="logTools">
            <button class="btn" id="backFromLog">← 任务列表</button>
            <button class="btn" id="expLog">导出日志</button>
            <button class="btn" id="clrLog">清空</button>
            <button class="btn" id="shot">截图留证</button>
          </div>
          <div class="log" id="log"></div>
          </div>

          <div class="footer">
            <button class="btn pri" id="start">开始队列</button>
            <button class="btn" id="pause">暂停</button>
            <button class="btn danger" id="stop">停止</button>
            <span class="grow"></span>
            <button class="btn" id="retryFailed">重试失败（0）</button>
            <button class="btn" id="nextSku">下一条商品</button>
          </div>

          <div id="settings" class="settings">
            <hr>
            <div class="row"><b>外观</b><span class="hint">只影响这个面板，不影响 TEMU 页面</span></div>
            <div class="hint">拖动标题栏或面板空白区域可以移动位置；拖动面板右下角可以调整宽高。按钮、输入框和日志区不会误触发拖动。</div>
            <div class="row">
              <span class="swatches" id="themeBtns"></span>
              <span class="tag" id="themeName">经典蓝</span>
              <label title="自定义主色"><input type="color" id="customColor" value="#2f6fed"></label>
              <label><input type="checkbox" id="darkChk"> 深色模式</label>
            </div>
            <div class="row">
              <label>面板透明度</label>
              <input type="range" id="alphaRange" min="0.7" max="1" step="0.05" value="1" style="width:110px">
            </div>
            <hr>
            <div class="row"><b>本窗口</b></div>
            <div class="field" style="margin-bottom:6px">
              <span>窗口备注（用于区分多个店铺窗口）</span>
              <input type="text" id="remarkInput" style="width:100%" placeholder="例如：7512-店铺A">
            </div>
            <div class="row">
              <button class="btn" id="expCfg">导出配置</button>
              <button class="btn" id="impCfg">导入配置</button>
              <button class="btn" id="expDiag">导出诊断包</button>
              <input type="file" id="cfgFile" accept=".json" style="display:none">
            </div>
            <div class="row">
              <span class="hint" id="verLine">版本 v${VERSION}</span>
              <button class="btn" id="chkVer">检查更新</button>
            </div>
            <div class="hint">
              说明：配置里包含参数、SKC/SPU 清单类型、皮肤与备注；图片文件夹因为浏览器安全限制，换电脑后需要重新选择一次。
            </div>
          </div>
        </div>
      <span class="resizer ew" data-resize="ew" title="左右拉伸"></span>
      <span class="resizer ns" data-resize="ns" title="上下拉伸"></span>
      <span class="resizer nwse" data-resize="nwse" title="四角拉伸"></span>
      </div>
      <button id="panelLauncher" class="panelLauncher" title="打开 TEMU 图片工作台" aria-label="打开 TEMU 图片工作台">✦</button>
    `;
    (document.body || document.documentElement).appendChild(host);

    ui = {
      host,
      root: shadow,
      box: shadow.querySelector('.box'),
      taskPane: shadow.querySelector('[data-pane=task]'),
      panelLauncher: shadow.getElementById('panelLauncher'),
      themeStyle: shadow.getElementById('theme'),
      stat: shadow.getElementById('stat'),
      estimate: shadow.getElementById('estimate'),
      progressFill: shadow.getElementById('progressFill'),
      progressText: shadow.getElementById('progressText'),
      leaseChip: shadow.getElementById('leaseChip'),
      statusFileInfo: shadow.getElementById('statusFileInfo'),
      taskList: shadow.getElementById('taskList'),
      queueStats: shadow.getElementById('queueStats'),
      retryFailed: shadow.getElementById('retryFailed'),
      preparePanel: shadow.getElementById('preparePanel'),
      prepareHint: shadow.getElementById('prepareHint'),
      prepareChecklist: shadow.getElementById('prepareChecklist'),
      prepareTask: shadow.getElementById('prepareTask'),
      activeTaskState: shadow.getElementById('activeTaskState'),
      detailTaskName: shadow.getElementById('detailTaskName'),
      backHome: shadow.getElementById('backHome'),
      openLog: shadow.getElementById('openLog'),
      backFromLog: shadow.getElementById('backFromLog'),
      footer: shadow.querySelector('.footer'),
      queryType: shadow.getElementById('queryType'),
      listTypeTitle: shadow.getElementById('listTypeTitle'),
      tabs: [...shadow.querySelectorAll('.tab')],
      panes: [...shadow.querySelectorAll('.pane')],
      whoChip: shadow.getElementById('whoChip'),
      skcInfo: shadow.getElementById('skcInfo'),
      frontInfo: shadow.getElementById('frontInfo'),
      backInfo: shadow.getElementById('backInfo'),
      log: shadow.getElementById('log'),
      artNo: shadow.getElementById('artNo'),
      n: shadow.getElementById('n'),
      x: shadow.getElementById('x'),
      cropW: shadow.getElementById('cropW'),
      cropH: shadow.getElementById('cropH'),
      autoSubmit: shadow.getElementById('autoSubmit'),
      dryRun: shadow.getElementById('dryRun'),
      sens: shadow.getElementById('sens'),
      dimL: shadow.getElementById('dimL'),
      dimM: shadow.getElementById('dimM'),
      dimS: shadow.getElementById('dimS'),
      weight: shadow.getElementById('weight'),
      strictCheck: shadow.getElementById('strictCheck'),
      declPrice: shadow.getElementById('declPrice'),
      stock: shadow.getElementById('stock'),
      skuCategory: shadow.getElementById('skuCategory'),
      skuCodeBase: shadow.getElementById('skuCodeBase'),
      skuCodeMode: shadow.getElementById('skuCodeMode'),
      skuTimeoutMin: shadow.getElementById('skuTimeoutMin'),
      semiAuto: shadow.getElementById('semiAuto'),
      skcFile: shadow.getElementById('skcFile'),
      wizard: shadow.getElementById('wizard'),
      settings: shadow.getElementById('settings'),
      themeBtns: shadow.getElementById('themeBtns'),
      themeName: shadow.getElementById('themeName'),
      customColor: shadow.getElementById('customColor'),
      darkChk: shadow.getElementById('darkChk'),
      alphaRange: shadow.getElementById('alphaRange'),
      remarkInput: shadow.getElementById('remarkInput'),
      cfgFile: shadow.getElementById('cfgFile'),
      verLine: shadow.getElementById('verLine'),
    };

    // 参数区合并到任务设置页，主列表页不再显示参数
    const paramsPane = shadow.querySelector('[data-pane=params]');
    if (paramsPane && ui.taskPane) {
      paramsPane.classList.remove('pane');
      paramsPane.removeAttribute('data-pane');
      paramsPane.classList.add('paramsSection', 'setupOnly');
      ui.taskPane.appendChild(paramsPane);
    }
    ui.panes = ui.panes.filter((pane) => pane.dataset.pane === 'task' || pane.dataset.pane === 'log');

    let panelSizeSaveTimer = null;
    if (typeof ResizeObserver !== 'undefined' && ui.box) {
      const sizeObserver = new ResizeObserver(() => {
        if (!panelReady) return;
        const rect = ui.box.getBoundingClientRect();
        if (rect.width < 100 || rect.height < 100) return;
        uiState.panelSize = { width: Math.round(rect.width), height: Math.round(rect.height) };
        clearTimeout(panelSizeSaveTimer);
        panelSizeSaveTimer = setTimeout(() => saveUI(), 350);
      });
      sizeObserver.observe(ui.box);
    }

    // 皮肤预设按钮
    Object.entries(THEMES).forEach(([key, t]) => {
      const b = document.createElement('button');
      b.dataset.preset = key;
      b.title = t.label;
      b.setAttribute('aria-label', `切换到${t.label}主题`);
      b.style.background = t.swatch || t.headerBg
        || `linear-gradient(135deg,${t.primary},${mixColor(t.primary, t.dark ? 0.2 : -0.16)})`;
      b.onclick = async () => {
        uiState.theme.preset = key;
        uiState.theme.dark = t.dark;
        uiState.theme.primary = '';
        applyTheme();
        await saveUI();
      };
      ui.themeBtns.appendChild(b);
    });

    shadow.getElementById('min').onclick = () => {
      const bd = shadow.querySelector('.bd');
      bd.classList.toggle('open');
      uiState.collapsed = !bd.classList.contains('open');
      saveUI();
    };
    shadow.getElementById('closePanel').onclick = () => {
      uiState.closed = true;
      applyPos();
      saveUI();
    };
    ui.panelLauncher.onclick = () => {
      uiState.closed = false;
      uiState.collapsed = false;
      applyPos();
      saveUI();
    };
    const switchTab = (name) => {
      if (name === 'log') showView('log');
      else if (uiState.view === 'detail') showView('detail');
      else showView('home');
      if (ui.settings) ui.settings.classList.remove('show');
      saveUI();
    };
    ui.switchTab = switchTab;
    ui.backHome.onclick = async () => {
      await syncCurrentTaskRecord();
      await saveTaskLibrary();
      showView('home');
      saveUI();
    };
    ui.openLog.onclick = () => switchTab('log');
    ui.backFromLog.onclick = () => switchTab('home');
    shadow.getElementById('gear').onclick = () => {
      ui.settings.classList.toggle('show');
      if (ui.settings.classList.contains('show')) {
        setTimeout(() => ui.settings.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
      }
    };
    shadow.getElementById('impSkc').onclick = () => ui.skcFile.click();
    shadow.getElementById('impFront').onclick = () => pickFolder('front');
    shadow.getElementById('impBack').onclick = () => pickFolder('back');
    shadow.getElementById('expStatus').onclick = downloadStatusWorkbook;
    shadow.getElementById('dlDelistTemplate').onclick = downloadDelistTemplate;
    shadow.getElementById('newTask').onclick = onCreateTask;
    shadow.getElementById('prepareTask').onclick = onPrepareTask;
    shadow.getElementById('deleteTask').onclick = onDeleteTask;
    shadow.getElementById('start').onclick = onStart;
    shadow.getElementById('retryFailed').onclick = onRetryFailed;
    shadow.getElementById('nextSku').onclick = onNextSku;
    shadow.getElementById('pause').onclick = onPause;
    shadow.getElementById('stop').onclick = onStop;
    shadow.getElementById('shot').onclick = onShot;
    shadow.getElementById('expLog').onclick = onExportLog;
    shadow.getElementById('clrLog').onclick = () => {
      state.logs = [];
      renderLog();
    };
    shadow.getElementById('wzOk').onclick = async () => {
      uiState.wizardDone = true;
      ui.wizard.classList.remove('show');
      await saveUI();
    };
    ui.customColor.oninput = async () => {
      uiState.theme.primary = ui.customColor.value;
      applyTheme();
      await saveUI();
    };
    ui.darkChk.onchange = async () => {
      uiState.theme.dark = ui.darkChk.checked;
      applyTheme();
      await saveUI();
    };
    ui.alphaRange.oninput = async () => {
      uiState.theme.alpha = Number(ui.alphaRange.value);
      applyTheme();
    };
    ui.alphaRange.onchange = () => saveUI();
    ui.remarkInput.oninput = () => {
      uiState.remark = ui.remarkInput.value.trim();
      renderWho();
    };
    ui.remarkInput.onchange = () => saveUI();
    shadow.getElementById('expCfg').onclick = onExportConfig;
    shadow.getElementById('impCfg').onclick = () => ui.cfgFile.click();
    shadow.getElementById('expDiag').onclick = onExportDiagnostics;
    shadow.getElementById('chkVer').onclick = onCheckVersion;
    ui.cfgFile.onchange = async (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) await importConfigFile(f);
      e.target.value = '';
    };

    // 货号即时同步任务卡和 SKU 货号默认值
    ui.artNo.addEventListener('input', () => {
      const previous = state.config.artNo;
      readConfigFromUI({ silent: true });
      const currentArtNo = state.config.artNo;
      if (!state.config.skuCodeBase || state.config.skuCodeBase === previous) {
        state.config.skuCodeBase = currentArtNo;
        if (ui.skuCodeBase) ui.skuCodeBase.value = currentArtNo;
      }
      markTaskDirty();
      const record = currentTaskRecord();
      if (record) record.artNo = currentArtNo || '未命名货号';
      if (ui.detailTaskName) ui.detailTaskName.textContent = currentArtNo || '未命名货号';
      renderTaskList();
      renderEstimate();
      clearTimeout(artNoSaveTimer);
      artNoSaveTimer = setTimeout(async () => {
        await syncCurrentTaskRecord();
        await saveTaskLibrary();
        renderTaskList();
      }, 350);
    });
    [ui.n, ui.x, ui.cropW, ui.cropH].forEach((el) => {
      el.addEventListener('input', () => {
        markTaskDirty();
        readConfigFromUI({ silent: true });
        renderTaskList();
        renderEstimate();
      });
    });

    // 面板拖动：标题栏，以及面板中没有交互控件的空白区域都可以拖。
    let drag = null;
    let resizing = null;
    const box = shadow.querySelector('.box');
    const noDrag = 'button,input,select,textarea,a,label,.log,.settings,.taskRow,.resizer';
    shadow.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const target = e.target;
      const resizeHandle = !!(target.closest && target.closest('.resizer'));
      if (resizeHandle) {
        const boxRect = box.getBoundingClientRect();
        host.style.left = `${boxRect.left}px`;
        host.style.top = `${boxRect.top}px`;
        host.style.right = 'auto';
        host.style.bottom = 'auto';
        resizing = {
          id: e.pointerId,
          dir: target.closest('.resizer').dataset.resize || 'nwse',
          startX: e.clientX,
          startY: e.clientY,
          startW: boxRect.width,
          startH: boxRect.height,
          boxLeft: boxRect.left,
          boxTop: boxRect.top,
          boxRight: boxRect.right,
          boxBottom: boxRect.bottom,
        };
        box.classList.add('dragging');
        e.preventDefault();
        return;
      }
      const inHeader = !!(target.closest && target.closest('.hd'));
      const blocked = !!(target.closest && target.closest(noDrag));
      if (blocked && (!inHeader || target.closest('button'))) return;
      if (e.pointerType === 'touch' && !inHeader) return;
      const boxRect = box.getBoundingClientRect();
      const resizeHit = 22;
      const inResizeZone = !inHeader
        && e.clientX >= boxRect.right - resizeHit
        && e.clientY >= boxRect.bottom - resizeHit;
      if (inResizeZone) return;
      drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        rect: host.getBoundingClientRect(),
      };
      box.classList.add('dragging');
      e.preventDefault();
    }, true);
    window.addEventListener('pointermove', (e) => {
      if (resizing && e.pointerId === resizing.id) {
        const minW = 360;
        const maxW = Math.max(minW, Math.min(760, window.innerWidth - resizing.boxLeft - 8));
        const minH = 320;
        const maxH = Math.max(minH, Math.min(Math.round(window.innerHeight * 0.94), window.innerHeight - resizing.boxTop - 8));
        let width = resizing.startW;
        let height = resizing.startH;
        if (resizing.dir === 'ew' || resizing.dir === 'nwse') {
          width = Math.max(minW, Math.min(maxW, resizing.startW + e.clientX - resizing.startX));
        }
        if (resizing.dir === 'ns' || resizing.dir === 'nwse') {
          height = Math.max(minH, Math.min(maxH, resizing.startH + e.clientY - resizing.startY));
        }
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
        uiState.panelSize = { width, height };
        uiState.pos = { left: resizing.boxLeft, top: resizing.boxTop };
        e.preventDefault();
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      const left = Math.max(56 - drag.rect.width,
        Math.min(window.innerWidth - 56, drag.rect.left + e.clientX - drag.x));
      const top = Math.max(0,
        Math.min(window.innerHeight - 42, drag.rect.top + e.clientY - drag.y));
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
      uiState.pos = { left, top };
      e.preventDefault();
    }, true);
    const endDrag = () => {
      if (drag) {
        drag = null;
        box.classList.remove('dragging');
        saveUI();
      }
      if (resizing) {
        resizing = null;
        box.classList.remove('dragging');
        saveUI();
      }
    };
    window.addEventListener('pointerup', endDrag, true);
    window.addEventListener('pointercancel', endDrag, true);

    ui.skcFile.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) await importSkcFile(file);
      e.target.value = '';
    };
    ui.queryType.onchange = async () => {
      const next = ui.queryType.value === 'SPU' ? 'SPU' : 'SKC';
      if (next === state.queryType) return;
      state.queryType = next;
      state.skcs = [];
      state.skcStatuses = {};
      state.xlsxMeta = null;
      state.runScopedSkcs = null;
      state.activeRetry = false;
      state.imagePlan = {};
      state.backPlanNames = [];
      state.cursor = 0;
      state.current = null;
      state.status = 'draft';
      const record = currentTaskRecord();
      if (record) record.status = 'draft';
      ui.skcInfo.textContent = '未导入';
      ui.listTypeTitle.textContent = `${next} 清单`;
      ui.statusFileInfo.textContent = '未导入状态表';
      await saveState();
      renderStatus();
      renderEstimate();
      log(`商品清单类型已切换为 ${next}，请重新导入清单`);
    };
  }

  function renderWho() {
    if (!ui.whoChip) return;
    const shop = uiState.shopName || '未识别店铺';
    ui.whoChip.textContent = uiState.remark ? `${uiState.remark} · ${shop}` : shop;
    ui.whoChip.title = '店铺名自动读取；窗口备注可在“⚙ 设置”里修改，用来区分多个店铺窗口';
  }

  function applyConfigToUI() {
    if (ui.queryType) ui.queryType.value = state.queryType || 'SKC';
    if (ui.listTypeTitle) ui.listTypeTitle.textContent = `${state.queryType || 'SKC'} 清单`;
    ui.artNo.value = state.config.artNo || '';
    ui.n.value = String(state.config.n || 4);
    ui.x.value = String(state.config.x || 2);
    ui.cropW.value = String(state.config.cropW || 1350);
    ui.cropH.value = String(state.config.cropH || 1800);
    if (ui.sens) ui.sens.value = state.config.sens || '否';
    if (ui.dimL) ui.dimL.value = String(state.config.dimL != null ? state.config.dimL : 30);
    if (ui.dimM) ui.dimM.value = String(state.config.dimM != null ? state.config.dimM : 20);
    if (ui.dimS) ui.dimS.value = String(state.config.dimS != null ? state.config.dimS : 1);
    if (ui.weight) ui.weight.value = String(state.config.weight != null ? state.config.weight : 500);
    if (ui.strictCheck) ui.strictCheck.checked = !!state.config.strictCheck;
    if (ui.declPrice) ui.declPrice.value = String(state.config.declPrice != null ? state.config.declPrice : 300);
    if (ui.stock) ui.stock.value = String(state.config.stock != null ? state.config.stock : 500);
    if (ui.skuCategory) ui.skuCategory.value = state.config.skuCategory || '单品';
    if (ui.skuCodeBase) ui.skuCodeBase.value = state.config.skuCodeBase || state.config.artNo || '';
    if (ui.skuCodeMode) ui.skuCodeMode.value = state.config.skuCodeMode || 'fixed';
    if (ui.skuTimeoutMin) ui.skuTimeoutMin.value = String(state.config.skuTimeoutMin || 10);
    ui.autoSubmit.checked = state.config.autoSubmit !== false;
    ui.dryRun.checked = !!state.config.dryRun;
    if (ui.semiAuto) ui.semiAuto.checked = !!state.config.semiAuto;
    if (ui.skcInfo) {
      ui.skcInfo.textContent = state.skcs.length
        ? `已导入 ${state.skcs.length} 个 ${state.queryType || 'SKC'}` : '未导入';
    }
    if (ui.statusFileInfo) {
      ui.statusFileInfo.textContent = state.xlsxMeta
        ? (state.xlsxMeta.sheetName ? `状态列：第 ${state.xlsxMeta.statusCol + 1} 列` : 'CSV 状态回写')
        : '未导入状态表';
    }
  }

  function taskStatusMeta(status) {
    const map = {
      draft: ['草稿', ''],
      ready: ['准备完成', 'ready'],
      running: ['运行中', 'running'],
      paused: ['已暂停', 'failed'],
      success: ['全部成功', 'success'],
      partial: ['部分成功', 'partial'],
      failed: ['失败', 'failed'],
      done: ['执行结束', 'done'],
    };
    return map[status] || ['失败', 'failed'];
  }

  function markTaskDirty() {
    if (state.status === 'running') return;
    const record = currentTaskRecord();
    if (record && record.status !== 'draft') {
      record.status = 'draft';
      record.needsPrepare = true;
    }
    if (state.status !== 'draft') state.status = 'draft';
  }

  function renderPrepareChecklist() {
    if (!ui.prepareChecklist) return;
    const c = state.config;
    const pending = pendingProductIds();
    const requiredFront = pending.length * Math.max(1, Number(c.n || 1));
    const artOk = !!(c.artNo || '').trim();
    const listOk = state.skcs.length > 0;
    const frontOk = listOk && (!pending.length || (ui.frontCount || 0) >= requiredFront);
    const backOk = (ui.backCount || 0) >= Math.max(1, Number(c.x || 1));
    const items = [
      { ok: artOk, label: '货号', detail: artOk ? c.artNo : '必填' },
      { ok: listOk, label: '商品清单', detail: listOk ? `${state.skcs.length} 个` : '未导入' },
      { ok: frontOk, label: '主图', detail: !listOk ? '待清单' : (frontOk ? `${ui.frontCount || 0}/${requiredFront} 张` : `需 ${requiredFront} 张`) },
      { ok: backOk, label: '背面图', detail: backOk ? `${ui.backCount || 0} 张` : `需 ${c.x || 1} 张` },
    ];
    ui.prepareChecklist.innerHTML = items.map((item) =>
      `<div class="prepareCheckItem ${item.ok ? 'ok' : 'bad'}">`
      + `<b>${item.ok ? '✓' : '!'}</b><span>${escapeHtml(item.label)}</span>`
      + `<span style="margin-left:auto">${escapeHtml(item.detail)}</span></div>`).join('');
    const allReady = items.every((item) => item.ok)
      && c.n >= 1 && c.n <= 7 && c.x >= 1 && c.x <= 10;
    const record = currentTaskRecord();
    const isPrepared = !!(record && record.status === 'ready' && allReady);
    ui.preparePanel.classList.remove('attention', 'ready');
    ui.prepareTask.classList.remove('attention', 'ready');
    if (isPrepared) {
      ui.preparePanel.classList.add('ready');
      ui.prepareTask.classList.add('ready');
      ui.prepareTask.textContent = '准备完成 · 可开始';
      ui.prepareHint.textContent = '资料已保存；修改货号、清单或图片后会恢复为草稿。';
    } else if (allReady) {
      ui.preparePanel.classList.add('attention');
      ui.prepareTask.classList.add('attention');
      ui.prepareTask.textContent = '保存准备并加入队列';
      ui.prepareHint.textContent = '资料已齐全，点击高亮按钮保存准备。';
    } else {
      ui.prepareTask.textContent = '检查并保存准备';
      const missing = items.filter((item) => !item.ok).map((item) => item.label);
      ui.prepareHint.textContent = missing.length ? '还需完成：' + missing.join('、') : '请检查参数范围。';
    }
  }

  function renderQueueStats() {
    if (!ui.queueStats) return;
    const stats = queueStats();
    const items = [
      ['任务总数', stats.tasks],
      ['成功商品', stats.success],
      ['失败商品', stats.failed],
      ['超时跳过', stats.timedOut],
      ['待处理', stats.pending],
    ];
    ui.queueStats.innerHTML = items.map(([label, value]) =>
      `<div class="queueStat"><b>${value}</b><span>${label}</span></div>`).join('');
    if (ui.retryFailed) {
      ui.retryFailed.textContent = `重试失败（${stats.retryable}）`;
      ui.retryFailed.disabled = state.status === 'running' || !stats.retryable;
      ui.retryFailed.title = stats.retryable
        ? `将重试 ${stats.retryTasks} 个货号任务中的 ${stats.retryable} 个失败/待确认/超时商品`
        : '当前没有可重试的 SKC';
    }
  }

  function renderTaskList() {
    if (!ui.taskList) return;
    if (!taskLibrary.length) {
      ui.taskList.innerHTML = '<div class="emptyTip">还没有货号任务，请先新建。</div>';
    } else {
      ui.taskList.innerHTML = taskLibrary.map((task, index) => {
        const status = task.id === currentTaskId && state.status !== 'idle'
          ? state.status : task.status;
        const [label, cls] = taskStatusMeta(status);
        const stats = taskStats(task);
        const counts = stats.total
          ? `成功 ${stats.success} · 失败 ${stats.failed} · 超时 ${stats.timedOut}`
          : '尚未导入清单';
        return `<div class="taskRow ${task.id === currentTaskId ? 'active' : ''}" data-task-id="${escapeHtml(task.id)}">`
          + `<span class="tag">${index + 1}</span>`
          + `<span class="taskCopy"><span class="name">${escapeHtml(task.artNo || '未命名货号')}</span>`
          + `<span class="taskCounts">${counts}</span></span>`
          + `<span class="taskBadge ${cls}">${label}</span></div>`;
      }).join('');
      [...ui.taskList.querySelectorAll('.taskRow')].forEach((row) => {
        row.onclick = () => selectTask(row.dataset.taskId, { openDetail: true });
      });
    }
    const record = currentTaskRecord();
    const [label, cls] = taskStatusMeta(record ? record.status : 'draft');
    if (ui.activeTaskState) {
      ui.activeTaskState.textContent = label;
      ui.activeTaskState.className = `taskBadge ${cls}`;
    }
    renderQueueStats();
  }

  async function selectTask(taskId, { openDetail = false } = {}) {
    if (!taskId) return;
    if (taskId === currentTaskId) {
      if (openDetail) showView('detail');
      return;
    }
    if (state.status === 'running') {
      log('当前任务正在运行，请先暂停后再切换货号任务', 'error');
      return;
    }
    await syncCurrentTaskRecord();
    await saveTaskLibrary();
    currentTaskId = taskId;
    uiState.currentTaskId = taskId;
    await saveUI();
    const record = currentTaskRecord();
    if (!record) return;
    applyTaskState(record.snapshot || {
      status: 'draft', phase: 'LIST_SEARCH', cursor: 0, retry: 0, current: null,
      config: record.config || { ...DEFAULT_CONFIG }, skcs: [], queryType: 'SKC', skcStatuses: {},
      backPlanNames: [], imagePlan: {},
      xlsxMeta: null, backMaterialNames: [], usedFrontImages: [], logs: [],
    });
    state.status = record.status === 'ready' ? 'ready' : (record.status || 'draft');
    applyConfigToUI();
    await refreshFolderInfo();
    renderTaskList();
    renderStatus();
    renderEstimate();
    if (openDetail) showView('detail');
    log(`切换货号任务：${record.artNo || currentTaskId}`);
  }

  async function onCreateTask() {
    if (state.status === 'running') {
      log('当前任务正在运行，请先暂停再新建任务', 'error');
      return;
    }
    await syncCurrentTaskRecord();
    await saveTaskLibrary();
    const index = taskLibrary.length + 1;
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const artNo = `新货号${index}`;
    const snapshot = {
      status: 'draft', phase: 'LIST_SEARCH', cursor: 0, retry: 0, current: null,
      config: { ...DEFAULT_CONFIG, artNo, skuCodeBase: artNo },
      skcs: [], queryType: 'SKC', skcStatuses: {}, xlsxMeta: null, frontCursor: 0,
      backPlanNames: [], imagePlan: {},
      backMaterialNames: [], usedFrontImages: [], submitAttempt: null, error: null, logs: [],
    };
    taskLibrary.push({ id, artNo, status: 'draft', createdAt: Date.now(), updatedAt: Date.now(), snapshot });
    await saveTaskLibrary();
    currentTaskId = id;
    uiState.currentTaskId = id;
    await saveUI();
    applyTaskState(snapshot);
    applyConfigToUI();
    await refreshFolderInfo();
    renderTaskList();
    renderStatus();
    renderEstimate();
    showView('detail');
    if (ui.artNo) ui.artNo.focus();
    log(`已新建货号任务：${artNo}`);
  }

  async function onPrepareTask() {
    readConfigFromUI();
    await refreshFolderInfo();
    const errs = validateConfig();
    if (errs.length) {
      renderEstimate();
      log('准备未完成：' + errs.join('；'), 'error');
      return;
    }
    const record = currentTaskRecord();
    if (!record) return;
    const pending = pendingProductIds();
    if (!pending.length) {
      state.status = 'success';
      state.error = null;
      record.status = 'success';
      await saveState();
      renderTaskList();
      renderStatus();
      renderEstimate();
      log(`货号任务「${state.config.artNo}」没有待处理商品，无需重新执行`);
      return;
    }
    const duplicate = taskLibrary.find((task) => task.id !== currentTaskId
      && (task.artNo || '').trim() === state.config.artNo.trim());
    if (duplicate) {
      log(`货号「${state.config.artNo}」已存在，请使用唯一货号`, 'error');
      return;
    }
    state.status = 'ready';
    state.error = null;
    state.runScopedSkcs = pending.length && pending.length < state.skcs.length ? pending : null;
    state.activeRetry = false;
    state.cursor = 0;
    record.status = 'ready';
    record.retryOnly = false;
    record.needsPrepare = false;
    await saveState();
    renderTaskList();
    renderStatus();
    renderEstimate();
    log(`货号任务「${state.config.artNo}」准备完成；点击“开始队列”后正式执行`);
  }

  async function onDeleteTask() {
    if (state.status === 'running') {
      log('运行中的任务不能删除', 'error');
      return;
    }
    const record = currentTaskRecord();
    if (!record) return;
    if (!confirm(`确定删除货号任务「${record.artNo}」？`)) return;
    for (const key of ['frontFiles', 'backFiles', 'frontDirName', 'backDirName', 'xlsxParts']) {
      await dbDel(taskFileKey(key, record.id));
    }
    taskLibrary = taskLibrary.filter((task) => task.id !== record.id);
    currentTaskId = taskLibrary.length ? taskLibrary[0].id : LEGACY_TASK_ID;
    uiState.currentTaskId = currentTaskId;
    await saveTaskLibrary();
    await saveUI();
    if (taskLibrary.length) {
      const next = currentTaskRecord();
      applyTaskState(next.snapshot || {});
      state.status = next.status || 'draft';
      applyConfigToUI();
      await refreshFolderInfo();
    } else {
      await onCreateTask();
    }
    renderTaskList();
    renderStatus();
  }

  function renderStatus() {
    if (!ui.stat) return;
    const idType = state.queryType || 'SKC';
    const runSkcs = activeSkcs();
    const total = runSkcs.length;
    const cur = Math.min(state.cursor + 1, Math.max(total, 1));
    const skc = runSkcs[state.cursor] || '-';
    let s = '';
    let dot = 'dot';
    if (state.status === 'idle' || state.status === 'draft') s = '草稿';
    else if (state.status === 'ready') { s = '<span class="ok">准备完成</span>'; dot += ' done'; }
    else if (state.status === 'success') { s = '<span class="ok">全部成功</span>'; dot += ' done'; }
    else if (state.status === 'partial') { s = '<span class="warn">部分成功</span>'; dot += ' err'; }
    else if (state.status === 'failed') { s = '<span class="warn">执行失败</span>'; dot += ' err'; }
    else if (state.status === 'done') { s = '<span class="ok">队列已结束</span>'; dot += ' done'; }
    else if (state.status === 'paused') {
      s = `<span class="warn">已暂停</span>${state.error ? '：' + escapeHtml(state.error) : ''}`;
      dot += ' err';
    } else { s = '运行中'; dot += ' run'; }
    ui.stat.innerHTML = `<span class="${dot}"></span>状态：${s}<br>进度：${idType} ${total ? cur : 0}/${total}　当前：${skc}<br>阶段：${state.phase}`
      + (state.current && state.current.spu ? `　SPU：${state.current.spu}` : '')
      + (state.backMaterialNames.length ? `<br>背面图素材：${escapeHtml(state.backMaterialNames.join(' / '))}` : '')
      + (state.current && state.current.lastProgress
        ? `<br>最后进展：${escapeHtml(state.current.lastProgress)}（${Math.round(skuInactivityMs() / 1000)} 秒前）`
        : '')
      + (state.activeRetry ? '<br><span class="warn">当前为重试失败项，仅处理本轮范围内的商品。</span>' : '');
    const phaseNames = { LIST_SEARCH: '查询商品', EDIT: '编辑商品', CONFIRM_INFO: '确认商品信息', DONE: '队列结束' };
    let pct = 0;
    if (state.status === 'done') pct = 100;
    else if (total) pct = Math.min(99, ((state.cursor + (state.current ? 0.35 : 0)) / total) * 100);
    if (ui.progressFill) ui.progressFill.style.width = `${Math.max(0, pct)}%`;
    if (ui.progressText) {
      ui.progressText.textContent = total
        ? `${phaseNames[state.phase] || state.phase} · ${idType} ${Math.min(state.cursor + 1, total)}/${total}`
        : '等待导入任务';
    }
    if (ui.leaseChip) {
      const conflict = uiState.leaseBlocked || leaseConflict();
      ui.leaseChip.textContent = conflict ? '另一任务页运行中' : '单任务保护已开启';
      ui.leaseChip.classList.toggle('alert', conflict);
    }
    if (state.status === 'running' && !isBotTab()) {
      ui.stat.innerHTML += '<br><span class="warn">任务在另一个标签页运行中。</span>';
    }
    renderWho();
    renderQueueStats();
  }

  /** 参数校验：返回错误数组（空数组=OK） */
  function validateConfig() {
    const errors = [];
    const c = state.config;
    if (!state.skcs.length) errors.push(`还没导入 ${state.queryType || 'SKC'} 清单`);
    if (!c.artNo) errors.push('新色值货号不能为空');
    if (!(c.n >= 1 && c.n <= 7)) errors.push('新增色值数量需在 1–7 之间');
    if (!(c.x >= 1 && c.x <= 10)) errors.push('背面图张数需在 1–10 之间');
    if (!(c.cropW > 0 && c.cropH > 0)) errors.push('裁剪尺寸要填正整数');
    const pending = pendingProductIds();
    const requiredFront = pending.length * c.n;
    if (pending.length && ui.frontCount != null && ui.frontCount < requiredFront) {
      errors.push(`本轮主图不够：需要 ${requiredFront} 张（${pending.length} 个待处理商品 × ${c.n}），已准备 ${ui.frontCount} 张`);
    }
    if (state.skcs.length && ui.backCount != null && c.x > ui.backCount) {
      errors.push(`背面图不够：每个色值要 ${c.x} 张，已导入 ${ui.backCount} 张`);
    }
    return errors;
  }

  function renderEstimate() {
    if (!ui.estimate) return;
    const c = state.config;
    const errs = validateConfig();
    const parts = [];
    if (state.skcs.length) {
      const pending = pendingProductIds();
      parts.push(`本次将处理 <b>${pending.length}</b> 个待处理商品，共新增 <b>${pending.length * c.n}</b> 个色值`);
      const used = (state.usedFrontImages || []).length;
      parts.push(`需主图 <b>${pending.length * c.n}</b> 张（已准备 ${ui.frontCount != null ? ui.frontCount : 0} 张`
        + `${used ? `，已用 ${used} 张` : ''}）`);
      parts.push(`背面图 <b>${c.x}</b> 张/色值（已导入 ${ui.backCount != null ? ui.backCount : 0} 张）`);
    }
    let html = parts.length ? parts.join(' · ') : '填好上面的导入项后，这里会显示本次任务的预估。';
    if (errs.length) html += `<br><span class="warn">✗ ${errs.map(escapeHtml).join('；')}</span>`;
    else if (state.skcs.length) html += '<br><span class="ok">✓ 参数检查通过，可以开始</span>';
    ui.estimate.innerHTML = html;

    // 向导步骤打勾
    const mark = (id, done) => {
      const el = ui.root.querySelector('#' + id);
      if (el) el.innerHTML = (done ? '✅ ' : '⬜ ') + el.textContent.replace(/^[✅⬜] /, '');
    };
    mark('wz1', state.skcs.length > 0);
    mark('wz2', ui.frontCount > 0);
    mark('wz3', ui.backCount > 0);
    renderPrepareChecklist();
    return errs;
  }

  function renderLog() {
    if (!ui.log) return;
    ui.log.innerHTML = state.logs.slice(-120).map((l) =>
      `<div class="${l.level === 'error' ? 'warn' : ''}">${escapeHtml(l.line)}</div>`).join('');
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function readConfigFromUI({ silent = false } = {}) {
    state.config = {
      ...state.config,
      artNo: (ui.artNo.value || '').trim(),
      n: Math.max(1, Math.min(7, Number(ui.n.value) || 4)),
      x: Math.max(1, Math.min(10, Number(ui.x.value) || 2)),
      cropW: Number(ui.cropW.value) || 1350,
      cropH: Number(ui.cropH.value) || 1800,
      sens: (ui.sens && ui.sens.value) || '否',
      dimL: Number(ui.dimL && ui.dimL.value) || 0,
      dimM: Number(ui.dimM && ui.dimM.value) || 0,
      dimS: Number(ui.dimS && ui.dimS.value) || 0,
      weight: Number(ui.weight && ui.weight.value) || 0,
      strictCheck: !!(ui.strictCheck && ui.strictCheck.checked),
      declPrice: Number(ui.declPrice && ui.declPrice.value) || 300,
      stock: Number(ui.stock && ui.stock.value) || 500,
      skuCategory: (ui.skuCategory && ui.skuCategory.value) || '单品',
      skuCodeBase: ((ui.skuCodeBase && ui.skuCodeBase.value) || 'DWRG').trim(),
      skuCodeMode: (ui.skuCodeMode && ui.skuCodeMode.value) || 'fixed',
      skuTimeoutMin: Math.max(3, Math.min(120, Number(ui.skuTimeoutMin && ui.skuTimeoutMin.value) || 10)),
      autoSubmit: ui.autoSubmit.checked,
      dryRun: ui.dryRun.checked,
      semiAuto: ui.semiAuto ? ui.semiAuto.checked : true,
    };
    if (!silent) renderEstimate();
  }

  // ============================================================ 截图桥
  const pendingShots = new Map();
  let shotSeq = 0;
  const pendingType = new Map();
  let typeSeq = 0;
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.__temuImageBot !== true) return;
    if (d.type === 'CAPTURE_TAB_RESULT') {
      const resolve = pendingShots.get(d.reqId);
      if (resolve) {
        pendingShots.delete(d.reqId);
        resolve(d);
      }
    }
    if (d.type === 'TYPE_TEXT_RESULT') {
      const resolve = pendingType.get(d.reqId);
      if (resolve) {
        pendingType.delete(d.reqId);
        resolve(d);
      }
    }
    if (d.type === 'REAL_CLICK_RESULT') {
      const resolve = pendingType.get(d.reqId);
      if (resolve) {
        pendingType.delete(d.reqId);
        resolve(d);
      }
    }
    if (d.type === 'NAVIGATE_URL_RESULT') {
      const resolve = pendingType.get(d.reqId);
      if (resolve) {
        pendingType.delete(d.reqId);
        resolve(d);
      }
    }
    if (d.type === 'FIND_CONFIRM_TAB_RESULT') {
      const resolve = pendingType.get(d.reqId);
      if (resolve) {
        pendingType.delete(d.reqId);
        resolve(d);
      }
    }
    if (d.type === 'GET_TAB_INFO_RESULT' || d.type === 'CLOSE_TAB_RESULT') {
      const resolve = pendingType.get(d.reqId);
      if (resolve) {
        pendingType.delete(d.reqId);
        resolve(d);
      }
    }
    if (d.type === 'ENSURE_WINDOW_RESULT') {
      const resolve = pendingType.get(d.reqId);
      if (resolve) {
        pendingType.delete(d.reqId);
        resolve(d);
      }
    }
  });

  /** 通过扩展后台用调试协议发送“真实”文本输入（只有真实按键才被某些组件接受） */
  function typeTextViaDebugger(text, opts = {}) {
    const reqId = ++typeSeq;
    window.postMessage({
      __temuImageBot: true,
      type: 'TYPE_TEXT',
      reqId,
      text,
      clear: !!opts.clear,
      clickX: opts.clickX,
      clickY: opts.clickY,
    }, '*');
    return new Promise((resolve) => {
      pendingType.set(reqId, resolve);
      setTimeout(() => {
        if (pendingType.has(reqId)) {
          pendingType.delete(reqId);
          resolve({ ok: false, error: '真实输入超时' });
        }
      }, 12000);
    });
  }

  /** 聚焦 -> 全选 -> 真实输入（替换选中内容） */
  async function typeTextReal(el, text, { clear = true, commitClick = false } = {}) {
    el.focus();
    try { el.select(); } catch (err) { /* ignore */ }
    await sleep(150);
    let clickX;
    let clickY;
    if (commitClick) {
      const r = el.getBoundingClientRect();
      clickX = Math.max(8, Math.min(window.innerWidth - 8, r.left - 32));
      clickY = Math.max(8, Math.min(window.innerHeight - 8, r.top + r.height / 2));
    }
    const res = await typeTextViaDebugger(String(text), { clear, clickX, clickY });
    if (!res || !res.ok) throw new Error(`真实输入失败：${res ? res.error : '未知'}`);
    await sleep(400);
  }

  /** 通过调试协议发送 trusted 鼠标点击；用于普通合成事件无效的平台按钮。 */
  async function trustedClick(el, { offsetY = 0 } = {}) {
    if (!el) throw new Error('真实点击目标为空');
    await deepScrollIntoView(el, 0.62);
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) throw new Error('真实点击目标不可见');
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2 + offsetY;
    const reqId = ++typeSeq;
    window.postMessage({ __temuImageBot: true, type: 'REAL_CLICK', reqId, x, y }, '*');
    const res = await new Promise((resolve) => {
      pendingType.set(reqId, resolve);
      setTimeout(() => {
        if (pendingType.has(reqId)) {
          pendingType.delete(reqId);
          resolve({ ok: false, error: '真实点击超时' });
        }
      }, 12000);
    });
    if (!res || !res.ok) throw new Error(`真实点击失败：${res ? res.error : '未知'}`);
    await sleep(250);
  }

  /** 插件内部导航统一走调试协议：若出现“离开此网站”确认，自动按插件既定流程继续。 */
  async function safeNavigate(url) {
    const reqId = ++typeSeq + 200000;
    window.postMessage({ __temuImageBot: true, type: 'NAVIGATE_URL', reqId, url }, '*');
    const res = await new Promise((resolve) => {
      pendingType.set(reqId, resolve);
      setTimeout(() => {
        if (pendingType.has(reqId)) {
          pendingType.delete(reqId);
          resolve({ ok: false, error: '导航超时' });
        }
      }, 15000);
    });
    if (!res || !res.ok) {
      log(`受控导航失败，使用普通跳转：${res ? res.error : '未知原因'}`, 'error');
      location.href = url;
    }
  }

  async function findConfirmTab(productId) {
    const reqId = ++typeSeq + 300000;
    window.postMessage({ __temuImageBot: true, type: 'FIND_CONFIRM_TAB', reqId, productId }, '*');
    return new Promise((resolve) => {
      pendingType.set(reqId, resolve);
      setTimeout(() => {
        if (pendingType.has(reqId)) {
          pendingType.delete(reqId);
          resolve({ ok: false, error: '查找确认页超时' });
        }
      }, 8000);
    });
  }

  async function getTabInfo() {
    const reqId = ++typeSeq + 400000;
    window.postMessage({ __temuImageBot: true, type: 'GET_TAB_INFO', reqId }, '*');
    return new Promise((resolve) => {
      pendingType.set(reqId, resolve);
      setTimeout(() => {
        if (pendingType.has(reqId)) {
          pendingType.delete(reqId);
          resolve({ ok: false, error: '获取标签页信息超时' });
        }
      }, 5000);
    });
  }

  async function closeExtraTab(tabId) {
    if (!tabId) return false;
    const reqId = ++typeSeq + 500000;
    window.postMessage({ __temuImageBot: true, type: 'CLOSE_TAB', reqId, tabId }, '*');
    return new Promise((resolve) => {
      pendingType.set(reqId, resolve);
      setTimeout(() => {
        if (pendingType.has(reqId)) {
          pendingType.delete(reqId);
          resolve({ ok: false, error: '关闭标签页超时' });
        }
      }, 5000);
    });
  }

  /** 让扩展把窗口调大一点（弹窗比视口高时底部按钮会被裁掉） */
  function ensureWindowSize() {
    const reqId = ++typeSeq + 100000;
    return new Promise((resolve) => {
      const key = `WINDOW_${reqId}`;
      pendingType.set(key, resolve);
      window.postMessage({ __temuImageBot: true, type: 'ENSURE_WINDOW', reqId: key, minHeight: 1000, minWidth: 1400 }, '*');
      setTimeout(() => {
        if (pendingType.has(key)) {
          pendingType.delete(key);
          resolve({ ok: false, error: '超时' });
        }
      }, 8000);
    });
  }

  function captureTab() {
    const reqId = ++shotSeq;
    window.postMessage({ __temuImageBot: true, type: 'CAPTURE_TAB', reqId }, '*');
    return new Promise((resolve) => {
      pendingShots.set(reqId, resolve);
      setTimeout(() => {
        if (pendingShots.has(reqId)) {
          pendingShots.delete(reqId);
          resolve({ ok: false, error: '截图超时（需要扩展在运行）' });
        }
      }, 8000);
    });
  }

  async function onShot() {
    const res = await captureTab();
    if (!res.ok) {
      log('截图失败：' + res.error, 'error');
      return;
    }
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = res.dataUrl;
    a.download = `temu-bot-${ts}.png`;
    a.click();
    log('已保存截图');
  }

  // ============================================================ Excel / CSV
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer) {
    const buf = new Uint8Array(buffer);
    const view = new DataView(buf.buffer);
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 xlsx 文件');
    const count = view.getUint16(eocd + 10, true);
    let off = view.getUint32(eocd + 16, true);
    const files = {};
    for (let i = 0; i < count; i += 1) {
      if (view.getUint32(off, true) !== 0x02014b50) break;
      const method = view.getUint16(off + 10, true);
      const compSize = view.getUint32(off + 20, true);
      const nameLen = view.getUint16(off + 28, true);
      const extraLen = view.getUint16(off + 30, true);
      const commentLen = view.getUint16(off + 32, true);
      const localOff = view.getUint32(off + 42, true);
      const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nameLen));
      const lNameLen = view.getUint16(localOff + 26, true);
      const lExtraLen = view.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compSize);
      files[name] = method === 0 ? raw : await inflateRaw(raw);
      off += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  function columnIndexFromRef(ref) {
    const letters = String(ref || '').match(/[A-Z]+/i)?.[0] || '';
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return Math.max(0, n - 1);
  }

  async function parseXlsxDetailed(file) {
    const files = await unzip(await file.arrayBuffer());
    const dec = new TextDecoder();
    const parser = new DOMParser();
    const shared = [];
    if (files['xl/sharedStrings.xml']) {
      const doc = parser.parseFromString(dec.decode(files['xl/sharedStrings.xml']), 'application/xml');
      [...doc.getElementsByTagName('si')].forEach((si) => {
        shared.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
      });
    }
    const sheetName = Object.keys(files).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    if (!sheetName) throw new Error('xlsx 里找不到工作表');
    const doc = parser.parseFromString(dec.decode(files[sheetName]), 'application/xml');
    const rows = [];
    [...doc.getElementsByTagName('row')].forEach((row) => {
      const cells = [];
      [...row.getElementsByTagName('c')].forEach((c) => {
        const t = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0];
        let value = '';
        if (t === 's' && v) value = shared[Number(v.textContent)] || '';
        else if (t === 'inlineStr') value = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
        else value = v ? v.textContent : '';
        const idx = columnIndexFromRef(c.getAttribute('r'));
        while (cells.length < idx) cells.push('');
        cells[idx] = value;
      });
      rows.push(cells);
    });
    return { files, rows, sheetName };
  }

  async function parseXlsx(file) {
    return (await parseXlsxDetailed(file)).rows;
  }

  function extractProductEntries(rows, preferredType = 'SKC') {
    let headerIndex = -1;
    let idCol = -1;
    let idType = preferredType === 'SPU' ? 'SPU' : 'SKC';
    let statusCol = -1;
    for (let i = 0; i < rows.length; i += 1) {
      const cells = rows[i] || [];
      const skcCol = cells.findIndex((cell) => /(?:^|\W)skc(?:\s*id)?(?:$|\W)/i.test(String(cell || '')));
      const spuCol = cells.findIndex((cell) => /(?:^|\W)spu(?:\s*id)?(?:$|\W)/i.test(String(cell || '')));
      if (skcCol >= 0 || spuCol >= 0) {
        headerIndex = i;
        if (idType === 'SPU' && spuCol >= 0) {
          idCol = spuCol;
        } else if (idType === 'SKC' && skcCol >= 0) {
          idCol = skcCol;
        } else if (spuCol >= 0) {
          idType = 'SPU';
          idCol = spuCol;
        } else {
          idType = 'SKC';
          idCol = skcCol;
        }
        const status = cells.findIndex((cell) => /状态|status|״̬/i.test(String(cell || '')));
        statusCol = status >= 0 ? status : idCol + 1;
        break;
      }
    }
    if (headerIndex < 0) {
      const ids = extractSkcs(rows);
      return {
        entries: ids.map((id, i) => ({ id, skc: id, rowNumber: i + 1, oldStatus: '' })),
        headerIndex: 0, idType, idCol: 0, skcCol: idType === 'SKC' ? 0 : -1, statusCol: 1,
      };
    }
    const entries = [];
    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const id = String((rows[i] || [])[idCol] || '').trim();
      if (!/^\d{6,20}$/.test(id)) continue;
      entries.push({
        id,
        skc: id,
        rowNumber: i + 1,
        oldStatus: String((rows[i] || [])[statusCol] || '').trim(),
      });
    }
    return {
      entries, headerIndex, idType, idCol,
      skcCol: idType === 'SKC' ? idCol : -1,
      statusCol,
    };
  }

  function extractSkcs(rows) {
    const out = [];
    rows.forEach((cells) => {
      cells.forEach((cell) => {
        const v = String(cell || '').trim();
        if (/^\d{6,20}$/.test(v)) out.push(v);
      });
    });
    return [...new Set(out)];
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const [name, raw] of Object.entries(files)) {
      const nameBytes = enc.encode(name);
      const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length + data.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034B50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      local.set(data, 30 + nameBytes.length);
      locals.push(local);

      const central = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014B50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centrals.push(central);
      offset += local.length;
    }
    const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054B50, true);
    ev.setUint16(8, centrals.length, true);
    ev.setUint16(10, centrals.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    const parts = [...locals, ...centrals, end];
    const total = parts.reduce((sum, b) => sum + b.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const part of parts) { out.set(part, pos); pos += part.length; }
    return out;
  }

  function setInlineCell(doc, row, colIndex, value) {
    const letters = (n) => {
      let s = '';
      for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26)) {
        s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
      }
      return s;
    };
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const ref = `${letters(colIndex)}${row.getAttribute('r')}`;
    let cell = [...row.getElementsByTagName('c')].find((c) => c.getAttribute('r') === ref);
    if (!cell) {
      cell = doc.createElementNS(ns, 'c');
      cell.setAttribute('r', ref);
      row.appendChild(cell);
    }
    [...cell.children].forEach((child) => cell.removeChild(child));
    cell.setAttribute('t', 'inlineStr');
    const is = doc.createElementNS(ns, 'is');
    const t = doc.createElementNS(ns, 't');
    t.textContent = String(value == null ? '' : value);
    is.appendChild(t);
    cell.appendChild(is);
  }

  function excelColumnLetters(index) {
    let out = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
      out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    }
    return out;
  }

  function xmlEscape(value) {
    return String(value == null ? '' : value)
      .replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
      }[ch]))
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function inlineSheetXml(rows) {
    const body = rows.map((cells, rowIndex) => {
      const number = rowIndex + 1;
      const values = cells.map((value, colIndex) =>
        `<c r="${excelColumnLetters(colIndex)}${number}" t="inlineStr"><is><t xml:space="preserve">`
        + `${xmlEscape(value)}</t></is></c>`).join('');
      return `<row r="${number}">${values}</row>`;
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="15"/>'
      + '<cols><col min="1" max="1" width="18" customWidth="1"/>'
      + '<col min="2" max="2" width="34" customWidth="1"/>'
      + '<col min="3" max="3" width="12" customWidth="1"/>'
      + '<col min="4" max="4" width="12" customWidth="1"/>'
      + '<col min="5" max="5" width="54" customWidth="1"/>'
      + '<col min="6" max="6" width="22" customWidth="1"/></cols>'
      + `<sheetData>${body}</sheetData></worksheet>`;
  }

  function addRunSummarySheet(files, meta, stats) {
    const parser = new DOMParser();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const workbookPath = 'xl/workbook.xml';
    const relsPath = 'xl/_rels/workbook.xml.rels';
    const typesPath = '[Content_Types].xml';
    if (!files[workbookPath] || !files[relsPath] || !files[typesPath]) {
      throw new Error('Excel 工作簿结构不完整，无法写入运行汇总');
    }
    const workbook = parser.parseFromString(decoder.decode(files[workbookPath]), 'application/xml');
    const rels = parser.parseFromString(decoder.decode(files[relsPath]), 'application/xml');
    const types = parser.parseFromString(decoder.decode(files[typesPath]), 'application/xml');
    const summaryName = '运行汇总';
    let sheetNode = [...workbook.getElementsByTagName('sheet')]
      .find((node) => node.getAttribute('name') === summaryName);
    let summaryPath = '';
    if (sheetNode) {
      const rid = sheetNode.getAttribute('r:id');
      const relation = [...rels.getElementsByTagName('Relationship')]
        .find((node) => node.getAttribute('Id') === rid);
      if (relation) {
        const target = relation.getAttribute('Target') || '';
        summaryPath = target.startsWith('/') ? target.slice(1)
          : (target.startsWith('xl/') ? target : `xl/${target}`);
      }
    }
    if (!sheetNode || !summaryPath) {
      const usedNumbers = Object.keys(files)
        .map((name) => name.match(/^xl\/worksheets\/sheet(\d+)\.xml$/))
        .filter(Boolean)
        .map((match) => Number(match[1]));
      const nextNumber = Math.max(0, ...usedNumbers) + 1;
      summaryPath = `xl/worksheets/sheet${nextNumber}.xml`;
      const sheetIds = [...workbook.getElementsByTagName('sheet')]
        .map((node) => Number(node.getAttribute('sheetId') || 0));
      const relIds = [...rels.getElementsByTagName('Relationship')]
        .map((node) => Number(String(node.getAttribute('Id') || '').replace(/\D/g, '') || 0));
      const rid = `rId${Math.max(0, ...relIds) + 1}`;
      const sheetNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
      sheetNode = workbook.createElementNS(sheetNs, 'sheet');
      sheetNode.setAttribute('name', summaryName);
      sheetNode.setAttribute('sheetId', String(Math.max(0, ...sheetIds) + 1));
      sheetNode.setAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'r:id',
        rid,
      );
      workbook.getElementsByTagName('sheets')[0].appendChild(sheetNode);
      const relNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
      const relation = rels.createElementNS(relNs, 'Relationship');
      relation.setAttribute('Id', rid);
      relation.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet');
      relation.setAttribute('Target', `worksheets/sheet${nextNumber}.xml`);
      rels.getElementsByTagName('Relationships')[0].appendChild(relation);
      const typeNs = 'http://schemas.openxmlformats.org/package/2006/content-types';
      const override = types.createElementNS(typeNs, 'Override');
      override.setAttribute('PartName', `/${summaryPath}`);
      override.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
      types.getElementsByTagName('Types')[0].appendChild(override);
      files[workbookPath] = encoder.encode(new XMLSerializer().serializeToString(workbook));
      files[relsPath] = encoder.encode(new XMLSerializer().serializeToString(rels));
      files[typesPath] = encoder.encode(new XMLSerializer().serializeToString(types));
    }

    const queue = queueStats();
    const kindLabel = { success: '成功', failed: '失败', timeout: '超时跳过', pending: '待处理' };
    const idType = meta.idType || state.queryType || 'SKC';
    const rows = [
      ['TEMU 图片助手运行汇总', ''],
      ['导出时间', new Date().toLocaleString('zh-CN')],
      ['版本', VERSION],
      ['货号', state.config.artNo || ''],
      ['Excel 文件', meta.fileName || ''],
      [''],
      [`当前任务 ${idType} 总数`, stats.total],
      ['成功商品', stats.success],
      ['失败商品', stats.failed],
      ['超时跳过', stats.timedOut],
      ['待处理', stats.pending],
      ['可重试商品', stats.retryable],
      [''],
      ['队列任务总数', queue.tasks],
      ['队列成功商品', queue.success],
      ['队列失败商品', queue.failed],
      ['队列超时跳过', queue.timedOut],
      ['队列待处理', queue.pending],
      [''],
      [idType, '最终状态', '分类', '尝试次数', '最近原因', '更新时间'],
      ...stats.details.map((item) => [
        item.skc,
        item.status,
        kindLabel[item.kind] || item.kind,
        item.attempts,
        item.reason || '',
        item.at ? new Date(item.at).toLocaleString('zh-CN') : '',
      ]),
    ];
    files[summaryPath] = encoder.encode(inlineSheetXml(rows));
  }

  async function buildStatusWorkbook() {
    const meta = state.xlsxMeta;
    const parts = await dbGet(taskFileKey('xlsxParts'));
    if (!meta || !meta.sheetName || !parts || !parts[meta.sheetName]) {
      throw new Error('没有可回写的 Excel 工作簿');
    }
    const parser = new DOMParser();
    const xml = new TextDecoder().decode(parts[meta.sheetName]);
    const doc = parser.parseFromString(xml, 'application/xml');
    const rows = new Map([...doc.getElementsByTagName('row')]
      .map((row) => [Number(row.getAttribute('r')), row]));
    const ensureRow = (number) => {
      let row = rows.get(number);
      if (!row) {
        const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
        row = doc.createElementNS(ns, 'row');
        row.setAttribute('r', String(number));
        doc.getElementsByTagName('sheetData')[0].appendChild(row);
        rows.set(number, row);
      }
      return row;
    };
    setInlineCell(doc, ensureRow(meta.headerIndex + 1), meta.statusCol, '状态');
    (meta.entries || []).forEach((entry) => {
      const info = state.skcStatuses[entry.skc];
      setInlineCell(doc, ensureRow(entry.rowNumber), meta.statusCol,
        info ? info.status : '待处理');
    });
    const updatedFiles = { ...parts };
    updatedFiles[meta.sheetName] = new TextEncoder().encode(new XMLSerializer().serializeToString(doc));
    const currentStats = taskStats(currentTaskRecord() || {
      id: currentTaskId,
      snapshot: captureTaskState(),
    });
    addRunSummarySheet(updatedFiles, meta, currentStats);
    return new Blob([zipStore(updatedFiles)],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  async function downloadStatusWorkbook() {
    try {
      const blob = await buildStatusWorkbook();
      const meta = state.xlsxMeta;
      const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
      const base = baseName(meta.fileName || 'skc-状态');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${base}-状态-${stamp}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      log(`已生成状态回写 Excel：${a.download}`);
      return true;
    } catch (err) {
      log('生成状态回写 Excel 失败：' + err.message, 'error');
      return false;
    }
  }

  function buildBlankWorkbook(sheets) {
    const encoder = new TextEncoder();
    const types = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      ...sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml"`
        + ' ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'),
      '</Types>',
    ].join('');
    const rootRels = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"'
        + ' Target="xl/workbook.xml"/>',
      '</Relationships>',
    ].join('');
    const workbook = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '<sheets>',
      ...sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`),
      '</sheets>',
      '</workbook>',
    ].join('');
    const workbookRels = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      ...sheets.map((_, i) => `<Relationship Id="rId${i + 1}"`
        + ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"'
        + ` Target="worksheets/sheet${i + 1}.xml"/>`),
      '</Relationships>',
    ].join('');
    const files = {
      '[Content_Types].xml': encoder.encode(types),
      '_rels/.rels': encoder.encode(rootRels),
      'xl/workbook.xml': encoder.encode(workbook),
      'xl/_rels/workbook.xml.rels': encoder.encode(workbookRels),
    };
    sheets.forEach((s, i) => {
      files[`xl/worksheets/sheet${i + 1}.xml`] = encoder.encode(inlineSheetXml(s.rows));
    });
    return new Blob([zipStore(files)],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function downloadDelistTemplate() {
    try {
      const blob = buildBlankWorkbook([{
        name: '下架SKC清单',
        rows: [['下架 SKC ID', '状态']],
      }]);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '下架SKC清单-模板.xlsx';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      log('已下载下架 SKC ID 标准模板：下架SKC清单-模板.xlsx');
      return true;
    } catch (err) {
      log('下载下架 SKC 模板失败：' + err.message, 'error');
      return false;
    }
  }

  async function setSkcStatus(skc, status, {
    save = true,
    countAttempt = false,
    retryableOverride = null,
  } = {}) {
    if (!skc) return;
    if (state.current && state.current.skc === skc) markSkuProgress(status);
    const prev = state.skcStatuses[skc] || {};
    const next = {
      ...prev,
      status,
      at: Date.now(),
      attempts: Number(prev.attempts || 0) + (countAttempt ? 1 : 0),
    };
    if (!next.attempts) delete next.attempts;
    const cls = classifySkcInfo({ ...next, retryable: retryableOverride == null ? true : retryableOverride });
    next.retryable = cls.retryable;
    if (['failed', 'timeout'].includes(cls.kind)) next.lastReason = status;
    state.skcStatuses[skc] = next;
    if (countAttempt && next.attempts > 3) {
      log(`${state.queryType || 'SKC'} ${skc} 已尝试 ${next.attempts} 次；仍可手动重试，但请优先检查失败原因`, 'error');
    }
    if (save) await saveState();
    renderQueueStats();
  }

  async function importSkcFile(file) {
    try {
      let entries = [];
      let meta = null;
      const preferredType = (ui.queryType && ui.queryType.value) || state.queryType || 'SKC';
      if (/\.xlsx?$/i.test(file.name)) {
        const book = await parseXlsxDetailed(file);
        const parsed = extractProductEntries(book.rows, preferredType);
        entries = parsed.entries;
        meta = {
          fileName: file.name,
          sheetName: book.sheetName,
          headerIndex: parsed.headerIndex,
          idType: parsed.idType,
          idCol: parsed.idCol,
          skcCol: parsed.skcCol,
          statusCol: parsed.statusCol,
        };
        await dbSet(taskFileKey('xlsxParts'), book.files);
        state.xlsxMeta = meta;
      } else {
        const text = await file.text();
        const rows = text.split(/\r?\n/).map((l) => l.split(/[,\t;]/));
        const parsed = extractProductEntries(rows, preferredType);
        entries = parsed.entries;
        meta = {
          fileName: file.name,
          sheetName: null,
          headerIndex: parsed.headerIndex,
          idType: parsed.idType,
          idCol: parsed.idCol,
          skcCol: parsed.skcCol,
          statusCol: parsed.statusCol,
        };
      }
      const skcs = [...new Set(entries.map((x) => x.id || x.skc))];
      const detectedType = (meta && meta.idType) || preferredType;
      if (!skcs.length) throw new Error(`没有解析到 ${detectedType}`);
      state.queryType = detectedType;
      state.skcs = skcs;
      state.skcStatuses = {};
      state.runScopedSkcs = null;
      state.activeRetry = false;
      state.imagePlan = {};
      state.backPlanNames = [];
      entries.forEach((item) => {
        const id = item.id || item.skc;
        if (item.oldStatus) state.skcStatuses[id] = { status: item.oldStatus, at: null };
      });
      if (meta) {
        meta.entries = entries;
        state.xlsxMeta = meta;
      }
      state.cursor = 0;
      if (ui.queryType) ui.queryType.value = detectedType;
      if (ui.listTypeTitle) ui.listTypeTitle.textContent = `${detectedType} 清单`;
      ui.skcInfo.textContent = `已导入 ${skcs.length} 个 ${detectedType}`;
      if (ui.statusFileInfo) {
        ui.statusFileInfo.textContent = meta && meta.sheetName
          ? `状态列：第 ${meta.statusCol + 1} 列`
          : 'CSV 状态回写';
      }
      markTaskDirty();
      await saveState();
      renderStatus();
      renderEstimate();
      log(`导入 ${detectedType} ${skcs.length} 个：${skcs.join(', ')}`);
    } catch (err) {
      ui.skcInfo.textContent = '导入失败';
      log('导入商品清单失败：' + err.message, 'error');
    }
  }

  // ============================================================ 文件夹导入
  const IMAGE_TARGET_W = 1350;
  const IMAGE_TARGET_H = 1800;
  const IMAGE_MAX_BYTES = Math.floor(1.8 * 1024 * 1024);

  function drawCoverToCanvas(bitmap, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    const scale = Math.max(width / bitmap.width, height / bitmap.height);
    const sourceW = width / scale;
    const sourceH = height / scale;
    const sx = (bitmap.width - sourceW) / 2;
    const sy = (bitmap.height - sourceH) / 2;
    ctx.drawImage(bitmap, sx, sy, sourceW, sourceH, 0, 0, width, height);
    return canvas;
  }

  async function normalizeImageFile(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (err) {
      throw new Error(`${file.name} 无法读取：${err.message}`);
    }
    try {
      let width = IMAGE_TARGET_W;
      let height = IMAGE_TARGET_H;
      let canvas = drawCoverToCanvas(bitmap, width, height);
      let blob = null;
      for (const quality of [0.9, 0.85, 0.8, 0.75]) {
        blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= IMAGE_MAX_BYTES) break;
      }
      if (!blob || blob.size > IMAGE_MAX_BYTES) {
        width = 1340;
        height = 1787;
        canvas = drawCoverToCanvas(bitmap, width, height);
        for (const quality of [0.78, 0.72, 0.65]) {
          blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
          if (blob && blob.size <= IMAGE_MAX_BYTES) break;
        }
      }
      if (!blob || !blob.size) throw new Error('JPEG 编码失败');
      if (blob.size > IMAGE_MAX_BYTES) {
        throw new Error(`压缩后仍为 ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
      }
      return {
        file: new File([blob], `${baseName(file.name)}.jpg`,
          { type: 'image/jpeg', lastModified: Date.now() }),
        width,
        height,
        originalSize: file.size,
        size: blob.size,
      };
    } finally {
      bitmap.close && bitmap.close();
    }
  }

  async function normalizeImageBatch(files, onProgress) {
    const output = new Array(files.length);
    let cursor = 0;
    let done = 0;
    const worker = async () => {
      while (cursor < files.length) {
        const index = cursor++;
        output[index] = await normalizeImageFile(files[index]);
        done += 1;
        if (onProgress) onProgress(done, files.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const keys = new Set();
    for (const item of output) {
      const key = baseName(item.file.name);
      if (keys.has(key)) throw new Error(`文件名重复：${key}`);
      keys.add(key);
    }
    return output;
  }

  async function collectImageFiles(dirHandle) {
    const list = [];
    for await (const [name, entry] of dirHandle.entries()) {
      if (entry.kind === 'file' && /\.(jpe?g|png|webp|bmp)$/i.test(name)) list.push({ name, entry });
    }
    list.sort((a, b) => naturalCompare(a.name, b.name));
    const files = [];
    for (const item of list) {
      const f = await item.entry.getFile();
      files.push(f);
    }
    return files;
  }

  function pendingProductIds() {
    return state.skcs.filter((id) => classifySkcInfo(state.skcStatuses[id]).kind !== 'success');
  }

  function allocateFrontPlan(files) {
    const n = Math.max(1, Number(state.config.n || 4));
    const pending = pendingProductIds();
    const reserved = new Set(state.usedFrontImages || []);
    const cursor = { index: 0 };
    const takeNext = () => {
      while (cursor.index < files.length) {
        const file = files[cursor.index++];
        const key = baseName(file.name);
        if (reserved.has(key)) continue;
        reserved.add(key);
        return file;
      }
      return null;
    };
    const plan = {};
    const selectedFiles = [];
    for (const id of pending) {
      const chosen = [];
      for (let i = 0; i < n; i += 1) {
        const file = takeNext();
        if (!file) {
          throw new Error(`主图不够：待处理商品 ${pending.length} 个，需要 ${pending.length * n} 张，`
            + `扣除已用图片后只剩 ${selectedFiles.length} 张可用`);
        }
        chosen.push(file);
        selectedFiles.push(file);
      }
      plan[id] = {
        frontNames: chosen.map((file) => baseName(file.name)),
        backNames: [...(state.backPlanNames || [])],
      };
    }
    return { plan, selectedFiles, pendingCount: pending.length };
  }

  function ensureImagePlan(frontFiles) {
    const n = Math.max(1, Number(state.config.n || 4));
    const plan = JSON.parse(JSON.stringify(state.imagePlan || {}));
    const reserved = new Set(state.usedFrontImages || []);
    for (const item of Object.values(plan)) {
      (item.frontNames || []).forEach((name) => reserved.add(name));
    }
    let assigned = 0;
    for (const id of pendingProductIds()) {
      const current = plan[id];
      if (current && Array.isArray(current.frontNames) && current.frontNames.length === n
        && current.frontNames.every((name) => frontFiles.some((file) => baseName(file.name) === name))) {
        continue;
      }
      const names = [];
      for (const file of frontFiles) {
        const name = baseName(file.name);
        if (reserved.has(name)) continue;
        reserved.add(name);
        names.push(name);
        if (names.length === n) break;
      }
      if (names.length !== n) {
        throw new Error(`图片计划不完整：商品 ${id} 需要 ${n} 张主图，当前缺少 ${n - names.length} 张`);
      }
      plan[id] = {
        frontNames: names,
        backNames: [...(state.backPlanNames || current?.backNames || [])],
      };
      assigned += 1;
    }
    state.imagePlan = plan;
    return assigned;
  }

  async function pickFolder(kind) {
    try {
      if (!window.showDirectoryPicker) {
        throw new Error('当前浏览器不支持文件夹选择，请用 Chromium 内核浏览器');
      }
      const dirHandle = await window.showDirectoryPicker({ id: `temu-bot-${kind}`, mode: 'read' });
      const files = await collectImageFiles(dirHandle);
      if (!files.length) throw new Error('文件夹里没有图片');
      const info = kind === 'front' ? ui.frontInfo : ui.backInfo;
      readConfigFromUI({ silent: true });
      let selectedFiles = [];
      let frontPlanResult = null;
      if (kind === 'front') {
        if (!state.skcs.length) throw new Error('请先导入 SKC 或 SPU 商品清单');
        frontPlanResult = allocateFrontPlan(files);
        selectedFiles = frontPlanResult.selectedFiles;
        if (!selectedFiles.length) throw new Error('没有待处理商品，不需要再导入主图');
      } else {
        const count = Math.max(1, Number(state.config.x || 2));
        if (files.length < count) {
          throw new Error(`背面图不够：每个色值需要 ${count} 张，文件夹只有 ${files.length} 张`);
        }
        selectedFiles = files.slice(0, count);
      }
      if (info) info.textContent = `正在标准化 0/${selectedFiles.length}`;
      const normalized = await normalizeImageBatch(selectedFiles, (done, total) => {
        if (info) info.textContent = `正在标准化 ${done}/${total}`;
      });
      const outputFiles = normalized.map((item) => item.file);
      const outputNames = outputFiles.map((file) => baseName(file.name));
      await dbSet(taskFileKey(kind === 'front' ? 'frontFiles' : 'backFiles'), outputFiles);
      await dbSet(taskFileKey(kind === 'front' ? 'frontDirName' : 'backDirName'), dirHandle.name);
      if (kind === 'front') {
        state.imagePlan = frontPlanResult.plan;
      } else {
        state.backPlanNames = outputNames;
        Object.values(state.imagePlan || {}).forEach((plan) => { plan.backNames = [...outputNames]; });
      }
      markTaskDirty();
      await saveState();
      await refreshFolderInfo();
      const oversized = normalized.filter((item) => item.originalSize > IMAGE_MAX_BYTES);
      log(`从${kind === 'front' ? '主图' : '背面图'}文件夹「${dirHandle.name}」中选取本轮实际需要的 ${outputFiles.length} 张，`
        + `已统一标准化为 JPEG（${IMAGE_TARGET_W}×${IMAGE_TARGET_H}，≤1.8MB）`
        + (oversized.length ? `；自动压缩 ${oversized.length} 张` : ''));
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      log('导入文件夹失败：' + err.message, 'error');
    }
  }

  async function refreshFolderInfo() {
    const front = await dbGet(taskFileKey('frontFiles'));
    const back = await dbGet(taskFileKey('backFiles'));
    const frontName = await dbGet(taskFileKey('frontDirName'));
    const backName = await dbGet(taskFileKey('backDirName'));
    ui.frontCount = front ? front.length : 0;
    ui.backCount = back ? back.length : 0;
    ui.frontInfo.textContent = front ? `${frontName || '主图'}（本轮选中 ${front.length} 张）` : '未导入';
    ui.backInfo.textContent = back ? `${backName || '背面图'}（固定 ${back.length} 张）` : '未导入';
    renderEstimate();
  }

  // ============================================================ 列表页
  function isListPage() {
    return location.pathname.includes('/goods/list');
  }

  function isEditPage() {
    return location.pathname.includes('/goods/edit');
  }

  function isConfirmInfoPage() {
    return location.pathname.includes('/newon/product-select');
  }

  function isBotTab() {
    return location.hash.includes(BOT_HASH);
  }

  function botUrl(url) {
    return url.includes('#') ? `${url}&${BOT_HASH}` : `${url}#${BOT_HASH}`;
  }

  function getSpuFromUrl() {
    const m = location.search.match(/productId=(\d+)/);
    return m ? m[1] : null;
  }

  function findRowByIdentifier(identifier) {
    const tables = [...document.querySelectorAll('table')];
    for (const t of tables) {
      for (const tr of t.querySelectorAll('tbody tr')) {
        const has = [...tr.querySelectorAll('*')].some((el) => el.children.length === 0 && (el.innerText || '').trim() === identifier)
          || new RegExp(`(?:SKC|SPU)\\s*ID\\s*[:：]\\s*${escapeRegExp(identifier)}\\b`, 'i').test(tr.innerText || '');
        if (has) return tr;
      }
    }
    return null;
  }

  function findRowBySkc(skc) {
    return findRowByIdentifier(skc);
  }

  function extractSpu(row) {
    const m = (row.innerText || '').match(/SPU\s*ID\s*[:：]\s*(\d+)/);
    return m ? m[1] : null;
  }

  async function listSearchProduct(productId, queryType = state.queryType || 'SKC') {
    assertRunning();
    const wantedType = queryType === 'SPU' ? 'SPU' : 'SKC';
    log(`查询 ${wantedType} ${productId}`);
    const typeInput = await waitFor(
      () => [...document.querySelectorAll('input')].find((i) => visible(i) && ['SKC', 'SKU', 'SPU'].includes(i.value)),
      { desc: '商品ID类型下拉' },
    );
    if (typeInput.value !== wantedType) {
      const head = typeInput.closest('[data-testid=beast-core-select]') || typeInput.parentElement;
      const trigger = head.querySelector('[data-testid=beast-core-select-header]') || head;
      await realClick(trigger);
      await sleep(600);
      const opt = await waitFor(() => allVisible(document)
        .filter((e) => (e.innerText || '').trim() === wantedType && e.closest('[class*=dropdown],[class*=Dropdown],[class*=option],[class*=Option]'))
        .pop(), { desc: `下拉项 ${wantedType}`, timeout: 8000 });
      await realClick(opt);
      await sleep(400);
      log(`已把查询类型切换为 ${wantedType}`);
    }

    const input = await waitFor(
      () => [...document.querySelectorAll('input')].find((i) => i.placeholder === '多个查询请空格或逗号依次输入' && visible(i)),
      { desc: `${wantedType} 输入框` },
    );
    await setInput(input, productId);
    await sleep(200);

    const qbtn = await waitFor(() => [...document.querySelectorAll('button')]
      .find((b) => visible(b) && (b.innerText || '').trim() === '查询'), { desc: '查询按钮' });
    await realClick(qbtn);

    const row = await waitFor(() => {
      const total = (document.body.innerText.match(/全部\s*(\d+)/) || [])[1];
      const r = findRowByIdentifier(productId);
      return total === '1' && r ? r : null;
    }, { timeout: 40000, desc: `${wantedType} ${productId} 的查询结果` });

    const spu = extractSpu(row) || (wantedType === 'SPU' ? productId : null);
    if (!spu) throw new Error('结果行里没找到 SPU ID');
    log(`命中 SPU ${spu}`);
    return { row, spu };
  }

  async function listSearchSkc(skc) {
    return listSearchProduct(skc, 'SKC');
  }

  // ============================================================ 编辑页基础
  function specTable() {
    const tables = [...document.querySelectorAll('table')].filter((t) => (t.innerText || '').includes('正面图'));
    return tables[tables.length - 1] || null;
  }

  function specRows() {
    const t = specTable();
    if (!t) return [];
    return [...t.querySelectorAll('tbody tr')].filter((tr) => tr.querySelectorAll('td').length);
  }

  function cellOf(rowIdx, sub) {
    return document.getElementById(`productSkcList[${rowIdx}].${sub}`);
  }

  function carouselImgCount(rowIdx) {
    const cell = cellOf(rowIdx, 'carouselImgsI18n.common');
    return cell ? cell.querySelectorAll('img').length : -1;
  }

  async function revealCarouselRow(rowIdx, expected = 1) {
    const cell = cellOf(rowIdx, 'carouselImgsI18n.common');
    if (!cell) return -1;
    await deepScrollIntoView(cell, 0.42);
    await sleep(350);
    await waitFor(() => carouselImgCount(rowIdx) >= expected, {
      timeout: 3000,
      interval: 250,
      desc: `第 ${rowIdx + 1} 行轮播图渲染`,
    }).catch(() => null);
    return carouselImgCount(rowIdx);
  }

  function rowColorName(rowIdx) {
    const box = cellOf(rowIdx, 'mainSpec[0]');
    const input = box && box.querySelector('input');
    return input ? input.value : '';
  }

  function rowArtNo(rowIdx) {
    const box = cellOf(rowIdx, 'extCode');
    const input = box && box.querySelector('input');
    return input ? input.value : '';
  }

  function findRowIndexByColorName(name) {
    const rows = specRows();
    for (let i = 0; i < rows.length; i += 1) {
      if (rowColorName(i) === name) return i;
    }
    return -1;
  }

  async function waitEditReady() {
    log('等待编辑页加载…');
    await waitFor(() => !document.body.innerText.includes('正在获取商品数据'), { timeout: 120000, desc: '编辑页数据加载完成' });
    await waitFor(() => specTable(), { timeout: 90000, desc: '商品规格表格' });
    await sleep(800);
  }

  async function addColorRow(expectedCount) {
    const before = specRows().length;
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const addBtn = await waitFor(
          () => document.querySelector('div[class*=product-skc_specItem] > a[class*=BTN_]'),
          { desc: '色值「+ 添加」按钮', timeout: 20000 },
        );
        await realClick(addBtn);
        await waitFor(() => specRows().length >= expectedCount,
          { timeout: 45000, desc: `色值行数变为 ${expectedCount}` });
        await sleep(600);
        log(`新增色值行，当前共 ${specRows().length} 行`);
        return;
      } catch (err) {
        lastErr = err;
        const now = specRows().length;
        if (now > before) {
          log(`色值行已从 ${before} 变成 ${now}（不足 ${expectedCount}），再补一行`);
        } else {
          log(`添加色值行第 ${attempt + 1} 次没生效，重试：${err.message}`);
          await pressEscape();
          await sleep(800);
        }
      }
    }
    throw new Error(`添加色值行失败：${lastErr ? lastErr.message : '未知原因'}`);
  }

  async function setColorName(rowIdx, name) {
    const box = cellOf(rowIdx, 'mainSpec[0]');
    if (!box) throw new Error(`找不到第 ${rowIdx + 1} 行的色值输入框`);
    const accepted = () => {
      const liveBox = cellOf(rowIdx, 'mainSpec[0]');
      const live = liveBox && liveBox.querySelector('input');
      return !!(live && live.value === name && live.placeholder === name
        && !(liveBox.innerText || '').includes('请选择skc颜色'));
    };
    if (accepted()) return;
    // 只写 DOM 不够：必须失焦，让平台把自定义颜色登记成有效 SKC 颜色。
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const liveInput = box.querySelector('input');
      if (!liveInput) throw new Error(`第 ${rowIdx + 1} 行的色值输入框消失了`);
      const input = liveInput;
      try {
        await deepScrollIntoView(input, 0.58);
        await sleep(200);
        await typeTextReal(input, name, { clear: true, commitClick: true });
        await sleep(500);
        await waitFor(accepted,
          { timeout: 6000, interval: 250, desc: `色值登记确认 ${name}` });
        log(`色值 → ${name}`);
        return;
      } catch (err) {
        // 兜底：先清空，再走一次真实全选输入 + 真实点击失焦
        try {
          await deepScrollIntoView(input, 0.55);
          await typeTextReal(input, name, { clear: true, commitClick: true });
        } catch (inner) {
          log(`色值真实输入第 ${attempt + 1} 次失败：${inner.message}`, 'error');
        }
        if (accepted()) {
          log(`色值 → ${name}`);
          return;
        }
      }
    }
    const live = cellOf(rowIdx, 'mainSpec[0]');
    const input = live && live.querySelector('input');
    throw new Error(`色值未登记为有效SKC颜色（期望 ${name}，当前 ${input ? input.value : '空'}，`
      + `占位 ${input ? input.placeholder : '空'}）`);
  }

  async function setArtNo(rowIdx, code) {
    const box = cellOf(rowIdx, 'extCode');
    if (!box) throw new Error(`找不到第 ${rowIdx + 1} 行的货号输入框`);
    const input = box.querySelector('input');
    if (rowArtNo(rowIdx) === code) return;
    input.focus();
    await setInput(input, code, { settle: 100 });
    await commitInput(input, 80);
    try {
      await waitFor(() => rowArtNo(rowIdx) === code,
        { timeout: 8000, interval: 300, desc: `货号写入确认 ${code}` });
      log(`货号 → ${code}`);
    } catch (err) {
      await realClick(input);
      await setInput(input, code, { settle: 100 });
      await commitInput(input, 80);
      await waitFor(() => rowArtNo(rowIdx) === code,
        { timeout: 8000, interval: 300, desc: `货号写入确认 ${code}` });
      log(`货号 → ${code}`);
    }
  }

  /** 找一个空行（色值名和图片都为空）用于复用，避免失败重试后留下空行 */
  function findReusableEmptyRow() {
    const rows = specRows();
    for (let i = 0; i < rows.length; i += 1) {
      const name = rowColorName(i);
      const art = rowArtNo(i);
      const imgs = carouselImgCount(i);
      if (!name && !art && imgs === 0) return i;
    }
    return -1;
  }

  /** 取下一张还没用过的正面图（跨商品不复用） */
  function pickFrontFile(frontFiles) {
    const used = new Set(state.usedFrontImages || []);
    const file = frontFiles.find((f) => !used.has(baseName(f.name)));
    if (!file) {
      throw new Error(`主图不足：${frontFiles.length} 张正面图已全部用过，请补充新的主图文件夹`);
    }
    return file;
  }

  // ============================================================ 素材中心
  function materialDialog() {
    const list = allVisible(document)
      .filter((el) => /MDL_innerWrapper/.test(el.className || '')
        && (el.innerText || '').includes('本地上传')
        && !(el.innerText || '').includes('无需重复上传'));
    return list[list.length - 1] || null;
  }

  function cropDialog() {
    const list = allVisible(document).filter((el) => /MDL_innerWrapper/.test(el.className || '')
      && /裁剪/.test(el.innerText || '') && /待载[剪裁]|待保存/.test(el.innerText || ''));
    return list[list.length - 1] || null;
  }

  function imageQualityDialog() {
    const candidates = allVisible(document)
      .filter((el) => /图片品质不佳/.test(el.innerText || '')
        && [...el.querySelectorAll('button')].some((button) => (button.innerText || '').trim() === '取消'));
    candidates.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
    return candidates[0] || null;
  }

  async function rejectImageQualityIfAny(imageName = '', targetNames = []) {
    const dlg = imageQualityDialog();
    if (!dlg) return false;
    const text = (dlg.innerText || '').replace(/\s+/g, ' ').trim();
    const reasonMatch = text.match(/本次上传图片中[^。]*[。]?/) || text.match(/存在[^。]*不合规[^。]*/);
    const reason = (reasonMatch ? reasonMatch[0] : text).slice(0, 220);
    const targetText = imageName || (targetNames.length ? targetNames.join('、') : '当前色值图片');
    log(`平台图片合规拦截：${targetText}；${reason}`, 'error');
    const cancel = [...dlg.querySelectorAll('button')]
      .find((button) => (button.innerText || '').trim() === '取消' && visible(button));
    if (cancel) await realClick(cancel);
    await waitFor(() => !imageQualityDialog(), {
      timeout: 12000,
      desc: '图片品质不合规弹窗关闭',
      checkQuality: false,
    })
      .catch(async () => { await pressEscape(); });
    const error = new Error(`图片品质不合规：${reason}；图片=${targetText}`);
    error.code = 'IMAGE_QUALITY_REJECTED';
    error.imageName = targetText;
    throw error;
  }

  async function openMaterialDialog(rowIdx) {
    const cell = cellOf(rowIdx, 'carouselImgsI18n.common');
    if (!cell) throw new Error(`找不到第 ${rowIdx + 1} 行的轮播图单元`);
    const trigger = cell.querySelector('[class*=upload-trigger_wrap]');
    if (!trigger) throw new Error('找不到「素材中心」入口');
    if (/disabled/.test(trigger.className || '')) {
      throw new Error('该色值行的图片入口被平台锁定（原色值行不可改，请检查是否误操作到旧行）');
    }
    await realClick(trigger);
    const dlg = await waitFor(() => materialDialog(), { timeout: 40000, desc: '素材中心弹窗' });
    await sleep(1200);
    return dlg;
  }

  async function closeMaterialDialog() {
    const dlg = materialDialog();
    if (!dlg) return;
    const cancel = allVisible(dlg).filter((e) => (e.innerText || '').trim() === '取消').pop();
    if (cancel) {
      await realClick(clickable(cancel));
    } else {
      const close = allVisible(dlg).filter((e) => /close/i.test(e.className || '')).pop();
      if (close) await realClick(close);
    }
    await waitFor(() => !materialDialog(), { timeout: 15000, desc: '素材中心弹窗关闭' });
  }

  function materialSearchInput(dlg) {
    dlg = materialDialog() || dlg;
    return allVisible(dlg).find((i) => i.tagName === 'INPUT' && i.placeholder === '请输入素材名称');
  }

  async function searchMaterial(dlg, keyword) {
    dlg = materialDialog() || dlg;
    const box = materialSearchInput(dlg);
    if (!box) return false;
    await setInput(box, keyword);
    await sleep(300);
    // 搜索按钮是 svg 放大镜，位于输入框右侧
    const scope = box.closest('[class*=reunitBlock]') || box.parentElement;
    const svg = [...scope.querySelectorAll('svg')].pop();
    if (svg && visible(svg)) {
      await realClick(svg);
    } else {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }
    await sleep(1200);
    log(`素材中心搜索「${keyword}」`);
    return true;
  }

  async function clearMaterialSearch(dlg) {
    dlg = materialDialog() || dlg;
    const box = materialSearchInput(dlg);
    if (!box) return;
    await setInput(box, '');
    await sleep(400);
  }

  function nameRegexFor(base) {
    return new RegExp(`^${escapeRegExp(base)}(-\\d+)?$`);
  }

  function findMaterialCard(dlg, regex) {
    dlg = materialDialog() || dlg;
    const hits = allVisible(dlg).filter((el) => regex.test((el.innerText || '').trim()));
    if (!hits.length) return null;
    // 名称标签本身带子元素，这里取“后代最少”的最内层节点
    const min = Math.min(...hits.map((el) => el.querySelectorAll('*').length));
    const inner = hits.filter((el) => el.querySelectorAll('*').length === min);
    const scored = inner.map((el) => {
      const m = (el.innerText || '').trim().match(/-(\d+)$/);
      return { el, index: m ? Number(m[1]) : -1, top: el.getBoundingClientRect().top };
    });
    scored.sort((a, b) => (b.index - a.index) || (a.top - b.top));
    return scored[0].el;
  }

  function selectedCount(dlg) {
    dlg = materialDialog() || dlg;
    const m = (dlg.innerText || '').match(/已选\s*(\d+)\s*个/);
    return m ? Number(m[1]) : -1;
  }

  async function selectCard(labelEl) {
    const card = labelEl.closest('[class*=cardContainer]') || labelEl.parentElement.parentElement || labelEl;
    card.scrollIntoView({ block: 'center', behavior: 'instant' });
    await sleep(350);
    const r = card.getBoundingClientRect();
    await clickAt(r.left + r.width / 2, r.top + Math.min(60, r.height / 3));
    await sleep(500);
  }

  async function dismissDedupeIfAny() {
    const dlg = allVisible(document).find((el) => /MDL_innerWrapper/.test(el.className || '')
      && (el.innerText || '').includes('无需重复上传'));
    if (!dlg) return false;
    log('出现「无需重复上传」提示，改为从素材库选取');
    const close = allVisible(dlg).filter((e) => ['关闭', '在列表中查看'].includes((e.innerText || '').trim())).pop();
    if (close) await realClick(clickable(close));
    await waitFor(() => !allVisible(document).some((el) => /MDL_innerWrapper/.test(el.className || '')
      && (el.innerText || '').includes('无需重复上传')), { timeout: 8000, desc: '重复上传提示关闭' }).catch(() => {});
    await sleep(800);
    return true;
  }

  async function uploadFilesToDialog(dlg, files) {
    // 注意：上传用的 file input 是隐藏元素，不能用“可见”过滤
    const input = await waitFor(() => [...document.querySelectorAll('input[type=file]')]
      .filter((i) => i.multiple && i.closest('[class*=MDL_innerWrapper]'))
      .pop(), { desc: '素材上传文件框' });
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    log(`已选择本地文件：${files.map((f) => f.name).join(', ')}`);
    await sleep(1500);
  }

  /** 平台单图上限约 2MB；超大 PNG 自动等比转 JPEG，保持原像素尺寸。 */
  async function ensureUploadableImage(file) {
    if (!file || file.size <= 1.9 * 1024 * 1024) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close && bitmap.close();
      let blob = null;
      for (const quality of [0.92, 0.86, 0.8, 0.72, 0.65, 0.55]) {
        blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size <= 1.9 * 1024 * 1024) break;
      }
      if (!blob || blob.size > 2 * 1024 * 1024) {
        throw new Error('压缩后仍超过2MB');
      }
      const name = `${baseName(file.name)}.jpg`;
      log(`图片 ${file.name} 为 ${(file.size / 1024 / 1024).toFixed(1)}MB，已自动压缩为 ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
      return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    } catch (err) {
      throw new Error(`图片 ${file.name} 超过2MB且压缩失败：${err.message}`);
    }
  }

  async function handleCropDialog(cropW, cropH) {
    const dlg = await waitFor(() => cropDialog(), { timeout: 90000, desc: '裁剪弹窗' });
    let confirmedCount = 0;
    for (let guard = 0; guard < 40; guard += 1) {
      assertRunning();
      const d = cropDialog();
      if (!d) break;
      const pending = Number((d.innerText.match(/待载[剪裁]\((\d+)\)/) || [])[1] || 0);
      log(`裁剪弹窗：待裁剪 ${pending} 张，尺寸目标 ${cropW}×${cropH}`);
      if (pending === 0) break;
      const inputs = allVisible(d).filter((i) => i.tagName === 'INPUT');
      if (!inputs.length || !inputs[0].value || !inputs[1].value) {
        const thumbs = [...d.querySelectorAll('img')]
          .filter((img) => visible(img) && img.getBoundingClientRect().width > 40
            && img.getBoundingClientRect().height > 40)
          .sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return (ar.top - br.top) || (ar.left - br.left);
          });
        const target = thumbs[Math.min(confirmedCount, thumbs.length - 1)];
        if (target) {
          await trustedClick(target);
          await sleep(700);
        }
      }
      await waitFor(() => {
        const live = allVisible(cropDialog() || d).filter((i) => i.tagName === 'INPUT');
        return live.length >= 2 && live[0].value && live[1].value;
      },
        { timeout: 40000, desc: '裁剪尺寸加载' });
      const liveInputs = allVisible(cropDialog() || d).filter((i) => i.tagName === 'INPUT');
      if (liveInputs[0].value !== String(cropW) || liveInputs[1].value !== String(cropH)) {
        await setInput(liveInputs[0], cropW);
        await setInput(liveInputs[1], cropH);
        await sleep(300);
        log(`裁剪尺寸已改为 ${liveInputs[0].value}×${liveInputs[1].value}`);
      }
      markSkuProgress(`裁剪尺寸 ${cropW}×${cropH}`);
      await clickInDialog(d, '确认裁剪');
      confirmedCount += 1;
      markSkuProgress(`已确认裁剪 ${confirmedCount} 张`);
      await sleep(1800);
    }
    const d = cropDialog();
    if (d) {
      await clickInDialog(d, '保存');
      await waitFor(() => !cropDialog(), { timeout: 60000, desc: '裁剪弹窗关闭' });
      markSkuProgress('裁剪图片已保存');
      log('裁剪完成并已保存');
    }
    await sleep(1500);
  }

  /** 选中素材库里的目标图片（返回实际素材名） */
  async function pickMaterial(dlg, fileOrName, { uploadIfMissing = true } = {}) {
    const base = typeof fileOrName === 'string' ? fileOrName : baseName(fileOrName.name);
    activeImageTarget = base;
    const regex = nameRegexFor(base);
    // 1) 先在当前列表里找（可能刚好在可视区）
    let label = await waitFor(() => findMaterialCard(dlg, regex), { timeout: 2000 }).catch(() => null);
    if (!label) {
      // 2) 搜索素材库
      await searchMaterial(dlg, base);
      label = await waitFor(() => findMaterialCard(dlg, regex), { timeout: 12000 }).catch(() => null);
    }
    if (!label && uploadIfMissing && typeof fileOrName !== 'string') {
      // 3) 库里没有 → 本地上传（裁剪统一 1350×1800）
      await clearMaterialSearch(dlg);
      const uploadFile = await ensureUploadableImage(fileOrName);
      await uploadFilesToDialog(dlg, [uploadFile]);
      await dismissDedupeIfAny();
      await handleCropDialog(state.config.cropW, state.config.cropH);
      await dismissDedupeIfAny();
      // 上传后的素材需要一点时间入库，而且列表不会自动刷新 —— 隔几秒重搜一次
      await sleep(6000);
      label = await waitFor(async () => {
        let found = findMaterialCard(dlg, regex);
        if (found) return found;
        await searchMaterial(dlg, base);
        await sleep(2500);
        found = findMaterialCard(dlg, regex);
        return found || null;
      }, { timeout: 240000, interval: 2500, desc: `上传后出现的素材「${base}」` });
    }
    if (!label) throw new Error(`素材中心里找不到「${base}」`);
    const name = (label.innerText || '').trim();
    await selectCard(label);
    await sleep(250);
    await rejectImageQualityIfAny(base, [base]);
    markSkuProgress(`选中素材 ${name}`);
    return name;
  }

  // ============================================================ 编辑页流程
  async function attachFrontImage(rowIdx, file) {
    const need = 1;
    const before = carouselImgCount(rowIdx);
    if (before >= need) {
      log(`第 ${rowIdx + 1} 行已有正面图，跳过`);
      return;
    }
    const dlg = await openMaterialDialog(rowIdx);
    const selBefore = selectedCount(dlg);
    const name = await pickMaterial(dlg, file);
    const selAfter = selectedCount(dlg);
    if (selBefore >= 0 && selAfter >= 0 && selAfter <= selBefore) {
      throw new Error('正面图未被选中，请检查素材中心列表');
    }
    await clickInDialog(dlg, '确认');
    await waitFor(() => !materialDialog(), { timeout: 30000, desc: '素材中心弹窗关闭' });
    await waitFor(() => carouselImgCount(rowIdx) > before,
      { timeout: 30000, desc: `第 ${rowIdx + 1} 行轮播图增加` });
    log(`正面图已写入第 ${rowIdx + 1} 行（素材 ${name}）`);
  }

  function dedupeDialog() {
    return allVisible(document).find((el) => /MDL_innerWrapper/.test(el.className || '')
      && (el.innerText || '').includes('无需重复上传')) || null;
  }

  async function materialExistsByBase(dlg, fileOrName) {
    const base = typeof fileOrName === 'string' ? fileOrName : baseName(fileOrName.name);
    activeImageTarget = base;
    const regex = nameRegexFor(base);
    let found = await waitFor(() => findMaterialCard(dlg, regex), { timeout: 700 }).catch(() => null);
    if (found) return true;
    await clearMaterialSearch(dlg);
    await searchMaterial(dlg, base);
    found = await waitFor(() => findMaterialCard(dlg, regex), { timeout: 5000 }).catch(() => null);
    return !!found;
  }

  async function attachFrontFromLibrary(rowIdx, file, dlg = null) {
    const before = carouselImgCount(rowIdx);
    if (before >= 1) return false;
    const useDlg = dlg || await openMaterialDialog(rowIdx);
    await clearMaterialSearch(useDlg);
    const selBefore = selectedCount(useDlg);
    const name = await pickMaterial(useDlg, file, { uploadIfMissing: false });
    const selAfter = selectedCount(useDlg);
    if (selBefore >= 0 && selAfter >= 0 && selAfter <= selBefore) {
      throw new Error(`第 ${rowIdx + 1} 行正面图未被选中`);
    }
    await clickInDialog(useDlg, '确认');
    await waitFor(() => !materialDialog(), { timeout: 30000, desc: '素材中心弹窗关闭' });
    await waitFor(() => carouselImgCount(rowIdx) > before,
      { timeout: 30000, desc: `第 ${rowIdx + 1} 行轮播图增加` });
    log(`正面图已写入第 ${rowIdx + 1} 行（素材 ${name}）`);
    return true;
  }

  /**
   * 同一商品的主图先在同一个素材中心批量上传、批量裁剪；
   * 之后每个色值只从素材库选取，避免重复打开上传/裁剪流程。
   */
  async function attachFrontImagesBatch(assignments) {
    const pending = assignments.filter((x) => carouselImgCount(x.rowIdx) < 1);
    if (!pending.length) return;
    log(`正面图批处理：共 ${pending.length} 张，先统一上传并裁剪`);
    const first = pending[0];
    let dlg = await openMaterialDialog(first.rowIdx);
    const missing = [];
    for (const item of pending) {
      assertRunning();
      if (!(await materialExistsByBase(dlg, item.file))) missing.push(item.file);
    }
    if (missing.length) {
      await clearMaterialSearch(dlg);
      const uploadMissing = [];
      for (const file of missing) uploadMissing.push(await ensureUploadableImage(file));
      await uploadFilesToDialog(dlg, uploadMissing);
      await sleep(800);
      const dedupe = dedupeDialog();
      if (dedupe) await dismissDedupeIfAny();
      if (cropDialog()) {
        await handleCropDialog(state.config.cropW, state.config.cropH);
      } else {
        await waitFor(() => cropDialog() || dedupeDialog(), { timeout: 15000, desc: '批量上传结果' })
          .catch(() => null);
        if (dedupeDialog()) await dismissDedupeIfAny();
        if (cropDialog()) await handleCropDialog(state.config.cropW, state.config.cropH);
      }
      await dismissDedupeIfAny();
      await sleep(5000);
      log(`主图批量上传完成：新上传 ${missing.length} 张`);
    } else {
      log('本商品主图均已在素材库，直接从素材库选取');
    }
    // 复用当前弹窗写入第一张，其余色值从素材库选取。
    await attachFrontFromLibrary(first.rowIdx, first.file, dlg);
    if (!state.usedFrontImages.includes(baseName(first.file.name))) {
      state.usedFrontImages.push(baseName(first.file.name));
      state.frontCursor = state.usedFrontImages.length;
      await saveState();
    }
    for (let i = 1; i < pending.length; i += 1) {
      assertRunning();
      const item = pending[i];
      dlg = await openMaterialDialog(item.rowIdx);
      await attachFrontFromLibrary(item.rowIdx, item.file, dlg);
      if (!state.usedFrontImages.includes(baseName(item.file.name))) {
        state.usedFrontImages.push(baseName(item.file.name));
        state.frontCursor = state.usedFrontImages.length;
        await saveState();
      }
    }
  }

  /**
   * 新流程：每个色值只打开一次素材中心，同时选中 1 张正面和 X 张背面后一次确认。
   * 背面图第一次上传入库，后续色值从素材库复用。
   */
  async function attachImagesForColor(rowIdx, frontFile, backFiles) {
    const expected = 1 + backFiles.length;
    const before = carouselImgCount(rowIdx);
    if (before >= expected) {
      log(`第 ${rowIdx + 1} 行已有完整图片，跳过`);
      return false;
    }
    if (before > 0) {
      throw new Error(`第 ${rowIdx + 1} 行已有 ${before} 张图片但不足 ${expected} 张，请人工检查该色值`);
    }
    const dlg = await openMaterialDialog(rowIdx);
    const targetBack = state.backMaterialNames.length
      ? state.backMaterialNames.slice(0, backFiles.length)
      : backFiles;
    const allTargets = [frontFile, ...targetBack];
    const missingFiles = [];
    markSkuProgress(`检查第 ${rowIdx + 1} 行素材`);
    for (const target of allTargets) {
      assertRunning();
      if (!(await materialExistsByBase(dlg, target))) {
        if (typeof target === 'string') {
          throw new Error(`背面图素材「${target}」在素材库中不存在`);
        }
        missingFiles.push(target);
      }
    }
    if (missingFiles.length) {
      await clearMaterialSearch(dlg);
      const uploadMissing = [];
      for (const file of missingFiles) uploadMissing.push(await ensureUploadableImage(file));
      await uploadFilesToDialog(dlg, uploadMissing);
      await sleep(800);
      if (dedupeDialog()) await dismissDedupeIfAny();
      await waitFor(() => cropDialog() || dedupeDialog(), { timeout: 15000, desc: '图片批量上传结果' })
        .catch(() => null);
      if (dedupeDialog()) await dismissDedupeIfAny();
      if (cropDialog()) await handleCropDialog(state.config.cropW, state.config.cropH);
      await dismissDedupeIfAny();
      await sleep(5000);
      markSkuProgress(`第 ${rowIdx + 1} 行素材上传完成`);
      log(`本颜色素材批量上传完成：${uploadMissing.map((f) => f.name).join('、')}`);
    }
    const selBefore = selectedCount(dlg);
    const selectedNames = [];
    for (const target of allTargets) {
      assertRunning();
      const name = await pickMaterial(dlg, target, { uploadIfMissing: false });
      selectedNames.push(name);
      markSkuProgress(`第 ${rowIdx + 1} 行已选 ${selectedNames.length}/${allTargets.length} 张`);
      await sleep(250);
    }
    const selAfter = selectedCount(dlg);
    if (selBefore >= 0 && selAfter >= 0 && selAfter - selBefore !== allTargets.length) {
      throw new Error(`素材选中数量不符（期望 ${allTargets.length}，实际 ${selAfter - selBefore}）`);
    }
    await clickInDialog(dlg, '确认');
    markSkuProgress(`第 ${rowIdx + 1} 行素材已确认`);
    await waitFor(() => !materialDialog(), { timeout: 30000, desc: '素材中心弹窗关闭' });
    await waitFor(() => carouselImgCount(rowIdx) >= expected,
      { timeout: 40000, desc: `第 ${rowIdx + 1} 行图片达到 ${expected} 张` });
    if (!state.backMaterialNames.length) {
      state.backMaterialNames = selectedNames.slice(1);
      log(`背面图素材登记：${state.backMaterialNames.join('、')}（后续色值直接复用）`);
    }
    const frontKey = baseName(frontFile.name);
    if (!state.usedFrontImages.includes(frontKey)) state.usedFrontImages.push(frontKey);
    state.frontCursor = state.usedFrontImages.length;
    await saveState();
    log(`第 ${rowIdx + 1} 行主图+背面图一次上传完成（${selectedNames.join('、')}）`);
    return true;
  }

  async function selectPlannedTargetsForRow(rowIdx, dlg, targets) {
    const expected = targets.length;
    const selBefore = selectedCount(dlg);
    const selectedNames = [];
    for (const target of targets) {
      assertRunning();
      const name = await pickMaterial(dlg, target, { uploadIfMissing: false });
      selectedNames.push(name);
      markSkuProgress(`第 ${rowIdx + 1} 行已选 ${selectedNames.length}/${targets.length} 张`);
      await sleep(220);
    }
    const selAfter = selectedCount(dlg);
    if (selBefore >= 0 && selAfter >= 0 && selAfter - selBefore !== expected) {
      throw new Error(`第 ${rowIdx + 1} 行选中数量不符（期望 ${expected}，实际 ${selAfter - selBefore}）`);
    }
    await clickInDialog(dlg, '确认');
    await sleep(300);
    const targetNames = targets.map((target) => typeof target === 'string' ? target : baseName(target.name));
    await rejectImageQualityIfAny(targetNames[0], targetNames);
    markSkuProgress(`第 ${rowIdx + 1} 行图片已确认`);
    await waitFor(() => !materialDialog(), { timeout: 30000, desc: '素材中心弹窗关闭' });
    await waitFor(() => carouselImgCount(rowIdx) >= expected,
      { timeout: 40000, desc: `第 ${rowIdx + 1} 行图片达到 ${expected} 张` });
    if (state.current) {
      state.current.confirmedImages = state.current.confirmedImages || {};
      state.current.confirmedImages[rowColorName(rowIdx) || `row-${rowIdx + 1}`] = expected;
    }
    return selectedNames;
  }

  /**
   * 每个商品只打开一次上传窗口：把该商品全部计划主图和背面图一次上传、一次裁剪，
   * 然后逐个色值从素材库按计划选中对应图片。
   */
  async function attachImagesForProductBatch(assignments, backFiles) {
    if (!assignments.length) return 0;
    const expectedBacks = backFiles.slice(0, state.config.x);
    const first = assignments[0];
    let dlg = await openMaterialDialog(first.rowIdx);
    const targetBacks = state.backMaterialNames.length
      ? state.backMaterialNames.slice(0, expectedBacks.length)
      : expectedBacks;
    markSkuProgress(`检查本商品 ${assignments.length} 个色值的批量素材`);
    const uploadCandidates = [...new Set([
      ...assignments.map((item) => item.file),
      ...(state.backMaterialNames.length ? [] : expectedBacks),
    ])];
    const missing = [];
    for (const target of uploadCandidates) {
      assertRunning();
      if (!(await materialExistsByBase(dlg, target))) missing.push(target);
    }
    if (missing.length) {
      await clearMaterialSearch(dlg);
      const uploadMissing = [];
      for (const file of missing) uploadMissing.push(await ensureUploadableImage(file));
      log(`本商品批量上传 ${uploadMissing.length} 张：${uploadMissing.map((file) => file.name).join('、')}`);
      await uploadFilesToDialog(dlg, uploadMissing);
      await sleep(800);
      if (dedupeDialog()) await dismissDedupeIfAny();
      await waitFor(() => cropDialog() || dedupeDialog(), { timeout: 20000, desc: '本商品批量上传结果' })
        .catch(() => null);
      if (dedupeDialog()) await dismissDedupeIfAny();
      if (cropDialog()) await handleCropDialog(state.config.cropW, state.config.cropH);
      await dismissDedupeIfAny();
      await sleep(5000);
      await rejectImageQualityIfAny('',
        uploadCandidates.map((target) => typeof target === 'string' ? target : baseName(target.name)));
      markSkuProgress(`本商品 ${uploadMissing.length} 张图片批量上传并裁剪完成`);
    }

    // 批量上传后逐项验证；平台若静默吞图，自动拆成每批 3 张补传。
    let missingAfterBatch = [];
    for (const target of uploadCandidates) {
      assertRunning();
      if (!(await materialExistsByBase(dlg, target))) missingAfterBatch.push(target);
    }
    if (missingAfterBatch.length) {
      log(`批量上传后仍有 ${missingAfterBatch.length} 张未入库，自动拆成小批次补传`, 'error');
      for (let start = 0; start < missingAfterBatch.length; start += 3) {
        const chunk = missingAfterBatch.slice(start, start + 3);
        if (chunk.some((item) => typeof item === 'string')) {
          throw new Error('批量补传目标中有素材名而不是本地文件，请重新导入图片文件夹');
        }
        await clearMaterialSearch(dlg);
        const chunkFiles = [];
        for (const target of chunk) {
          chunkFiles.push(await ensureUploadableImage(target));
        }
        await uploadFilesToDialog(dlg, chunkFiles);
        await sleep(800);
        await waitFor(() => cropDialog() || dedupeDialog(), { timeout: 20000, desc: '补传批次结果' })
          .catch(() => null);
        if (dedupeDialog()) await dismissDedupeIfAny();
        if (cropDialog()) await handleCropDialog(state.config.cropW, state.config.cropH);
        await dismissDedupeIfAny();
        await sleep(3000);
        log(`补传完成一批：${chunkFiles.map((file) => file.name).join('、')}`);
      }
      missingAfterBatch = [];
      for (const target of uploadCandidates) {
        assertRunning();
        if (!(await materialExistsByBase(dlg, target))) missingAfterBatch.push(target);
      }
      if (missingAfterBatch.length) {
        throw new Error(`补传后素材仍缺失：${missingAfterBatch.map((item) => typeof item === 'string' ? item : item.name).join('、')}`);
      }
    }

    const firstTargets = [first.file, ...targetBacks];
    const firstNameList = await selectPlannedTargetsForRow(first.rowIdx, dlg, firstTargets);
    if (!state.backMaterialNames.length) {
      state.backMaterialNames = firstNameList.slice(1);
      log(`背面图素材登记：${state.backMaterialNames.join('、')}（本任务后续全部复用）`);
    }
    const firstFront = baseName(first.file.name);
    if (!state.usedFrontImages.includes(firstFront)) state.usedFrontImages.push(firstFront);
    state.frontCursor = state.usedFrontImages.length;
    await saveState();
    markSkuProgress(`第 ${first.rowIdx + 1} 行图片写入完成`);

    for (let i = 1; i < assignments.length; i += 1) {
      assertRunning();
      const item = assignments[i];
      dlg = await openMaterialDialog(item.rowIdx);
      const targets = [item.file, ...state.backMaterialNames.slice(0, expectedBacks.length)];
      await selectPlannedTargetsForRow(item.rowIdx, dlg, targets);
      const frontKey = baseName(item.file.name);
      if (!state.usedFrontImages.includes(frontKey)) state.usedFrontImages.push(frontKey);
      state.frontCursor = state.usedFrontImages.length;
      await saveState();
      markSkuProgress(`第 ${item.rowIdx + 1} 行图片写入完成`);
    }
    log(`本商品批量图片流程完成：${assignments.length} 个色值已按计划一一对应`);
    return assignments.length;
  }

  async function attachBackImages(rowIdx, files) {
    const need = files.length;
    const before = carouselImgCount(rowIdx);
    if (before >= 1 + need) {
      log(`第 ${rowIdx + 1} 行已有背面图，跳过`);
      return;
    }
    const dlg = await openMaterialDialog(rowIdx);
    const selBefore = selectedCount(dlg);
    const names = [];
    for (let i = 0; i < files.length; i += 1) {
      assertRunning();
      const known = state.backMaterialNames[i];
      const target = known || files[i];
      const name = await pickMaterial(dlg, target);
      names.push(name);
      await sleep(400);
    }
    const selAfter = selectedCount(dlg);
    if (selBefore >= 0 && selAfter >= 0 && selAfter - selBefore !== files.length) {
      throw new Error(`背面图选中数量不符（期望 ${files.length}，实际 ${selAfter - selBefore}）`);
    }
    await clickInDialog(dlg, '确认');
    await waitFor(() => !materialDialog(), { timeout: 30000, desc: '素材中心弹窗关闭' });
    await waitFor(() => carouselImgCount(rowIdx) >= before + files.length,
      { timeout: 40000, desc: `第 ${rowIdx + 1} 行轮播图增加 ${files.length} 张` });
    if (!state.backMaterialNames.length) {
      state.backMaterialNames = names;
      await saveState();
      log(`背面图素材登记：${names.join('、')}（后续色值直接复用）`);
    }
    log(`背面图已写入第 ${rowIdx + 1} 行`);
  }

  function preflightCheck(n) {
    const rows = specRows();
    const problems = [];
    for (let i = 1; i <= n; i += 1) {
      const name = `Mixed Color${i + 1}`;
      const idx = findRowIndexByColorName(name);
      if (idx < 0) {
        problems.push(`缺少色值行 ${name}`);
        continue;
      }
      const imgs = carouselImgCount(idx);
      const confirmed = Number(state.current && state.current.confirmedImages
        && state.current.confirmedImages[name] || 0);
      const verifiedImages = Math.max(imgs, confirmed);
      if (verifiedImages < 3) {
        problems.push(`${name} 轮播图只有 ${verifiedImages} 张（至少 3 张）`);
      } else if (imgs < 3 && confirmed >= 3) {
        log(`${name} 当前 DOM 未挂载轮播图，使用本轮已确认写入的 ${confirmed} 张记录通过自检`);
      }
      if (!rowArtNo(idx)) problems.push(`${name} 货号为空`);
      const colorBox = cellOf(idx, 'mainSpec[0]');
      const colorInput = colorBox && colorBox.querySelector('input');
      if (!colorInput || colorInput.value !== name || colorInput.placeholder !== name
        || (colorBox.innerText || '').includes('请选择skc颜色')) {
        problems.push(`${name} 尚未登记为有效SKC颜色`);
      }
    }
    if (rows.length < n + 1) problems.push(`色值行总数不足（${rows.length}）`);

    // 敏感属性与体积重量：新增色值行必须填好
    const wRows = weightRows().map(parseWeightRow);
    wRows.filter((r) => r.sensEditable).forEach((r) => {
      const tag = r.size ? `尺码 ${r.size}` : '某一行';
      if (!r.sensText) problems.push(`体积重量：${tag} 的敏感属性为空`);
      if (!r.dimInputs.length || !r.dimInputs[0].value) problems.push(`体积重量：${tag} 的体积为空`);
      if (!r.weightInputs.length || !r.weightInputs[0].value) problems.push(`体积重量：${tag} 的重量为空`);
    });
    // SKU 信息：申报价格 / SKU分类
    const sTable = skuInfoTable();
    if (sTable) {
      const sRows = [...sTable.querySelectorAll('tbody tr')].filter((tr) => tr.querySelectorAll('td').length).map(parseSkuRow);
      let gc = null;
      sRows.forEach((r) => { if (r.hasColor) gc = r.color; r.groupColor = gc; });
      const firstColor = sRows.length ? sRows[0].groupColor : null;
      const baseSites = {};
      sRows.filter((r) => r.groupColor === firstColor).forEach((r) => {
        baseSites[r.size] = Object.fromEntries(r.priceItems.map((p) => [p.site, p.input.value]));
      });
      sRows.filter((r) => r.groupColor !== firstColor).forEach((r) => {
        const tag = r.size ? `尺码 ${r.size}` : '某一行';
        const expected = baseSites[r.size] || {};
        for (const p of r.priceItems) {
          if (expected[p.site] && p.input.value !== expected[p.site]) {
            problems.push(`SKU信息：${r.groupColor}/${tag} 的申报价格未沿用混合色`);
            break;
          }
          if (!p.input.value) {
            problems.push(`SKU信息：${r.groupColor}/${tag} 的申报价格为空`);
            break;
          }
        }
        if (!(r.catText || '').trim() || /请选择/.test(r.catText)) problems.push(`SKU信息：${tag} 的SKU分类为空`);
        if (r.packInput && !r.packInput.disabled && !r.packInput.value) {
          problems.push(`SKU信息：${r.groupColor}/${tag} 的共计内含为空`);
        }
        if (!(r.stockText || '').trim() || r.stockText.trim() === '-') problems.push(`SKU信息：${tag} 的库存为空`);
        if (!r.codeInput || !r.codeInput.value) problems.push(`SKU信息：${tag} 的SKU货号为空`);
      });
    }
    if (!problems.length) return [];
    if (state.config.strictCheck) return problems;
    log('提交前自检有警告（未阻断，仍会提交）：' + problems.join('；'), 'error');
    return [];
  }

  // ---------------- 敏感属性与体积重量（新增色值需要照抄第一个色值）
  // ---------------- SKU 信息：申报价格 / SKU分类
  function skuInfoTable() {
    const tables = [...document.querySelectorAll('table')].filter((t) => (t.innerText || '').includes('申报价格'));
    return tables.pop() || null;
  }

  function parseSkuRow(tr) {
    const tds = [...tr.querySelectorAll('td')];
    const hasColor = tds.length >= 8;
    const colorCell = hasColor ? tds[0] : null;
    const sizeCell = hasColor ? tds[1] : tds[0];
    const stockCell = hasColor ? tds[4] : tds[3];
    const priceCell = hasColor ? tds[3] : tds[2];
    const catCell = hasColor ? tds[5] : tds[4];
    const codeCell = hasColor ? tds[7] : tds[6];
    const packItem = catCell
      ? catCell.querySelector('[id$=".productSkuMultiPack.packIncludeInfo"]')
      : null;
    const priceItems = priceCell
      ? [...priceCell.querySelectorAll('[data-testid="beast-core-form-item"]')]
        .filter((el) => /\.siteSupplierPriceMap\./.test(el.id || ''))
        .map((el) => ({
          formId: el.id,
          site: (el.id || '').split('.').pop(),
          input: el.querySelector('input'),
        }))
      : [];
    return {
      tr,
      hasColor,
      color: colorCell ? (colorCell.innerText || '').trim() : null,
      size: sizeCell ? (sizeCell.innerText || '').trim() : '',
      priceInputs: priceCell ? [...priceCell.querySelectorAll('input')] : [],
      priceItems,
      stockCell,
      stockText: stockCell ? (stockCell.innerText || '').replace(/\s+/g, ' ').trim() : '',
      catInput: catCell ? catCell.querySelector('input') : null,
      catText: catCell ? (catCell.innerText || '').replace(/\s+/g, ' ').trim() : '',
      packInput: packItem ? packItem.querySelector('input[placeholder="请输入"]') : null,
      codeInput: codeCell ? codeCell.querySelector('input') : null,
    };
  }

  /** 库存：点行内铅笔 -> “填写库存”弹窗 -> 当前库存 -> 批量填写 -> 确认 */
  async function setStockForRow(tr, value) {
    const tds = [...tr.querySelectorAll('td')];
    const hasColor = tds.length >= 8;
    const stockCell = hasColor ? tds[4] : tds[3];
    const icon = stockCell ? stockCell.querySelector('[data-testid=beast-core-icon-edit]') : null;
    if (!icon) throw new Error('找不到库存编辑图标');
    await realClick(icon);
    const findDlg = () => allVisible(document).find((el) => /MDL_innerWrapper/.test(el.className || '')
      && (el.innerText || '').includes('填写库存'));
    let dlg = await waitFor(findDlg, { timeout: 20000, desc: '库存弹窗' });
    // 弹窗打开后会先转圈加载仓库/库存数据，等遮罩消失再操作
    const loadingMask = () => allVisible(document).some((el) => /spinningMask|Spn_spinningMask/.test(el.className || ''));
    await waitFor(() => !loadingMask(), { timeout: 25000, desc: '库存弹窗加载完成' }).catch(() => {});
    await sleep(500);
    const input = [...dlg.querySelectorAll('input')].find((el) => el.placeholder === '请输入');
    if (!input) throw new Error('库存弹窗里没有输入框');
    input.focus();
    await setInput(input, String(value), { settle: 100 });
    await commitInput(input, 80);
    await sleep(200);
    const batch = [...dlg.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '批量填写');
    if (batch) {
      await waitFor(() => !loadingMask(), { timeout: 15000 }).catch(() => {});
      await realClick(batch);
      await sleep(1200);
    }
    // 点确认；若弹窗没关（偶发），再点一次
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ok = [...dlg.querySelectorAll('button')].find((el) => (el.innerText || '').trim() === '确认');
      if (!ok) break;
      await realClick(ok);
      await sleep(1200);
      if (!findDlg()) break;
      dlg = findDlg();
    }
    await waitFor(() => !findDlg(), { timeout: 15000, desc: '库存弹窗关闭' });
    await sleep(300);
  }

  async function pickSkuCategory(input, text) {
    await deepScrollIntoView(input, 0.7);
    await sleep(80);
    await trustedClick(input);
    await sleep(220);
    const pops = allVisible(document).filter((el) => /dropdownPanel|dropdownMain/.test(el.className || '')
      && el.getBoundingClientRect().height > 20 && (el.innerText || '').includes(text));
    for (const pop of pops.reverse()) {
      // 选项是「标题 + 描述」的整行（li），不是单独文字节点
      const opt = [...pop.querySelectorAll('li, [class*=item], [class*=Item]')]
        .filter((e) => {
          const t = (e.innerText || '').replace(/\s+/g, ' ').trim();
          return t.startsWith(text) && e.getBoundingClientRect().height > 10;
        })
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
      if (opt) {
        await trustedClick(opt);
        await sleep(120);
        await pressEscape();
        return;
      }
    }
    await pressEscape();
    throw new Error(`SKU分类下拉里找不到「${text}」`);
  }

  function readSkuRows() {
    const table = skuInfoTable();
    if (!table) return [];
    const rows = [...table.querySelectorAll('tbody tr')]
      .filter((tr) => tr.querySelectorAll('td').length).map(parseSkuRow);
    let color = null;
    rows.forEach((r) => {
      if (r.hasColor) color = r.color;
      r.groupColor = color;
    });
    return rows;
  }

  function skuRowKey(r) {
    return `${r.groupColor || ''}\u0000${r.size || ''}`;
  }

  function findSkuRow(rows, color, size) {
    return rows.find((r) => r.groupColor === color && r.size === size) || null;
  }

  function clonePriceBase(rows, firstColor) {
    const base = {};
    rows.filter((r) => r.groupColor === firstColor).forEach((r) => {
      base[r.size] = Object.fromEntries(
        r.priceItems.map((p) => [p.site, p.input ? p.input.value : '']),
      );
    });
    return base;
  }

  /** 按「尺码 + 站点」从混合色逐项复制，避免把混合色已核价的价格改成统一 300。 */
  async function fillSkuPricesFromBase(firstColor, fallbackPrice) {
    let rows = readSkuRows();
    const base = clonePriceBase(rows, firstColor);
    if (!Object.keys(base).length) throw new Error('取不到混合色申报价格基准');
    let changed = 0;
    for (let pass = 0; pass < 4; pass += 1) {
      rows = readSkuRows();
      let pending = 0;
      for (const r of rows) {
        assertRunning();
        if (r.groupColor === firstColor) continue;
        const expected = base[r.size] || {};
        let rowPending = 0;
        for (const item of r.priceItems) {
          const target = expected[item.site] || fallbackPrice;
          const liveItem = document.getElementById(item.formId);
          const liveInput = liveItem && liveItem.querySelector('input');
          if (!liveInput || !target || liveInput.value === target) continue;
          setInputQuick(liveInput, target);
          rowPending += 1;
        }
        if (rowPending) {
          pending += rowPending;
          await sleep(25);
        }
      }
      await sleep(500);
      changed += pending;
      rows = readSkuRows();
      const remaining = rows.filter((r) => r.groupColor !== firstColor).reduce((sum, r) => {
        const expected = base[r.size] || {};
        return sum + r.priceItems.filter((p) => {
          const target = expected[p.site] || fallbackPrice;
          return !p.input || !p.input.value || (target && p.input.value !== target);
        }).length;
      }, 0);
      if (!remaining) {
        log(`申报价格已按混合色逐站点沿用（写入 ${changed} 项）`);
        return changed;
      }
      log(`申报价格第 ${pass + 1} 轮后仍有 ${remaining} 项未落盘`);
    }
    throw new Error('申报价格未能全部沿用混合色，请检查站点价格输入框');
  }

  /** 用 SKU 信息区自带的批量工具设置 SKU 分类，只选中新增色值。 */
  async function tryBatchSkuCategory(firstColor, wantCat) {
    const table = skuInfoTable();
    if (!table) return false;
    const section = batchRoot(table);
    if (!section) return false;
    try {
      await selectBatchScope(section.root, batchNewColors());
      let live = batchRoot(skuInfoTable());
      const outer = [...live.root.querySelectorAll('[data-testid="beast-core-select"]')]
        .find((el) => el.querySelector('input[readonly]')?.placeholder === 'SKU分类' && visible(el));
      if (!outer) throw new Error('SKU 批量工具栏没有 SKU分类');
      await trustedClick(outer.querySelector('input[readonly]'));
      const panel = await waitFor(() => [...document.querySelectorAll('[data-testid="beast-core-portal"]')]
        .filter(visible).find((el) => /sku-category-input-panel/.test(el.innerHTML)
          && (el.querySelector('input') || {}).placeholder === '请选择SKU分类'),
      { timeout: 6000, desc: 'SKU分类批量面板' });
      const inner = [...panel.querySelectorAll('input')]
        .find((el) => el.placeholder === '请选择SKU分类');
      await trustedClick(inner);
      const options = await waitFor(() => [...document.querySelectorAll('[data-testid="beast-core-portal"]')]
        .filter(visible).find((el) => el !== panel && (el.innerText || '').includes(wantCat)),
      { timeout: 6000, desc: 'SKU分类批量选项' });
      const option = [...options.querySelectorAll('li,[role="option"]')]
        .find((el) => (el.innerText || '').replace(/\s+/g, ' ').trim().startsWith(wantCat)
          && visible(el));
      if (!option) throw new Error(`SKU分类批量选项找不到 ${wantCat}`);
      await trustedClick(option);
      await sleep(300);
      live = batchRoot(skuInfoTable());
      if (live.button.disabled || /disabled/.test(live.button.className || '')) {
        throw new Error('SKU分类批量按钮未启用');
      }
      await trustedClick(live.button);
      await waitFor(() => {
        const rows = readSkuRows().filter((r) => r.groupColor !== firstColor);
        return rows.length && rows.every((r) => (r.catText || '').includes(wantCat));
      }, { timeout: 12000, interval: 400, desc: `SKU分类批量写入 ${wantCat}` });
      log(`SKU分类已使用平台批量填写：全部新增色值 → ${wantCat}`);
      return readSkuRows().filter((r) => r.groupColor !== firstColor).length;
    } catch (err) {
      log(`SKU分类批量填写不可用，改用逐行补齐：${err.message}`, 'error');
      await pressEscape();
      return false;
    }
  }

  async function fillSkuCategories(firstColor, wantCat) {
    let changed = 0;
    for (let pass = 0; pass < 5; pass += 1) {
      let rows = readSkuRows();
      const pending = rows.filter((r) => r.groupColor !== firstColor
        && !(r.catText || '').includes(wantCat));
      if (!pending.length) {
        if (wantCat) log(`SKU分类已全部设为「${wantCat}」`);
        return changed;
      }
      for (const snapshot of pending) {
        assertRunning();
        rows = readSkuRows();
        const r = findSkuRow(rows, snapshot.groupColor, snapshot.size);
        if (!r || !r.catInput || (r.catText || '').includes(wantCat)) continue;
        try {
          await pickSkuCategory(r.catInput, wantCat);
          await waitFor(() => {
            const now = findSkuRow(readSkuRows(), snapshot.groupColor, snapshot.size);
            return now && (now.catText || '').includes(wantCat);
          }, { timeout: 7000, interval: 300, desc: `SKU分类写入 ${snapshot.groupColor}/${snapshot.size}` });
          changed += 1;
        } catch (err) {
          log(`SKU分类写入失败（${snapshot.groupColor}/${snapshot.size}）：${err.message}`, 'error');
          await pressEscape();
          await sleep(500);
        }
      }
      await sleep(500);
    }
    const left = readSkuRows().filter((r) => r.groupColor !== firstColor
      && !(r.catText || '').includes(wantCat)).length;
    if (left) throw new Error(`SKU分类仍有 ${left} 行未设置`);
    return changed;
  }

  async function fillSkuCodes(firstColor, codeBase, mode) {
    let changed = 0;
    for (let pass = 0; pass < 4; pass += 1) {
      const snapshots = readSkuRows();
      let pending = 0;
      for (const snapshot of snapshots) {
        assertRunning();
        if (snapshot.groupColor === firstColor) continue;
        const r = findSkuRow(readSkuRows(), snapshot.groupColor, snapshot.size);
        if (!r || !r.codeInput) continue;
        if (mode === 'random' && r.codeInput.value) continue;
        const target = mode === 'random'
          ? `${codeBase}-s-${100 + Math.floor(Math.random() * 900)}`
          : codeBase;
        if (r.codeInput.value === target) continue;
        await setInputCommitted(r.codeInput, target, { settle: 20 });
        pending += 1;
      }
      changed += pending;
      await sleep(300);
      const left = readSkuRows().filter((r) => r.groupColor !== firstColor
        && r.codeInput && !r.codeInput.value).length;
      if (!left) {
        log(`SKU货号已补齐（${mode === 'random' ? '含随机后缀' : '全部相同'}）`);
        return changed;
      }
    }
    throw new Error('SKU货号仍有空值');
  }

  /** 新增“单品”SKU 的“共计内含”必须为 1，否则平台会要求进入商品信息确认。 */
  async function fillSkuPackIncludes(firstColor) {
    let changed = 0;
    for (let pass = 0; pass < 4; pass += 1) {
      const snapshots = readSkuRows();
      let pending = 0;
      for (const snapshot of snapshots) {
        assertRunning();
        if (snapshot.groupColor === firstColor) continue;
        const r = findSkuRow(readSkuRows(), snapshot.groupColor, snapshot.size);
        if (!r || !r.packInput || r.packInput.disabled || r.packInput.value) continue;
        await setInputCommitted(r.packInput, '1', { settle: 20 });
        pending += 1;
      }
      changed += pending;
      await sleep(300);
      const left = readSkuRows().filter((r) => r.groupColor !== firstColor
        && r.packInput && !r.packInput.disabled && !r.packInput.value).length;
      if (!left) {
        log('SKU“共计内含”已补齐为 1 件');
        return changed;
      }
    }
    throw new Error('SKU“共计内含”仍有空值');
  }

  /** 库存弹窗会带动整组尺码；每个颜色只开一次，只有平台没有整组带上时才逐行补。 */
  async function fillSkuStocks(firstColor, stockVal) {
    let changed = 0;
    for (let pass = 0; pass < 30; pass += 1) {
      const rows = readSkuRows();
      const missing = rows.filter((r) => r.groupColor !== firstColor
        && (!(r.stockText || '').trim() || r.stockText.trim() === '-'));
      if (!missing.length) {
        if (changed) log(`库存已补齐为 ${stockVal}`);
        return changed;
      }
      const colors = [...new Set(missing.map((r) => r.groupColor))];
      const color = colors[0];
      const first = missing.find((r) => r.groupColor === color);
      try {
        await setStockForRow(first.tr, stockVal);
        changed += 1;
      } catch (err) {
        log(`库存写入失败（${color}/${first.size}）：${err.message}`, 'error');
        await pressEscape();
        await sleep(600);
      }
      await sleep(500);
    }
    const left = readSkuRows().filter((r) => r.groupColor !== firstColor
      && (!(r.stockText || '').trim() || r.stockText.trim() === '-')).length;
    if (left) throw new Error(`库存仍有 ${left} 行为空`);
    return changed;
  }

  async function fillSkuInfo() {
    const table = skuInfoTable();
    if (!table) {
      log('没找到 SKU 信息表，跳过');
      return 0;
    }
    const rows = readSkuRows();
    if (!rows.length) throw new Error('SKU 信息表为空');
    const firstColor = rows[0].groupColor;
    const cfg = state.config || {};
    const fallbackPrice = String(cfg.declPrice || 300);
    const stockVal = String(cfg.stock || 500);
    const wantCat = (cfg.skuCategory || '单品').trim();
    const codeBase = (cfg.skuCodeBase || 'DWRG').trim();
    const codeMode = cfg.skuCodeMode || 'fixed';
    if (!codeBase) throw new Error('SKU货号必填');
    log(`SKU 信息：申报价沿用「${firstColor}」逐站点价格；库存 ${stockVal}；分类 ${wantCat}；货号 ${codeBase}`);
    let total = 0;
    total += await fillSkuPricesFromBase(firstColor, fallbackPrice);
    markSkuProgress('SKU 申报价已填写');
    const batchCategoryCount = await tryBatchSkuCategory(firstColor, wantCat);
    total += batchCategoryCount === false ? await fillSkuCategories(firstColor, wantCat) : batchCategoryCount;
    markSkuProgress('SKU 分类已填写');
    total += await fillSkuPackIncludes(firstColor);
    total += await fillSkuCodes(firstColor, codeBase, codeMode);
    markSkuProgress('SKU 货号已填写');
    total += await fillSkuStocks(firstColor, stockVal);
    markSkuProgress('SKU 库存已填写');
    log(`SKU 信息已逐项确认并补齐，共写入 ${total} 项`);
    return total;
  }

  function weightTable() {
    const tables = [...document.querySelectorAll('table')]
      .filter((t) => (t.innerText || '').includes('敏感属性'));
    return tables[tables.length - 1] || null;
  }

  /** 滚动到「敏感属性与体积重量」表格，方便人工接手 */
  async function scrollToWeightSection() {
    const t = weightTable();
    if (!t) return false;
    await deepScrollIntoView(t, 0.25);
    await sleep(500);
    return true;
  }

  function weightRows() {
    const t = weightTable();
    if (!t) return [];
    return [...t.querySelectorAll('tbody tr')].filter((tr) => tr.querySelectorAll('td').length);
  }

  /** 解析一行：拿到颜色/尺码/敏感属性/体积/重量，以及是否可编辑 */
  function parseWeightRow(tr) {
    const tds = [...tr.querySelectorAll('td')];
    const hasColor = tds.length >= 5;                 // 分组首行才带「颜色」列
    const colorCell = hasColor ? tds[0] : null;
    const sizeCell = hasColor ? tds[1] : tds[0];
    const sensCell = hasColor ? tds[2] : tds[1];
    const dimCell = hasColor ? tds[3] : tds[2];
    const weightCell = hasColor ? tds[4] : tds[3];
    const sensInput = sensCell ? sensCell.querySelector('input') : null;
    return {
      hasColor,
      color: hasColor ? (colorCell.innerText || '').trim() : null,
      size: sizeCell ? (sizeCell.innerText || '').trim() : '',
      sensText: sensCell ? (sensCell.innerText || '').trim() : '',
      sensInput,
      sensEditable: sensInput ? !sensInput.disabled : false,
      dimInputs: dimCell ? [...dimCell.querySelectorAll('input')] : [],
      weightInputs: weightCell ? [...weightCell.querySelectorAll('input')] : [],
    };
  }

  /** 在敏感属性下拉里选一个选项（如“否”） */
  function sensitiveDropdown() {
    return allVisible(document).filter((el) => /dropdownPanel|dropdownMain|sensitive-attr-input-pan/.test(el.className || '')
      && (el.innerText || '').includes('是否敏感品')
      && el.getBoundingClientRect().height > 20).pop() || null;
  }

  async function pickSensitiveOption(input, text) {
    // 这个下拉是“向上弹出”的固定弹层：打开前先把输入框放到视口中部。
    const ratios = [0.65, 0.8];
    let lastRect = null;
    for (let attempt = 0; attempt < ratios.length; attempt += 1) {
      assertRunning();
      await deepScrollIntoView(input, ratios[attempt]);
      try {
        await trustedClick(input);
      } catch (err) {
        const ir = input.getBoundingClientRect();
        await clickAt(ir.left + ir.width / 2, ir.top + ir.height / 2);
      }
      await sleep(320);
      const pop = sensitiveDropdown();
      if (!pop) {
        await pressEscape();
        await sleep(180);
        continue;
      }
      const opt = [...pop.querySelectorAll('*')]
        .filter((el) => el.children.length === 0 && (el.innerText || '').trim() === text
          && el.getBoundingClientRect().height > 0)
        .pop();
      if (!opt) {
        await pressEscape();
        await sleep(180);
        continue;
      }
      const orect = opt.getBoundingClientRect();
      lastRect = orect;
      if (orect.top >= 4 && orect.bottom <= window.innerHeight - 4) {
        try {
          await trustedClick(opt);
        } catch (err) {
          await clickAt(orect.left + orect.width / 2, orect.top + orect.height / 2);
          const o = { bubbles: true, cancelable: true, clientX: orect.left + orect.width / 2,
            clientY: orect.top + orect.height / 2 };
          opt.dispatchEvent(new MouseEvent('mousedown', o));
          opt.dispatchEvent(new MouseEvent('mouseup', o));
          opt.dispatchEvent(new MouseEvent('click', o));
        }
        await sleep(180);
        // 强制确认下拉已收起：否则下一行的点击会落在还开着的下拉上（隔行失败的主因）
        for (let k = 0; k < 3; k += 1) {
          if (!sensitiveDropdown()) break;
          await pressEscape();
          await sleep(200);
          if (sensitiveDropdown()) {
            const t = weightTable();
            if (t) {
              const tr = t.getBoundingClientRect();
              await clickAt(tr.left + 40, tr.top + 20);
            }
            await sleep(250);
          }
        }
        return;
      }
      // 选项跑到视口外：不再硬性要求可见，直接对元素派发点击（React 只看事件，不看可见性）
      log(`「${text}」选项不在视口内（y=${Math.round(orect.top)}），直接对元素派发点击`);
      try {
        opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        opt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        opt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        opt.click && opt.click();
        await sleep(350);
        await pressEscape();
        await sleep(180);
        return;
      } catch (err) {
        log(`直接派发点击失败：${err.message}`, 'error');
      }
      await pressEscape();
      await sleep(220);
    }
    throw new Error(`敏感属性选项「${text}」始终不可见（最后一次 y=${lastRect ? Math.round(lastRect.top) : '?'}）`);
  }

  function sectionButton(table, text) {
    let node = table;
    for (let depth = 0; depth < 9 && node; depth += 1, node = node.parentElement) {
      const btn = [...node.querySelectorAll('button,a')]
        .find((el) => (el.innerText || '').trim() === text && visible(el));
      if (btn) return btn;
    }
    return null;
  }

  function batchRoot(table) {
    let node = table;
    for (let depth = 0; depth < 9 && node; depth += 1, node = node.parentElement) {
      const btn = [...node.querySelectorAll('button')]
        .find((el) => (el.innerText || '').trim() === '批量填写' && visible(el));
      if (btn) return { root: node, button: btn };
    }
    return null;
  }

  function batchNewColors() {
    return Array.from({ length: state.config.n }, (_, i) => `Mixed Color${i + 2}`);
  }

  async function selectBatchScope(root, colors) {
    const select = [...root.querySelectorAll('[data-testid="beast-core-select"]')]
      .find((el) => {
        const input = el.querySelector('input[readonly]');
        return visible(el) && input && input.placeholder === 'SKU';
      });
    if (!select) throw new Error('批量工具栏没有 SKU 范围选择');
    const input = select.querySelector('input[readonly]');
    await trustedClick(input);
    const portal = await waitFor(() => [...document.querySelectorAll('[data-testid="beast-core-portal"]')]
      .filter(visible).find((el) => (el.innerText || '').includes('颜色')
        && (el.innerText || '').includes(colors[colors.length - 1])),
    { timeout: 6000, desc: '批量 SKU 范围面板' });
    for (const color of colors) {
      const label = [...portal.querySelectorAll('label[data-testid="beast-core-checkbox"]')]
        .find((el) => (el.innerText || '').trim() === color);
      if (!label) throw new Error(`批量范围找不到色值 ${color}`);
      if (label.dataset.checked !== 'true') await trustedClick(label);
      await sleep(120);
    }
    if ((portal.innerText || '').includes('尺码')) {
      const all = [...portal.querySelectorAll('label[data-testid="beast-core-checkbox"]')]
        .filter((el) => (el.innerText || '').trim() === '全选');
      if (all.length) await trustedClick(all[all.length - 1]);
    }
    await sleep(250);
  }

  async function setBatchSensitiveValue(root, value) {
    const select = [...root.querySelectorAll('[data-testid="beast-core-select"]')]
      .find((el) => el.querySelector('input[readonly]')?.placeholder === '敏感属性' && visible(el));
    if (!select) throw new Error('批量工具栏没有敏感属性字段');
    await trustedClick(select.querySelector('input[readonly]'));
    const portal = await waitFor(() => [...document.querySelectorAll('[data-testid="beast-core-portal"]')]
      .filter(visible).find((el) => (el.innerText || '').includes('是否敏感品')),
    { timeout: 5000, desc: '敏感属性批量下拉' });
    const option = [...portal.querySelectorAll('*')]
      .filter((el) => el.children.length === 0 && (el.innerText || '').trim() === value
        && visible(el)).pop();
    if (!option) throw new Error(`敏感属性批量下拉找不到 ${value}`);
    await trustedClick(option);
    await sleep(200);
  }

  async function setBatchVolumeWeight(root, cfg) {
    const select = [...root.querySelectorAll('[data-testid="beast-core-select"]')]
      .find((el) => el.querySelector('input[readonly]')?.placeholder === '体积重量' && visible(el));
    if (!select) throw new Error('批量工具栏没有体积重量字段');
    await trustedClick(select.querySelector('input[readonly]'));
    const portal = await waitFor(() => [...document.querySelectorAll('[data-testid="beast-core-portal"]')]
      .filter(visible).find((el) => (el.innerText || '').includes('最长边')
        && (el.innerText || '').includes('重量')),
    { timeout: 5000, desc: '体积重量批量面板' });
    const inputs = [...portal.querySelectorAll('input')].filter((el) => !el.disabled && visible(el));
    if (inputs.length < 4) throw new Error('体积重量批量面板字段不足');
    setInputQuick(inputs[0], cfg.dimL);
    setInputQuick(inputs[1], cfg.dimM);
    setInputQuick(inputs[2], cfg.dimS);
    setInputQuick(inputs[3], cfg.weight);
    await sleep(250);
  }

  async function tryBatchSensitiveFill() {
    const table = weightTable();
    if (!table) return false;
    const section = batchRoot(table);
    if (!section) return false;
    const colors = batchNewColors();
    try {
      await selectBatchScope(section.root, colors);
      let live = batchRoot(weightTable());
      await setBatchSensitiveValue(live.root, state.config.sens || '否');
      live = batchRoot(weightTable());
      await setBatchVolumeWeight(live.root, state.config);
      live = batchRoot(weightTable());
      if (live.button.disabled || /disabled/.test(live.button.className || '')) {
        throw new Error('批量填写按钮未启用');
      }
      await trustedClick(live.button);
      await sleep(800);
      const pending = weightRows().map(parseWeightRow).filter((r) => r.sensEditable
        && (!(r.sensText || '').trim() || !r.dimInputs[0]?.value || !r.weightInputs[0]?.value));
      if (pending.length) throw new Error(`批量填写后仍有 ${pending.length} 行未完成`);
      log('敏感属性/体积重量已使用平台“批量填写”一次完成');
      markSkuProgress('敏感属性/体积重量批量填写完成');
      return true;
    } catch (err) {
      if (err && (err.code === 'IMAGE_QUALITY_REJECTED' || /图片品质不合规|图片品质不佳/.test(err.message || ''))) {
        await pressEscape();
        throw err;
      }
      log(`平台批量填写不可用，改用逐行快速补齐：${err.message}`, 'error');
      await pressEscape();
      return false;
    }
  }

  /** 把所有新增色值的「敏感属性/体积/重量」照抄第一个色值（按尺码对应） */
  async function fillSensitiveAndWeight() {
    let rows = weightRows().map(parseWeightRow);
    if (!rows.length) {
      log('没找到「敏感属性与体积重量」表格，跳过');
      return 0;
    }
    // 同色值只有第一行带「颜色」单元格，其余行要继承分组颜色
    let groupColor = null;
    rows.forEach((r) => {
      if (r.hasColor) groupColor = r.color;
      r.groupColor = groupColor;
    });
    const firstColor = rows[0].groupColor;
    // 基准只存“值”，不存元素引用（表格会因 React 重渲染而失效）
    const cfg = state.config || {};
    const uniformSens = (cfg.sens || '').trim();
    const uniformDims = [cfg.dimL, cfg.dimM, cfg.dimS].map((v) => (v ? String(v) : ''));
    const uniformWeight = cfg.weight ? String(cfg.weight) : '';
    const base = {};
    rows.filter((r) => r.groupColor === firstColor).forEach((r) => {
      base[r.size] = {
        sensText: uniformSens || (r.sensText || '否').trim(),
        dims: uniformDims[0] ? uniformDims : r.dimInputs.map((x) => x.value),
        weight: uniformWeight || (r.weightInputs[0] ? r.weightInputs[0].value : ''),
      };
    });
    if (!Object.keys(base).length) {
      log('取不到第一个色值的体积重量基准，跳过');
      return 0;
    }
    log(`体积重量基准：${Object.keys(base).join('/')}（来自 ${firstColor}）`);
    if (await tryBatchSensitiveFill()) {
      return rows.filter((r) => r.sensEditable).length;
    }

    let filled = 0;
    // 平台表格存在“隔一行写不进去、稍后才渲染”的现象：多做几轮补齐
    for (let pass = 0; pass < 3; pass += 1) {
      const fresh0 = weightRows().map(parseWeightRow);
      let gc0 = null;
      fresh0.forEach((x) => { if (x.hasColor) gc0 = x.color; x.groupColor = gc0; });
      const pending = fresh0.filter((r) => r.sensEditable
        && (!(r.sensText || '').trim() || !r.dimInputs.length || !r.dimInputs[0].value
          || !r.weightInputs.length || !r.weightInputs[0].value));
      if (!pending.length) break;
      log(`体积重量第 ${pass + 1} 轮：还有 ${pending.length} 行待填`);
      const rowCount = fresh0.length;
      for (let idx = 0; idx < rowCount; idx += 1) {
      assertRunning();
      // 每行都重新解析，避免 React 重渲染后引用失效
      const fresh = weightRows().map(parseWeightRow);
      let gc = null;
      fresh.forEach((x) => { if (x.hasColor) gc = x.color; x.groupColor = gc; });
      const r = fresh[idx];
      if (!r) continue;
      const sizeKey = r.size;
      const b = base[sizeKey];
      if (!r.sensEditable) continue;            // 原色值行是禁用的，不碰
      if (!b) {
        log(`第 ${sizeKey} 码在第一个色值里找不到对应行，跳过`);
        continue;
      }

      // 敏感属性
      const sensTarget = b.sensText;
      if (sensTarget && !(r.sensText || '').includes(sensTarget)) {
        try {
          await pickSensitiveOption(r.sensInput, sensTarget);
          await waitFor(() => {
            const again = weightRows().map(parseWeightRow)[idx];
            return again && (again.sensText || '').includes(sensTarget);
          },
            { timeout: 8000, interval: 400, desc: `敏感属性写入 ${sensTarget}` });
        } catch (err) {
          log(`敏感属性写入失败（尺码 ${sizeKey}）：${err.message}`, 'error');
        }
      }

      // 体积 / 重量：写入前再查一次最新元素
      const fresh2 = weightRows().map(parseWeightRow)[idx];
      if (fresh2) {
        let changedInputs = 0;
        for (let i = 0; i < fresh2.dimInputs.length && i < b.dims.length; i += 1) {
          if (b.dims[i] && fresh2.dimInputs[i].value !== b.dims[i]) {
            setInputQuick(fresh2.dimInputs[i], b.dims[i]);
            changedInputs += 1;
          }
        }
        if (b.weight && fresh2.weightInputs[0] && fresh2.weightInputs[0].value !== b.weight) {
          setInputQuick(fresh2.weightInputs[0], b.weight);
          changedInputs += 1;
        }
        if (changedInputs) await sleep(25);
      }
      filled += 1;
      }
      await sleep(1200);
    }
    log(`敏感属性/体积重量已照抄第一个色值，共处理 ${filled} 行`);
    return filled;
  }

  async function submitProduct() {
    const problems = preflightCheck(state.config.n);
    if (problems.length) throw new Error('提交前自检未通过：' + problems.join('；'));
    if (state.config.dryRun) {
      log('【演练模式】跳过提交；页面保留原状，可人工检查后关闭标签页');
      return { ok: true, dryRun: true };
    }
    // 提交前先关掉可能残留的素材中心弹窗（它会盖住底部的提交按钮）
    try {
      if (materialDialog()) {
        log('提交前关闭残留的素材中心弹窗');
        await closeMaterialDialog();
      }
    } catch (err) {
      log('关闭素材中心弹窗失败：' + err.message, 'error');
    }
    const btn = await waitFor(() => [...document.querySelectorAll('button')]
      .find((b) => visible(b) && (b.innerText || '').trim() === '提交'), { desc: '提交按钮' });
    await waitFor(() => {
      const live = [...document.querySelectorAll('button')]
        .find((b) => visible(b) && (b.innerText || '').trim() === '提交') || btn;
      return live && !live.disabled
        && live.getAttribute('aria-disabled') !== 'true'
        && !/BTN_disabled/.test(live.className || '');
    }, { timeout: 30000, desc: '提交按钮可用' });
    await sleep(600);
    state.submitAttempt = {
      skc: activeSkcs()[state.cursor],
      spu: state.current && state.current.spu,
      queryType: state.queryType || 'SKC',
      expectedColors: state.config.n + 1,
      at: Date.now(),
    };
    await saveState();
    await trustedClick(btn);
    log('已点击提交，等待平台反馈…');
    let lastErrorText = '';
    let pendingConfirmAt = 0;
    let pendingClicked = false;
    for (let i = 0; i < 40; i += 1) {
      await sleep(1500);
      // 复色商品提交后可能出现「当前存在异常，确认录入」：
      // 这是可继续提交的风险提示，不是必填校验失败。
      const anomaly = allVisible(document).find((el) => /MDL_innerWrapper/.test(el.className || '')
        && /当前存在|异常，确认录入/.test(el.innerText || '')
        && /继续提交|再检查/.test(el.innerText || ''));
      if (anomaly) {
        const proceed = allVisible(anomaly)
          .filter((e) => ['没问题继续提交', '继续提交', '仍要提交'].includes((e.innerText || '').trim()))
          .pop();
        if (proceed) {
          log('平台提示复色品价格风险，按确认规则选择“没问题继续提交”');
          await trustedClick(clickable(proceed));
          markSkuProgress('已处理价格风险弹窗');
          await sleep(2500);
          continue;
        }
      }
      // 异常确认后的第二层：进入“商品信息待确认”。只在目标弹窗内找按钮。
      const pendingConfirm = allVisible(document).find((el) => /MDL_innerWrapper/.test(el.className || '')
        && /存在商品信息待确认/.test(el.innerText || ''));
      if (pendingConfirm) {
        const go = allVisible(pendingConfirm)
          .filter((e) => (e.innerText || '').trim() === '去确认')
          .pop();
        if (go) {
          if (pendingClicked) {
            return { ok: false, message: '商品信息待确认：再次确认后仍未进入下一步，请人工检查' };
          }
          log('平台要求确认商品信息，点击“去确认”');
          await trustedClick(clickable(go));
          markSkuProgress('已点击商品信息去确认');
          pendingConfirmAt = Date.now();
          pendingClicked = true;
          await sleep(1800);
          const confirmTab = await findConfirmTab(state.current && state.current.spu);
          if (confirmTab && confirmTab.ok && confirmTab.url) {
            state.phase = 'CONFIRM_INFO';
            state.submitAttempt = {
              ...(state.submitAttempt || {}),
              skc: activeSkcs()[state.cursor],
              spu: state.current && state.current.spu,
              stage: 'confirm-info',
            };
            await setSkcStatus(activeSkcs()[state.cursor], '待确认商品信息');
            await saveState();
            log(`已进入商品信息确认页：${confirmTab.url}`);
            await closeExtraTab(confirmTab.tabId).catch(() => {});
            await safeNavigate(botUrl(confirmTab.url));
            await new Promise(() => {});
          }
          await sleep(1200);
          continue;
        }
      }
      const modal = allVisible(document).find((el) => /MDL_innerWrapper/.test(el.className || '')
        && /确认|确定/.test(el.innerText || ''));
      if (modal) {
        const ok = allVisible(modal).filter((e) => ['确认', '确定'].includes((e.innerText || '').trim())).pop();
        if (ok) {
          await realClick(clickable(ok));
          markSkuProgress('已处理提交二次确认');
          log('点击了提交二次确认');
          await sleep(2000);
          continue;
        }
      }
      const text = document.body.innerText;
      if (/提交成功|保存成功|修改成功|操作成功|本次提交修改的内容/.test(text)) {
        state.submitAttempt = null;
        await saveState();
        return { ok: true };
      }
      if (!location.pathname.includes('/goods/edit')) return { ok: true, navigated: true };
      // 记录平台给出的任何红色提示/Toast（提交失败时通常只闪一下）
      const toast = allVisible(document)
        .filter((el) => /toast|message|alert|error/i.test(el.className || '')
          && el.getBoundingClientRect().height > 0
          && (el.innerText || '').trim().length > 2)
        .map((el) => (el.innerText || '').replace(/\s+/g, ' ').trim())
        .filter((t) => t.length < 120 && /失败|错误|不能|请|必填|不通过|无效/.test(t))
        .filter((t) => !/商品不合规|商品资质|实拍图|影响售卖/.test(t));
      if (toast.length) {
        lastErrorText = toast[toast.length - 1];
        log('平台提示：' + lastErrorText, 'error');
      }
      const fieldErrors = [...new Set(
        [...document.querySelectorAll('.Form_itemError_5-123-0')]
          .filter(visible)
          .map((el) => (el.innerText || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean),
      )];
      if (fieldErrors.length) {
        lastErrorText = fieldErrors.join('；');
        log('平台字段校验：' + lastErrorText, 'error');
        if (i >= 2) return { ok: false, uncertain: false, message: lastErrorText };
      }
      if (/提交失败|保存失败|校验失败|请填写|不通过/.test(text)
        && Date.now() - pendingConfirmAt > 10000) {
        return {
          ok: false,
          uncertain: false,
          message: lastErrorText || (text.match(/[^\n]*(?:失败|不通过)[^\n]*/) || ['提交失败'])[0],
        };
      }
      if (pendingClicked && Date.now() - pendingConfirmAt > 10000) {
        return {
          ok: false,
          uncertain: true,
          message: '商品信息待确认：点击“去确认”后未识别到可填写项，需要回列表核对',
        };
      }
    }
    return {
      ok: false,
      uncertain: true,
      message: '页面未给出明确提交结果' + (lastErrorText ? '（平台提示：' + lastErrorText + '）' : ''),
    };
  }

  async function stepEdit() {
    const cfg = state.config;
    const skc = activeSkcs()[state.cursor];
    const win = await ensureWindowSize();
    if (win && win.ok) {
      log(win.resized ? `已把窗口调整为 ${win.width}×${win.height}，避免弹窗按钮被裁掉` : '窗口尺寸合适');
    } else {
      log('窗口尺寸检查失败（不影响继续）：' + (win ? win.error : '未知'), 'error');
    }
    await waitEditReady();

    const frontFiles = await dbGet(taskFileKey('frontFiles'));
    const backFiles = await dbGet(taskFileKey('backFiles'));
    if (!frontFiles || !frontFiles.length) throw new Error('没有导入主图文件夹');
    if (!backFiles || !backFiles.length) throw new Error('没有导入背面图文件夹');
    const assignedPlans = ensureImagePlan(frontFiles);
    if (assignedPlans) await saveState();
    const productPlan = state.imagePlan && state.imagePlan[skc];
    if (!productPlan || !Array.isArray(productPlan.frontNames)
      || productPlan.frontNames.length !== cfg.n) {
      throw new Error(`商品 ${skc} 没有完整的图片计划，请重新导入主图文件夹并保存准备`);
    }
    const plannedBackFiles = (productPlan.backNames || state.backPlanNames || []).slice(0, cfg.x)
      .map((name) => backFiles.find((file) => baseName(file.name) === name))
      .filter(Boolean);
    const backBatch = plannedBackFiles.length === cfg.x ? plannedBackFiles : backFiles.slice(0, cfg.x);
    if (backBatch.length !== cfg.x) {
      throw new Error(`背面图计划不完整：需要 ${cfg.x} 张，当前只有 ${backBatch.length} 张`);
    }
    if (!Array.isArray(productPlan.backNames) || productPlan.backNames.length !== cfg.x) {
      productPlan.backNames = backBatch.map((file) => baseName(file.name));
      state.backPlanNames = [...productPlan.backNames];
      Object.values(state.imagePlan || {}).forEach((plan) => { plan.backNames = [...state.backPlanNames]; });
      await saveState();
    }

    const base = specRows().length;
    log(`原始色值行 ${base} 行，需要新增 ${cfg.n} 行`);

    const imageAssignments = [];
    for (let i = 1; i <= cfg.n; i += 1) {
      assertRunning();
      const name = `Mixed Color${i + 1}`;
      const artNo = cfg.artNo.replace('{i}', String(i + 1));
      let idx = findRowIndexByColorName(name);
      if (idx >= 0) {
        log(`第 ${i} 个色值 ${name} 已存在，检查还缺什么`);
      } else {
        const reusable = findReusableEmptyRow();
        if (reusable >= 0) {
          idx = reusable;
          log(`复用已有的空色值行（第 ${idx + 1} 行）`);
        } else {
          await addColorRow(specRows().length + 1);
          idx = specRows().length - 1;
        }
      }
      // 不论是否续跑，都确保色值名和货号已填（这是上一版漏掉的地方）
      await setColorName(idx, name);
      await setArtNo(idx, artNo);
      markSkuProgress(`色值和货号 ${name}`);

      const renderedCount = await revealCarouselRow(idx, 1 + cfg.x);
      const confirmedCount = Number(state.current && state.current.confirmedImages
        && state.current.confirmedImages[name] || 0);
      const imageCount = Math.max(renderedCount, confirmedCount);
      if (imageCount < 1 + cfg.x) {
        if (imageCount > 0) {
          throw new Error(`第 ${idx + 1} 行已有 ${imageCount} 张图片但不足 ${1 + cfg.x} 张，请人工检查该色值`);
        }
        const plannedName = productPlan.frontNames[i - 1];
        const file = frontFiles.find((candidate) => baseName(candidate.name) === plannedName);
        if (!file) {
          throw new Error(`商品 ${skc} 的计划主图 ${plannedName} 不在本轮已准备文件中，请重新导入主图`);
        }
        imageAssignments.push({ rowIdx: idx, file });
      } else {
        state.current.confirmedImages = state.current.confirmedImages || {};
        state.current.confirmedImages[name] = imageCount;
      }
    }

    assertRunning();
    markSkuProgress('开始本商品批量上传图片');
    await attachImagesForProductBatch(imageAssignments, backBatch);
    await setSkcStatus(skc, '上传成功，正在填写商品信息');

    // 新增色值后，平台要求填写「敏感属性与体积重量」
    if (cfg.semiAuto) {
      // 半自动：滚到该区域，交给人工填写与提交
      await scrollToWeightSection();
      state.status = 'paused';
      state.manualStep = 'weights';
      state.error = '半自动：图片已全部完成。请手动照抄「敏感属性/体积重量」→ 点提交 → 再点「下一条商品」';
      await setSkcStatus(skc, '待人工提交');
      await saveState();
      renderStatus();
      log('⏸ 图片已全部完成，已滚到「敏感属性与体积重量」；请手工填写并提交，然后点「下一条商品」');
      return;
    }
    // 全自动模式：照抄第一个色值
    markSkuProgress('开始填写敏感属性和 SKU');
    await fillSensitiveAndWeight();
    await fillSkuInfo();
    await setSkcStatus(skc, '提交中');

    const res = await submitProduct();
    if (res.dryRun) {
      state.submitAttempt = null;
      state.status = 'paused';
      state.error = '演练模式已停在此处（未提交）';
      await setSkcStatus(skc, '演练成功（未提交）');
      await saveState();
      renderStatus();
      return;
    }
    if (res.ok === false && res.uncertain) {
      state.phase = 'LIST_SEARCH';
      state.status = 'running';
      state.error = null;
      await setSkcStatus(skc, `待确认：${res.message}，返回列表核对`);
      await saveState();
      log(`提交结果未明确，先返回列表核对，不自动重复提交：${res.message}`, 'error');
      await safeNavigate(botUrl(LIST_URL));
      return;
    }
    if (res.ok === false) throw new Error('提交失败：' + res.message);
    if (!res.ok) throw new Error('提交结果未确认：' + (res.message || '未知原因'));
    if (res.navigated) {
      state.phase = 'LIST_SEARCH';
      state.status = 'running';
      await setSkcStatus(skc, '待确认：提交后页面跳转，等待列表校验');
      await saveState();
      log('提交后页面跳转，保留提交尝试状态，返回列表核对');
      await safeNavigate(botUrl(LIST_URL));
      return;
    }
    state.submitAttempt = null;
    await saveState();
    await setSkcStatus(skc, '提交成功');
    log(`${state.queryType || 'SKC'} ${skc} 处理完成`);
    state.cursor += 1;
    state.retry = 0;
    state.current = null;
    if (state.cursor >= activeSkcs().length) {
      log(`货号任务 ${state.config.artNo} 的全部商品已处理完成`);
      await finishCurrentTaskAndStartNext();
      return;
    }
    state.phase = 'LIST_SEARCH';
    await saveState();
    await safeNavigate(botUrl(LIST_URL));
  }

  async function stepListSearch() {
    const skc = activeSkcs()[state.cursor];
    if (!skc) throw new Error(`${state.queryType || 'SKC'} 清单为空`);
    await setSkcStatus(skc, '查询中', { countAttempt: true });
    const existingStart = state.current && state.current.skc === skc
      ? Number(state.current.startedAt || 0) : 0;
    const now = Date.now();
    state.current = {
      skc, spu: null, startedAt: existingStart || now,
      lastProgressAt: now, lastProgress: '开始查询',
      confirmedImages: {},
    };
    state.skcTimedOut = false;
    state.timeoutNavigating = false;
    state.frontCursorStart = state.frontCursor;
    state.usedFrontStart = [...(state.usedFrontImages || [])];   // 重试时回滚，避免白耗主图
    await saveState();
    const { spu } = await listSearchProduct(skc, state.queryType || 'SKC');
    state.current.spu = spu;
    await setSkcStatus(skc, '已找到商品，准备编辑');
    state.phase = 'EDIT';
    await saveState();
    log('打开编辑页…');
    await safeNavigate(botUrl(EDIT_URL(spu)));
  }

  async function stepConfirmInfo() {
    const skc = activeSkcs()[state.cursor];
    const spu = state.current && state.current.spu;
    log(`处理商品信息待确认：${state.queryType || 'SKC'} ${skc}，SPU ${spu || '-'}`);
    await waitFor(() => (document.body.innerText || '').includes('商品信息待确认'),
      { timeout: 60000, desc: '商品信息待确认页面' });
    await dismissOverlays();
    const go = await waitFor(() => {
      const candidates = allVisible(document)
        .filter((el) => el.children.length === 0 && (el.innerText || '').trim() === '去确认');
      // “更新待确认”状态区里的去确认才会打开商品信息抽屉；
      // 右侧操作列的另一个“去确认”是普通商品状态操作，不能误点。
      return candidates.find((el) => {
        const statusBox = el.closest('[class*=newon-cofirm-render_container]')
          || el.closest('[class*=newon-cofirm-render_needConfirm]');
        return statusBox && (statusBox.innerText || '').includes('更新待确认');
      }) || null;
    }, { timeout: 30000, desc: '行级去确认' });
    const goLink = clickable(go);
    goLink.click();
    markSkuProgress('已点击行级去确认');
    await sleep(800);
    const drawer = await waitFor(() => allVisible(document)
      .find((el) => /Drawer_outerWrapper/.test(el.className || '')
        && (el.innerText || '').includes('确认商品信息')
        && (el.innerText || '').includes('确认商品信息并同意以上全部内容')),
    { timeout: 30000, desc: '商品信息确认抽屉' });
    log('已打开发起更新后的商品信息确认抽屉');
    markSkuProgress('已打开商品信息确认抽屉');
    const finalButton = await waitFor(() => [...drawer.querySelectorAll('button,a')]
      .find((el) => (el.innerText || '').replace(/\s+/g, ' ').trim()
        === '确认商品信息并同意以上全部内容' && visible(el)),
    { timeout: 30000, desc: '最终确认商品信息按钮' });
    const confirmControl = clickable(finalButton);
    confirmControl.click();
    markSkuProgress('已点击最终商品信息确认');
    await sleep(800);
    let completed = false;
    for (let i = 0; i < 30; i += 1) {
      await sleep(1000);
      const modal = allVisible(document).find((el) => /MDL_innerWrapper/.test(el.className || '')
        && /确认|确定/.test(el.innerText || ''));
      if (modal) {
        const ok = allVisible(modal).filter((el) => ['确认', '确定'].includes((el.innerText || '').trim())).pop();
        if (ok) await trustedClick(clickable(ok));
      }
      const body = document.body.innerText || '';
      const drawerOpen = allVisible(document).some((el) => /Drawer_outerWrapper/.test(el.className || '')
        && (el.innerText || '').includes('确认商品信息并同意以上全部内容'));
      if (!drawerOpen || /确认成功|提交成功|操作成功/.test(body)) {
        completed = true;
        break;
      }
    }
    if (!completed) throw new Error('确认商品信息后未出现成功状态');
    state.submitAttempt = {
      ...(state.submitAttempt || {}),
      skc,
      spu,
      stage: 'confirmed',
      at: Date.now(),
    };
    state.phase = 'LIST_SEARCH';
    state.status = 'running';
    state.error = null;
    await setSkcStatus(skc, '确认完成，等待列表校验');
    await saveState();
    log(`${state.queryType || 'SKC'} ${skc} 商品信息确认完成，返回列表校验`);
    await safeNavigate(botUrl(LIST_URL));
  }

  async function verifySubmitOnList() {
    const attempt = state.submitAttempt;
    if (!attempt || !attempt.skc) return false;
    log(`校验提交状态：${attempt.queryType || state.queryType || 'SKC'} ${attempt.skc}`);
    const queryType = attempt.queryType || state.queryType || 'SKC';
    const { row } = await listSearchProduct(attempt.skc, queryType);
    let text = '';
    for (let i = 0; i < 20; i += 1) {
      assertRunning();
      const live = findRowByIdentifier(attempt.skc) || row;
      text = (live && live.innerText || '').replace(/\s+/g, ' ');
      if (/信息修改中|修改成功|审核中|提交成功|已提交|审核通过/.test(text)) {
        const skc = attempt.skc;
        state.submitAttempt = null;
        state.retry = 0;
        state.current = null;
        state.cursor += 1;
        log(`提交状态已确认：${queryType} ${skc} ${/信息修改中/.test(text) ? '信息修改中' : '提交成功'}`);
        await setSkcStatus(skc, /信息修改中/.test(text) ? '提交成功（平台处理中）' : '提交成功');
        if (state.cursor >= activeSkcs().length) {
          await saveState();
          renderStatus();
          await finishCurrentTaskAndStartNext();
          return true;
        } else {
          state.phase = 'LIST_SEARCH';
        }
        await saveState();
        renderStatus();
        return true;
      }
      await sleep(3000);
    }
    state.status = 'paused';
    state.error = `提交状态未确认：${queryType} ${attempt.skc} 未出现“信息修改中/修改成功”`;
    await setSkcStatus(attempt.skc, '待确认：提交状态未识别');
    state.frontCursor = state.frontCursorStart;
    if (Array.isArray(state.usedFrontStart)) state.usedFrontImages = [...state.usedFrontStart];
    await saveState();
    renderStatus();
    await downloadStatusWorkbook();
    log(state.error, 'error');
    return false;
  }

  async function skipCurrentSkc(reason, { retryable = true } = {}) {
    if (state.timeoutNavigating) return;
    if (!isBotTab()) return;
    const lease = readLease();
    if (!lease || lease.owner !== TAB_ID) return;
    state.timeoutNavigating = true;
    state.skcTimedOut = true;
    const skc = state.current && state.current.skc || activeSkcs()[state.cursor];
    const submitUncertain = !!state.submitAttempt;
    const finalReason = submitUncertain ? `${reason}；提交状态待确认，本轮不自动重试` : reason;
    if (skc) {
      await setSkcStatus(skc, finalReason, { retryableOverride: retryable });
      log(`自动跳过 ${state.queryType || 'SKC'} ${skc}：${finalReason}`, 'error');
    }
    rollbackCurrentFrontUsage();
    state.retry = 0;
    state.current = null;
    state.submitAttempt = null;
    state.cursor += 1;
    if (state.cursor >= activeSkcs().length) {
      state.error = null;
      await saveState();
      renderStatus();
      await finishCurrentTaskAndStartNext();
      return;
    }
    state.phase = 'LIST_SEARCH';
    state.status = 'running';
    state.error = null;
    await saveState();
    renderStatus();
    if (isListPage()) {
      location.reload();
      return;
    }
    await safeNavigate(botUrl(LIST_URL));
    await sleep(800);
    if (state.status === 'running' && isBotTab() && isListPage()) {
      state.skcTimedOut = false;
      state.timeoutNavigating = false;
      await runDriver();
    }
  }

  async function checkSkuTimeout() {
    if (state.status !== 'running' || state.timeoutNavigating || !state.current) return;
    if (!isBotTab()) return;
    const lease = readLease();
    if (!lease || lease.owner !== TAB_ID) return;
    const limit = Math.max(3, Number(state.config.skuTimeoutMin || 10)) * 60000;
    const elapsed = skuInactivityMs();
    if (elapsed < limit) return;
    const last = state.current.lastProgress ? `，最后进展：${state.current.lastProgress}` : '';
    await skipCurrentSkc(`卡死超时（连续 ${Math.round(limit / 60000)} 分钟无进展${last}）`);
  }

  async function activateTaskForRun(taskId, { preserveLibrary = false } = {}) {
    if (!preserveLibrary) await syncCurrentTaskRecord();
    await saveTaskLibrary();
    currentTaskId = taskId;
    uiState.currentTaskId = taskId;
    await saveUI();
    const record = currentTaskRecord();
    if (!record) throw new Error('找不到待运行货号任务');
    const resumePaused = record.status === 'paused';
    applyTaskState(record.snapshot || {
      status: 'running', phase: 'LIST_SEARCH', cursor: 0, retry: 0, current: null,
      config: record.config || { ...DEFAULT_CONFIG }, skcs: [], queryType: 'SKC', skcStatuses: {},
      backPlanNames: [], imagePlan: {},
      xlsxMeta: null, backMaterialNames: [], usedFrontImages: [], logs: [],
    });
    state.status = 'running';
    if (!resumePaused) state.phase = 'LIST_SEARCH';
    state.error = null;
    state.skcTimedOut = false;
    state.timeoutNavigating = false;
    record.status = 'running';
    applyConfigToUI();
    await refreshFolderInfo();
    await saveState();
    renderTaskList();
    renderStatus();
    renderEstimate();
    log(`开始执行货号任务：${record.artNo || taskId}`);
    return record;
  }

  async function finishCurrentTaskAndStartNext() {
    const record = currentTaskRecord();
    let finalStatus = 'done';
    let completedStats = null;
    if (record) {
      state.status = 'done';
      state.phase = 'DONE';
      completedStats = taskStats(record);
      finalStatus = finalTaskStatus(completedStats);
      await syncCurrentTaskRecord();
      record.status = finalStatus;
      if (record.snapshot) record.snapshot.status = finalStatus;
      await saveTaskLibrary();
      await downloadStatusWorkbook();
      log(`货号任务「${record.artNo}」执行结束：${taskStatusMeta(finalStatus)[0]}；`
        + `成功 ${completedStats.success}，失败 ${completedStats.failed}，超时 ${completedStats.timedOut}`);
    }
    const currentIndex = taskLibrary.findIndex((task) => task.id === currentTaskId);
    const queue = [...taskLibrary.slice(currentIndex + 1), ...taskLibrary.slice(0, Math.max(0, currentIndex))]
      .filter((task) => task.id !== currentTaskId && ['ready', 'paused'].includes(task.status))
      .filter((task) => state.activeRetry ? !!task.retryOnly : !task.retryOnly);
    if (!queue.length) {
      state.status = 'done';
      if (state.activeRetry) {
        state.activeRetry = false;
        state.runScopedSkcs = null;
        taskLibrary.forEach((task) => {
          task.retryOnly = false;
          if (task.snapshot) {
            task.snapshot.activeRetry = false;
            task.snapshot.runScopedSkcs = null;
          }
        });
        if (record && record.snapshot) {
          record.snapshot.runScopedSkcs = null;
          record.snapshot.activeRetry = false;
        }
      }
      releaseTaskLease();
      await saveState();
      renderTaskList();
      renderStatus();
      if (record) {
        record.status = finalStatus;
        if (record.snapshot) record.snapshot.status = finalStatus;
        await saveTaskLibrary();
      }
      const totals = queueStats();
      log(`队列已结束：成功 ${totals.success}，失败 ${totals.failed}，超时跳过 ${totals.timedOut}，待处理 ${totals.pending}`);
      return false;
    }
    const next = queue[0];
    log(`自动进入下一个货号任务：${next.artNo}`);
    await activateTaskForRun(next.id);
    await safeNavigate(botUrl(LIST_URL));
    return true;
  }

  async function onRetryFailed() {
    if (state.status === 'running') {
      log('当前队列正在运行，请先暂停后再重试失败项', 'error');
      return;
    }
    await syncCurrentTaskRecord();
    const prepared = [];
    let retryTotal = 0;
    for (const task of taskLibrary) {
      const source = task.id === currentTaskId ? captureTaskState() : task.snapshot;
      const stats = taskStats(task);
      if (!stats.retryable || !source) continue;
      const snapshot = JSON.parse(JSON.stringify(source));
      snapshot.status = 'ready';
      snapshot.phase = 'LIST_SEARCH';
      snapshot.cursor = 0;
      snapshot.retry = 0;
      snapshot.current = null;
      snapshot.submitAttempt = null;
      snapshot.error = null;
      snapshot.runScopedSkcs = [...stats.retrySkcs];
      snapshot.activeRetry = true;
      task.status = 'ready';
      task.retryOnly = true;
      task.needsPrepare = false;
      task.snapshot = snapshot;
      prepared.push(task);
      retryTotal += stats.retryable;
      if (task.id === currentTaskId) applyTaskState(snapshot);
    }
    if (!prepared.length) {
      log('没有可重试的失败、待确认或超时商品', 'error');
      renderQueueStats();
      return;
    }
    await saveTaskLibrary();
    if (!acquireTaskLease()) {
      uiState.leaseBlocked = true;
      renderStatus();
      log('另一个标签页正在执行任务，暂时不能重试失败项', 'error');
      return;
    }
    uiState.leaseBlocked = false;
    const first = prepared[0];
    log(`重试队列已建立：${prepared.length} 个货号任务，共 ${retryTotal} 个商品；已成功项不会重复执行`);
    await activateTaskForRun(first.id, { preserveLibrary: true });
    state.activeRetry = true;
    state.runScopedSkcs = Array.isArray(first.snapshot.runScopedSkcs)
      ? [...first.snapshot.runScopedSkcs] : null;
    await saveState();
    if (ui.switchTab) ui.switchTab('log');
    await safeNavigate(botUrl(LIST_URL));
  }

  async function onError(err) {
    if (err && err.message === '__ABORTED__') return;
    const message = (err && err.message) || String(err);
    log('出错：' + message, 'error');
    const skc = activeSkcs()[state.cursor];
    if (/提交失败|提交结果未确认|商品信息待确认/.test(message)) state.submitAttempt = null;
    const stopAfterConfirmIssue = /商品信息待确认|提交结果未确认|提交状态未确认/.test(message);
    const preparationIssue = PREP_ERROR_RE.test(message);
    const imageQualityIssue = (err && err.code === 'IMAGE_QUALITY_REJECTED')
      || /图片品质不合规|图片品质不佳/.test(message);
    if (imageQualityIssue) {
      let finalMessage = message;
      if (imageQualityDialog()) {
        try {
          await rejectImageQualityIfAny((err && err.imageName) || activeImageTarget);
        } catch (qualityError) {
          finalMessage = qualityError.message || finalMessage;
        }
      }
      state.error = finalMessage;
      const record = currentTaskRecord();
      if (record) record.needsPrepare = true;
      log(`图片合规失败，按规则跳过当前商品：${err && err.imageName ? err.imageName : skc}`, 'error');
      await skipCurrentSkc(`失败：${finalMessage}`, { retryable: false });
      return;
    }
    if (preparationIssue) {
      state.status = 'paused';
      state.error = message;
      await setSkcStatus(skc, `失败：${message}`, { retryableOverride: false });
      rollbackCurrentFrontUsage();
      const record = currentTaskRecord();
      if (record) record.needsPrepare = true;
      await saveState();
      renderStatus();
      log('本轮遇到素材或清单准备问题，已暂停；请补齐素材/重新准备后再开始，此项不会进入自动重试', 'error');
      await downloadStatusWorkbook();
      return;
    }
    if (stopAfterConfirmIssue) {
      state.status = 'paused';
      state.error = message;
      await setSkcStatus(skc, `失败：${message}`);
      rollbackCurrentFrontUsage();
      await saveState();
      renderStatus();
      log('提交确认未闭环：本轮主图使用记录已回滚，任务暂停等待人工检查', 'error');
      await downloadStatusWorkbook();
      return;
    }
    if (state.retry < 1) {
      state.retry += 1;
      state.phase = 'LIST_SEARCH';
      rollbackCurrentFrontUsage();
      state.error = message;
      await setSkcStatus(skc, `重试中：${message}`);
      await saveState();
      renderStatus();
      log(`自动重做 1 次（${state.queryType || 'SKC'} ${skc}）…`);
      if (!isListPage()) await safeNavigate(botUrl(LIST_URL));
      else await runDriver();
    } else {
      state.status = 'paused';
      state.error = message;
      await setSkcStatus(skc, `失败：${message}`);
      rollbackCurrentFrontUsage();
      await saveState();
      renderStatus();
      log('重做后仍然失败，已暂停，请人工检查后点「开始」继续', 'error');
      await downloadStatusWorkbook();
    }
  }

  async function runDriver() {
    await loadState();
    if (state.status !== 'running') {
      renderStatus();
      return;
    }
    if (!touchTaskLease()) {
      uiState.leaseBlocked = true;
      renderStatus();
      log('另一个任务标签页正在运行；本页保持只读，避免状态互相覆盖', 'error');
      return;
    }
    uiState.leaseBlocked = false;
    if (!isBotTab()) {
      renderStatus();
      return;
    }
    try {
      if (isListPage() && state.submitAttempt) {
        const ok = await verifySubmitOnList();
        if (!ok) return;
      }
      if (state.phase === 'DONE') {
        state.status = 'done';
        releaseTaskLease();
        await saveState();
      } else if (isListPage() && state.phase === 'LIST_SEARCH') {
        await stepListSearch();
      } else if (isEditPage() && state.phase === 'EDIT') {
        await stepEdit();
      } else if (isConfirmInfoPage() && state.phase === 'CONFIRM_INFO') {
        await stepConfirmInfo();
      } else {
        log(`当前页面与阶段(${state.phase})不匹配，回到列表页`);
        await safeNavigate(botUrl(LIST_URL));
      }
    } catch (err) {
      if (err && err.message === '__SKC_TIMEOUT__') {
      log('当前商品已超时，由看门狗接管跳过', 'error');
        return;
      }
      await onError(err);
    }
    renderStatus();
  }

  // ============================================================ 启动 / 控制
  async function onStart() {
    readConfigFromUI();
    await syncCurrentTaskRecord();
    await saveTaskLibrary();
    if (state.status === 'running') {
      if (!acquireTaskLease()) {
        log('当前窗口已有其他任务页正在运行', 'error');
        return;
      }
      await runDriver();
      return;
    }
    const currentRecord = currentTaskRecord();
    let candidates = taskLibrary.filter((task) => ['ready', 'paused'].includes(task.status))
      .filter((task) => state.activeRetry ? !!task.retryOnly : !task.retryOnly);
    if (!candidates.length) {
      log('没有准备完成或暂停待继续的货号任务，请先逐个点击“保存准备”', 'error');
      return;
    }
    if (currentRecord && candidates.some((task) => task.id === currentRecord.id)) {
      candidates = [currentRecord, ...candidates.filter((task) => task.id !== currentRecord.id)];
    }
    if (!acquireTaskLease()) {
      uiState.leaseBlocked = true;
      renderStatus();
      log('另一个标签页正在执行任务。为避免两个页面互相覆盖，本页不能同时启动', 'error');
      return;
    }
    uiState.leaseBlocked = false;
    const first = candidates[0];
    await activateTaskForRun(first.id);
    if (ui.switchTab) ui.switchTab('log');
    log(`开始队列：当前货号 ${state.config.artNo}，本轮共 ${activeSkcs().length} 个商品 × 新增 ${state.config.n} 个色值；`
      + `货号=${state.config.artNo}，每个色值 ${state.config.x} 张背面图，裁剪 ${state.config.cropW}×${state.config.cropH}，`
      + `${state.config.dryRun ? '安全演练（不提交）' : '处理完自动提交'}`);
    await safeNavigate(botUrl(LIST_URL));
    await sleep(800);
    if (state.status === 'running' && isBotTab() && isListPage()) await runDriver();
  }

  async function onPause() {
    state.status = 'paused';
    await saveState();
    renderStatus();
    log('已暂停（当前步骤会跑完，之后停在下一步）');
  }

  /** 半自动模式：人工填完敏感属性并提交后，点「下一条商品」进入下一个商品 */
  async function onNextSku() {
    if (state.status !== 'paused') {
      log('当前没有等待人工处理的商品，无需点「下一条商品」');
      return;
    }
    if (!state.skcs.length) {
      log(`${state.queryType || 'SKC'} 清单为空`, 'error');
      return;
    }
    state.cursor += 1;
    state.retry = 0;
    state.current = null;
    state.manualStep = null;
    state.error = null;
    if (state.cursor >= activeSkcs().length) {
      await saveState();
      renderStatus();
      await finishCurrentTaskAndStartNext();
      return;
    }
    state.phase = 'LIST_SEARCH';
    state.status = 'running';
    await saveState();
    renderStatus();
    log(`进入下一条商品：${activeSkcs()[state.cursor]}`);
    await safeNavigate(botUrl(LIST_URL));
  }

  async function onStop() {
    releaseTaskLease();
    if (state.current && state.current.skc) await setSkcStatus(state.current.skc, '已停止');
    state.status = 'idle';
    state.phase = 'LIST_SEARCH';
    state.cursor = 0;
    state.retry = 0;
    state.current = null;
    state.error = null;
    state.frontCursor = 0;
    state.backMaterialNames = [];
    state.submitAttempt = null;
    const record = currentTaskRecord();
    if (record) record.status = 'ready';
    await saveState();
    renderTaskList();
    renderStatus();
    log('已停止并重置进度');
  }

  async function onExportLog() {
    const text = state.logs.map((l) => l.line).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `temu-bot-log-${Date.now()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function download(filename, content, mime = 'application/json') {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function onExportConfig() {
    readConfigFromUI({ silent: true });
    const payload = {
      kind: 'temu-image-bot-config',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      remark: uiState.remark,
      config: state.config,
      skcs: state.skcs,
      queryType: state.queryType,
      theme: uiState.theme,
    };
    download(`temu-bot-config-${Date.now()}.json`, JSON.stringify(payload, null, 2));
    log('已导出配置（不含图片文件）');
  }

  async function importConfigFile(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.kind !== 'temu-image-bot-config') throw new Error('文件不是本插件的配置文件');
      if (data.config) {
        state.config = { ...DEFAULT_CONFIG, ...data.config };
        ui.artNo.value = state.config.artNo;
        ui.n.value = String(state.config.n);
        ui.x.value = String(state.config.x);
        ui.cropW.value = String(state.config.cropW);
        ui.cropH.value = String(state.config.cropH);
        ui.autoSubmit.checked = !!state.config.autoSubmit;
        ui.dryRun.checked = !!state.config.dryRun;
      }
      if (Array.isArray(data.skcs) && data.skcs.length) {
        state.skcs = data.skcs;
        state.cursor = 0;
        state.queryType = data.queryType === 'SPU' ? 'SPU' : 'SKC';
        ui.queryType.value = state.queryType;
        ui.listTypeTitle.textContent = `${state.queryType} 清单`;
        ui.skcInfo.textContent = `已导入 ${data.skcs.length} 个 ${state.queryType}`;
      }
      if (data.theme) {
        uiState.theme = { ...uiState.theme, ...data.theme };
        applyTheme();
      }
      if (data.remark) {
        uiState.remark = data.remark;
        if (ui.remarkInput) ui.remarkInput.value = data.remark;
        renderWho();
      }
      await saveUI();
      await saveState();
      renderEstimate();
      renderStatus();
      log(`已导入配置（${data.version || '未知版本'}）`);
    } catch (err) {
      log('导入配置失败：' + err.message, 'error');
    }
  }

  async function onExportDiagnostics() {
    readConfigFromUI({ silent: true });
    const front = await dbGet(taskFileKey('frontFiles'));
    const back = await dbGet(taskFileKey('backFiles'));
    const shot = await captureTab().catch(() => ({ ok: false }));
    const lines = [
      '=== TEMU 图片自动编辑助手 诊断包 ===',
      `版本: v${VERSION}`,
      `导出时间: ${new Date().toLocaleString('zh-CN')}`,
      `页面 URL: ${location.href}`,
      `店铺名(自动识别): ${uiState.shopName || '未识别'}`,
      `窗口备注: ${uiState.remark || '-'}`,
      `浏览器: ${navigator.userAgent}`,
      '',
      '--- 参数 ---',
      JSON.stringify(state.config, null, 2),
      `清单类型: ${state.queryType || 'SKC'}`,
      `清单数量: ${state.skcs.length} -> ${state.skcs.join(', ')}`,
      `主图: ${front ? front.length : 0} 张`,
      `背面图: ${back ? back.length : 0} 张`,
      '',
      '--- 任务状态 ---',
      `status=${state.status} phase=${state.phase} cursor=${state.cursor} retry=${state.retry} frontCursor=${state.frontCursor}`,
      `current=${JSON.stringify(state.current)}`,
      `背面图素材=${JSON.stringify(state.backMaterialNames)}`,
      `最近错误: ${state.error || '无'}`,
      '',
      '--- 最近 200 行日志 ---',
      ...state.logs.slice(-200).map((l) => l.line),
    ];
    download(`temu-bot-diag-${Date.now()}.txt`, lines.join('\n'), 'text/plain');
    if (shot.ok) {
      const a = document.createElement('a');
      a.href = shot.dataUrl;
      a.download = `temu-bot-clip-${Date.now()}.png`;
      a.click();
      log('已导出诊断包（含截图）');
    } else {
      log('已导出诊断包（截图失败，仅文本）');
    }
  }

  function onCheckVersion() {
    if (ui.verLine) {
      ui.verLine.innerHTML = `当前版本 <b>v${VERSION}</b>（本地校验，未联网）`;
    }
    log(`当前插件版本 v${VERSION}；如需更新，请让管理员发最新压缩包，覆盖 extension 文件夹后在扩展页点“重新加载”`, 'info');
  }

  async function boot() {
    if (!document.body) {
      await new Promise((r) => window.addEventListener('DOMContentLoaded', r, { once: true }));
    }
    await loadUI();
    buildPanel();
    currentTaskId = uiState.currentTaskId || LEGACY_TASK_ID;
    const tabInfo = await getTabInfo();
    if (tabInfo && tabInfo.ok) {
      TAB_INFO.tabId = tabInfo.tabId;
      TAB_INFO.windowId = tabInfo.windowId;
    }
    await loadTaskLibrary();
    await loadState();
    if (!taskLibrary.length) {
      const rec = {
        id: LEGACY_TASK_ID,
        artNo: state.config.artNo || '当前货号',
        status: state.status === 'idle' ? 'draft' : state.status,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        snapshot: captureTaskState(),
      };
      taskLibrary = [rec];
      currentTaskId = rec.id;
      uiState.currentTaskId = rec.id;
      await saveTaskLibrary();
      await saveUI();
    } else {
      let record = currentTaskRecord();
      if (!record) {
        record = taskLibrary[0];
        currentTaskId = record.id;
        uiState.currentTaskId = currentTaskId;
      }
      applyTaskState(record.snapshot || {});
      state.status = record.status || state.status;
    }
    state.logs = state.logs || [];
    uiState.shopName = detectShopName();
    if (!uiState.shopName) {
      // 页面头部是异步渲染的，前 30 秒内快速重试，避免一直显示“未识别店铺”
      let tries = 0;
      const timer = setInterval(() => {
        const s = detectShopName();
        if (s) {
          clearInterval(timer);
          uiState.shopName = s;
          renderWho();
          log(`识别到店铺：${s}`);
        } else if (++tries > 20) {
          clearInterval(timer);
        }
      }, 1500);
    }
    applyTheme();
    applyPos();
    if (!uiState.wizardDone && !state.skcs.length) ui.wizard.classList.add('show');
    applyConfigToUI();
    if (state.skcs.length) ui.skcInfo.textContent = `已导入 ${state.skcs.length} 个`;
    if (state.xlsxMeta && ui.statusFileInfo) {
      ui.statusFileInfo.textContent = state.xlsxMeta.sheetName
        ? `状态列：第 ${state.xlsxMeta.statusCol + 1} 列`
        : 'CSV 状态回写';
    }
    await refreshFolderInfo();
    renderTaskList();
    renderStatus();
    renderEstimate();
    showView(uiState.view || 'home');
    panelReady = true;
    log(`助手已就绪（v${VERSION}｜店铺：${uiState.shopName || '未识别'}${uiState.remark ? '｜备注：' + uiState.remark : ''}）`);
    if (state.status === 'running' && isBotTab()) {
      log('检测到未完成任务，自动续跑');
      runDriver();
    }
    // SPA 页面切换后店铺名可能变化，定期刷新
    setInterval(() => {
      const s = detectShopName();
      if (s && s !== uiState.shopName) {
        uiState.shopName = s;
        renderWho();
      }
    }, 15000);
    setInterval(() => {
      if (state.status === 'running') {
        if (touchTaskLease()) {
          if (uiState.leaseBlocked) {
            uiState.leaseBlocked = false;
            renderStatus();
          }
        } else {
          uiState.leaseBlocked = true;
          renderStatus();
        }
      }
    }, 5000);
    setInterval(() => {
      checkSkuTimeout()
        .then(() => { if (state.status === 'running') renderStatus(); })
        .catch((err) => log('卡死检查失败：' + err.message, 'error'));
    }, 5000);
  }

  // 调试接口（供排查问题用，不影响正常运行）
  window.__TEMU_IMG_BOT_API__ = {
    state,
    saveState,
    loadState,
    runDriver,
    listSearchSkc,
    listSearchProduct,
    specRows,
    carouselImgCount,
    findRowIndexByColorName,
    setColorName,
    typeTextReal,
    commitInput,
    openMaterialDialog,
    preflightCheck,
    classifySkcInfo,
    taskStats,
    queueStats,
    setSkcStatus,
    buildStatusWorkbook,
    addRunSummarySheet,
    zipStore,
    onRetryFailed,
    extractProductEntries,
    markSkuProgress,
    skuInactivityMs,
    allocateFrontPlan,
    ensureImagePlan,
    imageQualityDialog,
    rejectImageQualityIfAny,
    waitFor,
    log,
  };

  boot();
})();
