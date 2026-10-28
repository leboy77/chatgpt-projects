"""v0.10.10 第二次真机验证：方向、底部填充、并还原用户面板尺寸。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

EXT_ID = "koiobokagpbhihnhmhegokjmpbhgghon"
URL = "https://agentseller.temu.com/goods/list#temu-image-bot"


def find_tab(wd, prefix):
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if prefix in (wd.url() or ""):
                return handle
        except Exception:
            continue
    return None


def reload_extension(wd):
    ext_tab = find_tab(wd, "chrome://extensions")
    if not ext_tab:
        ext_tab = wd.new_tab("chrome://extensions")
        time.sleep(5)
    wd.switch(ext_tab)
    wd.js("""
    const id = arguments[0];
    window.__temuReloadResult = 'pending';
    chrome.developerPrivate.reload(id, {failQuietly:false}, () => {
      window.__temuReloadResult = chrome.runtime.lastError
        ? 'ERROR: ' + chrome.runtime.lastError.message : 'OK';
    });
    return 'started';
    """, [EXT_ID])
    result = "pending"
    for _ in range(30):
        time.sleep(1)
        result = wd.js("return window.__temuReloadResult || 'pending';")
        if result != "pending":
            break
    if not result.startswith("OK"):
        raise SystemExit(result)
    time.sleep(2)
    version = wd.js("""
    const id = arguments[0];
    const manager = document.querySelector('extensions-manager');
    const list = manager.shadowRoot.querySelector('extensions-item-list');
    const item = [...list.shadowRoot.querySelectorAll('extensions-item')]
      .find(node => node.getAttribute('id') === id);
    return item ? item.shadowRoot.querySelector('#version').innerText.trim() : 'not-found';
    """, [EXT_ID])
    print("扩展页版本:", version)
    return version


def main():
    wd = bb.connect()
    print("扩展页版本:", reload_extension(wd))

    tab = wd.new_tab(URL)
    try:
        panel = None
        for _ in range(25):
            time.sleep(1)
            panel = wd.js("""
            const host = document.getElementById('temu-image-bot-host');
            if (!host || !host.shadowRoot) return null;
            const sr = host.shadowRoot;
            return JSON.stringify({
              version: sr.getElementById('verLine').innerText,
              resizers: sr.querySelectorAll('.resizer').length
            });
            """)
            if panel and "v0.10.10" in panel:
                break
        assert panel and "v0.10.10" in panel, panel
        print("新标签页面板:", panel)

        outcome = json.loads(wd.js("""
        const host = document.getElementById('temu-image-bot-host');
        const sr = host.shadowRoot;
        const box = sr.querySelector('.box');
        const bd = sr.querySelector('.bd');
        const footer = sr.querySelector('.footer');
        const rect = () => {
          const r = box.getBoundingClientRect();
          return {x: Math.round(r.x), y: Math.round(r.y),
                  w: Math.round(r.width), h: Math.round(r.height)};
        };
        const fire = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, {
          bubbles: true, composed: true, cancelable: true, button: 0,
          buttons: type === 'pointerup' ? 0 : 1, pointerId: 77,
          pointerType: 'mouse', clientX: x, clientY: y
        }));

        // 1) 先把面板放到一个不触顶的测试尺寸，方便做往返验证
        box.style.width = '420px';
        box.style.height = '500px';
        const base = rect();

        const ns = sr.querySelector('.resizer.ns');
        const ew = sr.querySelector('.resizer.ew');
        const nwse = sr.querySelector('.resizer.nwse');

        // 2) 下边缘：往下拉 +80 应向下变高（y 不变），再往回 -80 恢复
        let nr = ns.getBoundingClientRect();
        let px = nr.left + Math.min(60, nr.width / 2);
        let py = nr.top + 2;
        fire(ns, 'pointerdown', px, py);
        fire(window, 'pointermove', px, py + 80);
        fire(window, 'pointerup', px, py + 80);
        const grewDown = rect();
        nr = ns.getBoundingClientRect();
        py = nr.top + 2;
        fire(ns, 'pointerdown', px, py);
        fire(window, 'pointermove', px, py - 80);
        fire(window, 'pointerup', px, py - 80);
        const backDown = rect();

        // 3) 右边缘：往右拉 +80 应向右变宽（x 不变），再往回 -80 恢复
        let er = ew.getBoundingClientRect();
        let ex = er.left + 2;
        let ey = er.top + Math.min(60, er.height / 2);
        fire(ew, 'pointerdown', ex, ey);
        fire(window, 'pointermove', ex + 80, ey);
        fire(window, 'pointerup', ex + 80, ey);
        const grewRight = rect();
        er = ew.getBoundingClientRect();
        ex = er.left + 2;
        fire(ew, 'pointerdown', ex, ey);
        fire(window, 'pointermove', ex - 80, ey);
        fire(window, 'pointerup', ex - 80, ey);
        const backRight = rect();

        // 4) 右下角：同时放大宽高，再恢复
        let cr = nwse.getBoundingClientRect();
        fire(nwse, 'pointerdown', cr.right - 2, cr.bottom - 2);
        fire(window, 'pointermove', cr.right - 2 + 50, cr.bottom - 2 + 60);
        fire(window, 'pointerup', cr.right - 2 + 50, cr.bottom - 2 + 60);
        const grewCorner = rect();
        cr = nwse.getBoundingClientRect();
        fire(nwse, 'pointerdown', cr.right - 2, cr.bottom - 2);
        fire(window, 'pointermove', cr.right - 2 - 50, cr.bottom - 2 - 60);
        fire(window, 'pointerup', cr.right - 2 - 50, cr.bottom - 2 - 60);
        const backCorner = rect();

        // 5) 底部填充：拉到 700 高，bd 应填满、footer 贴底
        box.style.height = '700px';
        const br2 = box.getBoundingClientRect();
        const dr2 = bd.getBoundingClientRect();
        const fr2 = footer.getBoundingClientRect();
        const bdFills = Math.round(dr2.bottom - br2.bottom);
        const footerGap = Math.round(dr2.bottom - fr2.bottom);

        // 6) 还原用户面板尺寸（426×869），零位移触发保存
        box.style.width = '426px';
        box.style.height = '869px';
        const rr = ns.getBoundingClientRect();
        const rx = rr.left + Math.min(60, rr.width / 2);
        const ry = rr.top + 2;
        fire(ns, 'pointerdown', rx, ry);
        fire(window, 'pointermove', rx, ry);
        fire(window, 'pointerup', rx, ry);

        return JSON.stringify({
          base, grewDown, backDown, grewRight, backRight,
          grewCorner, backCorner, bdFills, footerGap
        });
        """))
        print(json.dumps(outcome, ensure_ascii=False, indent=2))
        base = outcome["base"]
        assert outcome["grewDown"]["h"] == base["h"] + 80, outcome
        assert abs(outcome["grewDown"]["y"] - base["y"]) <= 1, outcome
        assert outcome["backDown"]["h"] == base["h"], outcome
        assert outcome["grewRight"]["w"] == base["w"] + 80, outcome
        assert abs(outcome["grewRight"]["x"] - base["x"]) <= 1, outcome
        assert outcome["backRight"]["w"] == base["w"], outcome
        assert outcome["grewCorner"]["w"] == base["w"] + 50, outcome
        assert outcome["grewCorner"]["h"] == base["h"] + 60, outcome
        assert abs(outcome["grewCorner"]["x"] - base["x"]) <= 1, outcome
        assert abs(outcome["grewCorner"]["y"] - base["y"]) <= 1, outcome
        assert outcome["backCorner"]["w"] == base["w"], outcome
        assert outcome["backCorner"]["h"] == base["h"], outcome
        assert abs(outcome["bdFills"]) <= 2, outcome
        assert abs(outcome["footerGap"]) <= 2, outcome
        print("伸缩方向 + 底部填充 + 尺寸还原: OK")
    finally:
        wd.switch(tab)
        wd.close_tab()


if __name__ == "__main__":
    main()
