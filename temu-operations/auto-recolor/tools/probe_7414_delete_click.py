"""测试 element.click() 是否能删除轮播图。"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    handles = []
    for h in wd.handles():
        try:
            wd.switch(h)
            if "goods/images-edit" in (wd.url() or ""):
                handles.append(h)
        except Exception:
            continue
    if not handles:
        raise SystemExit("没找到图片更新详情页")
    wd.switch(handles[-1])
    print("page:", wd.url())
    print("before:", wd.js("""
    const w = [...document.querySelectorAll('[class*="preview-image_wrap"]')]
      .find(el => el.offsetParent !== null);
    return w ? w.querySelectorAll('[class*="preview-image_productItem"]').length : -1;
    """))
    print("click:", wd.js("""
    const w = [...document.querySelectorAll('[class*="preview-image_wrap"]')]
      .find(el => el.offsetParent !== null);
    if (!w) return 'no-wrap';
    const items = [...w.querySelectorAll('[class*="preview-image_productItem"]')];
    if (items.length < 5) return 'too-few';
    const icon = items[4].querySelector('[class*="preview-image_deleteIcon"]');
    if (!icon) return 'no-icon';
    icon.click();
    return 'clicked';
    """))
    time.sleep(2)
    print("after:", wd.js("""
    const w = [...document.querySelectorAll('[class*="preview-image_wrap"]')]
      .find(el => el.offsetParent !== null);
    return w ? w.querySelectorAll('[class*="preview-image_productItem"]').length : -1;
    """))


if __name__ == "__main__":
    main()
