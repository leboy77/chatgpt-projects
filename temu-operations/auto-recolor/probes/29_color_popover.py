"""流程第 4 步(2)：真实鼠标打开 色值 弹层，看可选颜色与自定义输入。"""
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

SEL_ROW = """
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const rows = [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
const td = rows[rows.length - 1].querySelectorAll('td')[0];
const input = td.querySelector('input');
"""

print("滚动:", wd.js(SEL_ROW + "input.scrollIntoView({block:'center'}); return 'ok';"))
time.sleep(1.0)

pos = wd.js(SEL_ROW + """
const r = input.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y + r.height/2, inView: r.top > 0 && r.bottom < window.innerHeight};
""")
print("输入框位置:", pos)

if pos and pos["inView"]:
    wd.mouse_click(pos["x"], pos["y"])
time.sleep(2.0)

print("== 弹层 ==")
print(wd.js("""
const pops = [...document.querySelectorAll('[class*=PP_dropdownMain],[class*=popover],[class*=Popover],[class*=dropdownMain]')]
  .filter(el => el.getBoundingClientRect().height > 30 && (el.innerText||'').trim());
if (!pops.length) return 'no-popover';
const p = pops[pops.length - 1];
const opts = [];
const walk = el => {
  if (el.children.length === 0) {
    const t = (el.innerText||'').trim();
    if (t && t.length <= 24) opts.push(t);
  } else { [...el.children].forEach(walk); }
};
walk(p);
return JSON.stringify({cls: (p.className||'').toString().slice(0,90),
  text: p.innerText.slice(0, 500), options: [...new Set(opts)].slice(0, 40)}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "color_popover.png")))
