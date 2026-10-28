"""验证右边缘、下边缘和右下角三个缩放控制区。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if "agentseller.temu.com" not in (wd.url() or ""):
                continue
            if wd.js("return !!document.getElementById('temu-image-bot-host');"):
                break
        except Exception:
            continue
    else:
        raise SystemExit("未找到面板")

    result = json.loads(wd.js("""
    const host=document.getElementById('temu-image-bot-host');
    const sr=host.shadowRoot;
    const box=sr.querySelector('.box');
    const rect=()=>{const r=box.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
    const original=rect();
    const fire=(target,type,x,y)=>target.dispatchEvent(new PointerEvent(type,{
      bubbles:true,composed:true,cancelable:true,button:0,buttons:type==='pointerup'?0:1,
      pointerId:91,pointerType:'mouse',clientX:x,clientY:y
    }));
    const corner=sr.querySelector('.resizer.nwse');
    const cr=corner.getBoundingClientRect();
    fire(corner,'pointerdown',cr.right-2,cr.bottom-2);
    fire(window,'pointermove',cr.right+60,cr.bottom+70);
    fire(window,'pointerup',cr.right+60,cr.bottom+70);
    const cornerResized=rect();

    const bottom=sr.querySelector('.resizer.ns');
    const br=bottom.getBoundingClientRect();
    fire(bottom,'pointerdown',br.left+50,br.top+2);
    fire(window,'pointermove',br.left+50,br.top-40);
    fire(window,'pointerup',br.left+50,br.top-40);
    const bottomResized=rect();

    box.style.width=original.w+'px';
    box.style.height=original.h+'px';
    return JSON.stringify({original,cornerResized,bottomResized,resizers:[
      {name:'ew',cursor:getComputedStyle(sr.querySelector('.resizer.ew')).cursor},
      {name:'ns',cursor:getComputedStyle(sr.querySelector('.resizer.ns')).cursor},
      {name:'nwse',cursor:getComputedStyle(sr.querySelector('.resizer.nwse')).cursor}
    ]});
    """))
    assert result["cornerResized"]["w"] > result["original"]["w"], result
    assert result["cornerResized"]["h"] > result["original"]["h"], result
    assert result["bottomResized"]["h"] < result["cornerResized"]["h"], result
    assert all(item["cursor"] != "" for item in result["resizers"]), result
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("三个缩放控制区: OK")
    time.sleep(1)


if __name__ == "__main__":
    main()
