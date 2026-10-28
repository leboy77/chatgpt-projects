"""流程第 4 步(1)：点击 色值 的 添加，检查新行上传入口是否可用。"""
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
print("url:", wd.url())

ADD_SEL = "document.querySelector('div[class*=product-skc_specItem] > a[class*=BTN_]')"

print("滚动到添加按钮:", wd.js("""
const add = %s;
if (!add) return 'not-found';
add.scrollIntoView({block: 'center'});
return 'ok';
""" % ADD_SEL))
time.sleep(1.2)

pos = wd.js("""
const add = %s;
if (!add) return null;
const r = add.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y + r.height/2, top: r.top, bottom: r.bottom,
        inView: r.top > 0 && r.bottom < window.innerHeight};
""" % ADD_SEL)
print("添加按钮:", pos)

if pos and pos["inView"]:
    wd.mouse_click(pos["x"], pos["y"])
    time.sleep(3)

print("== 色值行 ==")
print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const rows = [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
return JSON.stringify(rows.map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  const color = tds[0] ? tds[0].querySelector('input') : null;
  const trigger = tr.querySelector('[class*=upload-trigger_wrap]');
  return {row: i, colorValue: color ? color.value : null, ph: color ? color.placeholder : null,
          triggerCls: trigger ? (trigger.className||'').toString().slice(0, 130) : null};
}), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "add_row_result.png")))
