"""系统级点击扩展卡片的「重新加载」按钮（按截图缩放比例换算屏幕坐标）。"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

EXT_ID = "koiobokagpbhihnhmhegokjmpbhgghon"

PS = r"""
param([int]$X, [int]$Y, [int]$ProcId)
Add-Type -Namespace W -Name M -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, System.UIntPtr e);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);
'@
$p = Get-Process -Id $ProcId
if ($p.MainWindowHandle -ne 0) { [void][W.M]::ShowWindow($p.MainWindowHandle, 9); [void][W.M]::SetForegroundWindow($p.MainWindowHandle); Start-Sleep -Milliseconds 600 }
[void][W.M]::SetCursorPos($X, $Y)
Start-Sleep -Milliseconds 250
[W.M]::mouse_event(0x0002, 0, 0, 0, [System.UIntPtr]::Zero)
Start-Sleep -Milliseconds 90
[W.M]::mouse_event(0x0004, 0, 0, 0, [System.UIntPtr]::Zero)
Write-Output ("clicked " + $X + "," + $Y)
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
    wd.navigate("chrome://extensions/")
    time.sleep(3)
    # 关键：让该标签页真正成为前台（否则页面不渲染，getBoundingClientRect 全是 0）
    try:
        st, res = wd._call("POST", "/goog/cdp/execute", {"cmd": "Page.bringToFront", "params": {}})
        print("bringToFront:", st)
    except Exception as exc:  # noqa: BLE001
        print("bringToFront 失败:", str(exc)[:80])
    time.sleep(1)

    geo = wd.js("""
    const id = %s;
    const m = document.querySelector('extensions-manager');
    const list = m.shadowRoot.querySelector('extensions-item-list');
    const item = [...list.shadowRoot.querySelectorAll('extensions-item')].find(it => it.getAttribute('id') === id);
    if (!item) return null;
    item.scrollIntoView({block: 'center', behavior: 'instant'});
    const btn = item.shadowRoot.querySelector('#dev-reload-button');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    const scale = window.outerWidth ? (window.outerWidth / window.innerWidth) : 1;
    return {
      cssX: r.x + r.width / 2, cssY: r.y + r.height / 2,
      screenX: window.screenX, screenY: window.screenY,
      outerH: window.outerHeight, innerH: window.innerHeight,
      dpr, scaleH: window.outerWidth / window.innerWidth,
      ver: (item.shadowRoot.querySelector('#version')||{}).innerText
    };
    """ % json.dumps(EXT_ID))
    print("按钮几何:", geo)
    if not geo:
        raise SystemExit("找不到按钮")

    # 浏览器页面被缩放，屏幕坐标 = 窗口位置 + 相对偏移（含工具栏）+ CSS 坐标 * 缩放
    scale = geo["cssX"] / 1.0
    # 用 outerWidth/innerWidth 估算缩放（两者都是 CSS 像素时约为 1；若页面被缩放，innerWidth 会偏大）
    f = geo["innerH"] and (geo["outerH"] - geo["innerH"]) or 0
    zx = geo["dpr"] if geo["dpr"] else 1
    # 尝试两套坐标：raw 与 按 dpr 缩放
    candidates = [
        (int(geo["screenX"] + geo["cssX"]), int(geo["screenY"] + f + geo["cssY"])),
        (int(geo["screenX"] + geo["cssX"] * zx), int(geo["screenY"] + f * zx + geo["cssY"] * zx)),
    ]
    info = bb.bb_open("9e6f73cc742b4abc9015f31f8e75fbd7")
    pid = str(info.get("pid"))
    ps = os.path.join(os.environ["TEMP"], "os_reload2.ps1")
    with open(ps, "w", encoding="utf-8-sig") as fh:
        fh.write(PS)

    for (x, y) in candidates:
        out = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps,
                              "-X", str(x), "-Y", str(y), "-ProcId", pid],
                             capture_output=True, text=True, encoding="utf-8", errors="replace")
        print("点击", x, y, "->", (out.stdout or "").strip())
        time.sleep(4)
        ver = wd.js("""
        const id = %s;
        const m = document.querySelector('extensions-manager');
        const list = m.shadowRoot.querySelector('extensions-item-list');
        const item = [...list.shadowRoot.querySelectorAll('extensions-item')].find(it => it.getAttribute('id') === id);
        return item ? (item.shadowRoot.querySelector('#version')||{}).innerText : 'not-found';
        """ % json.dumps(EXT_ID))
        print("   版本:", ver)
        if ver and ver != geo["ver"]:
            print("重载成功")
            return
    print("两个候选坐标都未生效")


if __name__ == "__main__":
    main()
