"""用 UIAutomation 把扩展「停用 -> 启用」，强制重新从磁盘加载。"""
import os
import subprocess
import sys
import time

PS = r"""
param([int]$ProcId)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$Auto = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]

$cond = New-Object System.Windows.Automation.PropertyCondition($Auto::ProcessIdProperty, $ProcId)
$wins = $Auto::RootElement.FindAll($Scope::Children, $cond)
$target = $null
foreach ($w in $wins) { if ($w.Current.ClassName -eq 'Chrome_WidgetWin_1') { $target = $w } }
if (-not $target) { Write-Output "NO_WINDOW"; exit 1 }

$found = @()
$queue = New-Object System.Collections.Queue
$queue.Enqueue($target)
$guard = 0
while ($queue.Count -gt 0 -and $guard -lt 4000) {
  $guard++
  $el = $queue.Dequeue()
  try {
    if ($el.Current.ControlType.ProgrammaticName -eq 'ControlType.Button') { $found += $el }
    $kids = $el.FindAll($Scope::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($k in $kids) { $queue.Enqueue($k) }
  } catch { }
}
$toggles = $found | Where-Object { $_.Current.AutomationId -eq 'enableToggle' }
Write-Output ("TOGGLES=" + $toggles.Count)
if ($toggles.Count -lt 1) { Write-Output "NO_TOGGLE"; exit 2 }
$t = $toggles | Select-Object -First 1
Write-Output ("BEFORE=" + $t.Current.Name)
$t.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
Write-Output "INVOKED_OFF"
Start-Sleep -Seconds 2
Write-Output ("AFTER=" + $t.Current.Name)
"""


def main():
    sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
    import bb  # noqa: E402

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
    ps = os.path.join(os.environ["TEMP"], "uia_toggle.ps1")
    with open(ps, "w", encoding="utf-8-sig") as fh:
        fh.write(PS)
    out = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps, "-ProcId", pid],
                         capture_output=True, text=True, encoding="utf-8", errors="replace")
    print((out.stdout or "") + (out.stderr or ""))
    time.sleep(2)

    print("页面里的状态:", wd.js("""
    const m = document.querySelector('extensions-manager');
    const list = m.shadowRoot.querySelector('extensions-item-list');
    return JSON.stringify([...list.shadowRoot.querySelectorAll('extensions-item')].map(it => ({
      id: it.getAttribute('id'),
      ver: (it.shadowRoot.querySelector('#version')||{}).innerText,
      enabled: it.shadowRoot.querySelector('#enableToggle') ? it.shadowRoot.querySelector('#enableToggle').checked : null
    })));
    """))


if __name__ == "__main__":
    main()
