"""重载编辑页 -> 新增一行色值 -> 干净写入色值名 -> 检查体积重量表分组。"""
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

print("重载:", wd.url().split("#")[0])
wd.navigate(wd.url().split("#")[0])
time.sleep(12)
print("初始色值行:", wd.js("return JSON.stringify(window.__TEMU_IMG_BOT_API__.specRows().map((tr,i)=>i+':'+(tr.querySelector('td input')||{}).value));"))

print("加一行:", wd.js("""
const add = document.querySelector('div[class*=product-skc_specItem] > a[class*=BTN_]');
add.scrollIntoView({block:'center', behavior:'instant'});
return 'ok';
"""))
time.sleep(1)
pos = wd.js("""
const add = document.querySelector('div[class*=product-skc_specItem] > a[class*=BTN_]');
const r = add.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y + r.height/2};
""")
wd.mouse_click(pos["x"], pos["y"])
time.sleep(3)
print("添加后行数:", wd.js("return window.__TEMU_IMG_BOT_API__.specRows().length;"))

eid = wd.find("xpath", '//div[@id="productSkcList[1].mainSpec[0]"]//input')
wd.el_click(eid)
time.sleep(0.8)
wd.press_key("ESCAPE")
time.sleep(0.4)
wd.el_send_keys(eid, "Mixed Color2")
time.sleep(2)
print("色值:", wd.el_attr(eid, "value"))

time.sleep(3)
print("== 体积重量表 ==")
print(wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
if (!t) return 'no-table';
const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
const summary = rows.map(tr => {
  const tds = [...tr.querySelectorAll('td')];
  return (tds[0] && tds[0].innerText || '').replace(/\\s+/g,' ').trim().slice(0, 14);
});
return JSON.stringify({rowCount: rows.length, firstCells: summary}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "weight_fresh.png")))
