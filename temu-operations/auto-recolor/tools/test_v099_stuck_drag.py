"""验证无进展卡死计时与面板空白区域拖动。"""
import json
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


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
                target = handle
                break
        except Exception:
            continue
    if not target:
        raise SystemExit("找不到 TEMU 插件页")
    wd.switch(target)

    stuck = json.loads(wd.js("""
    const api = window.__TEMU_IMG_BOT_API__;
    const old = api.state.current;
    const now = Date.now();
    api.state.current = {
      skc: 'timeout-test',
      startedAt: now - 30 * 60 * 1000,
      lastProgressAt: now - 60 * 1000,
      lastProgress: '测试进度'
    };
    api.state.config.skuTimeoutMin = 3;
    const inactivity = api.skuInactivityMs();
    api.markSkuProgress('刚刚有进展');
    const afterMark = api.skuInactivityMs();
    api.state.current = old;
    const sr = document.getElementById('temu-image-bot-host').shadowRoot;
    return JSON.stringify({
      inactivity,
      afterMark,
      label: sr.querySelector('input#skuTimeoutMin').closest('.field').querySelector('span').innerText
    });
    """))
    assert 59000 <= stuck["inactivity"] <= 62000, stuck
    assert stuck["afterMark"] < 2000, stuck
    assert stuck["label"] == "卡死无进展超时（分钟）", stuck
    print("卡死计时: OK", stuck)

    drag = json.loads(wd.js("""
    const host = document.getElementById('temu-image-bot-host');
    const sr = host.shadowRoot;
    const hero = sr.querySelector('.hero');
    const box = sr.querySelector('.box');
    const initial = host.getBoundingClientRect();
    const fire = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, composed: true, cancelable: true,
      button: 0, buttons: type === 'pointerup' ? 0 : 1,
      pointerId: 77, pointerType: 'mouse', clientX: x, clientY: y
    }));
    const sx = initial.left + 120;
    const sy = initial.top + 120;
    fire(hero, 'pointerdown', sx, sy);
    fire(window, 'pointermove', sx - 100, sy - 60);
    fire(window, 'pointerup', sx - 100, sy - 60);
    const moved = host.getBoundingClientRect();
    return new Promise(resolve => setTimeout(() => {
      const hero2 = sr.querySelector('.hero');
      fire(hero2, 'pointerdown', moved.left + 120, moved.top + 120);
      fire(window, 'pointermove', moved.left + 220, moved.top + 180);
      fire(window, 'pointerup', moved.left + 220, moved.top + 180);
      setTimeout(() => {
        const restored = host.getBoundingClientRect();
        resolve(JSON.stringify({
          initial: {x:Math.round(initial.x), y:Math.round(initial.y)},
          moved: {x:Math.round(moved.x), y:Math.round(moved.y)},
          restored: {x:Math.round(restored.x), y:Math.round(restored.y)},
          draggingClass: box.classList.contains('dragging')
        }));
      }, 250);
    }, 250));
    """))
    assert drag["moved"]["x"] < drag["initial"]["x"] - 80, drag
    assert drag["moved"]["y"] < drag["initial"]["y"] - 40, drag
    assert abs(drag["restored"]["x"] - drag["initial"]["x"]) <= 2, drag
    assert abs(drag["restored"]["y"] - drag["initial"]["y"]) <= 2, drag
    assert not drag["draggingClass"], drag
    print("空白区域自由拖动: OK", drag)


if __name__ == "__main__":
    main()
