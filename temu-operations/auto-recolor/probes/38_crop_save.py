"""流程第 4/5 步：裁剪弹窗 -> 确认裁剪 -> 保存。"""
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


def crop_state():
    return wd.js("""
    const dlg = [...document.querySelectorAll('[class*=MDL_inner]')]
      .filter(el => el.getBoundingClientRect().height > 200 && (el.innerText||'').includes('待裁剪'));
    if (!dlg.length) return 'NO-CROP-DIALOG';
    const d = dlg[dlg.length - 1];
    const sizeInputs = [...d.querySelectorAll('input')].map(i => ({ph: i.placeholder, value: i.value}));
    return JSON.stringify({text: d.innerText.replace(/\\n+/g, ' | ').slice(0, 200), sizeInputs}, null, 1);
    """)


def click_text_in_crop(text):
    return wd.js("""
    const dlg = [...document.querySelectorAll('[class*=MDL_inner]')]
      .filter(el => el.getBoundingClientRect().height > 200 && (el.innerText||'').includes('待裁剪')).pop();
    if (!dlg) return 'no-dialog';
    const btn = [...dlg.querySelectorAll('button,[role=button],div,span')]
      .find(el => el.children.length === 0 && (el.innerText||'').trim() === %s
              && el.getBoundingClientRect().height > 0);
    if (!btn) return 'no-btn';
    const t = btn.closest('button,[role=button]') || btn.parentElement;
    const r = t.getBoundingClientRect();
    return {x: r.x + r.width/2, y: r.y + r.height/2};
    """ % json.dumps(text, ensure_ascii=False))


print("裁剪弹窗:", crop_state())

pos = click_text_in_crop("确认裁剪")
print("确认裁剪按钮:", pos)
if isinstance(pos, dict):
    wd.mouse_click(pos["x"], pos["y"])
time.sleep(3)
print("裁剪后:", crop_state())
print("shot1:", wd.screenshot(os.path.join(SHOTS, "after_crop_confirm.png")))

pos = click_text_in_crop("保存")
print("保存按钮:", pos)
if isinstance(pos, dict):
    wd.mouse_click(pos["x"], pos["y"])
time.sleep(4)
print("保存后:", crop_state())
print("shot2:", wd.screenshot(os.path.join(SHOTS, "after_crop_save.png")))
