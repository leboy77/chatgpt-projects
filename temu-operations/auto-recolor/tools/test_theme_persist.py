"""验证皮肤跨页面刷新保持，并恢复测试前主题。"""
import json
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SHOT = os.path.join(os.getcwd(), "probes", "shots", "v099_theme_persisted.png")


def temu_tab(wd):
    for handle in wd.handles():
        try:
            wd.switch(handle)
            parsed = urllib.parse.urlparse(wd.url() or "")
            if parsed.hostname == "agentseller.temu.com":
                return handle
        except Exception:
            continue
    raise RuntimeError("没有 TEMU 标签页")


def wait_panel(wd, expected_name=None):
    for _ in range(25):
        time.sleep(1)
        try:
            raw = wd.js("""
            const host = document.getElementById('temu-image-bot-host');
            if (!host || !host.shadowRoot) return null;
            const sr = host.shadowRoot;
            const buttons = [...sr.getElementById('themeBtns').children];
            const selected = buttons.find(button => button.style.outline && button.style.outline !== 'none');
            return JSON.stringify({
              version: sr.getElementById('verLine').innerText,
              name: sr.getElementById('themeName').innerText,
              preset: selected ? selected.dataset.preset : '',
              count: buttons.length,
              header: getComputedStyle(sr.querySelector('.hd')).backgroundImage,
              body: getComputedStyle(sr.querySelector('.box')).backgroundImage
            });
            """)
            if not raw:
                continue
            data = json.loads(raw)
            if expected_name is None or data["name"] == expected_name:
                return data
        except Exception:
            continue
    raise RuntimeError(f"等待面板超时，期望主题：{expected_name}")


def read_saved_theme(wd):
    return json.loads(wd.js("""
    const open = () => new Promise((res, rej) => {
      const r = indexedDB.open('temu-image-bot', 1);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const db = await open();
    const ui = await new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readonly');
      const rq = tx.objectStore('kv').get('ui');
      rq.onsuccess = () => res(rq.result || {}); rq.onerror = () => rej(rq.error);
    });
    return JSON.stringify(ui.theme || {});
    """))


def reload_page(wd):
    wd.js("location.reload(); return 'reloading';")


def main():
    wd = bb.connect()
    tab = temu_tab(wd)
    wd.switch(tab)
    before = wait_panel(wd)
    print("测试前主题:", before)
    original_key = before["preset"]
    original_name = before["name"]

    wd.js("""
    const sr = document.getElementById('temu-image-bot-host').shadowRoot;
    const button = [...sr.getElementById('themeBtns').children]
      .find(item => item.dataset.preset === 'aurora');
    button.click();
    return 'clicked aurora';
    """)
    time.sleep(1.5)
    saved = read_saved_theme(wd)
    assert saved.get("preset") == "aurora", saved
    print("已保存主题:", saved)

    reload_page(wd)
    after = wait_panel(wd, "极光流彩")
    assert after["preset"] == "aurora", after
    assert "v0.9.9" in after["version"], after
    assert after["header"] != "none", after
    assert after["body"] != "none", after
    print("刷新后主题:", after)
    print("截图:", wd.screenshot(SHOT))

    wd.js("""
    const sr = document.getElementById('temu-image-bot-host').shadowRoot;
    const button = [...sr.getElementById('themeBtns').children]
      .find(item => item.dataset.preset === arguments[0]);
    if (button) button.click();
    return button ? 'restored ' + arguments[0] : 'not-found';
    """, [original_key])
    time.sleep(1.5)
    restored = read_saved_theme(wd)
    assert restored.get("preset") == original_key, (original_key, restored)
    reload_page(wd)
    final = wait_panel(wd, original_name)
    assert final["preset"] == original_key, final
    print("恢复并再次刷新:", final)
    print("皮肤持久化测试: OK")


if __name__ == "__main__":
    main()
