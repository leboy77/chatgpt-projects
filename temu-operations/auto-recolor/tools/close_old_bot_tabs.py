"""关闭非当前版本的 TEMU 图片助手任务标签页。"""
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    targets = []
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if "agentseller.temu.com" not in (wd.url() or ""):
                continue
            info = wd.js("""
            const host=document.getElementById('temu-image-bot-host');
            if (!host || !host.shadowRoot) return '';
            return host.shadowRoot.getElementById('verLine').innerText;
            """)
            if info and "v0.10.5" not in info:
                targets.append((handle, info, wd.url()))
        except Exception:
            continue
    for handle, version, url in targets:
        wd.switch(handle)
        wd.close_tab()
        print("已关闭:", version, url)
    print("保留 v0.10.5 标签页")


if __name__ == "__main__":
    main()
