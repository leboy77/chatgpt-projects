"""把「全选 + 尺码勾选」区域的 HTML 结构 dump 出来。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

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

print(wd.js("""
const all = [...document.querySelectorAll('*')];
const hits = all.filter(el => (el.innerText||'').replace(/\\s+/g,'') === '全选');
const out = hits.map(h => {
  let box = h;
  for (let i = 0; i < 6 && box.parentElement; i++) {
    box = box.parentElement;
    if ((box.innerText||'').includes('XXXL')) break;
  }
  return {
    cls: (box.className||'').toString().slice(0, 70),
    text: (box.innerText||'').replace(/\\n+/g,' | ').slice(0, 400),
    html: box.outerHTML.slice(0, 1800)
  };
});
return JSON.stringify(out, null, 1);
"""))
