"""探查：页面里店铺名 / 窗口标识可读取的位置。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

PROFILE_ID = "9e6f73cc742b4abc9015f31f8e75fbd7"

wd, info = bb.ensure_session(PROFILE_ID)
print("窗口:", info.get("seq"), info.get("name"))

for h in wd.handles():
    try:
        wd.switch(h)
        if "agentseller.temu.com/goods/list" in (wd.url() or ""):
            break
    except Exception:
        continue
print("页面:", wd.url())

print("== 右上角区域文本（可能是店铺名） ==")
print(wd.js("""
const out = [];
[...document.querySelectorAll('*')].forEach(el => {
  if (el.children.length) return;
  const r = el.getBoundingClientRect();
  const t = (el.innerText || '').trim();
  if (!t || t.length > 24) return;
  if (r.top < 0 || r.top > 90 || r.left < window.innerWidth * 0.6) return;
  out.push({text: t, cls: (el.className||'').toString().slice(0, 50),
            x: Math.round(r.x), y: Math.round(r.y)});
});
return JSON.stringify(out.slice(0, 25), null, 1);
"""))

print("== 页面里是否能找到浏览器 id / 序号 ==")
print(wd.js("""
const pid = %s;
const hits = [];
try {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const v = String(localStorage.getItem(k) || '');
    if (v.includes(pid) || /bitbrowser/i.test(k)) hits.push({store: 'local', k, v: v.slice(0, 120)});
  }
} catch (e) {}
try {
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    const v = String(sessionStorage.getItem(k) || '');
    if (v.includes(pid)) hits.push({store: 'session', k, v: v.slice(0, 120)});
  }
} catch (e) {}
const globals = Object.keys(window).filter(k => /bit|Bit/.test(k)).slice(0, 20);
return JSON.stringify({hits: hits.slice(0, 10), globals}, null, 1);
""" % json.dumps(PROFILE_ID)))
