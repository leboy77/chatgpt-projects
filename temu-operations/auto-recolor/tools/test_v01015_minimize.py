"""验证缩小按钮会隐藏整个插件框，并显示悬浮恢复按钮。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    for h in wd.handles():
        try:
            wd.switch(h)
            if "agentseller.temu.com" not in (wd.url() or ""):
                continue
            version = wd.js("""
            const host = document.getElementById('temu-image-bot-host');
            if (!host || !host.shadowRoot) return '';
            const ver = host.shadowRoot.getElementById('verLine');
            return ver ? ver.innerText : '';
            """)
            if version and "0.10.15" in version:
                break
        except Exception:
            continue
    else:
        raise SystemExit("没找到带面板的 TEMU 标签页")

    def state():
        return json.loads(wd.js("""
        const sr = document.getElementById('temu-image-bot-host').shadowRoot;
        const box = sr.querySelector('.box');
        const launcher = sr.getElementById('panelLauncher');
        return JSON.stringify({
          boxClosed: box.classList.contains('closed'),
          boxDisplay: getComputedStyle(box).display,
          boxWidth: Math.round(box.getBoundingClientRect().width),
          launcherShown: launcher.classList.contains('show'),
          launcherDisplay: getComputedStyle(launcher).display
        });
        """))

    initial = state()
    if initial["boxClosed"]:
        wd.js("""
        const sr = document.getElementById('temu-image-bot-host').shadowRoot;
        sr.getElementById('panelLauncher').click();
        return 'opened';
        """)
        time.sleep(1)
    before = state()
    assert not before["boxClosed"], before
    wd.js("""
    const sr = document.getElementById('temu-image-bot-host').shadowRoot;
    sr.getElementById('min').click();
    return 'min-clicked';
    """)
    time.sleep(1)
    after_min = state()
    wd.js("""
    const sr = document.getElementById('temu-image-bot-host').shadowRoot;
    sr.getElementById('panelLauncher').click();
    return 'launcher-clicked';
    """)
    time.sleep(1)
    restored = state()
    print(json.dumps({"before": before, "afterMin": after_min, "restored": restored},
                     ensure_ascii=False, indent=2))
    assert after_min["boxClosed"] and after_min["boxDisplay"] == "none", after_min
    assert after_min["launcherShown"] and after_min["launcherDisplay"] != "none", after_min
    assert not restored["boxClosed"] and restored["boxDisplay"] != "none", restored
    assert not restored["launcherShown"], restored
    print("缩小按钮: OK")


if __name__ == "__main__":
    main()
