"""查看当前页面上所有可见弹层。"""
import json
import os
import sys

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
print("url:", wd.url())

print(wd.js("""
const layers = [...document.querySelectorAll('div')].filter(el => {
  const r = el.getBoundingClientRect();
  const t = (el.innerText || '').trim();
  return r.height > 180 && r.width > 300 && t;
}).slice(-40);
const interesting = layers.filter(el => /MDL_|Modal|Drawer|dialog/i.test((el.className||'').toString()));
return JSON.stringify(interesting.slice(-8).map(el => ({
  cls: (el.className||'').toString().slice(0, 70),
  rect: [Math.round(el.getBoundingClientRect().x), Math.round(el.getBoundingClientRect().y),
         Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)],
  text: (el.innerText||'').replace(/\\n+/g, ' | ').slice(0, 200)
})), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "layers.png")))
