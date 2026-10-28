"""找到准备完成的 TEMU 任务页并点击“开始队列”。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

PROFILE_ID = "9e6f73cc742b4abc9015f31f8e75fbd7"


def main():
    wd, _ = bb.ensure_session(PROFILE_ID)
    target = None
    candidates = []
    for handle in wd.handles():
        try:
            wd.switch(handle)
            url = wd.url() or ""
            if "agentseller.temu.com" not in url:
                continue
            raw = wd.js("""
            const host = document.getElementById('temu-image-bot-host');
            const api = window.__TEMU_IMG_BOT_API__;
            if (!host || !host.shadowRoot || !api) return null;
            const sr = host.shadowRoot;
            const start = sr.getElementById('start');
            return JSON.stringify({
              status: api.state.status,
              phase: api.state.phase,
              skcs: api.state.skcs.length,
              cursor: api.state.cursor,
              taskText: sr.getElementById('taskList').innerText,
              stat: sr.getElementById('stat').innerText,
              startVisible: !!start && start.getBoundingClientRect().width > 0,
              startDisabled: start ? !!start.disabled : true
            });
            """)
            if not raw:
                continue
            info = json.loads(raw)
            info.update({"handle": handle, "url": url})
            candidates.append(info)
            if info["status"] == "ready" and info["skcs"] and not info["startDisabled"]:
                target = handle
                break
        except Exception:
            continue

    print("准备状态候选:", json.dumps(candidates, ensure_ascii=False, indent=2))
    if not target:
        raise SystemExit("没有找到状态为“准备完成”的任务页")
    wd.switch(target)
    clicked = wd.js("""
    const sr = document.getElementById('temu-image-bot-host').shadowRoot;
    const start = sr.getElementById('start');
    start.scrollIntoView({block:'center'});
    start.focus();
    start.click();
    return 'clicked';
    """)
    print("点击开始:", clicked)
    time.sleep(6)
    for i in range(12):
        try:
            state = wd.js("""
            const api = window.__TEMU_IMG_BOT_API__;
            if (!api) return null;
            return JSON.stringify({
              url: location.href,
              status: api.state.status,
              phase: api.state.phase,
              cursor: api.state.cursor,
              current: api.state.current,
              error: api.state.error,
              logs: (api.state.logs || []).slice(-8).map(x => x.line)
            });
            """)
            print(i, state)
            data = json.loads(state) if state else {}
            if data.get("status") in ("running", "paused") or data.get("phase") in ("EDIT", "CONFIRM_INFO"):
                break
        except Exception as exc:
            print("轮询:", str(exc)[:120])
        time.sleep(2)
    shot = os.path.join(os.getcwd(), "probes", "shots", "v098_started_queue.png")
    print("截图:", wd.screenshot(shot))


if __name__ == "__main__":
    main()
