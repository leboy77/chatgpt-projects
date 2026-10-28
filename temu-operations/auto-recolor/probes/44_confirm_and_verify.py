"""流程第 4 步收尾：确认选择 -> 校验轮播图是否写入。"""
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
        if "/goods/edit" in (wd.url() or ""):
            handle = h
    except Exception:
        continue
wd.switch(handle)

MAT = """
const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')]
  .filter(el => /素材中心/.test(el.innerText||'')).pop();
"""

pos = wd.js(MAT + """
if (!d) return 'no-dialog';
const el = [...d.querySelectorAll('*')].find(x =>
  x.children.length === 0 && (x.innerText||'').trim() === '确认' && x.getBoundingClientRect().height > 0);
if (!el) return 'no-btn';
const t = el.closest('button,[role=button]') || el.parentElement;
const r = t.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y + r.height/2};
""")
print("确认按钮:", pos)
if isinstance(pos, dict):
    wd.mouse_click(pos["x"], pos["y"])
time.sleep(4)

print("弹窗是否关闭:", wd.js(MAT + "return d ? 'still-open' : 'closed';"))

print("== 色值行轮播图 ==")
print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const rows = [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
return JSON.stringify(rows.map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  const color = tds[0] ? tds[0].querySelector('input') : null;
  const cell = tds[1];
  const imgs = [...cell.querySelectorAll('img')].map(im => (im.src||'').slice(0, 70));
  return {row: i, color: color ? color.value : null, imgCount: imgs.length, imgs: imgs.slice(0, 4)};
}), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "carousel_after_confirm.png")))
