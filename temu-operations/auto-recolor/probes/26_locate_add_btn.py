"""定位属于 商品规格/色值 的 添加 按钮：靠祖先链判断。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

wd = bb.connect()
for h in wd.handles():
    try:
        wd.switch(h)
        if "/goods/edit" in (wd.url() or ""):
            handle = h
    except Exception:
        continue
wd.switch(handle)

print(wd.js("""
const adds = [...document.querySelectorAll('*')].filter(el =>
  (el.innerText||'').replace(/\\s+/g,'') === '+添加' && el.getBoundingClientRect().height > 0);
const out = [];
adds.forEach((el, i) => {
  const chain = [];
  let p = el;
  let hasSpecTable = false;
  for (let d = 0; d < 12 && p; d++) {
    chain.push({tag: p.tagName, cls: (p.className||'').toString().slice(0, 70), id: p.id || ''});
    if (p.querySelector && [...p.querySelectorAll('table')].some(t => (t.innerText||'').includes('正面图'))) {
      hasSpecTable = true;
      break;
    }
    p = p.parentElement;
  }
  out.push({index: i, tag: el.tagName, ownCls: (el.className||'').toString().slice(0, 70),
            hasSpecTable, chain});
});
return JSON.stringify(out, null, 1);
"""))
