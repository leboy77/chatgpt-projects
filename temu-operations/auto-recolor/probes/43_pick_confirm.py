"""流程第 4 步：点击上传的图片 -> 确认 -> 检查该行轮播图。"""
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

MAT = """
const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')]
  .filter(el => /素材中心/.test(el.innerText||'')).pop();
"""

# 第一张卡片：以名称标签为锚点，点击其上方缩略图区域
pos = wd.js(MAT + """
if (!d) return 'no-dialog';
const labels = [...d.querySelectorAll('*')].filter(el =>
  /^DWRG03-\\d+$/.test((el.innerText||'').trim()) && el.getBoundingClientRect().height > 0);
if (!labels.length) return 'not-found';
const name = labels.sort((a, b) =>
  a.getBoundingClientRect().y - b.getBoundingClientRect().y)[0];
const r = name.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y - 45, nameY: Math.round(r.y)};
""")
print("卡片位置:", pos)
if isinstance(pos, dict):
    wd.mouse_click(pos["x"], pos["y"])
time.sleep(2)

print("已选:", wd.js(MAT + """
if (!d) return 'no-dialog';
const m = d.innerText.match(/已选\\d+个[^\\n]*/);
return m ? m[0] : 'no-selected-text';
"""))
print("shot1:", wd.screenshot(os.path.join(SHOTS, "picked.png")))

print("点击 确认:", wd.js(MAT + """
if (!d) return 'no-dialog';
const el = [...d.querySelectorAll('*')].find(x =>
  x.children.length === 0 && (x.innerText||'').trim() === '确认' && x.getBoundingClientRect().height > 0);
if (!el) return 'no-btn';
const t = el.closest('button,[role=button]') || el.parentElement;
const r = t.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y + r.height/2};
"""))
