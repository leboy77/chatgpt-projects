"""流程第 4 步(1)：用 scrollIntoView 正确定位并点击 色值 的 添加。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")
os.makedirs(SHOTS, exist_ok=True)

wd = bb.connect()
for h in wd.handles():
    try:
        wd.switch(h)
        if "/goods/edit" in (wd.url() or ""):
            handle = h
    except Exception:
        continue
wd.switch(handle)
print("url:", wd.url())

print("== 色值表格所在容器内的 添加 链接 ==")
print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
if (!table) return 'no-table';
let box = table;
const out = [];
for (let i = 0; i < 4 && box.parentElement; i++) {
  box = box.parentElement;
  const adds = [...box.querySelectorAll('a,div,span')].filter(el =>
    (el.innerText||'').replace(/\\s+/g,'') === '+添加' && el.getBoundingClientRect().height > 0);
  out.push({depth: i, cls: (box.className||'').toString().slice(0,60), addCount: adds.length});
  if (adds.length) {
    adds[0].scrollIntoView({block: 'center'});
    const r = adds[0].getBoundingClientRect();
    return JSON.stringify({foundAtDepth: i, addTag: adds[0].tagName,
      cls: (adds[0].className||'').toString().slice(0,80),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]}, null, 1);
  }
}
return 'add-not-found: ' + JSON.stringify(out);
"""))
time.sleep(1.2)

pos = wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
let box = table;
for (let i = 0; i < 4 && box.parentElement; i++) {
  box = box.parentElement;
  const adds = [...box.querySelectorAll('a,div,span')].filter(el =>
    (el.innerText||'').replace(/\\s+/g,'') === '+添加' && el.getBoundingClientRect().height > 0);
  if (adds.length) { const r = adds[0].getBoundingClientRect();
    return {x: r.x + r.width/2, y: r.y + r.height/2, inView: r.top > 0 && r.bottom < window.innerHeight}; }
}
return null;
""")
print("添加按钮位置:", pos)

if pos and pos.get("inView"):
    wd.mouse_click(pos["x"], pos["y"])
    time.sleep(2.5)

print("== 色值行 ==")
print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const rows = [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
return JSON.stringify(rows.map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  const color = tds[0] ? tds[0].querySelector('input') : null;
  const trigger = tr.querySelector('[class*=upload-trigger_wrap]');
  return {row: i, colorValue: color ? color.value : null, placeholder: color ? color.placeholder : null,
          triggerCls: trigger ? (trigger.className||'').toString().slice(0, 120) : null,
          disabled: trigger ? /disabled/.test((trigger.className||'').toString()) : null};
}), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "after_add_row2.png")))
