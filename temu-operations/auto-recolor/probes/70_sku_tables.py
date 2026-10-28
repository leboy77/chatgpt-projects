"""设置新行货号后，看 SKU 表 / 体积重量表是否出现新颜色。"""
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

try:
    eid = wd.find("xpath", '//div[@id="productSkcList[1].extCode"]//input')
    wd.el_click(eid)
    time.sleep(0.5)
    wd.el_clear(eid)
    time.sleep(0.3)
    wd.el_send_keys(eid, "DWRG")
    time.sleep(1.5)
    print("货号:", wd.el_attr(eid, "value"))
except Exception as exc:  # noqa: BLE001
    print("货号写入失败:", str(exc)[:80])

time.sleep(4)
print("== 所有表格概览 ==")
print(wd.js("""
const tables = [...document.querySelectorAll('table')];
return JSON.stringify(tables.map((t, i) => {
  const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
  const first = rows.map(tr => {
    const tds = [...tr.querySelectorAll('td')];
    return (tds[0] && tds[0].innerText || '').replace(/\\s+/g,' ').trim().slice(0, 10);
  });
  return {i, head: [...t.querySelectorAll('th')].map(e => (e.innerText||'').replace(/\\s+/g,'').slice(0,10)).slice(0,5),
          rowCount: rows.length, firstCells: first.slice(0, 14)};
}), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "sku_tables.png")))
