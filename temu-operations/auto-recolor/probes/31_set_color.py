"""流程第 4 步(2)：用多种 XPath 变体定位色值输入框并写入自定义值。"""
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
time.sleep(0.5)

variants = [
    '//input[@placeholder="选择或自定义颜色"]',
    '//*[@id="productSkcList[1].mainSpec[0]"]//input',
    '//div[contains(@id,"mainSpec")]//input',
    '(//input[@placeholder="选择或自定义颜色"])[last()]',
]
for xp in variants:
    try:
        eid = wd.find("xpath", xp)
        print("OK  ", xp, "->", eid)
    except Exception as exc:  # noqa: BLE001
        print("FAIL", xp, "->", str(exc)[:80])

# 用最后一个色值输入框写入
target = None
for xp in ['(//input[@placeholder="选择或自定义颜色"])[last()]',
           '//input[@placeholder="选择或自定义颜色"]']:
    try:
        ids = wd.find_all("xpath", xp)
        if ids:
            target = ids[-1]
            break
    except Exception:  # noqa: BLE001
        continue

print("目标输入框:", target)
if target:
    wd.el_click(target)
    time.sleep(0.6)
    wd.press_key("Escape")
    time.sleep(0.5)
    wd.el_send_keys(target, "Mixed Color2")
    time.sleep(1.0)
    print("值:", wd.el_attr(target, "value"))

print("shot:", wd.screenshot(os.path.join(os.getcwd(), "probes", "shots", "color_set.png")))
