"""定位「尺码」选择区（颜色×尺码 勾选），确认新颜色的尺码状态。"""
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
print("页面:", wd.url())

print("== 页面所有 checkbox 及其上下文 ==")
print(wd.js("""
const boxes = [...document.querySelectorAll('input[type=checkbox]')].filter(el => el.getBoundingClientRect().height > 0);
const out = [];
boxes.slice(0, 40).forEach(cb => {
  let label = '';
  const wrap = cb.closest('label') || cb.parentElement;
  if (wrap) label = (wrap.innerText || '').replace(/\\s+/g,' ').trim().slice(0, 24);
  let ctx = cb.parentElement;
  for (let i = 0; i < 6 && ctx; i++) {
    if ((ctx.innerText||'').includes('全选')) break;
    ctx = ctx.parentElement;
  }
  out.push({checked: cb.checked, label,
    ctxHead: ctx ? (ctx.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 160) : null});
});
return JSON.stringify(out.slice(0, 20), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "size_picker.png")))
