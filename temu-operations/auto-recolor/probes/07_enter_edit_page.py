"""走查：进入 编辑其它商品信息 页面，定位商品规格色值区域。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")
os.makedirs(SHOTS, exist_ok=True)

wd = bb.connect()

# 1) 回到商品列表，点开编辑弹窗
for h in wd.handles():
    wd.switch(h)
    if "agentseller.temu.com/goods/list" in (wd.url() or ""):
        break
print("列表页:", wd.url())

wd.js("""
const el = [...document.querySelectorAll('[data-testid=beast-core-button-link]')]
  .find(e => (e.innerText||'').trim() === '编辑');
if (el) { el.scrollIntoView({block: 'center'}); el.click(); }
return !!el;
""")
time.sleep(2.5)

before = set(wd.handles())
print("点击 编辑其它商品信息:", wd.js("""
const card = [...document.querySelectorAll('div.card_card__gVI5f')]
  .find(el => (el.innerText||'').trim() === '编辑其它商品信息');
if (!card) return 'not-found';
card.click();
return 'clicked';
"""))
time.sleep(6)

after = wd.handles()
new = [h for h in after if h not in before]
print("新标签页:", new)

target = new[-1] if new else None
if target is None:
    # 可能复用已有编辑页
    for h in after:
        try:
            wd.switch(h)
            if "/goods/edit" in (wd.url() or ""):
                target = h
                break
        except Exception:
            continue

print("编辑页 handle:", target)
if target:
    wd.switch(target)
    print("url:", wd.url())
    print("title:", wd.title())
    print("shot:", wd.screenshot(os.path.join(SHOTS, "edit_page.png")))
    print("== 页面分区标题 ==")
    print(wd.js("""
    const out = [];
    const seen = new Set();
    [...document.querySelectorAll('*')].forEach(el => {
      const t = (el.innerText || '').trim();
      if (el.children.length === 0 && t && t.length <= 12 && el.getBoundingClientRect().height > 0) {
        if (!seen.has(t)) { seen.add(t); out.push(t); }
      }
    });
    return JSON.stringify(out.slice(0, 120));
    """))
