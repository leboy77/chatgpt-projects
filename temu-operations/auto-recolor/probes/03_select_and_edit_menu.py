"""走查：商品ID类型下拉（SKC）+ 操作列 编辑 菜单。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

wd = bb.connect()
for h in wd.handles():
    wd.switch(h)
    if "agentseller.temu.com/goods/list" in (wd.url() or ""):
        break

print("== ID 类型下拉当前值 ==")
print(wd.js("""
let label = [...document.querySelectorAll('*')].find(el =>
  el.children.length === 0 && (el.textContent||'').trim() === '商品ID查询');
let box = label;
for (let i = 0; i < 5 && box.parentElement; i++) box = box.parentElement;
const sel = box.querySelector('[data-testid=beast-core-select]');
return JSON.stringify({selectText: sel ? sel.innerText.trim() : null,
  valueInput: box.querySelector('input[placeholder="多个查询请空格或逗号依次输入"]') ? 'ok' : 'missing'});
"""))

print("== 打开下拉，列出选项 ==")
wd.js("""
let label = [...document.querySelectorAll('*')].find(el =>
  el.children.length === 0 && (el.textContent||'').trim() === '商品ID查询');
let box = label;
for (let i = 0; i < 5 && box.parentElement; i++) box = box.parentElement;
const head = box.querySelector('[data-testid=beast-core-select-header]');
head && head.click();
return true;
""")
time.sleep(1.2)
print(wd.js("""
const opts = [...document.querySelectorAll('[data-testid=beast-core-select-option],[class*=ST_option]')]
  .filter(el => el.getBoundingClientRect().height > 0)
  .map(el => el.innerText.trim());
return JSON.stringify([...new Set(opts)]);
"""))

print("== 操作列首行 HTML ==")
print(wd.js("""
const spans = [...document.querySelectorAll('span')].filter(el =>
  el.children.length === 0 && (el.textContent||'').trim() === '编辑'
  && el.getBoundingClientRect().height > 0);
const first = spans[0];
let cell = first;
for (let i = 0; i < 4 && cell.parentElement; i++) cell = cell.parentElement;
return cell.outerHTML.slice(0, 1500);
"""))
