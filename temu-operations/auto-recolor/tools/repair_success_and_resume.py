"""补写列表已确认成功的 SKC，并从下一个 SKC 继续 v0.10.4 队列。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SUCCESS_SKCS = ["12889088637", "96659324659"]


def main():
    wd = bb.connect()
    target = None
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if "agentseller.temu.com" not in (wd.url() or ""):
                continue
            raw = wd.js("""
            const api=window.__TEMU_IMG_BOT_API__;
            const host=document.getElementById('temu-image-bot-host');
            if (!api || !host || !host.shadowRoot) return null;
            return JSON.stringify({
              version:host.shadowRoot.getElementById('verLine').innerText,
              status:api.state.status,
              cursor:api.state.cursor,
              current:api.state.current
            });
            """)
            if not raw:
                continue
            info = json.loads(raw)
            if "v0.10.4" in info["version"] and info["status"] == "paused":
                target = handle
                print("目标页:", wd.url(), info)
                break
        except Exception:
            continue
    if not target:
        raise SystemExit("找不到暂停中的 v0.10.4 任务页")
    wd.switch(target)
    state = wd.js("""
    const api=window.__TEMU_IMG_BOT_API__;
    for (const skc of arguments[0]) {
      api.state.skcStatuses[skc] = {
        ...(api.state.skcStatuses[skc] || {}),
        status:'提交成功（列表补确认）',
        at:Date.now(),
        retryable:false,
        lastReason:'列表已确认提交成功'
      };
    }
    const ids=api.state.skcs;
    const lastIndex=Math.max(...arguments[0].map(skc => ids.indexOf(skc)));
    api.state.cursor=Math.max(api.state.cursor, lastIndex + 1);
    api.state.current=null;
    api.state.phase='LIST_SEARCH';
    api.state.status='ready';
    api.state.error=null;
    api.state.retry=0;
    api.state.skcTimedOut=false;
    api.state.timeoutNavigating=false;
    await api.saveState();
    return JSON.stringify({cursor:api.state.cursor, statuses:arguments[0].map(skc => api.state.skcStatuses[skc])});
    """, [SUCCESS_SKCS])
    print("补写状态:", state)
    print("点击继续:", wd.js("""
    const host=document.getElementById('temu-image-bot-host');
    host.shadowRoot.getElementById('start').click();
    return 'clicked';
    """))
    time.sleep(8)
    print("继续后:", wd.js("""
    const api=window.__TEMU_IMG_BOT_API__;
    return JSON.stringify({
      url:location.href, status:api.state.status, phase:api.state.phase,
      cursor:api.state.cursor, current:api.state.current, error:api.state.error,
      logs:(api.state.logs||[]).slice(-8).map(x=>x.line)
    });
    """))


if __name__ == "__main__":
    main()
