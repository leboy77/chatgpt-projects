"""只看新颜色分组的行，按单元格顺序输出字段。"""
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

out = wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
if (!t) return 'no-table';
const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
return JSON.stringify(rows.slice(6).map((tr, i) => {
  const tds = [...tr.querySelectorAll('td')];
  return {
    row: i + 6,
    cells: tds.map(td => ({
      text: (td.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 20),
      inputs: [...td.querySelectorAll('input')].map(x => ({v: x.value, dis: x.disabled, ro: x.readOnly, cls: (x.className||'').toString().slice(0,26)}))
    }))
  };
}), null, 1);
""")
print(out)
