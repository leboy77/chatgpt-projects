"""用操作系统级鼠标点击“加载未打包的扩展程序”，再用 UIAutomation 填写文件夹并确认。"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

EXT_DIR = os.path.join(os.environ["LOCALAPPDATA"], "TemuImageBot", "extension")

PS_WAIT_AND_FILL = r"""
param([string]$Path, [int]$X, [int]$Y)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -Namespace W -Name M -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, System.UIntPtr e);
'@
$Auto = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]
$condAll = [System.Windows.Automation.Condition]::TrueCondition
$condDlg = New-Object System.Windows.Automation.PropertyCondition($Auto::ClassNameProperty, '#32770')
$before = @()
$Auto::RootElement.FindAll($Scope::Children, $condDlg) | ForEach-Object { $before += $_.Current.NativeWindowHandle }

Write-Output "OS_CLICK"
[void][W.M]::SetCursorPos($X, $Y)
Start-Sleep -Milliseconds 250
[W.M]::mouse_event(0x0002, 0, 0, 0, [System.UIntPtr]::Zero)   # LEFTDOWN
Start-Sleep -Milliseconds 90
[W.M]::mouse_event(0x0004, 0, 0, 0, [System.UIntPtr]::Zero)   # LEFTUP

$dlg = $null
for ($i = 0; $i -lt 120; $i++) {
  $all = $Auto::RootElement.FindAll($Scope::Children, $condDlg)
  foreach ($d in $all) {
    if ($before -notcontains $d.Current.NativeWindowHandle) { $dlg = $d; break }
  }
  if ($dlg) { break }
  Start-Sleep -Milliseconds 500
}
if (-not $dlg) { Write-Output "NO_DIALOG"; exit 1 }
Write-Output ("DIALOG=" + $dlg.Current.Name)

$all = $dlg.FindAll($Scope::Descendants, $condAll)
$lines = @()
foreach ($el in $all) {
  $ct = $el.Current.ControlType.ProgrammaticName -replace 'ControlType\.',''
  $lines += ("  {0} | {1} | {2}" -f $ct, $el.Current.Name, $el.Current.AutomationId)
}
Write-Output ($lines -join "`n")

$edit = $null
foreach ($el in $all) {
  if ($el.Current.ControlType.ProgrammaticName -eq 'ControlType.Edit') { $edit = $el; break }
}
if ($edit) {
  try {
    $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($Path)
    Write-Output "EDIT_SET=OK"
  } catch { Write-Output ("EDIT_SET_ERR=" + $_.Exception.Message) }
} else { Write-Output "EDIT_NOT_FOUND" }
Start-Sleep -Milliseconds 700

$clicked = $false
foreach ($el in $all) {
  if ($el.Current.ControlType.ProgrammaticName -ne 'ControlType.Button') { continue }
  $nm = $el.Current.Name
  if ($nm -match '选择文件夹|选择|打开|Select|Open|Choose|确定|OK') {
    try {
      $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
      Write-Output ("BUTTON_CLICKED=" + $nm)
      $clicked = $true
      break
    } catch { Write-Output ("BUTTON_ERR=" + $nm + " :: " + $_.Exception.Message) }
  }
}
if (-not $clicked) { Write-Output "NO_BUTTON_FOUND" }
"""


def main():
    wd = bb.connect()
    for h in wd.handles():
        try:
            wd.switch(h)
            if "chrome://extensions" in (wd.url() or ""):
                break
        except Exception:
            continue
    print("页面:", wd.url())

    geo = json.loads(wd.js("""
    const btn = document.querySelector('extensions-manager').shadowRoot
      .querySelector('extensions-toolbar').shadowRoot.querySelector('#loadUnpacked');
    const r = btn.getBoundingClientRect();
    return JSON.stringify({
      x: Math.round(window.screenX + r.x + r.width / 2),
      y: Math.round(window.screenY + (window.outerHeight - window.innerHeight) + r.y + r.height / 2),
      screenX: window.screenX, screenY: window.screenY,
      outerH: window.outerHeight, innerH: window.innerHeight, dpr: window.devicePixelRatio
    });
    """))
    print("坐标计算:", geo)

    ps_path = os.path.join(os.environ["TEMP"], "os_click_unpacked.ps1")
    with open(ps_path, "w", encoding="utf-8-sig") as fh:
        fh.write(PS_WAIT_AND_FILL)

    proc = subprocess.Popen(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps_path,
         "-Path", EXT_DIR, "-X", str(geo["x"]), "-Y", str(geo["y"])],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
    )
    out, _ = proc.communicate(timeout=180)
    print(out)
    time.sleep(3)
    print("截图:", wd.screenshot(os.path.join(os.getcwd(), "probes", "shots", "os_click_result.png")))


if __name__ == "__main__":
    main()
