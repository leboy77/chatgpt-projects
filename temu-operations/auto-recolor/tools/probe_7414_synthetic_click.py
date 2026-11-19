"""验证图片更新任务页的按钮是否接受合成鼠标事件。"""
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
            if "material/image-task" in (wd.url() or ""):
                break
        except Exception:
            continue
    else:
        raise SystemExit("没找到图片更新任务页")
    wd.js("location.reload(); return 'reloading';")
    time.sleep(6)
    result = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const btn = [...document.querySelectorAll('button')].filter(visible)
      .find(b => (b.innerText || '').trim() === '发起图片/视频更新');
    if (!btn) return 'no-button';
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const opts = {bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,button:0};
    const target = document.elementFromPoint(x, y) || btn;
    target.dispatchEvent(new MouseEvent('mousedown', opts));
    target.dispatchEvent(new MouseEvent('mouseup', opts));
    target.dispatchEvent(new MouseEvent('click', opts));
    return 'clicked';
    """)
    print("click:", result)
    time.sleep(3)
    print(wd.js("""
    return [...document.querySelectorAll('input')]
      .some(i => i.placeholder === '可输入SPU、SKC或SKC货号' && i.offsetParent !== null);
    """))


if __name__ == "__main__":
    main()
