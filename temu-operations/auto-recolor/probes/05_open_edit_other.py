"""走查：编辑 -> 编辑其它商品信息，进入商品规格色值编辑页。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")
os.makedirs(SHOTS, exist_ok=True)


def safe(fn):
    try:
        v = fn()
        return v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    except Exception as exc:  # noqa: BLE001
        return f"ERR {exc}"


wd = bb.connect()
for h in wd.handles():
    wd.switch(h)
    if "agentseller.temu.com/goods/list" in (wd.url() or ""):
        break

before = set(wd.handles())

print("== 点击行内 编辑 ==")
print(wd.js("""
const el = [...document.querySelectorAll('[data-testid=beast-core-button-link]')]
  .find(e => (e.innerText||'').trim() === '编辑');
if (!el) return 'no-edit-button';
el.scrollIntoView({block: 'center'});
el.click();
return 'clicked';
"""))

found = wd.wait_js("""
return [...document.querySelectorAll('*')].some(el =>
  el.children.length === 0 && (el.innerText||'').trim() === '编辑其它商品信息'
  && el.getBoundingClientRect().height > 0);
""", timeout=15)
print("弹窗出现:", found)

print("== 弹窗入口清单 ==")
print(wd.js("""
const leaves = [...document.querySelectorAll('*')].filter(el =>
  el.children.length === 0 && (el.innerText||'').trim() && el.getBoundingClientRect().height > 0);
const node = leaves.find(el => (el.innerText||'').trim() === '编辑商品信息');
if (!node) return 'no-dialog';
let box = node;
for (let i = 0; i < 8 && box.parentElement; i++) box = box.parentElement;
const out = [];
const walk = el => {
  if (el.children.length === 0) {
    const t = (el.innerText||'').trim();
    if (t && t.length <= 40) out.push(t);
  } else { [...el.children].forEach(walk); }
};
walk(box);
return JSON.stringify([...new Set(out)], null, 1);
"""))

print("== 点击 编辑其它商品信息 ==")
print(wd.js("""
const leaves = [...document.querySelectorAll('*')].filter(el =>
  el.children.length === 0 && el.getBoundingClientRect().height > 0);
const item = leaves.find(el => (el.innerText||'').trim() === '编辑其它商品信息');
if (!item) return 'not-found';
const clickable = item.closest('[role=button],button,a') || item.parentElement.parentElement;
clickable.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
clickable.click();
return 'clicked';
"""))
time.sleep(5)

after = wd.handles()
print("新标签页:", [h for h in after if h not in before])
for h in after:
    try:
        wd.switch(h)
        print(" -", safe(wd.title)[:60], "|", safe(wd.url)[:130])
    except Exception as exc:
        print(" - ERR", exc)
print("shot:", wd.screenshot(os.path.join(SHOTS, "after_click_other_info.png")))
