"""探测 7414 图片更新任务详情页（goods/images-edit）的轮播图结构。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

TARGET = "goods/images-edit"


def main():
    wd = bb.connect()
    handle = None
    for h in wd.handles():
        try:
            wd.switch(h)
            if TARGET in (wd.url() or ""):
                handle = h
                break
        except Exception:
            continue
    if not handle:
        raise SystemExit("没找到 goods/images-edit 标签页")
    wd.switch(handle)
    time.sleep(3)
    print("url:", wd.url())
    print("title:", wd.title())
    snapshot = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const text = (document.body.innerText || '').replace(/\\n{3,}/g, '\\n\\n');
    const buttons = [...document.querySelectorAll('button')].filter(visible)
      .map(b => ({text:(b.innerText||'').trim(), cls:String(b.className||'').slice(0,80)}))
      .filter(b => b.text);
    const imgs = [...document.querySelectorAll('img')].filter(visible)
      .map(i => {const r=i.getBoundingClientRect(); return {
        src:(i.src||'').slice(0,120), alt:i.alt||'',
        x:Math.round(r.left), y:Math.round(r.top),
        w:Math.round(r.width), h:Math.round(r.height)};})
      .filter(i => i.w > 30 && i.h > 30);
    const svgs = [...document.querySelectorAll('svg')].filter(visible).length;
    return JSON.stringify({text:text.slice(0, 4000), buttons:buttons.slice(0,80),
      imgs:imgs.slice(0,40), svgCount:svgs});
    """)
    print(snapshot)


if __name__ == "__main__":
    main()
