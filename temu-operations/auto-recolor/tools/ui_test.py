"""面板 UI 测试：注入 → 截图 → 切换皮肤 → 打开设置 → 截图 → 检查预估行。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

HERE = os.getcwd()
SRC = open(os.path.join(HERE, "extension", "page", "main.js"), encoding="utf-8").read()
SHOTS = os.path.join(HERE, "probes", "shots")

wd, info = bb.ensure_session("9e6f73cc742b4abc9015f31f8e75fbd7")
for h in wd.handles():
    try:
        wd.switch(h)
        if "agentseller.temu.com/goods/list" in (wd.url() or ""):
            break
    except Exception:
        continue
print("页面:", wd.url())

print("清空旧状态:", wd.js("""
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('temu-image-bot', 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const db = await open();
for (const k of ['task', 'ui']) {
  await new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete(k);
    tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error);
  });
}
return 'cleared';
"""))

wd.navigate("https://agentseller.temu.com/goods/list")
time.sleep(6)

print("注入:", wd.js("""
window.__TEMU_IMG_BOT_V1__ = false;
const old = document.getElementById('temu-image-bot-host');
if (old) old.remove();
try { (0, eval)(%s); return 'OK'; } catch (e) { return 'ERR ' + e.message; }
""" % json.dumps(SRC)))
time.sleep(3)

print("面板信息:", wd.js("""
const host = document.getElementById('temu-image-bot-host');
if (!host) return 'no-panel';
const sr = host.shadowRoot;
return JSON.stringify({
  title: sr.querySelector('.hd span').innerText.trim(),
  shop: sr.getElementById('whoChip').innerText,
  wizardShown: sr.getElementById('wizard').classList.contains('show'),
  estimate: sr.getElementById('estimate').innerText,
  version: sr.getElementById('verLine').innerText,
  themes: [...sr.getElementById('themeBtns').children].length,
}, null, 1);
"""))
print("shot1:", wd.screenshot(os.path.join(SHOTS, "ui_default.png")))

print("切换皮肤（星空紫）:", wd.js("""
const host = document.getElementById('temu-image-bot-host');
const sr = host.shadowRoot;
sr.querySelectorAll('#themeBtns button')[1].click();
return sr.getElementById('theme').textContent.slice(0, 120);
"""))
time.sleep(1)
print("shot2:", wd.screenshot(os.path.join(SHOTS, "ui_purple.png")))

print("打开设置 + 深色:", wd.js("""
const host = document.getElementById('temu-image-bot-host');
const sr = host.shadowRoot;
sr.getElementById('gear').click();
sr.getElementById('darkChk').click();
return 'ok';
"""))
time.sleep(1)
print("shot3:", wd.screenshot(os.path.join(SHOTS, "ui_dark_settings.png")))

print("模拟导入 SKC 后的预估:", wd.js("""
const api = window.__TEMU_IMG_BOT_API__;
api.state.skcs = ['46350409750', '97995719987'];
api.state.config = { artNo: 'DWRG', n: 4, x: 2, cropW: 1350, cropH: 1800, autoSubmit: true, dryRun: false };
const host = document.getElementById('temu-image-bot-host');
const sr = host.shadowRoot;
sr.getElementById('artNo').value = 'DWRG';
sr.getElementById('n').value = '4';
sr.getElementById('x').value = '2';
return 'ready';
"""))
time.sleep(0.5)
print(wd.js("""
const host = document.getElementById('temu-image-bot-host');
const sr = host.shadowRoot;
sr.getElementById('impSkc').dispatchEvent(new Event('click'));
// 直接触发一次预估刷新
const api = window.__TEMU_IMG_BOT_API__;
return 'estimate=' + sr.getElementById('estimate').innerText;
"""))
print("shot4:", wd.screenshot(os.path.join(SHOTS, "ui_estimate.png")))
