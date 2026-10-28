"""走查第 3 步：点击行内“编辑”，抓取弹出菜单项。"""
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
    wd.switch(h)
    if "agentseller.temu.com/goods/list" in (wd.url() or ""):
        break

print("shot:", wd.screenshot(os.path.join(SHOTS, "goods_list.png")))

# 滚到第一个 编辑 按钮并点击
print(wd.js("""
const el = [...document.querySelectorAll('[data-testid=beast-core-button-link]')]
  .find(e => (e.innerText||'').trim() === '编辑');
if (!el) return 'no-edit-button';
el.scrollIntoView({block: 'center'});
el.click();
return 'clicked';
"""))
time.sleep(1.5)

print("== 点击后弹出的菜单 ==")
print(wd.js("""
const popups = [...document.querySelectorAll('[class*=Popover],[class*=popover],[class*=Dropdown],[class*=dropdown],[class*=Menu],[class*=menu]')]
  .filter(el => el.getBoundingClientRect().height > 0 && (el.innerText||'').trim());
return JSON.stringify(popups.slice(-6).map(el => ({
  cls: (el.className||'').toString().slice(0, 80), text: el.innerText.trim().slice(0, 300)})), null, 1);
"""))

print("== 点击后当前 URL / 标签页数 ==")
print(wd.url(), len(wd.handles()))
print("shot2:", wd.screenshot(os.path.join(SHOTS, "goods_list_after_edit_click.png")))
