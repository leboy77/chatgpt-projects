"""流程第 4 步(4)：本地上传 按钮的 DOM 关联（file input）。"""
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
            handle = h
    except Exception:
        continue
wd.switch(handle)

print(wd.js("""
const dlg = [...document.querySelectorAll('[role=dialog]')].filter(el => el.getBoundingClientRect().height > 200).pop();
if (!dlg) return 'no-dialog';
const hits = [...dlg.querySelectorAll('*')].filter(el =>
  (el.innerText||'').trim() === '本地上传' && el.getBoundingClientRect().height > 0);
return JSON.stringify(hits.map(el => {
  const r = el.getBoundingClientRect();
  const chain = [];
  let p = el;
  for (let i = 0; i < 4 && p; i++) {
    chain.push({tag: p.tagName, cls: (p.className||'').toString().slice(0,70),
                inputs: p.querySelectorAll ? p.querySelectorAll('input[type=file]').length : 0});
    p = p.parentElement;
  }
  return {tag: el.tagName, rect: [Math.round(r.x), Math.round(r.y)], chain};
}), null, 1);
"""))

print("== 弹窗内 file input 详情 ==")
print(wd.js("""
const dlg = [...document.querySelectorAll('[role=dialog]')].filter(el => el.getBoundingClientRect().height > 200).pop();
return JSON.stringify([...dlg.querySelectorAll('input[type=file]')].map((i, idx) => ({
  idx, accept: i.accept.slice(0, 60), multiple: i.multiple,
  parentChain: (() => { const c = []; let p = i; for (let k = 0; k < 4 && p; k++) {
    c.push(p.tagName + '.' + (p.className||'').toString().slice(0, 40)); p = p.parentElement; } return c; })()
})), null, 1);
"""))

print("== 弹窗底部工具栏文本 ==")
print(wd.js("""
const dlg = [...document.querySelectorAll('[role=dialog]')].filter(el => el.getBoundingClientRect().height > 200).pop();
const foot = [...dlg.querySelectorAll('*')].filter(el =>
  /已选/.test(el.innerText||'') && el.getBoundingClientRect().height > 0 && el.children.length < 8);
return foot.length ? foot[foot.length - 1].innerText.slice(0, 300) : 'none';
"""))
