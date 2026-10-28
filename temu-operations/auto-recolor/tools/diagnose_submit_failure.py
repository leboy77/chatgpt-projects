"""读取提交失败后的页面状态、平台弹窗、按钮和字段错误。"""
import json
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOT = os.path.join(os.getcwd(), "probes", "shots", "submit_failure_diagnose.png")


def main():
    wd = bb.connect()
    target = None
    for handle in wd.handles():
        try:
            wd.switch(handle)
            parsed = urllib.parse.urlparse(wd.url() or "")
            if parsed.hostname != "agentseller.temu.com":
                continue
            if wd.js("return !!window.__TEMU_IMG_BOT_API__;"):
                state = wd.js("return window.__TEMU_IMG_BOT_API__.state.status;")
                if state == "paused":
                    target = handle
                    break
                target = target or handle
        except Exception:
            continue
    if not target:
        raise SystemExit("找不到 TEMU 插件页")
    wd.switch(target)
    raw = wd.js("""
    const api = window.__TEMU_IMG_BOT_API__;
    const visible = el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    const buttons = [...document.querySelectorAll('button,a')]
      .filter(visible)
      .map(el => ({
        tag:el.tagName,
        text:(el.innerText || '').replace(/\\s+/g,' ').trim().slice(0,80),
        cls:String(el.className || '').slice(0,100),
        disabled:!!el.disabled,
        rect:{x:Math.round(el.getBoundingClientRect().x),y:Math.round(el.getBoundingClientRect().y),
          w:Math.round(el.getBoundingClientRect().width),h:Math.round(el.getBoundingClientRect().height)}
      }))
      .filter(item => item.text);
    const modalSelectors = '[class*=MDL_innerWrapper],[class*=Drawer_outerWrapper],[role=dialog]';
    const modals = [...document.querySelectorAll(modalSelectors)]
      .filter(visible)
      .map(el => ({
        cls:String(el.className || '').slice(0,120),
        text:(el.innerText || '').replace(/\\s+/g,' ').trim().slice(0,1200)
      }))
      .filter(item => item.text);
    const keywordLines = (document.body.innerText || '').split(/\\n+/)
      .map(line => line.replace(/\\s+/g,' ').trim())
      .filter(line => /提交|确认|异常|失败|错误|待确认|合规|品质|价格|必填|不能|审核/.test(line))
      .slice(-100);
    const fieldErrors = [...new Set([...document.querySelectorAll('[class*=Form_itemError],[class*=itemError],[class*=errorMessage]')]
      .filter(visible).map(el => (el.innerText || '').replace(/\\s+/g,' ').trim()).filter(Boolean))];
    return JSON.stringify({
      url:location.href,
      status:api.state.status,
      phase:api.state.phase,
      cursor:api.state.cursor,
      current:api.state.current,
      error:api.state.error,
      submitAttempt:api.state.submitAttempt,
      buttons,
      modals,
      fieldErrors,
      keywordLines
    }, null, 2);
    """)
    print(raw)
    print("截图:", wd.screenshot(SHOT))


if __name__ == "__main__":
    main()
