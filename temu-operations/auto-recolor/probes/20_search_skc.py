"""流程第 1-2 步：商品列表 -> SKC 查询。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SKC = sys.argv[1] if len(sys.argv) > 1 else "46350409750"

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
time.sleep(0.5)

print("== 当前 ID 类型 ==")
print(wd.js("""
const rows = [...document.querySelectorAll('div')].filter(el =>
  /row_label/.test((el.className||'').toString()) && (el.innerText||'').trim() === '商品ID查询');
if (!rows.length) return 'label-not-found';
let box = rows[0];
for (let i = 0; i < 6 && box.parentElement; i++) box = box.parentElement;
const sel = box.querySelector('[data-testid=beast-core-select]');
const input = box.querySelector('input[placeholder="多个查询请空格或逗号依次输入"]');
return JSON.stringify({selectText: sel ? sel.innerText.trim() : null,
  inputPlaceholder: input ? input.placeholder : null}, null, 1);
"""))

print("== 设为 SKC + 填值 ==")
print(wd.js("""
const rows = [...document.querySelectorAll('div')].filter(el =>
  /row_label/.test((el.className||'').toString()) && (el.innerText||'').trim() === '商品ID查询');
let box = rows[0];
for (let i = 0; i < 6 && box.parentElement; i++) box = box.parentElement;
const head = box.querySelector('[data-testid=beast-core-select-header]');
if (head) {
  head.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
  head.click();
}
return 'opened';
"""))
time.sleep(1.2)

print(wd.js("""
const opts = [...document.querySelectorAll('[class*=ST_option], [class*=optionWrapper], li')]
  .filter(el => el.getBoundingClientRect().height > 0 && (el.innerText||'').trim() === 'SKC');
if (!opts.length) return 'no-SKC-option';
opts[0].dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
opts[0].click();
return 'selected-SKC';
"""))
time.sleep(1)

print(wd.js("""
const input = [...document.querySelectorAll('input')]
  .find(el => el.placeholder === '多个查询请空格或逗号依次输入' && el.getBoundingClientRect().height > 0);
if (!input) return 'no-input';
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(input, '%s');
input.dispatchEvent(new Event('input', {bubbles: true}));
input.dispatchEvent(new Event('change', {bubbles: true}));
return 'value=' + input.value;
""" % SKC))
time.sleep(0.6)

print("点击查询:", wd.click_text("查询", tag="button", timeout=10)
      or wd.click_xpath("(//button[contains(., '查询')])[1]", timeout=5))
time.sleep(6)

print("== 查询结果 ==")
print(wd.js("""
const txt = document.body.innerText;
const m = txt.match(/全部\\s*(\\d+)/);
const skcHit = [...document.querySelectorAll('*')].filter(el =>
  el.children.length === 0 && (el.innerText||'').trim() === '46350409750').length;
const rows = [...document.querySelectorAll('tbody tr')].length;
return JSON.stringify({totalHit: m ? m[1] : null, skcMatchedCells: skcHit, bodyRows: rows}, null, 1);
""".replace("46350409750", SKC)))
print("shot:", wd.screenshot(os.path.join(os.getcwd(), "probes", "shots", "search_result.png")))
