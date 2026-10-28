"""流程第 4 步(2)：列出行内输入框的稳定标识，并写入自定义色值。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

wd = bb.connect()
for h in wd.handles():
    try:
        wd.switch(h)
        if "/goods/edit" in (wd.url() or ""):
            handle = h
    except Exception:
        continue
wd.switch(handle)

wd.press_key("Escape")
time.sleep(0.6)

print("== 末行所有输入框及其 form-item id ==")
print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const rows = [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
const tr = rows[rows.length - 1];
return JSON.stringify([...tr.querySelectorAll('input')].map(inp => {
  const owner = inp.closest('[id]');
  const td = inp.closest('td');
  const tdIndex = td && td.parentElement ? [...td.parentElement.children].indexOf(td) : -1;
  return {ph: inp.placeholder, value: inp.value, formItemId: owner ? owner.id : null, tdIndex};
}), null, 1);
"""))

print("== 写入自定义色值 Mixed Color2 ==")
xpath = '//div[@id="productSkcList[1].mainSpec[0]"]//input'
try:
    eid = wd.find("xpath", xpath)
    print("找到输入框:", eid)
    wd.el_click(eid)
    time.sleep(0.6)
    wd.press_key("Escape")
    time.sleep(0.4)
    wd.el_send_keys(eid, "Mixed Color2")
    time.sleep(0.8)
    print("输入框值:", wd.el_attr(eid, "value"))
except Exception as exc:  # noqa: BLE001
    print("ERR", exc)

print("shot:", wd.screenshot(os.path.join(os.getcwd(), "probes", "shots", "color_set.png")))
