"""验证面板右下角拉伸后尺寸保存和刷新恢复。"""
import json
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def find_tab(wd):
    for handle in wd.handles():
        try:
            wd.switch(handle)
            parsed = urllib.parse.urlparse(wd.url() or "")
            if parsed.hostname == "agentseller.temu.com" and wd.js("return !!document.getElementById('temu-image-bot-host');"):
                return handle
        except Exception:
            continue
    raise RuntimeError("未找到面板")


def box_size(wd):
    return json.loads(wd.js("""
    const box=document.getElementById('temu-image-bot-host').shadowRoot.querySelector('.box');
    const r=box.getBoundingClientRect();
    return JSON.stringify({width:Math.round(r.width),height:Math.round(r.height),
      cssWidth:box.style.width,cssHeight:box.style.height,resize:getComputedStyle(box).resize});
    """))


def saved_size(wd):
    return json.loads(wd.js("""
    const open=()=>new Promise((res,rej)=>{const r=indexedDB.open('temu-image-bot',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
    const db=await open();
    const ui=await new Promise((res,rej)=>{const tx=db.transaction('kv','readonly');const q=tx.objectStore('kv').get('ui');q.onsuccess=()=>res(q.result||{});q.onerror=()=>rej(q.error)});
    return JSON.stringify(ui.panelSize || null);
    """))


def main():
    wd = bb.connect()
    tab = find_tab(wd)
    wd.switch(tab)
    original = box_size(wd)
    print("原尺寸:", original)
    assert original["resize"] == "both", original

    wd.js("""
    const box=document.getElementById('temu-image-bot-host').shadowRoot.querySelector('.box');
    box.style.width='560px';
    box.style.height='560px';
    """)
    time.sleep(1.2)
    resized = box_size(wd)
    saved = saved_size(wd)
    assert resized["width"] == 560 and resized["height"] == 560, (resized, saved)
    assert saved["width"] == 560 and saved["height"] == 560, saved
    print("拉伸并保存: OK", resized, saved)

    wd.js("location.reload(); return 'reloading';")
    for _ in range(25):
        time.sleep(1)
        try:
            after = box_size(wd)
            if after["width"] == 560 and after["height"] == 560:
                break
        except Exception:
            continue
    else:
        raise RuntimeError("刷新后尺寸未恢复")
    print("刷新后恢复: OK", after)

    wd.js("""
    const box=document.getElementById('temu-image-bot-host').shadowRoot.querySelector('.box');
    box.style.width=arguments[0] + 'px';
    box.style.height=arguments[1] + 'px';
    """, [original["width"], original["height"]])
    time.sleep(1.2)
    restored = box_size(wd)
    assert restored["width"] == original["width"] and restored["height"] == original["height"], restored
    print("恢复原尺寸: OK", restored)


if __name__ == "__main__":
    main()
