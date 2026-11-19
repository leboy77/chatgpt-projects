"""用真实鼠标点击「发起图片/视频更新」，再探测弹出的表单。"""
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
            if "material/image-task" in (wd.url() or ""):
                break
        except Exception:
            continue
    else:
        raise SystemExit("没找到 material/image-task 标签页")

    info = wd.js("""
    const buttons = [...document.querySelectorAll('button')]
      .filter(el => (el.innerText || '').trim() === '发起图片/视频更新')
      .map(el => {
        const r = el.getBoundingClientRect();
        return {x: r.left + r.width/2, y: r.top + r.height/2,
                w: r.width, h: r.height, visible: el.offsetParent !== null};
      });
    return JSON.stringify(buttons);
    """)
    print("buttons:", info)
    import json
    buttons = json.loads(info)
    visible = [b for b in buttons if b["visible"] and b["w"] > 0]
    if not visible:
        raise SystemExit("没有可见按钮")
    target = visible[0]
    wd.mouse_click(target["x"], target["y"])
    time.sleep(3)

    snapshot = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const textEls = [...document.querySelectorAll('body *')]
      .filter(visible)
      .filter(el => {
        const t = (el.innerText || '').trim();
        return t && (t.includes('发起图片') || t.includes('商品ID') || t.includes('商品 ID')
          || t.includes('SKC') || t.includes('SPU') || t.includes('请输入'));
      })
      .sort((a,b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)
      .slice(0, 25)
      .map(el => ({tag: el.tagName, cls: String(el.className||'').slice(0,80),
                   text: (el.innerText||'').trim().slice(0,180)}));
    const inputs = [...document.querySelectorAll('input,textarea')].filter(visible)
      .map(i => { const r=i.getBoundingClientRect(); return {
        type:i.tagName.toLowerCase()==='textarea'?'textarea':i.type,
        placeholder:i.placeholder||'', value:i.value||'',
        x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height)};});
    const buttons = [...document.querySelectorAll('button')].filter(visible)
      .map(b => ({text:(b.innerText||'').trim(), cls:String(b.className||'').slice(0,70)}))
      .filter(b => b.text);
    return JSON.stringify({textEls, inputs, buttons: buttons.slice(-30), url: location.href});
    """)
    print(snapshot)


if __name__ == "__main__":
    main()
