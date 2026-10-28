"""流程第 4 步：选中上传的图片 -> 确认 -> 检查轮播图。"""
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

print("== 列表项结构（含 DWRG03） ==")
print(wd.js(MAT + """
if (!d) return 'no-dialog';
const label = [...d.querySelectorAll('*')].find(el =>
  el.children.length === 0 && /DWRG03/.test(el.innerText||'') && el.getBoundingClientRect().height > 0);
if (!label) return 'label-not-found';
const chain = [];
let p = label;
for (let i = 0; i < 5 && p; i++) {
  const r = p.getBoundingClientRect();
  chain.push({tag: p.tagName, cls: (p.className||'').toString().slice(0, 60),
              rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
              imgs: p.querySelectorAll ? p.querySelectorAll('img').length : 0});
  p = p.parentElement;
}
return JSON.stringify(chain, null, 1);
"""))

print("== 点击该卡片 ==")
pos = wd.js(MAT + """
if (!d) return 'no-dialog';
const label = [...d.querySelectorAll('*')].find(el =>
  el.children.length === 0 && /DWRG03/.test(el.innerText||'') && el.getBoundingClientRect().height > 0);
if (!label) return 'no-label';
const card = label.closest('[class*=item],[class*=card],[class*=Card]') || label.parentElement.parentElement;
card.scrollIntoView({block: 'center'});
const r = card.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y + Math.min(40, r.height/3)};
""")
print(pos)
if isinstance(pos, dict):
    wd.mouse_click(pos["x"], pos["y"])
time.sleep(2.5)

print("== 已选状态 ==")
print(wd.js(MAT + """
if (!d) return 'no-dialog';
const t = d.innerText;
const m = t.match(/已选(\\d+)个[^\\n]*/);
return JSON.stringify({selected: m ? m[0] : null,
  tail: t.replace(/\\n+/g,' | ').slice(-260)}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "selected_item.png")))
