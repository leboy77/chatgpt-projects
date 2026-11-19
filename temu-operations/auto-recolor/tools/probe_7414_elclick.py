"""测试 element.click() 是否能打开图片更新表单。"""
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
    print(wd.js("""
    const btn = [...document.querySelectorAll('button')]
      .find(b => (b.innerText || '').trim() === '发起图片/视频更新' && b.offsetParent !== null);
    if (!btn) return 'no-button';
    btn.click();
    return 'clicked';
    """))
    time.sleep(3)
    print(wd.js("""
    return [...document.querySelectorAll('input')]
      .some(i => i.placeholder === '可输入SPU、SKC或SKC货号' && i.offsetParent !== null);
    """))


if __name__ == "__main__":
    main()
