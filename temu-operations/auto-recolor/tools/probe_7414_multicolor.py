"""只读检查 9542570366 的多色轮播图组结构。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

URL = "https://agentseller.temu.com/goods/images-edit?productId=9542570366&from=selfTask"


def main():
    wd = bb.connect()
    tab = wd.new_tab(URL)
    time.sleep(8)
    wd.switch(tab)
    print("url:", wd.url())
    print(wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const wraps = [...document.querySelectorAll('[class*="preview-image_wrap"]')].filter(visible);
    return JSON.stringify(wraps.map((w, i) => {
      const items = [...w.querySelectorAll('[class*="preview-image_productItem"]')];
      let p = w;
      let label = '';
      for (let n = 0; n < 8 && p; n += 1) {
        const lines = (p.innerText || '').split('\\n').map(x => x.trim()).filter(Boolean);
        const color = lines.find(x => x.length < 30 && !/轮播图|预览|素材中心|AI 制图|色值|色块图/.test(x));
        if (color) { label = color; break; }
        p = p.parentElement;
      }
      return {i, items: items.length, label};
    }), null, 2);
    """))
    # 只保留这个标签页，方便后续测试；不关闭用户已有标签页
    print("opened tab:", tab)


if __name__ == "__main__":
    main()
