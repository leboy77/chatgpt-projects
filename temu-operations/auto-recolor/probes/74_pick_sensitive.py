"""在敏感属性下拉里点「否」并验证是否写入。"""
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

print("点「否」:", wd.js("""
const pops = [...document.querySelectorAll('[class*=dropdownMain],[class*=dropdownPanel]')]
  .filter(el => el.getBoundingClientRect().height > 20 && (el.innerText||'').includes('是否敏感品'));
if (!pops.length) return 'no-dropdown';
const pop = pops[pops.length - 1];
const opt = [...pop.querySelectorAll('*')].find(el => el.children.length === 0 && (el.innerText||'').trim() === '否');
if (!opt) return 'no-option';
opt.scrollIntoView({block: 'nearest'});
const r = opt.getBoundingClientRect();
return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
"""))
pos = json.loads(wd.js("""
const pops = [...document.querySelectorAll('[class*=dropdownMain],[class*=dropdownPanel]')]
  .filter(el => el.getBoundingClientRect().height > 20 && (el.innerText||'').includes('是否敏感品'));
const pop = pops[pops.length - 1];
const opt = [...pop.querySelectorAll('*')].find(el => el.children.length === 0 && (el.innerText||'').trim() === '否');
const r = opt.getBoundingClientRect();
return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
"""))
wd.mouse_click(pos["x"], pos["y"])
time.sleep(2)

print("第 6 行现在的值:", wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
const tds = [...rows[6].querySelectorAll('td')];
return JSON.stringify({
  sensitiveText: (tds[2].innerText||'').replace(/\\s+/g,' ').trim(),
  dims: [...tds[3].querySelectorAll('input')].map(x => x.value),
  weight: [...tds[4].querySelectorAll('input')].map(x => x.value)
});
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "sensitive_picked.png")))
