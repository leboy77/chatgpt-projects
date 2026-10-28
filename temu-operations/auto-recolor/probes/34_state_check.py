"""检查当前编辑页状态：色值行是否还在、弹窗是否打开。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")

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

print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const rows = table ? [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length) : [];
const dlg = [...document.querySelectorAll('[role=dialog]')].filter(el => el.getBoundingClientRect().height > 200);
return JSON.stringify({
  rows: rows.map(tr => {
    const tds = [...tr.querySelectorAll('td')];
    const color = tds[0] ? tds[0].querySelector('input') : null;
    const code = tr.querySelector('input[id], input[placeholder="请输入"]');
    return {color: color ? color.value : null, artNo: code ? code.value : null,
            imgs: tr.querySelectorAll('img').length};
  }),
  dialogs: dlg.length,
  banner: (document.body.innerText.match(/正在获取商品数据[^\\n]*/) || [''])[0]
}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "state_now.png")))
