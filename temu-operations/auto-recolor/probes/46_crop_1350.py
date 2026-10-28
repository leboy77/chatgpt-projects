"""流程第 5 步：把裁剪尺寸设为 1350x1800，确认裁剪并保存。"""
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

CROP_JS = """
const c = [...document.querySelectorAll('[class*=MDL_innerWrapper]')]
  .filter(el => /裁剪/.test(el.innerText||'') && /待载剪|待保存/.test(el.innerText||'')).pop();
"""


def state():
    return wd.js(CROP_JS + """
    if (!c) return 'NO-CROP';
    const inputs = [...c.querySelectorAll('input')].map(el => el.value);
    const m = c.innerText.match(/待载剪\\((\\d)\\)/);
    const s = c.innerText.match(/待保存\\((\\d)\\)/);
    return JSON.stringify({pending: m ? m[1] : null, saved: s ? s[1] : null, inputs,
      text: c.innerText.replace(/\\n+/g,' | ').slice(0, 120)}, null, 1);
    """)


def button_pos(label):
    return wd.js(CROP_JS + """
    if (!c) return 'no-crop';
    const el = [...c.querySelectorAll('*')].find(x =>
      x.children.length === 0 && (x.innerText||'').trim() === %s && x.getBoundingClientRect().height > 0);
    if (!el) return 'no-btn';
    const t = el.closest('button,[role=button]') || el.parentElement;
    const r = t.getBoundingClientRect();
    return {x: r.x + r.width/2, y: r.y + r.height/2, text: t.innerText.trim()};
    """ % json.dumps(label, ensure_ascii=False))


print("初始:", state())
time.sleep(4)
print("等待后:", state())

print("设置尺寸:", wd.js(CROP_JS + """
if (!c) return 'no-crop';
const inputs = [...c.querySelectorAll('input')];
if (inputs.length < 2) return 'need-2-inputs';
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const setVal = (el, v) => {
  setter.call(el, String(v));
  el.dispatchEvent(new Event('input', {bubbles: true}));
  el.dispatchEvent(new Event('change', {bubbles: true}));
};
setVal(inputs[0], 1350);
setVal(inputs[1], 1800);
return inputs.map(el => el.value).join(' x ');
"""))
time.sleep(2)
print("设置后:", state())

pos = button_pos("确认裁剪")
print("确认裁剪:", pos)
if isinstance(pos, dict):
    wd.mouse_click(pos["x"], pos["y"])
time.sleep(5)
print("裁剪后:", state())
print("shot1:", wd.screenshot(os.path.join(SHOTS, "crop_1350_done.png")))

pos = button_pos("保存")
print("保存:", pos)
if isinstance(pos, dict):
    wd.mouse_click(pos["x"], pos["y"])
time.sleep(6)
print("保存后:", state())
print("shot2:", wd.screenshot(os.path.join(SHOTS, "crop_1350_saved.png")))
