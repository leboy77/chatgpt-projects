"""重载到 v0.10.12，并验证多色 SKC 模板下载入口。"""
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


def main():
    wd = bb.connect()
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
    assert result.startswith("OK"), result
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

    tab = wd.new_tab(URL)
    try:
        panel = None
        for _ in range(25):
            time.sleep(1)
            panel = wd.js("""
            const host = document.getElementById('temu-image-bot-host');
            if (!host || !host.shadowRoot) return null;
            const sr = host.shadowRoot;
            const btn = sr.getElementById('dlMulticolorTemplate');
            return JSON.stringify({
              version: sr.getElementById('verLine').innerText,
              hasBtn: !!btn,
              btnText: btn ? btn.innerText.trim() : ''
            });
            """)
            if panel and "v0.10.12" in panel:
                break
        assert panel and "v0.10.12" in panel, panel
        print("新标签页面板:", panel)
        import json
        data = json.loads(panel)
        assert data["hasBtn"] and "多色" in data["btnText"], data

        wd.js("""
        const sr = document.getElementById('temu-image-bot-host').shadowRoot;
        sr.getElementById('dlMulticolorTemplate').click();
        return 'clicked';
        """)
        time.sleep(1)
        logText = wd.js("""
        const sr = document.getElementById('temu-image-bot-host').shadowRoot;
        return sr.getElementById('log').innerText;
        """)
        assert "已下载多色 SKC ID 标准模板" in logText, logText
        print("多色 SKC 模板下载: OK")
    finally:
        wd.switch(tab)
        wd.close_tab()


if __name__ == "__main__":
    main()
