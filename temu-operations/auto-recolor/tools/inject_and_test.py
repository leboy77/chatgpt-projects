"""把扩展主脚本注入到页面（等价 MAIN world），并做无副作用的冒烟测试。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

HERE = os.getcwd()
SRC = open(os.path.join(HERE, "extension", "page", "main.js"), encoding="utf-8").read()

wd = bb.connect()

# 切到商品列表页
target = None
for h in wd.handles():
    try:
        wd.switch(h)
        if "agentseller.temu.com/goods/list" in (wd.url() or ""):
            target = h
            break
    except Exception:
        continue
if not target:
    target = wd.new_tab("https://agentseller.temu.com/goods/list")
    time.sleep(6)
wd.switch(target)
print("页面:", wd.url())

print("注入:", wd.js("""
window.__TEMU_IMG_BOT_V1__ = false;
try {
  (0, eval)(%s);
  return 'OK injected';
} catch (e) {
  return 'INJECT ERROR: ' + e.message;
}
""" % json.dumps(SRC)))
time.sleep(2)

print("面板:", wd.js("""
const host = document.getElementById('temu-image-bot-host');
if (!host || !host.shadowRoot) return 'no-panel';
return host.shadowRoot.querySelector('.hd span').innerText.trim();
"""))

print("调试接口:", wd.js("""
return window.__TEMU_IMG_BOT_API__ ? 'available' : 'missing';
"""))

print("查询 SKC（无副作用）:", wd.js("""
const api = window.__TEMU_IMG_BOT_API__;
api.state.status = 'running';
api.listSearchSkc('46350409750')
  .then(r => { window.__testResult = {ok: true, spu: r.spu}; })
  .catch(e => { window.__testResult = {ok: false, err: String(e && e.message || e)}; });
return 'started';
"""))

for i in range(20):
    time.sleep(2)
    res = wd.js("return window.__testResult ? JSON.stringify(window.__testResult) : 'pending';")
    if res != "pending":
        print("查询结果:", res)
        break
else:
    print("查询结果: 超时")

print("shot:", wd.screenshot(os.path.join(HERE, "probes", "shots", "panel_test.png")))
