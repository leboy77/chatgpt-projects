"""走查第 1 步：商品列表(全国)页面结构 —— 搜索框、查询按钮、行内编辑按钮。"""
import json
import sys

sys.path.insert(0, r"C:\Users\QZJLKJ\Documents\ChatGPT\temu自动复色\tools")
import bb  # noqa: E402

wd = bb.connect()

handle = None
for h in wd.handles():
    try:
        wd.switch(h)
        url = wd.url() or ""
    except Exception:
        continue
    if "agentseller.temu.com/goods/list" in url:
        handle = h
        break

print("handle:", handle)
wd.switch(handle)
print("url:", wd.url())
print("title:", wd.title())

info = wd.js("""
const vis = el => {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
};
const inputs = [...document.querySelectorAll('input,textarea')].filter(vis).map(el => ({
  tag: el.tagName, type: el.type, ph: el.placeholder, cls: (el.className||'').toString().slice(0,120),
  rect: [Math.round(el.getBoundingClientRect().x), Math.round(el.getBoundingClientRect().y),
         Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)]
}));
const btns = [...document.querySelectorAll('button,[role=button],a')].filter(vis)
  .map(el => (el.innerText||'').trim()).filter(t => t && t.length <= 12);
return JSON.stringify({inputs, btns: [...new Set(btns)].slice(0,60),
  bodyText: document.body.innerText.slice(0, 1500)}, null, 1);
""")
print(info)
