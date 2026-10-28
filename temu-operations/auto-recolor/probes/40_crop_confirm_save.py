"""流程第 4/5 步：确认裁剪 -> 保存 -> 观察素材中心列表。"""
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

CROP = """
const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')]
  .filter(el => /裁剪/.test(el.innerText||'')).pop();
"""


def crop_text():
    return wd.js(CROP + "return d ? d.innerText.replace(/\\n+/g,' | ').slice(0,220) : 'NO-CROP';")


def btn_pos(label):
    return wd.js(CROP + """
    if (!d) return 'no-dialog';
    const el = [...d.querySelectorAll('*')].find(x =>
      x.children.length === 0 && (x.innerText||'').trim() === %s && x.getBoundingClientRect().height > 0);
    if (!el) return 'no-btn';
    const t = el.closest('button,[role=button]') || el.parentElement;
    const r = t.getBoundingClientRect();
    return {x: r.x + r.width/2, y: r.y + r.height/2};
    """ % json.dumps(label, ensure_ascii=False))


print("裁剪弹窗:", crop_text())

p = btn_pos("确认裁剪")
print("确认裁剪:", p)
if isinstance(p, dict):
    wd.mouse_click(p["x"], p["y"])
time.sleep(3)
print("确认后:", crop_text())
print("shot1:", wd.screenshot(os.path.join(SHOTS, "crop_confirmed.png")))

p = btn_pos("保存")
print("保存:", p)
if isinstance(p, dict):
    wd.mouse_click(p["x"], p["y"])
time.sleep(5)
print("保存后裁剪弹窗:", crop_text())

print("== 素材中心弹窗文本 ==")
print(wd.js("""
const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')]
  .filter(el => /素材中心/.test(el.innerText||'')).pop();
return d ? d.innerText.replace(/\\n+/g, ' | ').slice(0, 700) : 'NO-MATERIAL-DIALOG';
"""))
print("shot2:", wd.screenshot(os.path.join(SHOTS, "after_save.png")))
