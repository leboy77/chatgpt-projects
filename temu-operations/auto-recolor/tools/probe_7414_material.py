"""探测图片更新任务页的素材中心弹窗结构。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    for h in wd.handles():
        try:
            wd.switch(h)
            if "goods/images-edit" in (wd.url() or ""):
                break
        except Exception:
            continue
    else:
        raise SystemExit("没找到 goods/images-edit 标签页")

    rect = wd.js("""
    const wrap = document.querySelector('.preview-image_wrap__38McN');
    if (!wrap) return null;
    const trigger = wrap.querySelector('.upload-trigger_wrap__kMsdx');
    if (!trigger) return null;
    const r = trigger.getBoundingClientRect();
    return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,
      text:(trigger.innerText||'').trim()});
    """)
    print("trigger:", rect)
    if not rect:
        raise SystemExit("找不到素材中心入口")
    data = json.loads(rect)
    wd.mouse_click(data["x"], data["y"])
    time.sleep(4)
    out = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const dialogs = [...document.querySelectorAll('.MDL_innerWrapper_5-125-0,[class*=MDL_innerWrapper]')].filter(visible);
    return JSON.stringify(dialogs.map(d => ({
      cls:String(d.className||'').slice(0,100),
      text:(d.innerText||'').slice(0,700),
      inputs:[...d.querySelectorAll('input')].map(i=>({
        type:i.type, placeholder:i.placeholder||'', value:i.value||'', visible:visible(i), multiple:i.multiple
      })),
      buttons:[...d.querySelectorAll('button')].filter(visible).map(b=>(b.innerText||'').trim()).filter(Boolean)
    })));
    """)
    print(out)


if __name__ == "__main__":
    main()
