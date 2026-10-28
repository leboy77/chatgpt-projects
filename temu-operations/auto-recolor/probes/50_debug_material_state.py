"""调试：素材中心弹窗当前状态（列表内容 / 搜索框 / 是否存在裁剪弹窗）。"""
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
print("url:", wd.url())

print(wd.js("""
const layers = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(el => el.getBoundingClientRect().height > 100);
const dlg = layers.find(el => (el.innerText||'').includes('素材中心'));
const out = {layerCount: layers.length,
  layers: layers.map(el => ({cls: (el.className||'').toString().slice(0,50),
    text: (el.innerText||'').replace(/\\n+/g,' | ').slice(0,150)}))};
if (dlg) {
  const inputs = [...dlg.querySelectorAll('input')].map(i => ({ph: i.placeholder, value: i.value, type: i.type}));
  const names = [...dlg.querySelectorAll('*')].filter(el => el.children.length === 0
    && /^[A-Za-z\\u4e00-\\u9fa5][\\w\\u4e00-\\u9fa5\\-\\.]{2,40}$/.test((el.innerText||'').trim())
    && el.getBoundingClientRect().height > 0).map(el => el.innerText.trim());
  out.dialog = {inputs, names: [...new Set(names)].slice(0, 15),
    selected: (dlg.innerText.match(/已选\\d+个[^\\n]*/)||[''])[0]};
}
return JSON.stringify(out, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "debug_material.png")))
