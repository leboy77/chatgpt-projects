"""只读输出当前面板 box 尺寸。"""
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
            print(wd.js("""
            const box=document.getElementById('temu-image-bot-host').shadowRoot.querySelector('.box');
            const r=box.getBoundingClientRect();
            return JSON.stringify({width:Math.round(r.width),height:Math.round(r.height),cssWidth:box.style.width,cssHeight:box.style.height});
            """))
            return
        except Exception:
            continue


if __name__ == "__main__":
    main()
