"""检查批量 ID 输入区已出现在 7414 面板。"""
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
            result = wd.js("""
            const sr = document.getElementById('temu-image-bot-host').shadowRoot;
            const textarea = sr.getElementById('carouselProductIds');
            return JSON.stringify({
              textarea: !!textarea,
              tag: textarea ? textarea.tagName : '',
              importer: !!sr.getElementById('carouselImportIds'),
              fileInput: !!sr.getElementById('carouselIdFile')
            });
            """)
            print(result)
            data = json.loads(result)
            assert data["textarea"] and data["tag"] == "TEXTAREA", data
            assert data["importer"] and data["fileInput"], data
            print("批量 ID UI: OK")
            return
        except Exception:
            continue
    raise SystemExit("没找到图片更新任务页")


if __name__ == "__main__":
    main()
