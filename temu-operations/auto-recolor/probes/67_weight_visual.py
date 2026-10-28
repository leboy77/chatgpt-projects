"""滚到体积重量表截图看实际渲染。"""
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
print(wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
if (!t) return 'no-table';
t.scrollIntoView({block: 'center', behavior: 'instant'});
return 'ok';
"""))
time.sleep(2)
print("行概览:", wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
return JSON.stringify(rows.map(tr => {
  const tds = [...tr.querySelectorAll('td')];
  return {first: (tds[0].innerText||'').replace(/\\s+/g,' ').trim().slice(0,12),
          all: (tr.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 60)};
}), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "weight_visual.png")))
print("页面高度/滚动:", wd.js("return JSON.stringify({h: document.body.scrollHeight, y: window.scrollY});"))
