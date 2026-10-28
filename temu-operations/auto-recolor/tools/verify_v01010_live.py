"""重载扩展到 v0.10.10，并在新标签页验证伸缩方向与底部空白。"""
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
        const original = rect();

        const ns = sr.querySelector('.resizer.ns');
        let nr = ns.getBoundingClientRect();
        let px = nr.left + Math.min(60, nr.width / 2);
        let py = nr.top + 2;
        fire(ns, 'pointerdown', px, py);
        fire(window, 'pointermove', px, py + 70);
        fire(window, 'pointerup', px, py + 70);
        const grewDown = rect();
        fire(ns, 'pointerdown', px, py + 70);
        fire(window, 'pointermove', px, py);
        fire(window, 'pointerup', px, py);
        const restoredAfterNs = rect();

        const ew = sr.querySelector('.resizer.ew');
        let er = ew.getBoundingClientRect();
        let ex = er.left + 2;
        let ey = er.top + Math.min(60, er.height / 2);
        fire(ew, 'pointerdown', ex, ey);
        fire(window, 'pointermove', ex + 60, ey);
        fire(window, 'pointerup', ex + 60, ey);
        const grewRight = rect();
        fire(ew, 'pointerdown', ex + 60, ey);
        fire(window, 'pointermove', ex, ey);
        fire(window, 'pointerup', ex, ey);
        const restoredAfterEw = rect();

        // 布局检查：bd 应填满 box，footer 贴底，不出现底部空白
        const br = box.getBoundingClientRect();
        const dr = bd.getBoundingClientRect();
        const fr = footer.getBoundingClientRect();
        const bdFills = Math.round(dr.bottom - br.bottom);
        const footerGap = Math.round(dr.bottom - fr.bottom);

        return JSON.stringify({
          original, grewDown, restoredAfterNs,
          grewRight, restoredAfterEw,
          bdFills, footerGap
        });
        """))
        print(json.dumps(outcome, ensure_ascii=False, indent=2))
        assert outcome["grewDown"]["h"] > outcome["original"]["h"], outcome
        assert abs(outcome["grewDown"]["y"] - outcome["original"]["y"]) <= 1, outcome
        assert outcome["grewRight"]["w"] > outcome["original"]["w"], outcome
        assert abs(outcome["grewRight"]["x"] - outcome["original"]["x"]) <= 1, outcome
        assert outcome["restoredAfterNs"]["h"] == outcome["original"]["h"], outcome
        assert outcome["restoredAfterEw"]["w"] == outcome["original"]["w"], outcome
        assert abs(outcome["bdFills"]) <= 2, outcome
        assert abs(outcome["footerGap"]) <= 2, outcome
        print("伸缩方向 + 底部填充: OK")
    finally:
        wd.switch(tab)
        wd.close_tab()


if __name__ == "__main__":
    main()
