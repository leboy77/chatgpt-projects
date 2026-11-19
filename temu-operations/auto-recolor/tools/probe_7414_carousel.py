"""探测轮播图缩略图的 DOM 结构与删除控件。"""
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
        raise SystemExit("没找到 goods/images-edit 标签页")
    time.sleep(1)
    print(wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const thumbs = [...document.querySelectorAll('img')].filter(visible).map(img => {
      const r = img.getBoundingClientRect();
      return {img, r};
    }).filter(x => x.r.width >= 40 && x.r.width <= 90 && x.r.height >= 50 && x.r.height <= 110)
      .sort((a,b) => (a.r.top - b.r.top) || (a.r.left - b.r.left));

    function describe(el, depth) {
      if (!el || depth < 0) return null;
      return {
        tag: el.tagName,
        cls: String(el.className || '').slice(0, 100),
        text: (el.innerText || '').trim().slice(0, 80),
        title: el.title || '',
        role: el.getAttribute('role') || '',
        children: [...el.children].slice(0, 8).map(c => ({
          tag: c.tagName, cls: String(c.className || '').slice(0, 80),
          text: (c.innerText || '').trim().slice(0, 40),
          html: c.outerHTML.slice(0, 300)
        }))
      };
    }
    const out = thumbs.slice(0, 8).map((x, index) => {
      const chain = [];
      let el = x.img;
      for (let i = 0; i < 5 && el; i += 1) { chain.push(describe(el, i)); el = el.parentElement; }
      return {index, rect: {x: Math.round(x.r.left), y: Math.round(x.r.top),
        w: Math.round(x.r.width), h: Math.round(x.r.height)}, chain};
    });
    const deleteHints = [...document.querySelectorAll('[title],[aria-label],[class*=close],[class*=delete],[class*=remove]')]
      .filter(visible)
      .filter(el => /删除|close|delete|remove/i.test(
        [el.title, el.getAttribute('aria-label'), String(el.className || '')].join(' ')))
      .map(el => ({tag: el.tagName, cls: String(el.className||'').slice(0,100),
        title: el.title||'', aria: el.getAttribute('aria-label')||'',
        html: el.outerHTML.slice(0, 300)}));
    return JSON.stringify({thumbs: out, deleteHints: deleteHints.slice(0, 20)},
      null, 2);
    """))


if __name__ == "__main__":
    main()
