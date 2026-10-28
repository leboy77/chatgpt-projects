"""走查：编辑商品信息 弹窗 DOM 结构 + 菜单项定位方式。"""
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
print("当前: ", wd.url())

wd.js("""
const el = [...document.querySelectorAll('[data-testid=beast-core-button-link]')]
  .find(e => (e.innerText||'').trim() === '编辑');
if (el) { el.scrollIntoView({block: 'center'}); el.click(); }
return !!el;
""")
time.sleep(3)

print("== 弹窗根节点结构 ==")
print(wd.js("""
const all = [...document.querySelectorAll('*')];
const anchor = all.filter(el => (el.innerText||'').includes('请选择修改项')
  && el.getBoundingClientRect().height > 0);
if (!anchor.length) return 'no-modal';
const modal = anchor[anchor.length - 1];
return JSON.stringify({
  cls: (modal.className||'').toString().slice(0,120),
  role: modal.getAttribute('role'),
  testid: modal.getAttribute('data-testid'),
  text: modal.innerText.slice(0, 400)
}, null, 1);
"""))

print("== 弹窗内所有短文本节点（含层级 class） ==")
print(wd.js("""
const all = [...document.querySelectorAll('*')];
const anchor = all.filter(el => (el.innerText||'').includes('请选择修改项')
  && el.getBoundingClientRect().height > 0);
if (!anchor.length) return 'no-modal';
let modal = anchor[anchor.length - 1];
while (modal.parentElement && modal.parentElement.innerText.length < 600) modal = modal.parentElement;
const out = [];
[...modal.querySelectorAll('*')].forEach(el => {
  const t = (el.innerText || '').trim();
  if (t && t.length <= 30 && el.getBoundingClientRect().height > 0) {
    out.push({tag: el.tagName, cls: (el.className||'').toString().slice(0,70),
              testid: el.getAttribute('data-testid') || '', text: t});
  }
});
return JSON.stringify(out.slice(0, 40), null, 1);
"""))

print("shot:", wd.screenshot(os.path.join(SHOTS, "modal_edit_goods.png")))
