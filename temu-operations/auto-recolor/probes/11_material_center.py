"""走查：打开 轮播图 单元格里的 素材中心 弹窗，检查上传入口。"""
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
            break
    except Exception:
        continue
print("url:", wd.url())

# 先把目标按钮滚到视口中间（瞬时滚动，避免坐标漂移）
print("滚动:", wd.js("""
const cell = [...document.querySelectorAll('td')]
  .filter(td => (td.innerText||'').includes('素材中心'))[0];
if (!cell) return 'no-cell';
const btn = [...cell.querySelectorAll('*')].find(el =>
  el.children.length === 0 && (el.innerText||'').trim() === '素材中心'
  && el.getBoundingClientRect().height > 0);
if (!btn) return 'no-btn';
const r = btn.getBoundingClientRect();
window.scrollTo({top: window.scrollY + r.top - window.innerHeight / 2, behavior: 'instant'});
return 'ok';
"""))
time.sleep(1.0)

pos = wd.js("""
const cell = [...document.querySelectorAll('td')]
  .filter(td => (td.innerText||'').includes('素材中心'))[0];
if (!cell) return null;
const btn = [...cell.querySelectorAll('*')].find(el =>
  el.children.length === 0 && (el.innerText||'').trim() === '素材中心'
  && el.getBoundingClientRect().height > 0);
if (!btn) return null;
const r = btn.getBoundingClientRect();
return {x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height};
""")
print("素材中心按钮位置:", pos)

if pos:
    wd.mouse_click(pos["x"], pos["y"])
    time.sleep(3)

print("== 弹窗结构 ==")
print(wd.js("""
const dlg = [...document.querySelectorAll('[role=dialog],[class*=MDL_outerWrapper],[class*=Modal]')]
  .filter(el => el.getBoundingClientRect().height > 200);
if (!dlg.length) return 'no-dialog';
const d = dlg[dlg.length - 1];
const leaves = [];
const walk = el => {
  if (el.children.length === 0) {
    const t = (el.innerText || '').trim();
    if (t && t.length <= 30 && el.getBoundingClientRect().height > 0) leaves.push(t);
  } else { [...el.children].forEach(walk); }
};
walk(d);
return JSON.stringify({cls: (d.className||'').toString().slice(0,100),
  leaves: [...new Set(leaves)].slice(0, 60),
  fileInputs: [...d.querySelectorAll('input[type=file]')].map(i => ({accept: i.accept, multiple: i.multiple}))}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "material_center.png")))
