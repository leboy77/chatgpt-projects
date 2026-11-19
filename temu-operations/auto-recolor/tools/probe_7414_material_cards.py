"""查看素材中心上传后的卡片名称与搜索状态。"""
import json
import os
import sys

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
    out = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
      .find(x => (x.innerText || '').includes('本地上传'));
    if (!d) return JSON.stringify({error:'no-dialog'});
    const inputs = [...d.querySelectorAll('input')].filter(visible)
      .map(i => ({placeholder:i.placeholder||'', value:i.value||'', type:i.type}));
    const cards = [...d.querySelectorAll('[class*=card],[class*=item],[class*=material]')].filter(visible)
      .map(el => ({cls:String(el.className||'').slice(0,100), text:(el.innerText||'').trim().slice(0,160),
        kids:el.querySelectorAll('*').length, rect:(()=>{const r=el.getBoundingClientRect();
          return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)};})()}))
      .filter(c => c.text && c.kids < 40);
    const icon = [...d.querySelectorAll('*')].filter(visible)
      .filter(el => /icon128|icon|128/i.test(el.innerText||''))
      .slice(0,20).map(el=>({tag:el.tagName,cls:String(el.className||'').slice(0,80),
        text:(el.innerText||'').trim().slice(0,120)}));
    return JSON.stringify({inputs, cards:cards.slice(0,40), icon, tail:(d.innerText||'').slice(-1200)});
    """)
    print(out)


if __name__ == "__main__":
    main()
