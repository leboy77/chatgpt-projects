"""在测试商品页尝试删除第 2 张轮播图，观察确认弹窗（不提交最终表单）。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def mouse_move(wd, x, y):
    payload = {"actions": [{
        "type": "pointer", "id": "mouse", "parameters": {"pointerType": "mouse"},
        "actions": [{"type": "pointerMove", "duration": 120, "x": int(x), "y": int(y), "origin": "viewport"}],
    }]}
    return wd._call("POST", "/actions", payload)


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

    state = wd.js("""
    const wrap = document.querySelector('.preview-image_wrap__38McN');
    if (!wrap) return JSON.stringify({error:'no-wrap'});
    const items = [...wrap.querySelectorAll('.preview-image_productItem__GDGY2')];
    return JSON.stringify({count: items.length, items: items.map((it, i) => {
      const r = it.getBoundingClientRect();
      const del = it.querySelector('.preview-image_deleteIcon__81nJ2');
      const dr = del ? del.getBoundingClientRect() : null;
      const cs = del ? getComputedStyle(del) : null;
      return {i, x:r.left, y:r.top, w:r.width, h:r.height,
        del: dr ? {x:dr.left+dr.width/2, y:dr.top+dr.height/2, w:dr.width, h:dr.height} : null,
        style: cs ? {opacity:cs.opacity, display:cs.display, visibility:cs.visibility, zIndex:cs.zIndex} : null};
    })});
    """)
    print("before:", state)
    data = json.loads(state)
    if data.get("error"):
        raise SystemExit(data["error"])
    items = data["items"]
    target = items[1] if len(items) > 1 else items[0]
    mouse_move(wd, target["x"] + target["w"] / 2, target["y"] + target["h"] / 2)
    time.sleep(1)
    state2 = wd.js("""
    const wrap = document.querySelector('.preview-image_wrap__38McN');
    const items = [...wrap.querySelectorAll('.preview-image_productItem__GDGY2')];
    return JSON.stringify(items.map((it, i) => {
      const del = it.querySelector('.preview-image_deleteIcon__81nJ2');
      const dr = del ? del.getBoundingClientRect() : null;
      const cs = del ? getComputedStyle(del) : null;
      return {i, del: dr ? {x:dr.left+dr.width/2, y:dr.top+dr.height/2, w:dr.width, h:dr.height} : null,
        style: cs ? {opacity:cs.opacity, display:cs.display, visibility:cs.visibility} : null};
    }));
    """)
    print("hover:", state2)
    hovered = json.loads(state2)
    delRect = hovered[1]["del"] if len(hovered) > 1 else hovered[0]["del"]
    if not delRect or delRect["w"] <= 0:
        raise SystemExit("删除图标无尺寸")
    wd.mouse_click(delRect["x"], delRect["y"])
    time.sleep(2)
    after = wd.js("""
    const wrap = document.querySelector('.preview-image_wrap__38McN');
    const items = wrap ? [...wrap.querySelectorAll('.preview-image_productItem__GDGY2')] : [];
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const dialogs = [...document.querySelectorAll('[class*=MDL_innerWrapper],[role=dialog]')].filter(visible)
      .map(d => ({cls:String(d.className||'').slice(0,80), text:(d.innerText||'').slice(0,400),
        buttons:[...d.querySelectorAll('button')].filter(visible).map(b=>(b.innerText||'').trim()).filter(Boolean)}))
      .filter(d => d.text);
    return JSON.stringify({count: items.length, dialogs});
    """)
    print("after:", after)


if __name__ == "__main__":
    main()
