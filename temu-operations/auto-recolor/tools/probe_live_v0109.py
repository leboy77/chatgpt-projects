"""只读检查运行中的面板是否为 v0.10.9 且带三个伸缩区。"""
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
            const host = document.getElementById('temu-image-bot-host');
            if (!host || !host.shadowRoot) return JSON.stringify({ok:false});
            const sr = host.shadowRoot;
            const ver = sr.getElementById('verLine');
            const rs = sr.querySelectorAll('.resizer');
            return JSON.stringify({
              ok: true,
              ver: ver ? ver.innerText : '',
              resizers: rs.length,
              dirs: Array.from(rs).map(function(e){return e.dataset.resize;})
            });
            """)
            print(result)
            return
        except Exception:  # noqa: BLE001
            continue
    print("NO_TEMU_TAB")


if __name__ == "__main__":
    main()
