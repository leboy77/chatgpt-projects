"""流程第 4 步(2)：新行 色值 输入框的交互方式（下拉/自定义）。"""
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
            handle = h
    except Exception:
        continue
wd.switch(handle)
print("url:", wd.url())

print("== 新行 色值 输入框 HTML ==")
print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const rows = [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
const tr = rows[rows.length - 1];
const td = tr.querySelectorAll('td')[0];
return td.innerHTML.slice(0, 1200);
"""))

print("== 聚焦并点击 色值 输入框 ==")
print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const rows = [...table.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
const td = rows[rows.length - 1].querySelectorAll('td')[0];
const input = td.querySelector('input');
if (!input) return 'no-input';
input.scrollIntoView({block: 'center'});
input.focus();
input.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
input.click();
return 'focused';
"""))
time.sleep(2)

print("== 展开的下拉内容 ==")
print(wd.js("""
const panels = [...document.querySelectorAll('[class*=ST_dropdownPanel],[class*=dropdownPanel],[class*=DD_],[class*=Select]')]
  .filter(el => el.getBoundingClientRect().height > 20);
if (!panels.length) return 'no-panel';
const p = panels[panels.length - 1];
const opts = [...p.querySelectorAll('*')].filter(el => el.children.length === 0)
  .map(el => (el.innerText||'').trim()).filter(Boolean);
return JSON.stringify({cls: (p.className||'').toString().slice(0,80),
  text: p.innerText.slice(0, 600),
  options: [...new Set(opts)].slice(0, 40)}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "color_dropdown.png")))
