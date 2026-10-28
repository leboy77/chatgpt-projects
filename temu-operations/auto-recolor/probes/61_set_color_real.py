"""用真实点击+键盘写入色值名，观察体积重量表是否出现新颜色分组。"""
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

xpath = '//div[@id="productSkcList[1].mainSpec[0]"]//input'
eid = wd.find("xpath", xpath)
print("输入框:", eid)
wd.el_click(eid)
time.sleep(0.8)
wd.press_key("ESCAPE")
time.sleep(0.5)
wd.el_send_keys(eid, "Mixed Color2")
time.sleep(1.5)
print("写入后行值:", wd.js("""
const rows = window.__TEMU_IMG_BOT_API__.specRows();
return JSON.stringify(rows.map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  const c = tds[0] ? tds[0].querySelector('input') : null;
  return i + ':' + (c ? c.value : '?');
}));
"""))

print("== 体积重量表分组 ==")
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
print("shot:", wd.screenshot(os.path.join(SHOTS, "weight_after_color2.png")))
