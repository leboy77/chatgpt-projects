"""用操作系统级鼠标点击扩展管理页里的「重新加载」按钮（真实用户手势）。"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

EXT_ID = "koiobokagpbhihnhmhegokjmpbhgghon"

PS_CLICK = r"""
param([int]$X, [int]$Y, [int]$ProcId)
Add-Type -Namespace W -Name M -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, System.UIntPtr e);
'@
Add-Type -Namespace W -Name F -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
'@
try {
  $p = Get-Process -Id $ProcId -ErrorAction Stop
  if ($p.MainWindowHandle -ne 0) {
    [void][W.F]::ShowWindow($p.MainWindowHandle, 9)
    [void][W.F]::SetForegroundWindow($p.MainWindowHandle)
    Start-Sleep -Milliseconds 700
    Write-Output ("activated:" + $p.MainWindowTitle)
  } else { Write-Output "no-main-window" }
} catch { Write-Output ("activate-err:" + $_.Exception.Message) }
[void][W.M]::SetCursorPos($X, $Y)
Start-Sleep -Milliseconds 250
[W.M]::mouse_event(0x0002, 0, 0, 0, [System.UIntPtr]::Zero)
Start-Sleep -Milliseconds 90
[W.M]::mouse_event(0x0004, 0, 0, 0, [System.UIntPtr]::Zero)
Write-Output "clicked"
"""


def main():
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
        tab = wd.new_tab("chrome://extensions")
        time.sleep(6)
    wd.switch(tab)

    geo = wd.js("""
    const id = %s;
    const m = document.querySelector('extensions-manager');
    m.shadowRoot.querySelector('extensions-toolbar');
    const list = m.shadowRoot.querySelector('extensions-item-list');
    const item = [...list.shadowRoot.querySelectorAll('extensions-item')]
      .find(it => it.getAttribute('id') === id);
    if (!item) return null;
    item.scrollIntoView({block: 'center', behavior: 'instant'});
    const btn = item.shadowRoot.querySelector('#dev-reload-button');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return {
      x: Math.round(window.screenX + r.x + r.width / 2),
      y: Math.round(window.screenY + (window.outerHeight - window.innerHeight) + r.y + r.height / 2),
      ver: item.shadowRoot.querySelector('#version') ? item.shadowRoot.querySelector('#version').innerText : null
    };
    """ % json.dumps(EXT_ID))
    print("重载按钮:", geo)
    if not geo:
        raise SystemExit("找不到重载按钮")

    info = bb.bb_open("9e6f73cc742b4abc9015f31f8e75fbd7")
    pid = str(info.get("pid") or "")
    print("浏览器 pid:", pid)

    ps = os.path.join(os.environ["TEMP"], "os_reload.ps1")
    with open(ps, "w", encoding="utf-8-sig") as fh:
        fh.write(PS_CLICK)
    out = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps,
                          "-X", str(geo["x"]), "-Y", str(geo["y"]), "-ProcId", pid],
                         capture_output=True, text=True, encoding="utf-8", errors="replace")
    print("OS 点击:", (out.stdout or "").strip(), (out.stderr or "").strip()[:120])
    time.sleep(5)

    print("扩展页版本:", wd.js("""
    const id = %s;
    const m = document.querySelector('extensions-manager');
    const list = m.shadowRoot.querySelector('extensions-item-list');
    const item = [...list.shadowRoot.querySelectorAll('extensions-item')]
      .find(it => it.getAttribute('id') === id);
    return item ? (item.shadowRoot.querySelector('#version') || {}).innerText : 'not-found';
    """ % json.dumps(EXT_ID)))


if __name__ == "__main__":
    main()
