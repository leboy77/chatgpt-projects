"""调试：为什么 素材中心 弹窗有时不打开。"""
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
        if "/goods/edit" in (wd.url() or ""):
            handle = h
    except Exception:
        continue
wd.switch(handle)

INFO = """
const row = document.querySelector('[id="productSkcList[1].carouselImgsI18n.common"]');
if (!row) return 'row-not-found';
const trigger = row.querySelector('[class*=upload-trigger_wrap]');
const r = trigger.getBoundingClientRect();
const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
const hit = document.elementFromPoint(cx, cy);
return JSON.stringify({
  triggerCls: (trigger.className||'').toString().slice(0, 90),
  disabled: /disabled/.test((trigger.className||'').toString()),
  triggerRect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
  inView: r.top > 0 && r.bottom < window.innerHeight,
  hitCls: hit ? (hit.className||'').toString().slice(0, 70) : null,
  hitText: hit ? (hit.innerText||'').trim().slice(0, 30) : null,
  hitIsTriggerDescendant: hit ? trigger.contains(hit) : null
}, null, 1);
"""

print("滚动:", wd.js("""
const row = document.querySelector('[id="productSkcList[1].carouselImgsI18n.common"]');
if (!row) return 'row-not-found';
row.querySelector('[class*=upload-trigger_wrap]').scrollIntoView({block: 'center'});
return 'ok';
"""))
time.sleep(1.5)
print("命中信息:", wd.js(INFO))

real = json.loads(wd.js(INFO))
wd.mouse_click(real["triggerRect"][0] + real["triggerRect"][2] / 2,
               real["triggerRect"][1] + real["triggerRect"][3] / 2)
time.sleep(3)

print("弹窗检测:", wd.js("""
const d = [...document.querySelectorAll('[role=dialog]')].filter(el => el.getBoundingClientRect().height > 100);
const m = [...document.querySelectorAll('[class*=MDL_],[class*=Drawer]')].filter(el => el.getBoundingClientRect().height > 200);
return JSON.stringify({roleDialogs: d.length, mdlCandidates: m.length,
  firstText: (d[0] || m[m.length-1] || {innerText: ''}).innerText.slice(0, 120)}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "dialog_debug.png")))
