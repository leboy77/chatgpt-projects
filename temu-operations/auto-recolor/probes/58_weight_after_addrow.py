"""加一个色值行后，看「敏感属性与体积重量」表里新颜色行的结构与可编辑性。"""
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

print("当前色值行数:", wd.js("""
const rows = window.__TEMU_IMG_BOT_API__.specRows();
return rows.length;
"""))

print("点击 + 添加:", wd.js("""
const add = document.querySelector('div[class*=product-skc_specItem] > a[class*=BTN_]');
if (!add) return 'no-btn';
add.scrollIntoView({block: 'center', behavior: 'instant'});
return 'scrolled';
"""))
time.sleep(1)
pos = wd.js("""
const add = document.querySelector('div[class*=product-skc_specItem] > a[class*=BTN_]');
const r = add.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y + r.height/2};
""")
wd.mouse_click(pos["x"], pos["y"])
time.sleep(3)
print("添加后色值行数:", wd.js("return window.__TEMU_IMG_BOT_API__.specRows().length;"))

print("== 体积重量表的行（含颜色分组） ==")
print(wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
if (!t) return 'no-table';
const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
return JSON.stringify(rows.map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  return {
    row: i,
    firstCell: (tds[0].innerText||'').replace(/\\s+/g,' ').trim().slice(0, 16),
    cellCount: tds.length,
    selectDisabled: tds[2] ? /disabled/.test((tds[2].querySelector('input') || {className:''}).className || '') : null,
    selectValue: tds[2] && tds[2].querySelector('input') ? tds[2].querySelector('input').value : null,
    dims: tds[3] ? [...tds[3].querySelectorAll('input')].map(x => x.value) : null,
    dimsDisabled: tds[3] ? [...tds[3].querySelectorAll('input')].map(x => /disabled/.test((x.className||'').toString())) : null,
    weight: tds[4] ? [...tds[4].querySelectorAll('input')].map(x => x.value) : null
  };
}), null, 1);
"""))

print("== 顶部筛选/批量填写按钮 ==")
print(wd.js("""
const btn = [...document.querySelectorAll('button,[role=button]')]
  .filter(el => (el.innerText||'').trim() === '批量填写');
return JSON.stringify(btn.map(el => ({tag: el.tagName, cls: (el.className||'').toString().slice(0,50)})));
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "weight_after_addrow.png")))
