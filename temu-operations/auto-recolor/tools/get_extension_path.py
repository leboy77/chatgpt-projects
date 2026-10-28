"""读取当前扩展管理页记录的 unpacked 扩展路径。"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

EXT_ID = "koiobokagpbhihnhmhegokjmpbhgghon"


def main():
    wd = bb.connect()
    tab = None
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if "chrome://extensions" in (wd.url() or ""):
                tab = handle
                break
        except Exception:
            continue
    if not tab:
        raise SystemExit("找不到 chrome://extensions 页面")
    wd.switch(tab)
    wd.js("""
    window.__extPathResult = '';
    chrome.developerPrivate.getExtensionInfo(arguments[0], info => {
      window.__extPathResult = chrome.runtime.lastError
        ? 'ERROR: ' + chrome.runtime.lastError.message
        : JSON.stringify({path:info.path, version:info.version, state:info.state});
    });
    return 'started';
    """, [EXT_ID])
    for _ in range(20):
        time.sleep(0.5)
        result = wd.js("return window.__extPathResult || '';")
        if result:
            print(result)
            return
    raise SystemExit("读取扩展路径超时")


if __name__ == "__main__":
    main()
