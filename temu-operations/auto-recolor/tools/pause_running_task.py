"""暂停当前运行中的任务标签页。"""
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if "agentseller.temu.com" not in (wd.url() or ""):
                continue
            status = wd.js("""
            const api=window.__TEMU_IMG_BOT_API__;
            return api ? api.state.status : '';
            """)
            if status != "running":
                continue
            result = wd.js("""
            const host=document.getElementById('temu-image-bot-host');
            if (!host || !host.shadowRoot) return 'no-panel';
            host.shadowRoot.getElementById('pause').click();
            return 'paused';
            """)
            print(handle, result, wd.url())
            return
        except Exception:
            continue
    print("没有运行中的任务")


if __name__ == "__main__":
    main()
