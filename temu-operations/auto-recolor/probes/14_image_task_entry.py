"""走查：编辑弹窗里的“修改素材语言、商品图片、视频、详情图文”入口 -> 图片更新任务页。"""
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
        if "agentseller.temu.com/goods/list" in (wd.url() or ""):
            break
    except Exception:
        continue
print("列表页:", wd.url())

wd.press_key("Escape")
time.sleep(0.3)

wd.js("""
const el = [...document.querySelectorAll('[data-testid=beast-core-button-link]')]
  .find(e => (e.innerText||'').trim() === '编辑');
if (el) { el.scrollIntoView({block: 'center'}); el.click(); }
return !!el;
""")
time.sleep(2.5)

before = set(wd.handles())
print("点击 图片/素材 入口:", wd.js("""
const card = [...document.querySelectorAll('div.card_card__gVI5f')]
  .find(el => (el.innerText||'').includes('修改素材语言'));
if (!card) return 'not-found';
card.click();
return 'clicked: ' + card.innerText.trim().slice(0, 40);
"""))
time.sleep(6)

new = [h for h in wd.handles() if h not in before]
print("新标签页:", new)
for h in new:
    wd.switch(h)
    print("url:", wd.url())
    print("title:", wd.title())
    time.sleep(3)
    print("shot:", wd.screenshot(os.path.join(SHOTS, "image_task_page.png")))
    print("== 短文本 ==")
    print(wd.js("""
    const out = []; const seen = new Set();
    [...document.querySelectorAll('*')].forEach(el => {
      if (el.children.length) return;
      const t = (el.innerText||'').trim();
      if (t && t.length <= 24 && el.getBoundingClientRect().height > 0 && !seen.has(t)) {
        seen.add(t); out.push(t);
      }
    });
    return JSON.stringify(out.slice(0, 150), null, 1);
    """))
