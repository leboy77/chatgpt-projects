"""在无任务标记的新标签页检查磁盘版本是否已被新页面加载。"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

URL = "https://agentseller.temu.com/goods/list"


def main():
    wd = bb.connect()
    tab = wd.new_tab(URL)
    try:
        time.sleep(6)
        wd.switch(tab)
        version = ''
        for _ in range(20):
            version = wd.js("""
            const host = document.getElementById('temu-image-bot-host');
            return host && host.shadowRoot
              ? host.shadowRoot.getElementById('verLine').innerText : '';
            """)
            if version:
                break
            time.sleep(1)
        print(version)
    finally:
        wd.switch(tab)
        wd.close_tab()


if __name__ == "__main__":
    main()
