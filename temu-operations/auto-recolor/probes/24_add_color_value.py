"""流程第 4 步(1)：商品规格 -> 色值 -> 添加，检查新行状态。"""
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

print("== 页面上的 '+ 添加' ==")
print(wd.js("""
const hits = [...document.querySelectorAll('*')].filter(el =>
  (el.innerText||'').replace(/\\s+/g,'') === '+添加' && el.getBoundingClientRect().height > 0);
return JSON.stringify(hits.map(el => {
  const r = el.getBoundingClientRect();
  return {tag: el.tagName, cls: (el.className||'').toString().slice(0,70),
          x: Math.round(r.x), y: Math.round(r.y)};
}), null, 1);
"""))

print("== 滚到 商品规格 下方 添加 ==")
pos = wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
if (!table) return null;
const tr = table.getBoundingClientRect();
const hits = [...document.querySelectorAll('*')].filter(el =>
  (el.innerText||'').replace(/\\s+/g,'') === '+添加' && el.getBoundingClientRect().height > 0);
const cand = hits.filter(el => el.getBoundingClientRect().top > tr.top);
cand.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
const btn = cand[0];
if (!btn) return null;
const r = btn.getBoundingClientRect();
window.scrollTo({top: window.scrollY + r.top - window.innerHeight / 2, behavior: 'instant'});
return {x: r.x + r.width / 2, y: r.y + r.height / 2};
""")
print("添加按钮:", pos)
time.sleep(0.8)

if pos:
    pos2 = wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const tr = table.getBoundingClientRect();
const hits = [...document.querySelectorAll('*')].filter(el =>
  (el.innerText||'').replace(/\\s+/g,'') === '+添加' && el.getBoundingClientRect().height > 0);
const cand = hits.filter(el => el.getBoundingClientRect().top > tr.top)
  .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
const r = cand.getBoundingClientRect();
return {x: r.x + r.width / 2, y: r.y + r.height / 2};
""")
    print("实际坐标:", pos2)
    wd.mouse_click(pos2["x"], pos2["y"])
time.sleep(2.5)

print("== 添加后的色值行 ==")
print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const rows = [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
return JSON.stringify(rows.map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  const color = tds[0] ? tds[0].querySelector('input') : null;
  const trigger = tr.querySelector('[class*=upload-trigger_wrap]');
  return {row: i, colorValue: color ? color.value : null,
          colorPlaceholder: color ? color.placeholder : null,
          uploadTriggerClass: trigger ? (trigger.className||'').toString().slice(0, 110) : null,
          imgCount: tr.querySelectorAll('img').length};
}), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "after_add_row.png")))
