"""流程第 4 步(4)(5)：上传 1 张主图到素材中心，观察上传列表与选中流程。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")
os.makedirs(SHOTS, exist_ok=True)

ROW = 1
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
print("url:", wd.url())


def dialog_text(limit=900):
    return wd.js("""
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(el => el.getBoundingClientRect().height > 200).pop();
    return dlg ? dlg.innerText.slice(0, %d) : 'NO-DIALOG';
    """ % limit)


# 1) 打开素材中心
wd.js("""
const row = document.querySelector('[id="productSkcList[%d].carouselImgsI18n.common"]');
const trigger = row.querySelector('[class*=upload-trigger_wrap]');
trigger.scrollIntoView({block: 'center'});
return 'ok';
""" % ROW)
time.sleep(1.2)
pos = wd.js("""
const row = document.querySelector('[id="productSkcList[%d].carouselImgsI18n.common"]');
const trigger = row.querySelector('[class*=upload-trigger_wrap]');
const r = trigger.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y + r.height/2, inView: r.top > 0 && r.bottom < window.innerHeight};
""" % ROW)
print("触发按钮:", pos)
if pos and pos["inView"]:
    wd.mouse_click(pos["x"], pos["y"])
time.sleep(4)
print("弹窗已打开:", dialog_text(80).replace("\n", " | ")[:80])

# 2) 直接给弹窗内的 file input 设置文件（等价于“本地上传”选文件）
print("设置文件:", wd.js("""
const dlg = [...document.querySelectorAll('[role=dialog]')].filter(el => el.getBoundingClientRect().height > 200).pop();
if (!dlg) return 'no-dialog';
const inputs = [...dlg.querySelectorAll('input[type=file]')];
if (!inputs.length) return 'no-file-input';
inputs.forEach((el, i) => { el.setAttribute('data-auto-idx', String(i)); });
return 'count=' + inputs.length;
"""))

try:
    eid = wd.find("xpath", '//input[@data-auto-idx="0"]')
    wd.upload_file(eid, IMG)
    print("已提交文件:", IMG)
except Exception as exc:  # noqa: BLE001
    print("上传失败:", exc)

for i in range(1, 11):
    time.sleep(3)
    txt = dialog_text(400).replace("\n", " | ")
    print(f"[{i*3}s] {txt[:300]}")
    if "上传成功" in txt or "上传失败" in txt:
        break

print("shot:", wd.screenshot(os.path.join(SHOTS, "after_upload.png")))
print("== 弹窗完整文本 ==")
print(dialog_text(1500))
