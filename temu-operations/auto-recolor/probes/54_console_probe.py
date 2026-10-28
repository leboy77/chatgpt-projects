"""探查比特浏览器工作台(console.bitbrowser.net)里是否有扩展/插件管理。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOTS = os.path.join(os.getcwd(), "probes", "shots")

wd, info = bb.ensure_session("9e6f73cc742b4abc9015f31f8e75fbd7")
target = None
for h in wd.handles():
    try:
        wd.switch(h)
        u = wd.url() or ""
        if isinstance(u, str) and "console.bitbrowser.net" in u:
            target = h
            break
    except Exception:
        continue

if not target:
    print("没有找到工作台标签页，新开一个")
    target = wd.new_tab("https://console.bitbrowser.net/?locale=zh&port=54345")
    time.sleep(8)

wd.switch(target)
print("url:", wd.url())
print("title:", wd.title())
time.sleep(3)

print("== 页面可见文本（关键词附近） ==")
print(wd.js("""
const t = document.body.innerText || '';
const keys = ['扩展', '插件', '皮肤', '应用'];
const out = [];
keys.forEach(k => {
  let i = -1;
  while ((i = t.indexOf(k, i + 1)) !== -1 && out.length < 40) {
    out.push(k + ' @ ' + i + ' :: ' + t.slice(Math.max(0, i - 40), i + 60).replace(/\\n/g, ' | '));
  }
});
return JSON.stringify({len: t.length, hits: out}, null, 1);
"""))

print("== 页面上的按钮/链接 ==")
print(wd.js("""
const items = [...document.querySelectorAll('button,a,[role=button],li')]
  .filter(el => el.getBoundingClientRect().height > 0 && (el.innerText||'').trim())
  .map(el => (el.innerText||'').trim().slice(0, 24));
return JSON.stringify([...new Set(items)].slice(0, 60), null, 1);
"""))
print("shot:", wd.screenshot(os.path.join(SHOTS, "bitbrowser_console.png")))
