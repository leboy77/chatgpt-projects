"""检查背面图裁剪保存后的状态：是否还有待裁剪、素材中心里有什么新图。"""
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
            handle = h
    except Exception:
        continue
wd.switch(handle)

print(wd.js("""
const layers = [...document.querySelectorAll('[class*=MDL_innerWrapper]')]
  .filter(el => el.getBoundingClientRect().height > 200);
return JSON.stringify(layers.map(el => ({
  cls: (el.className||'').toString().slice(0, 50),
  text: (el.innerText||'').replace(/\\n+/g,' | ').slice(0, 220)
})), null, 1);
"""))

print("== 素材中心列表前几项名称 ==")
print(wd.js("""
const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')]
  .filter(el => /素材中心/.test(el.innerText||'')).pop();
if (!d) return 'no-material-dialog';
const names = [...d.querySelectorAll('*')].filter(el =>
  el.children.length === 0 && /^[A-Za-z0-9\\u4e00-\\u9fa5\\-_]{3,30}$/.test((el.innerText||'').trim())
  && el.getBoundingClientRect().height > 0).map(el => el.innerText.trim());
const m = d.innerText.match(/共有 (\\d+) 条/);
return JSON.stringify({total: m ? m[1] : null, names: [...new Set(names)].slice(0, 12)}, null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "after_back_crop.png")))
