"""按「处理完自动提交」跑一遍完整流程（v0.4.0）。

步骤：重载编辑页(丢弃未提交残留) -> 写入已用主图 -> 设置任务 -> 启动 -> 轮询进度
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

USED_FRONT = ["DWRG03", "DWRG04", "DWRG05", "DWRG06", "DWRG07"]
BACK_NAMES = ["X面料图-31", "Z尺码表-32"]
SKCS = ["46350409750", "97995719987"]

wd = bb.connect()

# 1) 找到编辑页标签页并刷新（拿到 v0.4.0 的新代码）
tab = None
for h in wd.handles():
    try:
        wd.switch(h)
        u = wd.url() or ""
        if isinstance(u, str) and "agentseller.temu.com/goods/edit" in u:
            tab = h
            break
    except Exception:
        continue
if not tab:
    print("没找到编辑页，新开一个")
    tab = wd.new_tab("https://agentseller.temu.com/goods/list")
    time.sleep(8)

wd.switch(tab)
if "goods/edit" in (wd.url() or ""):
    print("刷新编辑页（丢弃未提交残留）:", wd.url().split("#")[0])
    wd.navigate(wd.url().split("#")[0])
else:
    print("当前页:", wd.url())
time.sleep(12)

print("版本:", wd.js("""
const host = document.getElementById('temu-image-bot-host');
return host && host.shadowRoot ? host.shadowRoot.getElementById('verLine').innerText : 'no-panel';
"""))

print("写入状态:", wd.js("""
const api = window.__TEMU_IMG_BOT_API__;
api.state.usedFrontImages = %s;
api.state.backMaterialNames = %s;
api.state.skcs = %s;
api.state.cursor = 0;
api.state.retry = 0;
api.state.config = {artNo: 'DWRG', n: 4, x: 2, cropW: 1350, cropH: 1800, autoSubmit: true, dryRun: false};
api.state.status = 'running';
api.state.phase = 'LIST_SEARCH';
api.state.error = null;
api.saveState();
api.log('开始按「处理完自动提交」正式跑一遍');
if (!location.hash.includes('temu-image-bot')) {
  location.href = location.origin + '/goods/list#temu-image-bot';
} else {
  api.runDriver();
}
return 'started';
""" % (json.dumps(USED_FRONT), json.dumps(BACK_NAMES), json.dumps(SKCS))))

deadline = time.time() + 20 * 60
last = None
while time.time() < deadline:
    time.sleep(8)
    try:
        wd.switch(tab)
        info = wd.js("""
        const host = document.getElementById('temu-image-bot-host');
        if (!host || !host.shadowRoot) return 'no-panel';
        const sr = host.shadowRoot;
        return JSON.stringify({
          url: location.href.slice(0, 90),
          status: sr.getElementById('stat').innerText.split('\\n')[0],
          logs: sr.getElementById('log').innerText.split('\\n').slice(-6)
        });
        """)
        data = json.loads(info)
        key = data["status"] + "|" + "".join(data["logs"][-2:])
        if key != last:
            print(f"[{time.strftime('%H:%M:%S')}] {data['url']}")
            print("   ", data["status"])
            for line in data["logs"]:
                print("    ", line[:150])
            last = key
        if "已暂停" in data["status"] or "全部完成" in data["status"]:
            print("结束:", data["status"])
            break
    except Exception as exc:  # noqa: BLE001
        print("轮询异常:", str(exc)[:90])

print("截图:", wd.screenshot(os.path.join(os.getcwd(), "probes", "shots", "auto_submit_run.png")))
