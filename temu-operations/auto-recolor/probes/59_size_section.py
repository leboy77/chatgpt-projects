"""查看 尺码 区域：新颜色是否已带尺码，以及体积重量表是否随之出现新颜色。"""
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

print("== 规格表当前行 ==")
print(wd.js("""
const rows = window.__TEMU_IMG_BOT_API__.specRows();
const out = rows.map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  const color = tds[0] ? tds[0].querySelector('input') : null;
  return {row: i, color: color ? color.value : null,
          imgs: tds[1] ? tds[1].querySelectorAll('img').length : null};
});
return JSON.stringify(out);
"""))

print("== 尺码区域文本 ==")
print(wd.js("""
const hits = [...document.querySelectorAll('*')].filter(el =>
  el.children.length === 0 && (el.innerText||'').trim() === '尺码');
if (!hits.length) return 'no-size-label';
let box = hits[hits.length - 1];
for (let i = 0; i < 8 && box.parentElement; i++) {
  box = box.parentElement;
  if ((box.innerText||'').includes('全选')) break;
}
return JSON.stringify({cls: (box.className||'').toString().slice(0,60),
  text: (box.innerText||'').replace(/\\n+/g,' | ').slice(0, 600)}, null, 1);
"""))

print("== 尺码表格结构（颜色×尺码） ==")
print(wd.js("""
const tables = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('全选'));
if (!tables.length) return 'no-table';
const t = tables[tables.length - 1];
const rows = [...t.querySelectorAll('tr')].slice(0, 8).map(tr => {
  const cells = [...tr.children].map(td => {
    const cb = td.querySelector('input[type=checkbox]');
    return {text: (td.innerText||'').trim().slice(0,10), checkbox: cb ? cb.checked : null};
  });
  return cells;
});
return JSON.stringify(rows, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "size_section.png")))
