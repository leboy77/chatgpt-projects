"""走查第 2/3 步：搜索区控件定位 + 行内 操作/编辑 菜单结构。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

wd = bb.connect()
for h in wd.handles():
    wd.switch(h)
    if "agentseller.temu.com/goods/list" in (wd.url() or ""):
        break

out = wd.js("""
const vis = el => { const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0; };

// 1) 找到 "商品ID查询" 标签及其右侧的输入控件
let labelEl = [...document.querySelectorAll('*')].find(el =>
  vis(el) && el.children.length === 0 && (el.textContent || '').trim() === '商品ID查询');
const around = [];
if (labelEl) {
  let box = labelEl;
  for (let i = 0; i < 4 && box.parentElement; i++) box = box.parentElement;
  around.push({labelTag: labelEl.tagName, labelCls: labelEl.className});
  const ctrls = [...box.querySelectorAll('input,button,[role=button]')].slice(0, 8).map(el => {
    const r = el.getBoundingClientRect();
    return {tag: el.tagName, type: el.type || '', ph: el.placeholder || '',
            txt: (el.innerText || '').trim().slice(0, 20),
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]};
  });
  around.push({controls: ctrls});
  around.push({boxHtml: box.outerHTML.slice(0, 1200)});
}

// 2) 表格首行：找 编辑 按钮
let editBtns = [...document.querySelectorAll('button,[role=button],a,span,div')]
  .filter(el => vis(el) && el.children.length === 0 && (el.textContent || '').trim() === '编辑');
const editInfo = editBtns.slice(0, 5).map(el => {
  const r = el.getBoundingClientRect();
  return {tag: el.tagName, cls: (el.className || '').toString().slice(0, 80),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]};
});

// 3) 表格容器与列头
const headers = [...document.querySelectorAll('th')].filter(vis).map(el => (el.innerText || '').trim()).filter(Boolean);

return JSON.stringify({around, editCount: editBtns.length, editInfo, headers: headers.slice(0, 30)}, null, 1);
""")
print(out)
