"""读取 7414 中图片助手扩展的加载路径与版本。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

EXT_ID = "koiobokagpbhihnhmhegokjmpbhgghon"


def main():
    wd = bb.connect()
    handle = None
    for h in wd.handles():
        try:
            wd.switch(h)
            if (wd.url() or "").startswith("chrome://extensions"):
                handle = h
                break
        except Exception:
            continue
    if not handle:
        raise SystemExit("没有 chrome://extensions 标签页")
    wd.switch(handle)
    result = wd.js("""
    const id = arguments[0];
    window.__extInfo = null;
    chrome.developerPrivate.getExtensionInfo(id, (info) => {
      window.__extInfo = info || {error: chrome.runtime.lastError && chrome.runtime.lastError.message};
    });
    return 'started';
    """, [EXT_ID])
    for _ in range(10):
        time.sleep(1)
        raw = wd.js("return JSON.stringify(window.__extInfo);")
        if raw and raw != "null":
            print(raw)
            return
    print("timeout")


if __name__ == "__main__":
    main()
