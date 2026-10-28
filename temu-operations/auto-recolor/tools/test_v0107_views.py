"""验证主页面不显示参数，任务详情显示参数和准备区。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def snapshot(wd):
    raw = wd.js("""
    const host=document.getElementById('temu-image-bot-host');
    if (!host || !host.shadowRoot) return '';
    const sr=host.shadowRoot;
    const vis = el => el && getComputedStyle(el).display !== 'none';
    return JSON.stringify({
      version:sr.getElementById('verLine').innerText,
      taskPaneDetail:sr.querySelector('[data-pane=task]').classList.contains('detail-mode'),
      footerHidden:sr.querySelector('.footer').classList.contains('hidden'),
      artNoVisible:vis(sr.getElementById('preparePanel')),
      paramsVisible:vis(sr.querySelector('.paramsSection')),
      taskListVisible:vis(sr.getElementById('taskList')),
      importVisible:vis(sr.querySelector('.importGrid')),
      saveVisible:vis(sr.getElementById('prepareTask'))
    });
    """)
    return json.loads(raw) if raw else {}


def main():
    wd = bb.connect()
    target = None
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if "agentseller.temu.com" not in (wd.url() or ""):
                continue
            if wd.js("return !!document.getElementById('temu-image-bot-host');"):
                target = handle
                break
        except Exception:
            continue
    if not target:
        raise SystemExit("未找到面板")
    wd.switch(target)
    if snapshot(wd)["taskPaneDetail"]:
        wd.js("document.getElementById('temu-image-bot-host').shadowRoot.getElementById('backHome').click();")
        time.sleep(0.5)
    home = snapshot(wd)
    assert "v0.10.7" in home["version"], home
    assert not home["taskPaneDetail"] and not home["footerHidden"], home
    assert not home["artNoVisible"] and not home["paramsVisible"] and not home["saveVisible"], home
    assert home["taskListVisible"], home
    print("主页面只显示任务列表: OK", home)

    wd.js("""
    const sr=document.getElementById('temu-image-bot-host').shadowRoot;
    sr.querySelector('.taskRow').click();
    """)
    time.sleep(1)
    detail = snapshot(wd)
    assert detail["taskPaneDetail"] and detail["footerHidden"], detail
    assert detail["artNoVisible"] and detail["paramsVisible"] and detail["saveVisible"], detail
    assert not detail["taskListVisible"], detail
    print("任务详情包含参数和准备: OK", detail)

    wd.js("document.getElementById('temu-image-bot-host').shadowRoot.getElementById('backHome').click();")
    time.sleep(0.5)
    restored = snapshot(wd)
    assert not restored["taskPaneDetail"], restored
    print("返回主页面: OK", restored)


if __name__ == "__main__":
    main()
