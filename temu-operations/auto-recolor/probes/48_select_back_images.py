"""流程第 5 步：关闭去重提示 -> 选中两张背面图 -> 确认。"""
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


def click_text(label, nth=0):
    p = wd.js("""
    const els = [...document.querySelectorAll('*')].filter(x =>
      x.children.length === 0 && (x.innerText||'').trim() === %s && x.getBoundingClientRect().height > 0);
    if (els.length <= %d) return 'not-found(' + els.length + ')';
    const t = els[%d].closest('button,[role=button],a') || els[%d].parentElement;
    const r = t.getBoundingClientRect();
    return {x: r.x + r.width/2, y: r.y + r.height/2};
    """ % (json.dumps(label, ensure_ascii=False), nth, nth, nth))
    if isinstance(p, dict):
        wd.mouse_click(p["x"], p["y"])
    return p


print("关闭去重提示:", click_text("关闭"))
time.sleep(1.5)
print("关闭上传列表面板:", click_text("上传列表"))
time.sleep(2)


def pick(name_pattern, label):
    pos = wd.js("""
    const re = new RegExp(%s);
    const labels = [...document.querySelectorAll('*')].filter(el =>
      re.test((el.innerText||'').trim()) && el.getBoundingClientRect().height > 0);
    if (!labels.length) return 'no-label';
    const name = labels[0];
    name.scrollIntoView({block: 'center'});
    const r = name.getBoundingClientRect();
    return {x: r.x + r.width/2, y: r.y - 45, label: name.innerText.trim()};
    """ % json.dumps(name_pattern))
    print(f"选中 {label}:", pos)
    if isinstance(pos, dict):
        wd.mouse_click(pos["x"], pos["y"])
        time.sleep(1.5)


pick(r"^X面料图-\d+$", "X面料图")
pick(r"^Z尺码表-\d+$", "Z尺码表")

print("已选:", wd.js("""
const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')]
  .filter(el => /素材中心/.test(el.innerText||'')).pop();
if (!d) return 'no-dialog';
const m = d.innerText.match(/已选\\d+个[^\\n]*/);
return m ? m[0] : 'none';
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "back_selected.png")))
