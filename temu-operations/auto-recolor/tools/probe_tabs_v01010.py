"""只读列出 agentseller 标签页与面板版本，判断当前运行状态。"""
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    for handle in wd.handles():
        try:
            wd.switch(handle)
            url = wd.url() or ""
            if "agentseller.temu.com" not in url:
                continue
            panel = wd.js("""
            const host = document.getElementById('temu-image-bot-host');
            if (!host || !host.shadowRoot) return 'no-panel';
            const sr = host.shadowRoot;
            const ver = sr.getElementById('verLine');
            return ver ? ver.innerText : 'no-version';
            """)
            print(url)
            print("  面板:", panel)
        except Exception as exc:  # noqa: BLE001
            print(url, "ERR", exc)


if __name__ == "__main__":
    main()
