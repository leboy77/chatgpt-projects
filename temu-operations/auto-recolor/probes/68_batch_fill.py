"""点「敏感属性与体积重量」区域的“批量填写”，看弹窗内容。"""
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

print("定位按钮:", wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
if (!t) return 'no-table';
const btns = [...document.querySelectorAll('button,[role=button]')].filter(el => (el.innerText||'').trim() === '批量填写');
const info = btns.map(b => {
  const r = b.getBoundingClientRect();
  const tRect = t.getBoundingClientRect();
  return {y: Math.round(r.top), tableY: Math.round(tRect.top), visible: r.height > 0, cls: (b.className||'').toString().slice(0, 40)};
});
return JSON.stringify(info, null, 1);
"""))

print("点击最靠近表格的按钮:", wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
const btns = [...document.querySelectorAll('button,[role=button]')].filter(el => (el.innerText||'').trim() === '批量填写');
if (!btns.length) return 'no-btn';
// 选 DOM 顺序上紧挨表格前面的那个
const tPos = t.compareDocumentPosition(btns[0]);
const target = btns[btns.length - 1];
target.scrollIntoView({block: 'center', behavior: 'instant'});
const r = target.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y + r.height/2, count: btns.length};
"""))
time.sleep(1)
pos = wd.js("""
const btns = [...document.querySelectorAll('button,[role=button]')].filter(el => (el.innerText||'').trim() === '批量填写');
const target = btns[btns.length - 1];
const r = target.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y + r.height/2};
""")
wd.mouse_click(pos["x"], pos["y"])
time.sleep(4)
print("弹窗:", wd.js("""
const layers = [...document.querySelectorAll('[class*=MDL_innerWrapper],[role=dialog]')]
  .filter(el => el.getBoundingClientRect().height > 100);
return JSON.stringify(layers.map(el => ({cls: (el.className||'').toString().slice(0,50),
  text: (el.innerText||'').replace(/\\n+/g,' | ').slice(0, 400)})), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "batch_fill.png")))
