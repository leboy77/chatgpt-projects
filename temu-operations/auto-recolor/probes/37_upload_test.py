"""流程第 4 步(4)：给素材中心弹窗的 file input 设置文件并跟踪上传状态。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")
os.makedirs(SHOTS, exist_ok=True)

IMG = r"C:\Users\QZJLKJ\Desktop\DWRG主图\DWRG03.jpg"

wd = bb.connect()
for h in wd.handles():
    try:
        wd.switch(h)
        if "/goods/edit" in (wd.url() or ""):
            handle = h
    except Exception:
        continue
wd.switch(handle)

DLG = """
const cands = [...document.querySelectorAll('[class*=MDL_outerWrapper],[class*=MDL_inner]')]
  .filter(el => el.getBoundingClientRect().height > 200 && (el.innerText||'').includes('素材中心'));
return cands.length ? cands[cands.length - 1] : null;
"""

print("弹窗存在:", wd.js("const c = (function(){ %s })(); return c ? 'yes' : 'no';" % DLG))

print("标记 file input:", wd.js("""
const c = (function(){ %s })();
if (!c) return 'no-dialog';
const inputs = [...c.querySelectorAll('input[type=file]')];
inputs.forEach((el, i) => el.setAttribute('data-auto-idx', String(i)));
return 'count=' + inputs.length;
""" % DLG))

try:
    eid = wd.find("xpath", '//input[@data-auto-idx="0"]')
    wd.upload_file(eid, IMG)
    print("已选择文件:", IMG)
except Exception as exc:  # noqa: BLE001
    print("失败:", exc)

for i in range(1, 12):
    time.sleep(4)
    txt = wd.js("""
    const c = (function(){ %s })();
    if (!c) return 'NO-DIALOG';
    return c.innerText.replace(/\\n+/g, ' | ').slice(0, 400);
    """ % DLG)
    print(f"[{i*4}s] {txt[:320]}")
    if "上传成功" in txt or "上传失败" in txt or "失败" in txt:
        break

print("shot:", wd.screenshot(os.path.join(SHOTS, "upload_progress.png")))
