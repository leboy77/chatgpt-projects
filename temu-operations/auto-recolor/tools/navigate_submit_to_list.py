"""将仍在旧版提交轮询中的任务页安全带回列表，交由新版本核验。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

URL = "https://agentseller.temu.com/goods/list#temu-image-bot"


def main():
    wd = bb.connect()
    target = None
    for handle in wd.handles():
        try:
            wd.switch(handle)
            parsed = wd.url() or ""
            if "agentseller.temu.com/goods/edit" not in parsed:
                continue
            state = wd.js("""
            const api = window.__TEMU_IMG_BOT_API__;
            if (!api) return null;
            return JSON.stringify({status:api.state.status, submitAttempt:api.state.submitAttempt,
              current:api.state.current, cursor:api.state.cursor});
            """)
            if not state:
                continue
            data = json.loads(state)
            if data.get("status") == "running" and data.get("submitAttempt"):
                target = handle
                print("发现提交轮询页:", parsed, data)
                break
        except Exception:
            continue
    if not target:
        print("没有需要接管的提交轮询页")
        return
    wd.switch(target)
    wd.navigate(URL)
    time.sleep(8)
    print("接管后:", wd.js("""
    const api = window.__TEMU_IMG_BOT_API__;
    return api ? JSON.stringify({
      version:document.getElementById('temu-image-bot-host').shadowRoot.getElementById('verLine').innerText,
      status:api.state.status, phase:api.state.phase, cursor:api.state.cursor,
      submitAttempt:api.state.submitAttempt, error:api.state.error
    }) : 'no-api';
    """))


if __name__ == "__main__":
    main()
