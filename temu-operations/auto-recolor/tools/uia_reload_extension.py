"""用 UIAutomation 找到扩展管理页里的「重新加载」按钮并调用 Invoke（无需坐标）。"""
import os
import subprocess
import sys

PS = r"""
param([int]$ProcId)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$Auto = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]

$proc = Get-Process -Id $ProcId -ErrorAction Stop
$cond = New-Object System.Windows.Automation.PropertyCondition($Auto::ProcessIdProperty, $ProcId)
$wins = $Auto::RootElement.FindAll($Scope::Children, $cond)
Write-Output ("WINDOWS=" + $wins.Count)
$target = $null
foreach ($w in $wins) {
  Write-Output ("  win: " + $w.Current.Name + " | " + $w.Current.ClassName)
  if ($w.Current.ClassName -eq 'Chrome_WidgetWin_1') { $target = $w }
}
if (-not $target) { $target = $wins[0] }
if (-not $target) { Write-Output "NO_WINDOW"; exit 1 }

# 递归找按钮
$found = @()
$queue = New-Object System.Collections.Queue
$queue.Enqueue($target)
$guard = 0
while ($queue.Count -gt 0 -and $guard -lt 4000) {
  $guard++
  $el = $queue.Dequeue()
  try {
    $ct = $el.Current.ControlType.ProgrammaticName
    if ($ct -eq 'ControlType.Button') {
      $found += $el
      Write-Output ("BTN: '" + $el.Current.Name + "' autoid=" + $el.Current.AutomationId)
    }
    $kids = $el.FindAll($Scope::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($k in $kids) { $queue.Enqueue($k) }
  } catch { }
}
Write-Output ("BTN_COUNT=" + $found.Count)

$reload = $found | Where-Object { $_.Current.AutomationId -eq 'dev-reload-button' }
if (-not $reload) { Write-Output "NO_RELOAD_BTN"; exit 2 }
$btn = $reload | Select-Object -First 1
Write-Output ("RELOAD_BTN=" + $btn.Current.Name)
try {
  $btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  Write-Output "INVOKED"
} catch {
  Write-Output ("INVOKE_ERR=" + $_.Exception.Message)
}
"""


def main():
    sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
    import bb  # noqa: E402
    import time

    # 先让扩展管理页成为当前标签页
    wd = bb.connect()
    for h in wd.handles():
        try:
            wd.switch(h)
            u = wd.url() or ""
            if isinstance(u, str) and "chrome://extensions" in u:
                break
        except Exception:
            continue
    time.sleep(2)

    info = bb.bb_open("9e6f73cc742b4abc9015f31f8e75fbd7")
    pid = str(info.get("pid"))
    ps = os.path.join(os.environ["TEMP"], "uia_reload.ps1")
    with open(ps, "w", encoding="utf-8-sig") as fh:
        fh.write(PS)
    out = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps, "-ProcId", pid],
                         capture_output=True, text=True, encoding="utf-8", errors="replace")
    text = (out.stdout or "") + (out.stderr or "")
    print("\n".join(text.splitlines()[:80]))


if __name__ == "__main__":
    main()
