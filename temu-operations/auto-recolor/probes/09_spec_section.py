"""走查：关闭干扰弹层，定位 商品规格->色值 表格结构。"""
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
            break
    except Exception:
        continue
print("url:", wd.url())

# 1) 关掉可能打开的下拉
wd.press_key("Escape")
time.sleep(0.5)

# 2) 关掉消息抽屉：优先找抽屉容器内的关闭按钮
print("抽屉关闭:", wd.js("""
const drawer = [...document.querySelectorAll('*')].find(el =>
  (el.innerText||'').includes('全部消息') && el.getBoundingClientRect().height > 100);
if (!drawer) return 'no-drawer';
let box = drawer;
for (let i = 0; i < 6 && box.parentElement; i++) box = box.parentElement;
const btn = [...box.querySelectorAll('*')].find(el => {
  const c = (el.className||'').toString();
  return el.getBoundingClientRect().height > 0 && /close/i.test(c);
});
if (btn) { btn.dispatchEvent(new MouseEvent('click', {bubbles: true})); return 'clicked-close'; }
return 'no-close-in-drawer';
"""))
time.sleep(1)

# 3) 滚到 商品规格 区域
print("滚动:", wd.js("""
const el = [...document.querySelectorAll('*')].find(e =>
  e.children.length === 0 && (e.innerText||'').trim() === '商品规格'
  && e.getBoundingClientRect().height > 0);
if (!el) return 'not-found';
el.scrollIntoView({block: 'center'});
return 'scrolled';
"""))
time.sleep(1.5)
print("shot:", wd.screenshot(os.path.join(SHOTS, "spec_section.png")))

# 4) 抓取 商品规格 区域结构
print("== 商品规格区块 ==")
print(wd.js("""
const el = [...document.querySelectorAll('*')].find(e =>
  e.children.length === 0 && (e.innerText||'').trim() === '色值'
  && e.getBoundingClientRect().height > 0);
if (!el) return 'no-color-value-label';
let box = el;
for (let i = 0; i < 10 && box.parentElement; i++) {
  box = box.parentElement;
  if ((box.className||'').toString().match(/spec|Spec|product-spec/i)) break;
}
return JSON.stringify({cls: (box.className||'').toString().slice(0,140),
  text: box.innerText.slice(0, 1500)}, null, 1);
"""))

# 5) 色值表格：行数、每行的输入框与图片槽位
print("== 色值表格行 ==")
print(wd.js("""
const tables = [...document.querySelectorAll('table')].filter(t =>
  (t.innerText||'').includes('正面图'));
if (!tables.length) return 'no-table';
const t = tables[tables.length - 1];
const rows = [...t.querySelectorAll('tr')].map(tr => {
  const tds = [...tr.children].map(td => ({
    tag: td.tagName, cls: (td.className||'').toString().slice(0, 60),
    inputs: td.querySelectorAll('input').length,
    imgs: td.querySelectorAll('img').length,
    text: (td.innerText||'').trim().slice(0, 40)
  }));
  return tds;
});
return JSON.stringify({rowCount: rows.length, rows: rows.slice(0, 4)}, null, 1);
"""))
