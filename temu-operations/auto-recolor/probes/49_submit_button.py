"""确认“提交”按钮位置与当前编辑页状态（不点击提交）。"""
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

print(wd.js("""
const btn = [...document.querySelectorAll('button')].find(el =>
  (el.innerText||'').trim() === '提交' && el.getBoundingClientRect().height > 0);
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const rows = table ? [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length) : [];
return JSON.stringify({
  submitRect: btn ? (() => { const r = btn.getBoundingClientRect();
    return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })() : null,
  submitDisabled: btn ? btn.disabled : null,
  rows: rows.map(tr => {
    const tds = [...tr.querySelectorAll('td')];
    return {color: tds[0] ? tds[0].querySelector('input').value : null,
            imgCount: [...tds[1].querySelectorAll('img')].length};
  }),
  pageHeight: document.body.scrollHeight
}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "final_state.png")))
