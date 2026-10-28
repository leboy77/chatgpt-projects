"""流程第 4 步：上传列表 -> 选中图片 -> 确认。"""
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

MAT = """
const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')]
  .filter(el => /素材中心/.test(el.innerText||'')).pop();
"""


def txt(limit=700):
    return wd.js(MAT + "return d ? d.innerText.replace(/\\n+/g,' | ').slice(0, %d) : 'NO-DIALOG';" % limit)


def click_by_text(label):
    p = wd.js(MAT + """
    if (!d) return 'no-dialog';
    const el = [...d.querySelectorAll('*')].find(x =>
      x.children.length === 0 && (x.innerText||'').trim() === %s && x.getBoundingClientRect().height > 0);
    if (!el) return 'no-btn';
    const t = el.closest('button,[role=button],a,li') || el.parentElement;
    const r = t.getBoundingClientRect();
    return {x: r.x + r.width/2, y: r.y + r.height/2};
    """ % json.dumps(label, ensure_ascii=False))
    if isinstance(p, dict):
        wd.mouse_click(p["x"], p["y"])
    return p


print("点击 上传列表:", click_by_text("上传列表"))
time.sleep(3)
print("上传列表内容:", txt(600))
print("shot1:", wd.screenshot(os.path.join(SHOTS, "upload_tab.png")))

print("== 上传列表内的条目 ==")
print(wd.js(MAT + """
if (!d) return 'no-dialog';
const items = [...d.querySelectorAll('[class*=upload],[class*=Upload]')].filter(el => el.getBoundingClientRect().height > 20);
const out = items.slice(-8).map(el => ({
  cls: (el.className||'').toString().slice(0, 60),
  rect: [Math.round(el.getBoundingClientRect().x), Math.round(el.getBoundingClientRect().y),
         Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)],
  text: (el.innerText||'').replace(/\\n+/g, ' | ').slice(0, 120),
  imgs: el.querySelectorAll('img').length
}));
return JSON.stringify(out, null, 1);
"""))
