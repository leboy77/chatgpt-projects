"""在已经进入运行状态的 TEMU 任务页手动启动驱动器。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    target = None
    for handle in wd.handles():
        try:
            wd.switch(handle)
            url = wd.url() or ""
            if "agentseller.temu.com/goods/list#temu-image-bot" not in url:
                continue
            status = wd.js("""
            const api = window.__TEMU_IMG_BOT_API__;
            return api ? api.state.status : '';
            """)
            if status == "running":
                target = handle
                break
        except Exception:
            continue
    if not target:
        raise SystemExit("没有找到运行中的任务页")
    wd.switch(target)
    print("运行页:", wd.url())
    print("驱动器:", wd.js("""
    const api = window.__TEMU_IMG_BOT_API__;
    api.runDriver();
    return 'started';
    """))
    for i in range(20):
        time.sleep(2)
        raw = wd.js("""
        const api = window.__TEMU_IMG_BOT_API__;
        return JSON.stringify({
          status: api.state.status,
          phase: api.state.phase,
          cursor: api.state.cursor,
          current: api.state.current,
          error: api.state.error,
          logs: (api.state.logs || []).slice(-6).map(x => x.line)
        });
        """)
        print(i, raw)
        data = json.loads(raw)
        if data.get("current") or data.get("phase") in ("EDIT", "CONFIRM_INFO") or data.get("status") == "paused":
            break


if __name__ == "__main__":
    main()
