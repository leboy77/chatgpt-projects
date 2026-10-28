"""定位 查询/重置 按钮的 DOM 形态。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

wd = bb.connect()
for h in wd.handles():
    try:
        wd.switch(h)
        if "agentseller.temu.com/goods/list" in (wd.url() or ""):
            break
    except Exception:
        continue

print(wd.js("""
const hits = [...document.querySelectorAll('*')].filter(el =>
  (el.innerText||'').trim() === '查询' && el.getBoundingClientRect().height > 0);
return JSON.stringify(hits.map(el => ({
  tag: el.tagName,
  cls: (el.className||'').toString().slice(0, 90),
  testid: el.getAttribute('data-testid'),
  rect: [Math.round(el.getBoundingClientRect().x), Math.round(el.getBoundingClientRect().y),
         Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)]
})), null, 1);
"""))

print("== 输入框当前值 ==")
print(wd.js("""
const inputs = [...document.querySelectorAll('input')].filter(el =>
  el.getBoundingClientRect().height > 0).map(el => ({ph: el.placeholder, value: el.value}));
return JSON.stringify(inputs.slice(0, 6), null, 1);
"""))
