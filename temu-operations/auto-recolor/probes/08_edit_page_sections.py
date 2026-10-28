"""走查：等待编辑页加载，关闭消息抽屉，定位 商品规格/色值 区域。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")
os.makedirs(SHOTS, exist_ok=True)

wd = bb.connect()

# 找到编辑页
target = None
for h in wd.handles():
    try:
        wd.switch(h)
        if "/goods/edit" in (wd.url() or ""):
            target = h
    except Exception:
        continue
wd.switch(target)
print("url:", wd.url())

# 关闭消息抽屉
print("关闭消息抽屉:", wd.js("""
const closeCandidates = [...document.querySelectorAll('[class*=close],[class*=Close],[aria-label*=close i]')]
  .filter(el => el.getBoundingClientRect().height > 0);
if (!closeCandidates.length) return 'no-close-btn';
const el = closeCandidates[closeCandidates.length - 1];
const target = el.closest('button,[role=button],a,div') || el;
if (typeof target.click === 'function') target.click();
else {
  const r = target.getBoundingClientRect();
  target.dispatchEvent(new MouseEvent('click', {
    bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2}));
}
return 'closed:' + target.tagName + '.' + (target.className||'').toString().slice(0, 50);
"""))

# 等页面加载
ok = wd.wait_js("""
return [...document.querySelectorAll('*')].some(el =>
  el.children.length === 0 && (el.innerText||'').trim() === '商品规格'
  && el.getBoundingClientRect().height > 0);
""", timeout=60)
print("页面加载(商品规格出现):", ok)
time.sleep(2)

print("shot:", wd.screenshot(os.path.join(SHOTS, "edit_page_loaded.png")))

print("== 页面所有短文本 ==")
print(wd.js("""
const out = []; const seen = new Set();
[...document.querySelectorAll('*')].forEach(el => {
  if (el.children.length) return;
  const t = (el.innerText||'').trim();
  if (t && t.length <= 24 && el.getBoundingClientRect().height > 0 && !seen.has(t)) {
    seen.add(t); out.push(t);
  }
});
return JSON.stringify(out.slice(0, 200), null, 1);
"""))

print("== 含“色值/规格”的区块 ==")
print(wd.js("""
const anchors = [...document.querySelectorAll('*')].filter(el =>
  (el.innerText||'').includes('商品规格') && el.getBoundingClientRect().height > 0);
if (!anchors.length) return 'none';
let box = anchors[anchors.length - 1];
let depth = 0;
while (box.parentElement && box.innerText.length < 1500 && depth < 8) { box = box.parentElement; depth++; }
return JSON.stringify({cls: (box.className||'').toString().slice(0,120),
  text: box.innerText.slice(0, 1200)}, null, 1);
"""))
