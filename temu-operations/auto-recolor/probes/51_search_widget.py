"""调试：素材中心 搜索控件与素材名标签的真实 DOM。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")
wd = bb.connect()
for h in wd.handles():
    try:
        wd.switch(h)
        if "/goods/edit" in (wd.url() or ""):
            break
    except Exception:
        continue

print(wd.js("""
const layers = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(el => el.getBoundingClientRect().height > 100);
const dlg = layers.find(el => (el.innerText||'').includes('本地上传') && !(el.innerText||'').includes('无需重复上传'));
if (!dlg) return 'no real dialog';
const box = [...dlg.querySelectorAll('input')].find(i => i.placeholder === '请输入素材名称');
const chain = [];
let p = box;
for (let i = 0; i < 5 && p; i++) { chain.push(p.tagName + '.' + (p.className||'').toString().slice(0,60)); p = p.parentElement; }
// 找搜索按钮（放大镜）
const wrap = box.closest('div').parentElement.parentElement;
const searchables = [...wrap.querySelectorAll('*')].filter(el => el.getBoundingClientRect().height > 0 && el.children.length === 0
  && !(el.innerText||'').trim()).slice(0, 12).map(el => ({tag: el.tagName, cls: (el.className||'').toString().slice(0,60)}));
// 素材名标签
const names = [...dlg.querySelectorAll('*')].filter(el => /^DWRG03/.test((el.innerText||'').trim())
  && el.getBoundingClientRect().height > 0).map(el => ({
    tag: el.tagName, cls: (el.className||'').toString().slice(0,60),
    text: el.innerText.trim().slice(0,30), kids: el.children.length,
    rect: [Math.round(el.getBoundingClientRect().x), Math.round(el.getBoundingClientRect().y),
           Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)]}));
return JSON.stringify({chain, searchables, names}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "search_widget.png")))
