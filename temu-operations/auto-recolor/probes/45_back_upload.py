"""流程第 5 步：背面图上传（2 张）-> 裁剪弹窗 -> 设置 1350x1800。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")
os.makedirs(SHOTS, exist_ok=True)

ROW = 1
BACK1 = r"C:\Users\QZJLKJ\Desktop\DWRG背面图\X面料图.jpg"
BACK2 = r"C:\Users\QZJLKJ\Desktop\DWRG背面图\Z尺码表.jpg"

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
CROP = """
const c = [...document.querySelectorAll('[class*=MDL_innerWrapper]')]
  .filter(el => /裁剪/.test(el.innerText||'') && /待载剪|待保存/.test(el.innerText||'')).pop();
"""

# 1) 打开素材中心
wd.js("""
const row = document.querySelector('[id="productSkcList[%d].carouselImgsI18n.common"]');
const t = row.querySelector('[class*=upload-trigger_wrap]');
t.scrollIntoView({block: 'center'});
return 'ok';
""" % ROW)
time.sleep(1.2)
pos = wd.js("""
const row = document.querySelector('[id="productSkcList[%d].carouselImgsI18n.common"]');
const t = row.querySelector('[class*=upload-trigger_wrap]');
const r = t.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y + r.height/2};
""" % ROW)
wd.mouse_click(pos["x"], pos["y"])
time.sleep(4)
print("素材中心:", wd.js(MAT + "return d ? 'open' : 'not-open';"))

# 2) 设置 2 张背面图
print("标记 file input:", wd.js(MAT + """
if (!d) return 'no-dialog';
const inputs = [...d.querySelectorAll('input[type=file]')];
inputs.forEach((el, i) => el.setAttribute('data-auto-idx', String(i)));
return 'count=' + inputs.length;
"""))
try:
    eid = wd.find("xpath", '//input[@data-auto-idx="0"]')
    wd.upload_file(eid, [BACK1, BACK2])
    print("已选择 2 个背面图")
except Exception as exc:  # noqa: BLE001
    print("上传失败:", exc)

for i in range(6):
    time.sleep(3)
    st = wd.js(CROP + "return c ? c.innerText.replace(/\\n+/g,' | ').slice(0,180) : 'NO-CROP-YET';")
    print(f"[{i*3+3}s]", st)
    if st != "NO-CROP-YET":
        break

print("== 裁剪弹窗输入框 ==")
print(wd.js(CROP + """
if (!c) return 'no-crop';
return JSON.stringify([...c.querySelectorAll('input')].map((el, i) => {
  el.setAttribute('data-crop-idx', String(i));
  return {i, ph: el.placeholder, value: el.value};
}), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "back_crop_dialog.png")))
