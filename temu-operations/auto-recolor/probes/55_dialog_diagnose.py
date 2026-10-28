"""诊断：点击 加载未打包 后到底有没有弹窗（列出所有顶层窗口做前后对比）。"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

PS_LIST = r"""
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$Auto = [System.Windows.Automation.AutomationElement]
$all = $Auto::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,
        [System.Windows.Automation.Condition]::TrueCondition)
$out = @()
foreach ($w in $all) {
  $out += ("{0}`t{1}`t{2}" -f $w.Current.ClassName, $w.Current.NativeWindowHandle, $w.Current.Name)
}
$out -join "`n"
"""

ps_path = os.path.join(os.environ["TEMP"], "list_windows.ps1")
with open(ps_path, "w", encoding="utf-8-sig") as fh:
    fh.write(PS_LIST)


def list_windows():
    out = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps_path],
                         capture_output=True, text=True, encoding="utf-8", errors="replace")
    rows = []
    for line in (out.stdout or "").splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            rows.append(parts)
    return rows


wd = bb.connect()
for h in wd.handles():
    try:
        wd.switch(h)
        if "chrome://extensions" in (wd.url() or ""):
            break
    except Exception:
        continue
print("页面:", wd.url())

before = list_windows()
print("点击前窗口数:", len(before))

print("安装点击探针:", wd.js("""
window.__clickLog = [];
const btn = document.querySelector('extensions-manager').shadowRoot
  .querySelector('extensions-toolbar').shadowRoot.querySelector('#loadUnpacked');
btn.addEventListener('click', () => window.__clickLog.push(Date.now()));
window.__errLog = [];
window.addEventListener('error', e => window.__errLog.push(String(e.message)));
const r = btn.getBoundingClientRect();
return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
"""))
pos = json.loads(wd.js("""
const btn = document.querySelector('extensions-manager').shadowRoot
  .querySelector('extensions-toolbar').shadowRoot.querySelector('#loadUnpacked');
const r = btn.getBoundingClientRect();
return JSON.stringify({x: r.x + r.width/2, y: r.y + r.height/2});
"""))
wd.mouse_click(pos["x"], pos["y"])
time.sleep(4)

print("点击记录:", wd.js("return JSON.stringify({clicks: window.__clickLog, errs: window.__errLog});"))
after = list_windows()
print("点击后窗口数:", len(after))
new = [w for w in after if w not in before]
print("新增窗口:")
for w in new:
    print("   class=%s hwnd=%s name=%s" % tuple(w))
print("截图:", wd.screenshot(os.path.join(os.getcwd(), "probes", "shots", "diagnose_dialog.png")))
