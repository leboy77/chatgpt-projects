"""验证面板关闭、悬浮恢复和刷新后关闭状态。"""
import json
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOT = os.path.join(os.getcwd(), "probes", "shots", "v0103_panel_closed.png")


def find_tab(wd):
    for handle in wd.handles():
        try:
            wd.switch(handle)
            parsed = urllib.parse.urlparse(wd.url() or "")
            if parsed.hostname == "agentseller.temu.com" and wd.js("return !!document.getElementById('temu-image-bot-host');"):
                return handle
        except Exception:
            continue
    raise RuntimeError("找不到 TEMU 插件页")


def panel_state(wd):
    raw = wd.js("""
    const host = document.getElementById('temu-image-bot-host');
    if (!host || !host.shadowRoot) return '';
    const sr = host.shadowRoot;
    return JSON.stringify({
      version: sr.getElementById('verLine').innerText,
      closed: sr.querySelector('.box').classList.contains('closed'),
      launcher: sr.getElementById('panelLauncher').classList.contains('show')
    });
    """)
    return json.loads(raw) if raw else {}


def main():
    wd = bb.connect()
    tab = find_tab(wd)
    wd.switch(tab)
    state = panel_state(wd)
    if state.get("closed"):
        wd.js("document.getElementById('temu-image-bot-host').shadowRoot.getElementById('panelLauncher').click();")
        time.sleep(0.5)
    wd.js("document.getElementById('temu-image-bot-host').shadowRoot.getElementById('closePanel').click();")
    time.sleep(0.8)
    closed = panel_state(wd)
    assert closed["closed"] and closed["launcher"], closed
    print("关闭面板: OK", closed)
    print("截图:", wd.screenshot(SHOT))

    wd.js("location.reload(); return 'reloading';")
    for _ in range(25):
        time.sleep(1)
        try:
            after_reload = panel_state(wd)
            if after_reload.get("version", "").endswith("v0.10.3"):
                break
        except Exception:
            continue
    else:
        raise RuntimeError("刷新后面板未恢复")
    assert after_reload["closed"] and after_reload["launcher"], after_reload
    print("刷新后保持关闭: OK", after_reload)

    wd.js("document.getElementById('temu-image-bot-host').shadowRoot.getElementById('panelLauncher').click();")
    time.sleep(0.8)
    opened = panel_state(wd)
    assert not opened["closed"] and not opened["launcher"], opened
    print("悬浮按钮恢复: OK", opened)


if __name__ == "__main__":
    main()
