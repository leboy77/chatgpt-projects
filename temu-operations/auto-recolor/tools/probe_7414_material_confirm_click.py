"""测试 element.click() 是否能关闭素材中心确认。"""
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
        raise SystemExit("没找到图片更新详情页")
    print(wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const d = [...document.querySelectorAll('[class*="MDL_innerWrapper"]')].filter(visible)
      .find(x => (x.innerText || '').includes('本地上传'));
    if (!d) return 'no-dialog';
    const b = [...d.querySelectorAll('button')].filter(visible)
      .find(x => (x.innerText || '').trim() === '确认');
    if (!b) return 'no-confirm';
    b.click();
    return 'clicked';
    """))
    time.sleep(2)
    print(wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    return [...document.querySelectorAll('[class*="MDL_innerWrapper"]')].filter(visible)
      .some(d => (d.innerText || '').includes('本地上传'));
    """))


if __name__ == "__main__":
    main()
