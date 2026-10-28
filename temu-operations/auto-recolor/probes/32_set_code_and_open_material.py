"""流程第 4 步(3)(4)：填货号 -> 打开新行 素材中心。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")
os.makedirs(SHOTS, exist_ok=True)

ROW = 1
ART_NO = "DWRG"

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
time.sleep(0.5)

# 1) 货号
try:
    eid = wd.find("xpath", f'//*[@id="productSkcList[{ROW}].extCode"]//input')
    wd.el_click(eid)
    time.sleep(0.3)
    wd.el_send_keys(eid, ART_NO)
    time.sleep(0.6)
    print("货号:", wd.el_attr(eid, "value"))
except Exception as exc:  # noqa: BLE001
    print("货号写入失败:", exc)

# 2) 打开 素材中心
print("滚动:", wd.js("""
const rows = [...document.querySelectorAll('[id^="productSkcList"]')];
const row = document.querySelector('[id="productSkcList[%d].carouselImgsI18n.common"]');
if (!row) return 'row-not-found';
const trigger = row.querySelector('[class*=upload-trigger_wrap]');
if (!trigger) return 'trigger-not-found';
trigger.scrollIntoView({block: 'center'});
return 'ok';
""" % ROW))
time.sleep(1.2)

pos = wd.js("""
const row = document.querySelector('[id="productSkcList[%d].carouselImgsI18n.common"]');
const trigger = row.querySelector('[class*=upload-trigger_wrap]');
if (!trigger) return null;
const r = trigger.getBoundingClientRect();
return {x: r.x + r.width/2, y: r.y + r.height/2, inView: r.top > 0 && r.bottom < window.innerHeight};
""" % ROW)
print("素材中心按钮:", pos)

if pos and pos["inView"]:
    wd.mouse_click(pos["x"], pos["y"])
time.sleep(4)

print("== 弹窗/上传面层 ==")
print(wd.js("""
const layer = [...document.querySelectorAll('*')].filter(el =>
  el.getBoundingClientRect().height > 200 && /MDL_|DLG_|drawer|Drawer/i.test((el.className||'').toString()));
const dlg = [...document.querySelectorAll('[role=dialog]')].filter(el => el.getBoundingClientRect().height > 200);
const picked = dlg.length ? dlg : layer.slice(-2);
if (!picked.length) {
  return 'no-dialog; fileInputs=' + document.querySelectorAll('input[type=file]').length;
}
const out = picked.map(d => ({cls: (d.className||'').toString().slice(0,80),
  text: (d.innerText||'').slice(0, 700),
  fileInputs: [...d.querySelectorAll('input[type=file]')].map(i => ({accept: i.accept, multiple: i.multiple, visible: i.getBoundingClientRect().height > 0}))}));
return JSON.stringify({totalFileInputs: document.querySelectorAll('input[type=file]').length, out}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "upload_dialog.png")))
