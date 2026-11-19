"""测试 element.click() 是否能打开素材中心。"""
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
    const w = [...document.querySelectorAll('[class*="preview-image_wrap"]')]
      .find(el => el.offsetParent !== null);
    if (!w) return 'no-wrap';
    const t = w.querySelector('[class*="upload-trigger_wrap"]');
    if (!t) return 'no-trigger';
    t.click();
    return 'clicked';
    """))
    time.sleep(3)
    print(wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    return [...document.querySelectorAll('[class*="MDL_innerWrapper"]')].filter(visible)
      .some(d => (d.innerText || '').includes('本地上传'));
    """))


if __name__ == "__main__":
    main()
