"""走查：用原生元素点击打开 素材中心 弹窗，并检查本地上传入口。"""
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
            break
    except Exception:
        continue
print("url:", wd.url())

# 关闭可能残留的弹层
wd.press_key("Escape")
time.sleep(0.5)

print("== 定位 素材中心 按钮 ==")
found = wd.js("""
const cells = [...document.querySelectorAll('td')].filter(td => (td.innerText||'').includes('素材中心'));
const out = [];
cells.forEach((cell, idx) => {
  const btn = [...cell.querySelectorAll('*')].find(el =>
    el.children.length === 0 && (el.innerText||'').trim() === '素材中心'
    && el.getBoundingClientRect().height > 0);
  if (btn) {
    const r = btn.getBoundingClientRect();
    out.push({row: idx, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
              inViewport: r.top > 0 && r.bottom < window.innerHeight});
  }
});
return JSON.stringify(out, null, 1);
""")
print(found)

# 滚到第一个素材中心按钮
wd.js("""
const cell = [...document.querySelectorAll('td')].filter(td => (td.innerText||'').includes('素材中心'))[0];
const btn = [...cell.querySelectorAll('*')].find(el =>
  el.children.length === 0 && (el.innerText||'').trim() === '素材中心'
  && el.getBoundingClientRect().height > 0);
if (btn) { const r = btn.getBoundingClientRect();
  window.scrollTo({top: window.scrollY + r.top - window.innerHeight/2, behavior: 'instant'}); }
return true;
""")
time.sleep(1)

print("原生点击:", wd.click_xpath(
    "(//td[contains(., '素材中心')]//*[normalize-space(text())='素材中心'])[1]", timeout=10))
time.sleep(4)

print("== 弹窗内容 ==")
print(wd.js("""
const dlg = [...document.querySelectorAll('[role=dialog]')].filter(el => el.getBoundingClientRect().height > 200);
if (!dlg.length) {
  const any = [...document.querySelectorAll('*')].filter(el =>
    el.getBoundingClientRect().height > 200 && /MDL_|Modal/.test((el.className||'').toString()));
  return 'no-dialog; candidates=' + JSON.stringify(any.slice(-3).map(e =>
    ({cls: (e.className||'').toString().slice(0,60), text: (e.innerText||'').slice(0, 80)})));
}
const d = dlg[dlg.length - 1];
const leaves = [];
const walk = el => {
  if (el.children.length === 0) {
    const t = (el.innerText || '').trim();
    if (t && t.length <= 30 && el.getBoundingClientRect().height > 0) leaves.push(t);
  } else { [...el.children].forEach(walk); }
};
walk(d);
return JSON.stringify({leaves: [...new Set(leaves)].slice(0, 60),
  fileInputs: [...d.querySelectorAll('input[type=file]')].map(i => ({accept: i.accept, multiple: i.multiple})),
  pageFileInputs: document.querySelectorAll('input[type=file]').length}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "material_dialog.png")))
