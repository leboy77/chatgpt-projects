"""读取当前图片更新任务页的扩展 tabId。"""
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    for h in wd.handles():
        try:
            wd.switch(h)
            if "material/image-task" in (wd.url() or ""):
                break
        except Exception:
            continue
    else:
        raise SystemExit("没找到图片更新任务页")
    print(wd.url())
    print(wd.js_async("""
    const done = arguments[arguments.length - 1];
    const reqId = 'probe-' + Date.now();
    const handler = (event) => {
      const d = event.data;
      if (d && d.__temuImageBot && d.type === 'GET_TAB_INFO_RESULT' && d.reqId === reqId) {
        window.removeEventListener('message', handler);
        done(JSON.stringify(d));
      }
    };
    window.addEventListener('message', handler);
    window.postMessage({__temuImageBot:true, type:'GET_TAB_INFO', reqId}, '*');
    setTimeout(() => { window.removeEventListener('message', handler); done('timeout'); }, 5000);
    """))


if __name__ == "__main__":
    main()
