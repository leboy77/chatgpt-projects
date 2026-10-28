"""滚到「尺码」区域截图，并 dump 每个勾选组的上下文（判断是否按颜色分组）。"""
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

print("滚动到尺码:", wd.js("""
const label = [...document.querySelectorAll('*')].find(el =>
  el.children.length === 0 && (el.innerText||'').trim() === '尺码');
if (!label) return 'no-label';
label.scrollIntoView({block: 'start', behavior: 'instant'});
return 'ok';
"""))
time.sleep(2)

print("== 勾选组上下文 ==")
print(wd.js("""
const groups = [...document.querySelectorAll('[data-testid=beast-core-checkbox]')]
  .filter(el => (el.innerText||'').includes('全选'));
const out = groups.map(g => {
  let ctx = g;
  for (let i = 0; i < 5 && ctx.parentElement; i++) ctx = ctx.parentElement;
  const boxes = [...ctx.querySelectorAll('[data-testid=beast-core-checkbox]')];
  return {
    ctxText: (ctx.innerText||'').replace(/\\n+/g,' | ').slice(0, 200),
    checkedLabels: boxes.filter(b => b.getAttribute('data-checked') === 'true')
      .map(b => (b.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 10))
  };
});
return JSON.stringify(out, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "size_area.png")))
