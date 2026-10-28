"""在 chrome://extensions 里真实点击“加载未打包的扩展程序”，并用 UIAutomation 填路径。"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

EXT_DIR = os.path.join(os.environ["LOCALAPPDATA"], "TemuImageBot", "extension")

PS_SCRIPT = r"""
param([string]$Path)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$Auto = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]
$condAll = [System.Windows.Automation.Condition]::TrueCondition

$cond = New-Object System.Windows.Automation.PropertyCondition($Auto::ClassNameProperty, '#32770')
$before = @()
$Auto::RootElement.FindAll($Scope::Children, $cond) | ForEach-Object { $before += $_.Current.NativeWindowHandle }
Write-Output ("BEFORE=" + ($before -join ','))

$dlg = $null
for ($i = 0; $i -lt 120; $i++) {
  $all = $Auto::RootElement.FindAll($Scope::Children, $cond)
  foreach ($d in $all) {
    if ($before -notcontains $d.Current.NativeWindowHandle) { $dlg = $d; break }
  }
  if ($dlg) { break }
  Start-Sleep -Milliseconds 500
}
if (-not $dlg) { Write-Output "NO_DIALOG"; exit 1 }
Write-Output ("DIALOG=" + $dlg.Current.Name + " hwnd=" + $dlg.Current.NativeWindowHandle)

$all = $dlg.FindAll($Scope::Descendants, $condAll)
Write-Output ("DESC_COUNT=" + $all.Count)
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
    $vp = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $vp.SetValue($Path)
    Write-Output "EDIT_SET=OK"
  } catch { Write-Output ("EDIT_SET_ERR=" + $_.Exception.Message) }
} else { Write-Output "EDIT_NOT_FOUND" }
Start-Sleep -Milliseconds 600

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
    found = None
    for h in wd.handles():
        try:
            wd.switch(h)
            if "chrome://extensions" in (wd.url() or ""):
                found = h
                break
        except Exception:
            continue
    if not found:
        raise SystemExit("没找到 chrome://extensions 标签页")
    wd.switch(found)

    ps_path = os.path.join(os.environ["TEMP"], "load_unpacked.ps1")
    with open(ps_path, "w", encoding="utf-8-sig") as fh:
        fh.write(PS_SCRIPT)

    proc = subprocess.Popen(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps_path, "-Path", EXT_DIR],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
    )
    time.sleep(1.5)

    pos = wd.js("""
    const m = document.querySelector('extensions-manager');
    const tb = m.shadowRoot.querySelector('extensions-toolbar');
    const btn = tb.shadowRoot.querySelector('#loadUnpacked');
    if (!btn) return null;
    btn.focus();
    const r = btn.getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2, text: btn.innerText.trim()};
    """)
    print("按钮位置:", pos)
    if pos:
        wd.mouse_click(pos["x"], pos["y"])
        print("已真实鼠标点击")
        time.sleep(2)
        # 若鼠标点击没触发（未获得用户手势），再用真实键盘回车触发一次
        still = wd.js("return !document.querySelector('extensions-manager').shadowRoot.querySelector('extensions-toolbar').shadowRoot.querySelector('#loadUnpacked').hasAttribute('aria-disabled');")
        wd.js("""
        const btn = document.querySelector('extensions-manager').shadowRoot
          .querySelector('extensions-toolbar').shadowRoot.querySelector('#loadUnpacked');
        btn.focus();
        return 'focused';
        """)
        wd.press_key("ENTER")
        print("已发送回车")

    out, _ = proc.communicate(timeout=150)
    print(out)
    time.sleep(3)
    print("截图:", wd.screenshot(os.path.join(os.getcwd(), "probes", "shots", "after_load_unpacked.png")))


if __name__ == "__main__":
    main()
