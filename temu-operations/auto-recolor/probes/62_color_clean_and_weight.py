"""清空并正确写入色值名后，检查体积重量表是否出现新颜色分组。"""
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

for row, name in ((1, "Mixed Color2"), (2, "Mixed Color3")):
    try:
        eid = wd.find("xpath", f'//div[@id="productSkcList[{row}].mainSpec[0]"]//input')
        wd.el_click(eid)
        time.sleep(0.6)
        wd.press_key("ESCAPE")
        time.sleep(0.3)
        wd.el_clear(eid)
        time.sleep(0.3)
        wd.el_send_keys(eid, name)
        time.sleep(1.2)
        print(f"第 {row} 行色值:", wd.el_attr(eid, "value"))
    except Exception as exc:  # noqa: BLE001
        print(f"第 {row} 行写入失败:", str(exc)[:80])

time.sleep(3)
print("规格行:", wd.js("""
const rows = window.__TEMU_IMG_BOT_API__.specRows();
return JSON.stringify(rows.map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  const c = tds[0] ? tds[0].querySelector('input') : null;
  return i + ':' + (c ? c.value : '?');
}));
"""))

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
print("shot:", wd.screenshot(os.path.join(SHOTS, "weight_after_color3.png")))
