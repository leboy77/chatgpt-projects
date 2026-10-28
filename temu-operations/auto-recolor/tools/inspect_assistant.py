"""只读检查比特浏览器窗口中的 TEMU 页面与插件面板状态。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

PROFILE_ID = "9e6f73cc742b4abc9015f31f8e75fbd7"


def main():
    wd, _ = bb.ensure_session(PROFILE_ID)
    rows = []
    for handle in wd.handles():
        try:
            wd.switch(handle)
            url = wd.url() or ""
            title = wd.title() or ""
            if "temu.com" not in url:
                rows.append({"handle": handle[:8], "url": url, "title": title[:60]})
                continue
            time.sleep(0.4)
            raw = wd.js("""
            const host = document.getElementById('temu-image-bot-host');
            const api = window.__TEMU_IMG_BOT_API__;
            if (!host || !host.shadowRoot) {
              return JSON.stringify({
                panel: false,
                extension: !!api,
                ready: document.readyState
              });
            }
            const sr = host.shadowRoot;
            const start = sr.getElementById('start');
            const rect = start ? start.getBoundingClientRect() : null;
            const settings = sr.getElementById('settings');
            const body = sr.querySelector('.bd');
            return JSON.stringify({
              panel: true,
              extension: !!api,
              version: sr.getElementById('verLine') ? sr.getElementById('verLine').innerText : '',
              taskTabActive: sr.querySelector('.tab[data-tab="task"]').classList.contains('active'),
              paneActive: [...sr.querySelectorAll('.pane')].find(p => p.classList.contains('active'))?.dataset.pane || '',
              panelOpen: body ? body.classList.contains('open') : false,
              settingsOpen: settings ? settings.classList.contains('show') : false,
              startVisible: !!(start && rect && rect.width > 0 && rect.height > 0),
              startDisabled: start ? !!start.disabled : null,
              startRect: rect ? {x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height)} : null,
              taskText: sr.getElementById('taskList') ? sr.getElementById('taskList').innerText : '',
              stat: sr.getElementById('stat') ? sr.getElementById('stat').innerText : '',
              state: api ? {
                status: api.state.status,
                phase: api.state.phase,
                cursor: api.state.cursor,
                current: api.state.current,
                skcs: api.state.skcs,
                queryType: api.state.queryType,
                error: api.state.error
              } : null
            });
            """)
            rows.append({
                "handle": handle[:8], "url": url, "title": title[:60],
                "ui": json.loads(raw) if raw else None,
            })
        except Exception as exc:  # noqa: BLE001
            rows.append({"handle": handle[:8], "error": str(exc)[:160]})
    print(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
