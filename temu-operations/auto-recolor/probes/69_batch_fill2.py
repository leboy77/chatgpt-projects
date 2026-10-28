"""点「敏感属性与体积重量」上方那个“批量填写”（按位置精确定位）。"""
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

print("滚动表格:", wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
t.scrollIntoView({block: 'center', behavior: 'instant'});
return 'ok';
"""))
time.sleep(1.5)

print("目标按钮:", wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
const tRect = t.getBoundingClientRect();
const btns = [...document.querySelectorAll('button,[role=button]')].filter(el => (el.innerText||'').trim() === '批量填写');
const above = btns.filter(b => b.getBoundingClientRect().top < tRect.top)
  .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
if (!above.length) return 'none';
const r = above[0].getBoundingClientRect();
const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2,
  hitText: hit ? (hit.innerText||'').trim().slice(0, 20) : null}, null, 1);
"""))
pos = json.loads(wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
const tRect = t.getBoundingClientRect();
const btns = [...document.querySelectorAll('button,[role=button]')].filter(el => (el.innerText||'').trim() === '批量填写');
const above = btns.filter(b => b.getBoundingClientRect().top < tRect.top)
  .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
const r = above[0].getBoundingClientRect();
return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
"""))
wd.mouse_click(pos["x"], pos["y"])
time.sleep(4)
print("弹窗:", wd.js("""
const layers = [...document.querySelectorAll('[class*=MDL_],[role=dialog]')]
  .filter(el => el.getBoundingClientRect().height > 100 && (el.innerText||'').trim());
return JSON.stringify(layers.slice(-4).map(el => ({cls: (el.className||'').toString().slice(0,50),
  text: (el.innerText||'').replace(/\\n+/g,' | ').slice(0, 500)})), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "batch_fill2.png")))
