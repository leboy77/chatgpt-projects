"""流程第 1-2 步：SKC 查询（坐标点击 查询 按钮）。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SKC = sys.argv[1] if len(sys.argv) > 1 else "46350409750"

wd = bb.connect()
for h in wd.handles():
    try:
        wd.switch(h)
        if "agentseller.temu.com/goods/list" in (wd.url() or ""):
            break
    except Exception:
        continue
print("列表页:", wd.url())

# 1) 确保 ID 类型 = SKC
print("ID类型:", wd.js("""
const inputs = [...document.querySelectorAll('input')].filter(el => el.getBoundingClientRect().height > 0);
const sel = inputs.find(el => el.value === 'SKC' || el.value === 'SKU' || el.value === 'SPU');
if (!sel) return 'type-input-not-found';
if (sel.value === 'SKC') return 'already-SKC';
return 'current=' + sel.value;
"""))

# 2) 填写 SKC
print("填值:", wd.js("""
const input = [...document.querySelectorAll('input')]
  .find(el => el.placeholder === '多个查询请空格或逗号依次输入' && el.getBoundingClientRect().height > 0);
if (!input) return 'no-input';
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(input, '%s');
input.dispatchEvent(new Event('input', {bubbles: true}));
input.dispatchEvent(new Event('change', {bubbles: true}));
return input.value;
""" % SKC))
time.sleep(0.5)

# 3) 坐标点击 查询
pos = wd.js("""
const btn = [...document.querySelectorAll('button')].find(el =>
  (el.innerText||'').trim() === '查询' && el.getBoundingClientRect().height > 0);
if (!btn) return null;
const r = btn.getBoundingClientRect();
return {x: r.x + r.width / 2, y: r.y + r.height / 2};
""")
print("查询按钮:", pos)
if pos:
    wd.mouse_click(pos["x"], pos["y"])
time.sleep(8)

print("== 结果 ==")
print(wd.js("""
const txt = document.body.innerText || '';
const m = txt.match(/全部\\s*(\\d+)/);
const rows = [...document.querySelectorAll('tbody tr')];
const cells = [...document.querySelectorAll('*')].filter(el =>
  el.children.length === 0 && (el.innerText||'').trim() === '%s');
return JSON.stringify({total: m ? m[1] : null, tbodyRows: rows.length, skcCells: cells.length,
  firstRowText: rows[0] ? rows[0].innerText.slice(0, 200) : null}, null, 1);
""" % SKC))
print("shot:", wd.screenshot(os.path.join(os.getcwd(), "probes", "shots", "search_result.png")))
