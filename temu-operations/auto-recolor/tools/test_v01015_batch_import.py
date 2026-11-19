"""验证批量 ID 文件导入（CSV）和去重。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if "agentseller.temu.com" not in (wd.url() or ""):
                continue
            status = wd.js("""
            const host = document.getElementById('temu-image-bot-host');
            if (!host || !host.shadowRoot) return null;
            const ver = host.shadowRoot.getElementById('verLine');
            const api = window.__TEMU_IMG_BOT_API__;
            return JSON.stringify({
              version: ver ? ver.innerText : '',
              apiOk: !!(api && typeof api.importCarouselIdFile === 'function')
            });
            """)
            if not status:
                continue
            info = json.loads(status)
            if "0.10.15" not in info["version"] or not info["apiOk"]:
                continue
            raw = wd.js_async("""
            const done = arguments[arguments.length - 1];
            (async () => {
              try {
                const api = window.__TEMU_IMG_BOT_API__;
                const sr = document.getElementById('temu-image-bot-host').shadowRoot;
                const text = ['ID', '9542570366', '45687392555', '9542570366'].join('\\n');
                const file = new File([text], 'ids.csv', {type:'text/csv'});
                await api.importCarouselIdFile(file);
                done(JSON.stringify({
                  value: sr.getElementById('carouselProductIds').value,
                  info: sr.getElementById('carouselIdInfo').innerText
                }));
              } catch (err) {
                done('ERR:' + (err && err.message || err));
              }
            })();
            """)
            print(raw)
            assert raw.startswith("{"), raw
            data = json.loads(raw)
            assert data["value"] == "9542570366\n45687392555", data
            assert "2 个 ID" in data["info"], data
            wd.js("""
            const sr = document.getElementById('temu-image-bot-host').shadowRoot;
            sr.getElementById('carouselProductIds').value = '';
            return 'cleared';
            """)
            print("批量 ID 文件导入: OK")
            return
        except Exception:
            continue
    raise SystemExit("没找到 v0.10.15 面板")


if __name__ == "__main__":
    main()
