"""用 UIAutomation 找到扩展卡片的「重新加载」按钮，取其屏幕矩形后做系统级点击。"""
import os
import subprocess
import sys
import time

PS = r"""
param([int]$ProcId, [int]$Index)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -Namespace W -Name M -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, System.UIntPtr e);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);
'@
$Auto = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]
$cond = New-Object System.Windows.Automation.PropertyCondition($Auto::ProcessIdProperty, $ProcId)
$wins = $Auto::RootElement.FindAll($Scope::Children, $cond)
$target = $null
foreach ($w in $wins) { if ($w.Current.ClassName -eq 'Chrome_WidgetWin_1') { $target = $w } }
if (-not $target) { Write-Output "NO_WINDOW"; exit 1 }

$p = Get-Process -Id $ProcId
if ($p.MainWindowHandle -ne 0) { [void][W.M]::ShowWindow($p.MainWindowHandle, 9); [void][W.M]::SetForegroundWindow($p.MainWindowHandle); Start-Sleep -Milliseconds 600 }

$found = @()
$queue = New-Object System.Collections.Queue
$queue.Enqueue($target)
$guard = 0
while ($queue.Count -gt 0 -and $guard -lt 5000) {
  $guard++
  $el = $queue.Dequeue()
  try {
    if ($el.Current.AutomationId -eq 'dev-reload-button') { $found += $el }
    $kids = $el.FindAll($Scope::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($k in $kids) { $queue.Enqueue($k) }
  } catch { }
}
Write-Output ("RELOAD_BUTTONS=" + $found.Count)
if ($found.Count -le $Index) { Write-Output "NOT_ENOUGH"; exit 2 }
$btn = $found[$Index]
$r = $btn.Current.BoundingRectangle
$x = [int]($r.X + $r.Width / 2)
$y = [int]($r.Y + $r.Height / 2)
Write-Output ("RECT=" + [int]$r.X + "," + [int]$r.Y + "," + [int]$r.Width + "," + [int]$r.Height)
[void][W.M]::SetCursorPos($x, $y)
Start-Sleep -Milliseconds 250
[W.M]::mouse_event(0x0002, 0, 0, 0, [System.UIntPtr]::Zero)
Start-Sleep -Milliseconds 90
[W.M]::mouse_event(0x0004, 0, 0, 0, [System.UIntPtr]::Zero)
Write-Output ("CLICKED=" + $x + "," + $y)
"""


def main():
    sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
    import bb  # noqa: E402

    wd = bb.connect()
    tab = None
    for h in wd.handles():
        try:
            wd.switch(h)
            u = wd.url() or ""
            if isinstance(u, str) and "chrome://extensions" in u:
                tab = h
                break
        except Exception:
            continue
    if not tab:
        tab = wd.new_tab("chrome://extensions/")
        time.sleep(6)
    wd.switch(tab)
    wd.navigate("chrome://extensions/")
    time.sleep(3)
    try:
        wd._call("POST", "/goog/cdp/execute", {"cmd": "Page.bringToFront", "params": {}})
    except Exception as exc:  # noqa: BLE001
        print("bringToFront 失败:", str(exc)[:60])
    time.sleep(2)

    before = wd.js("""
    const id = 'koiobokagpbhihnhmhegokjmpbhgghon';
    const m = document.querySelector('extensions-manager');
    const list = m.shadowRoot.querySelector('extensions-item-list');
    const item = [...list.shadowRoot.querySelectorAll('extensions-item')].find(it => it.getAttribute('id') === id);
    return item ? (item.shadowRoot.querySelector('#version')||{}).innerText.trim() : 'not-found';
    """)
    print("重载前版本:", before)

    info = bb.bb_open("9e6f73cc742b4abc9015f31f8e75fbd7")
    pid = str(info.get("pid"))
    ps = os.path.join(os.environ["TEMP"], "uia_click_reload.ps1")
    with open(ps, "w", encoding="utf-8-sig") as fh:
        fh.write(PS)
    out = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps,
                          "-ProcId", pid, "-Index", "0"],
                         capture_output=True, text=True, encoding="utf-8", errors="replace")
    print((out.stdout or "").strip(), (out.stderr or "").strip()[:200])
    time.sleep(5)

    after = wd.js("""
    const id = 'koiobokagpbhihnhmhegokjmpbhgghon';
    const m = document.querySelector('extensions-manager');
    const list = m.shadowRoot.querySelector('extensions-item-list');
    const item = [...list.shadowRoot.querySelectorAll('extensions-item')].find(it => it.getAttribute('id') === id);
    return item ? (item.shadowRoot.querySelector('#version')||{}).innerText.trim() : 'not-found';
    """)
    print("重载后版本:", after)
    print("结果:", "成功" if after != before else "未生效")


if __name__ == "__main__":
    main()
