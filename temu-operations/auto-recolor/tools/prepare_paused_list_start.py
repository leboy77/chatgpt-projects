"""将暂停任务调整为可从列表页重新查询当前 SKC。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    for handle in wd.handles():
        try:
            wd.switch(handle)
            parsed = wd.url() or ""
            if "agentseller.temu.com/goods/list" not in parsed:
                continue
            raw = wd.js("""
            const api=window.__TEMU_IMG_BOT_API__;
            const host=document.getElementById('temu-image-bot-host');
            if (!api || !host || !host.shadowRoot) return null;
            if (api.state.status !== 'paused') return null;
            api.state.phase='LIST_SEARCH';
            api.state.current=null;
            api.state.error='等待重新运行（轮播图虚拟化自检已修复）';
            api.state.skcTimedOut=false;
            api.state.timeoutNavigating=false;
            await api.saveState();
            return JSON.stringify({
              version:host.shadowRoot.getElementById('verLine').innerText,
              status:api.state.status, phase:api.state.phase,
              cursor:api.state.cursor, error:api.state.error
            });
            """)
            if raw:
                print(raw)
                return
        except Exception:
            continue
    print("没有需要调整的暂停列表页")


if __name__ == "__main__":
    main()
