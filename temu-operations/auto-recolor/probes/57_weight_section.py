"""探查编辑页「敏感属性与体积重量」表格结构。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")
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
print("面板版本:", wd.js("""
const host = document.getElementById('temu-image-bot-host');
return host && host.shadowRoot ? host.shadowRoot.getElementById('verLine').innerText : 'no-panel';
"""))

print("滚动到该区域:", wd.js("""
const label = [...document.querySelectorAll('*')].find(el =>
  el.children.length === 0 && (el.innerText||'').trim() === '敏感属性与体积重量');
if (!label) return 'label-not-found';
label.scrollIntoView({block: 'start', behavior: 'instant'});
return 'scrolled';
"""))
time.sleep(2)

print("== 该区域的表格 ==")
print(wd.js("""
const tables = [...document.querySelectorAll('table')].filter(t => (t.innerText||'').includes('敏感属性'));
return JSON.stringify(tables.map((t, ti) => {
  const head = [...t.querySelectorAll('th')].filter(e => e.getBoundingClientRect().height > 0)
    .map(e => (e.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 24));
  const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
  return {
    tableIndex: ti,
    head,
    rowCount: rows.length,
    sampleRows: rows.slice(0, 4).map(tr => {
      const tds = [...tr.querySelectorAll('td')];
      return tds.map(td => {
        const sel = td.querySelector('select');
        const ins = [...td.querySelectorAll('input')];
        return {
          text: (td.innerText||'').replace(/\\s+/g,' ').trim().slice(0, 20),
          tag: td.tagName,
          selectValue: sel ? sel.value : null,
          selectText: sel && sel.selectedOptions && sel.selectedOptions[0] ? sel.selectedOptions[0].text : null,
          inputs: ins.map(i => ({ph: i.placeholder, value: i.value, type: i.type, cls: (i.className||'').toString().slice(0,28)}))
        };
      });
    })
  };
}), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "weight_section.png")))
