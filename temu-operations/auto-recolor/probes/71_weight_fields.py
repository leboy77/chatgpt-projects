"""dump 新颜色行（Mixed Color2）的敏感属性/体积/重量字段，判断可编辑性。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

wd = bb.connect()
for h in wd.handles():
    try:
        wd.switch(h)
        u = wd.url() or ""
        if isinstance(u, str) and "goods/edit" in u:
            break
    except Exception:
        continue
print("页面:", wd.url())

print(wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
if (!t) return 'no-table';
const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
return JSON.stringify(rows.map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  const cell = (n) => tds[n] || null;
  const info = (td) => {
    if (!td) return null;
    const inputs = [...td.querySelectorAll('input')].map(x => ({
      value: x.value, ph: x.placeholder, type: x.type,
      disabled: x.disabled, cls: (x.className||'').toString().slice(0, 40)
    }));
    const sel = td.querySelector('select');
    return {text: (td.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 16), inputs,
            select: sel ? {value: sel.value, options: [...sel.options].map(o => o.text).slice(0, 5)} : null};
  };
  return {row: i, nCells: tds.length, c0: info(cell(0)), c2: info(cell(2)), c3: info(cell(3)), c4: info(cell(4))};
}), null, 1);
"""))
