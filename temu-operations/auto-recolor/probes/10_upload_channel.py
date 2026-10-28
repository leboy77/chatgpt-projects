"""走查：检查页面上传通道（file input）与 轮播图 单元格结构。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

wd = bb.connect()
for h in wd.handles():
    try:
        wd.switch(h)
        if "/goods/edit" in (wd.url() or ""):
            break
    except Exception:
        continue
print("url:", wd.url())

print("== 页面内 file input ==")
print(wd.js("""
const files = [...document.querySelectorAll('input[type=file]')].map(el => ({
  accept: el.accept, multiple: el.multiple, cls: (el.className||'').toString().slice(0, 60),
  visible: el.getBoundingClientRect().height > 0, name: el.name
}));
return JSON.stringify({count: files.length, files}, null, 1);
"""))

print("== 色值表格每行 色值/货号 当前值 ==")
print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const body = table.querySelector('tbody') || table;
const rows = [...body.querySelectorAll('tr')].filter(tr => tr.querySelectorAll('td').length);
return JSON.stringify(rows.map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  const colorInput = tds[0] ? tds[0].querySelector('input') : null;
  const artInput = tds[3] ? tds[3].querySelector('input') : null;
  return {row: i, colorValue: colorInput ? colorInput.value : null,
          artNo: artInput ? artInput.value : null,
          slotTexts: tds[1] ? [...tds[1].querySelectorAll('*')].filter(e => e.children.length === 0)
            .map(e => (e.innerText||'').trim()).filter(Boolean).slice(0, 20) : []};
}), null, 1);
"""))

print("== 轮播图单元格内按钮 ==")
print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const cells = [...table.querySelectorAll('td')].filter(td => (td.innerText||'').includes('素材中心'));
const cell = cells[0];
if (!cell) return 'none';
const btns = [...cell.querySelectorAll('button,[role=button],a,div')]
  .filter(el => el.getBoundingClientRect().height > 0 && (el.innerText||'').trim())
  .map(el => ({tag: el.tagName, cls: (el.className||'').toString().slice(0,60),
               text: (el.innerText||'').trim().slice(0,20)}));
const uniq = [];
btns.forEach(b => { if (!uniq.some(u => u.text === b.text && u.tag === b.tag)) uniq.push(b); });
return JSON.stringify(uniq.slice(0, 15), null, 1);
"""))

print("== 单元格 HTML 片段（前 2500 字） ==")
print(wd.js("""
const table = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('正面图')).pop();
const cells = [...table.querySelectorAll('td')].filter(td => (td.innerText||'').includes('素材中心'));
return cells[0] ? cells[0].outerHTML.slice(0, 2500) : 'none';
"""))
