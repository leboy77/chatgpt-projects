"""流程第 3 步：编辑 -> 编辑其它商品信息 -> 新页面(商品规格)。"""
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
time.sleep(0.4)

print("点击 编辑:", wd.js("""
const el = [...document.querySelectorAll('[data-testid=beast-core-button-link]')]
  .find(e => (e.innerText||'').trim() === '编辑');
if (!el) return 'not-found';
el.scrollIntoView({block: 'center'});
el.click();
return 'clicked';
"""))
time.sleep(2.5)

before = set(wd.handles())
print("点击 编辑其它商品信息:", wd.js("""
const card = [...document.querySelectorAll('div.card_card__gVI5f')]
  .find(el => (el.innerText||'').trim() === '编辑其它商品信息');
if (!card) return 'not-found';
card.click();
return 'clicked';
"""))
time.sleep(7)

new = [h for h in wd.handles() if h not in before]
print("新标签页:", new)
if not new:
    sys.exit("没有新标签页")

wd.switch(new[-1])
print("url:", wd.url())

ok = wd.wait_js("""
return [...document.querySelectorAll('*')].some(el =>
  el.children.length === 0 && (el.innerText||'').trim() === '色值'
  && el.getBoundingClientRect().height > 0);
""", timeout=60)
print("商品规格已加载:", ok)
time.sleep(1.5)

print("== 现有色值行 ==")
print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
if (!table) return 'no-table';
const rows = [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
return JSON.stringify(rows.map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  const color = tds[0] ? tds[0].querySelector('input') : null;
  const arts = [...tr.querySelectorAll('input')].map(x => x.value);
  const trigger = tr.querySelector('[class*=upload-trigger_wrap]');
  return {row: i, colorValue: color ? color.value : null, inputs: arts,
          uploadTriggerClass: trigger ? (trigger.className||'').toString().slice(0, 110) : null,
          imgCount: tr.querySelectorAll('img').length};
}), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "new_edit_page.png")))
