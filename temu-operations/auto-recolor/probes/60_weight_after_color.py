"""给新行填上色值名后，体积重量表里是否出现新颜色分组。"""
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

print("写入色值名:", wd.js("""
const setVal = (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: v}));
  el.dispatchEvent(new Event('change', {bubbles: true}));
};
const out = [];
[1, 2].forEach((i, k) => {
  const box = document.getElementById('productSkcList[' + i + '].mainSpec[0]');
  const input = box ? box.querySelector('input') : null;
  if (input) { setVal(input, 'Mixed Color' + (k + 2)); out.push(i + '=' + input.value); }
});
return out.join(',');
"""))
time.sleep(4)

print("规格行:", wd.js("""
const rows = window.__TEMU_IMG_BOT_API__.specRows();
return JSON.stringify(rows.map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  const c = tds[0] ? tds[0].querySelector('input') : null;
  return i + ':' + (c ? c.value : '?');
}));
"""))

print("== 体积重量表 ==")
print(wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
if (!t) return 'no-table';
const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
const summary = [];
[...t.querySelectorAll('tbody tr')].forEach((tr) => {
  const tds = [...tr.querySelectorAll('td')];
  const first = (tds[0] && tds[0].innerText || '').replace(/\\s+/g,' ').trim();
  summary.push({first: first.slice(0, 14), cells: tds.length});
});
return JSON.stringify({rowCount: rows.length, summary}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "weight_after_color.png")))
