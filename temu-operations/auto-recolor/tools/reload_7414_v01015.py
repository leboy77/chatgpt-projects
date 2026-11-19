"""重载 7414 的图片助手扩展，并验证 v0.10.15 的轮播图维护 UI。"""
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
        raise SystemExit("没有 chrome://extensions 标签页")
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
    print("reload:", result)
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
    print("extension version:", version)

    task_tab = find_tab(wd, "material/image-task")
    if not task_tab:
        task_tab = wd.new_tab("https://agentseller.temu.com/material/image-task")
        time.sleep(6)
    wd.switch(task_tab)
    wd.js("location.reload(); return 'reloading';")
    panel = None
    for _ in range(30):
        time.sleep(1)
        panel = wd.js("""
        const host = document.getElementById('temu-image-bot-host');
        if (!host || !host.shadowRoot) return null;
        const sr = host.shadowRoot;
        const ver = sr.getElementById('verLine');
        return JSON.stringify({
          version: ver ? ver.innerText : '',
          hasTool: !!sr.getElementById('carouselTool'),
          hasStart: !!sr.getElementById('carouselStart'),
          hasId: !!sr.getElementById('carouselProductIds')
        });
        """)
        if panel and "0.10.15" in panel:
            break
    print("panel:", panel)
    data = json.loads(panel)
    assert "0.10.15" in data["version"], data
    assert data["hasTool"] and data["hasStart"] and data["hasId"], data
    print("v0.10.15 UI: OK")


if __name__ == "__main__":
    main()
