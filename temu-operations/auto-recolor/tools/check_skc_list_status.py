"""只读查询指定 SKC 在商品列表中的真实审核/修改状态。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

SKC = sys.argv[1] if len(sys.argv) > 1 else "12889088637"
URL = "https://agentseller.temu.com/goods/list"


def main():
    wd = bb.connect()
    tab = wd.new_tab(URL)
    time.sleep(6)
    wd.switch(tab)
    for _ in range(25):
        if wd.js("return !!(window.__TEMU_IMG_BOT_API__ && document.getElementById('temu-image-bot-host'));"):
            break
        time.sleep(1)
    else:
        raise RuntimeError("插件页未就绪")
    wd.js("""
    const api = window.__TEMU_IMG_BOT_API__;
    api.state.status = 'running';
    api.state.skcTimedOut = false;
    window.__statusQuery = null;
    api.listSearchProduct(arguments[0], 'SKC')
      .then(result => {
        window.__statusQuery = {
          ok:true,
          rowText:(result.row.innerText || '').replace(/\\s+/g, ' ').trim()
        };
      })
      .catch(error => {
        window.__statusQuery = {ok:false, error:String(error && error.message || error)};
      });
    return 'started';
    """, [SKC])
    try:
        result = None
        for _ in range(35):
            time.sleep(1)
            raw = wd.js("return window.__statusQuery ? JSON.stringify(window.__statusQuery) : '';")
            if raw:
                result = json.loads(raw)
                break
        if not result:
            result = {"ok": False, "error": "查询超时", "url": wd.url()}
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        wd.switch(tab)
        wd.close_tab()


if __name__ == "__main__":
    main()
