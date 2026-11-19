"""检查 7414 的图片更新页是否已加载图片助手面板。"""
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    for h in wd.handles():
        try:
            wd.switch(h)
            url = wd.url() or ""
            if "goods/images-edit" not in url:
                continue
            print("url:", url)
            print(version := wd.js("""
            const host = document.getElementById('temu-image-bot-host');
            if (!host || !host.shadowRoot) return 'NO_PANEL';
            const ver = host.shadowRoot.getElementById('verLine');
            return ver ? ver.innerText : 'NO_VERSION';
            """))
            return
        except Exception:
            continue
    print("no images-edit tab")


if __name__ == "__main__":
    main()
