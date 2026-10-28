"""试填新颜色第一行（Mixed Color2 / S）的 敏感属性 + 体积 + 重量。"""
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

print("滚动表格:", wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
t.scrollIntoView({block: 'center', behavior: 'instant'});
return 'ok';
"""))
time.sleep(1.5)

print("写数字字段:", wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
const tr = rows[6];
const tds = [...tr.querySelectorAll('td')];
const setVal = (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(v));
  el.dispatchEvent(new InputEvent('input', {bubbles: true, data: String(v), inputType: 'insertText'}));
  el.dispatchEvent(new Event('change', {bubbles: true}));
};
const dims = [...tds[3].querySelectorAll('input')];
const wt = [...tds[4].querySelectorAll('input')];
dims.forEach((el, i) => setVal(el, [30, 20, 1][i]));
setVal(wt[0], 500);
return JSON.stringify({dims: dims.map(x => x.value), weight: wt[0].value});
"""))
time.sleep(1.5)

print("点敏感属性下拉:", wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
const input = rows[6].querySelectorAll('td')[2].querySelector('input');
input.scrollIntoView({block: 'center', behavior: 'instant'});
const r = input.getBoundingClientRect();
return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
"""))
pos = json.loads(wd.js("""
const t = [...document.querySelectorAll('table')].filter(x => (x.innerText||'').includes('敏感属性')).pop();
const rows = [...t.querySelectorAll('tbody tr')].filter(tr => tr.querySelectorAll('td').length);
const input = rows[6].querySelectorAll('td')[2].querySelector('input');
const r = input.getBoundingClientRect();
return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
"""))
wd.mouse_click(pos["x"], pos["y"])
time.sleep(2)

print("下拉选项:", wd.js("""
const pops = [...document.querySelectorAll('[class*=dropdown],[class*=Dropdown],[class*=option],[class*=Option],[class*=popover],[class*=Popover]')]
  .filter(el => el.getBoundingClientRect().height > 20 && (el.innerText||'').trim());
return JSON.stringify(pops.slice(-4).map(el => ({
  cls: (el.className||'').toString().slice(0, 50),
  text: (el.innerText||'').replace(/\\n+/g, ' | ').slice(0, 200)
})), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "fill_weight_row.png")))
