"""通过 chrome.developerPrivate 重载扩展，并验证 24 套主题与渐变纹理样式。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

EXT_ID = "koiobokagpbhihnhmhegokjmpbhgghon"


def find_tab(wd, prefix):
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if prefix in (wd.url() or ""):
                return handle
        except Exception:
            continue
    return None


def main():
    wd = bb.connect()
    ext_tab = find_tab(wd, "chrome://extensions")
    if not ext_tab:
        ext_tab = wd.new_tab("chrome://extensions")
        time.sleep(5)
    wd.switch(ext_tab)
    available = wd.js("return typeof chrome.developerPrivate !== 'undefined';")
    print("developerPrivate:", available)
    if not available:
        raise SystemExit("chrome.developerPrivate 不可用，需要 UIAutomation 兜底")
    wd.js("""
    const id = arguments[0];
    window.__temuReloadResult = 'pending';
    chrome.developerPrivate.reload(id, {failQuietly:false}, () => {
      window.__temuReloadResult = chrome.runtime.lastError
        ? 'ERROR: ' + chrome.runtime.lastError.message : 'OK';
    });
    return 'started';
    """, [EXT_ID])
    result = ""
    for _ in range(30):
        time.sleep(1)
        result = wd.js("return window.__temuReloadResult || 'pending';")
        if result != "pending":
            break
    print("reload:", result)
    if not result.startswith("OK"):
        raise SystemExit(result)
    time.sleep(3)
    version = wd.js("""
    const id = arguments[0];
    const manager = document.querySelector('extensions-manager');
    const list = manager.shadowRoot.querySelector('extensions-item-list');
    const item = [...list.shadowRoot.querySelectorAll('extensions-item')]
      .find(node => node.getAttribute('id') === id);
    return item ? item.shadowRoot.querySelector('#version').innerText.trim() : 'not-found';
    """, [EXT_ID])
    print("扩展页版本:", version)

    temu_tab = find_tab(wd, "https://agentseller.temu.com/")
    if not temu_tab:
        temu_tab = wd.new_tab("https://agentseller.temu.com/goods/list#temu-image-bot")
    wd.switch(temu_tab)
    wd.js("location.reload(); return 'reloading';")
    panel = "no-panel"
    for _ in range(20):
        time.sleep(1)
        try:
            panel = wd.js("""
            const host = document.getElementById('temu-image-bot-host');
            if (!host || !host.shadowRoot) return 'no-panel';
            const sr = host.shadowRoot;
            return JSON.stringify({
              version: sr.getElementById('verLine').innerText,
              stats: sr.getElementById('queueStats').innerText,
              task: sr.getElementById('taskList').innerText,
              retry: sr.getElementById('retryFailed').innerText,
              themeCount: sr.getElementById('themeBtns').children.length
            });
            """)
            if panel != "no-panel" and "v0.10.9" in panel:
                break
        except Exception:
            pass
    print("TEMU 面板:", panel)
    portrait = json.loads(panel)
    assert "v0.10.9" in portrait["version"], portrait
    assert portrait["themeCount"] == 24, portrait
    switched = wd.js("""
    const sr = document.getElementById('temu-image-bot-host').shadowRoot;
    const buttons = [...sr.getElementById('themeBtns').children];
    const original = buttons.findIndex(button => button.style.outline && button.style.outline !== 'none');
    const keys = ['aurora','sunset','porcelain','nebula','cream','sakura'];
    const results = {};
    let index = 0;
    const run = () => {
      if (index >= keys.length) {
        buttons.find(button => button.dataset.preset === 'aurora').click();
        setTimeout(() => resolve(JSON.stringify({items: results, original})), 150);
        return;
      }
      const key = keys[index++];
      const button = buttons.find(item => item.dataset.preset === key);
      button.click();
      setTimeout(() => {
        const box = sr.querySelector('.box');
        const header = sr.querySelector('.hd');
        const start = sr.getElementById('start');
        results[key] = {
          name: sr.getElementById('themeName').innerText,
          boxImage: getComputedStyle(box).backgroundImage,
          boxColor: getComputedStyle(box).backgroundColor,
          headerImage: getComputedStyle(header).backgroundImage,
          actionImage: getComputedStyle(start).backgroundImage,
          bodySize: getComputedStyle(box).backgroundSize
        };
        run();
      }, 100);
    };
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    run();
    return promise;
    """)
    print("皮肤切换:", switched)
    theme_result = json.loads(switched)
    for key, item in theme_result["items"].items():
        assert item["headerImage"] != "none", (key, item)
        assert item["actionImage"] != "none", (key, item)
    assert theme_result["items"]["aurora"]["boxImage"] != "none"
    assert theme_result["items"]["porcelain"]["boxImage"] != "none"
    assert theme_result["items"]["cream"]["boxImage"] != "none"
    assert theme_result["items"]["sakura"]["bodySize"].startswith("48px 48px")
    assert theme_result["items"]["nebula"]["boxColor"] == "rgb(13, 19, 36)"
    time.sleep(1)
    shot = os.path.join(os.getcwd(), "probes", "shots", "v0109_resize_ui.png")
    print("截图:", wd.screenshot(shot))
    wd.js("""
    const sr = document.getElementById('temu-image-bot-host').shadowRoot;
    const buttons = [...sr.getElementById('themeBtns').children];
    const original = arguments[0];
    if (original >= 0) buttons[original].click();
    return 'restored';
    """, [theme_result["original"]])


if __name__ == "__main__":
    main()
