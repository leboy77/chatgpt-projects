"""查素材库里已经上传过的 DWRG* 主图，用于确定哪些主图已经用过。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")
wd = bb.connect()
for h in wd.handles():
    try:
        wd.switch(h)
        u = wd.url() or ""
        if isinstance(u, str) and "goods/edit" in u:
            break
    except Exception:
        continue
print("页面:", wd.url())

print("打开素材中心:", wd.js("""
window.__matOk = false; window.__matErr = null;
window.__TEMU_IMG_BOT_API__.openMaterialDialog(1)
  .then(() => { window.__matOk = true; })
  .catch(e => { window.__matErr = String(e && e.message || e); });
return 'started';
"""))
for _ in range(20):
    time.sleep(1.5)
    st = wd.js("return window.__matOk ? 'ok' : (window.__matErr || 'pending');")
    if st != "pending":
        print("结果:", st)
        break

SEARCH_JS = """
const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')]
  .filter(el => (el.innerText||'').includes('本地上传') && !(el.innerText||'').includes('无需重复上传')).pop();
if (!d) return 'no-dialog';
const box = [...d.querySelectorAll('input')].find(i => i.placeholder === '请输入素材名称');
if (!box) return 'no-search-box';
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(box, 'DWRG');
box.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: 'DWRG'}));
box.dispatchEvent(new Event('change', {bubbles: true}));
const scope = box.closest('[class*=reunitBlock]') || box.parentElement;
const svg = [...scope.querySelectorAll('svg')].pop();
if (svg) {
  const r = svg.getBoundingClientRect();
  const opts = {bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2};
  svg.dispatchEvent(new MouseEvent('mousedown', opts));
  svg.dispatchEvent(new MouseEvent('mouseup', opts));
  svg.dispatchEvent(new MouseEvent('click', opts));
}
return 'searched';
"""
print("搜索 DWRG:", wd.js(SEARCH_JS))
time.sleep(4)

READ_JS = """
const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')]
  .filter(el => (el.innerText||'').includes('本地上传') && !(el.innerText||'').includes('无需重复上传')).pop();
if (!d) return 'no-dialog';
const names = [...d.querySelectorAll('*')]
  .filter(el => /^DWRG[0-9]+-[0-9]+$/.test((el.innerText||'').trim()))
  .map(el => el.innerText.trim());
const total = (d.innerText.match(/共有\\s*(\\d+)\\s*条/) || [])[1];
return JSON.stringify({total, names: [...new Set(names)]}, null, 1);
"""
print("结果名称:", wd.js(READ_JS))
print("shot:", wd.screenshot(os.path.join(SHOTS, "used_front_search.png")))
