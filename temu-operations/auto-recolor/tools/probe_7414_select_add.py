"""选中 icon128-33 并确认，验证轮播图新增。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def click_rect(wd, rect):
    wd.mouse_click(rect["x"], rect["y"])


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

    raw = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
      .find(x => (x.innerText || '').includes('本地上传'));
    if (!d) return JSON.stringify({error:'no-dialog'});
    const label = [...d.querySelectorAll('[class*=materialName]')].filter(visible)
      .find(el => /^icon128-\\d+$/.test((el.innerText||'').trim()));
    if (!label) return JSON.stringify({error:'no-label'});
    const card = label.closest('[class*=cardContainer]') || label.closest('[class*=itemContainer]');
    if (!card) return JSON.stringify({error:'no-card'});
    const r = card.getBoundingClientRect();
    const cb = card.querySelector('input[type=checkbox],[role=checkbox],[class*=checkbox]');
    const cr = cb ? cb.getBoundingClientRect() : null;
    return JSON.stringify({name:(label.innerText||'').trim(),
      card:{x:r.left+r.width/2,y:r.top+Math.min(60,r.height/3)},
      checkbox: cr ? {x:cr.left+cr.width/2,y:cr.top+cr.height/2} : null,
      text:(d.innerText||'').slice(-80)});
    """)
    print("target:", raw)
    data = json.loads(raw)
    if data.get("error"):
        raise SystemExit(data["error"])
    click_rect(wd, data["checkbox"] or data["card"])
    time.sleep(1.5)
    count = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
      .find(x => (x.innerText || '').includes('本地上传'));
    const text = d ? (d.innerText||'') : '';
    const m = text.match(/已选\\s*(\\d+)\\s*个/);
    return m ? m[1] : '?';
    """)
    print("selected:", count)

    confirm = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
      .find(x => (x.innerText || '').includes('本地上传'));
    if (!d) return null;
    const b = [...d.querySelectorAll('button')].filter(visible)
      .find(x => (x.innerText||'').trim() === '确认');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});
    """)
    print("confirm:", confirm)
    if confirm:
        click_rect(wd, json.loads(confirm))
    time.sleep(3)
    print("after:", wd.js("""
    const wrap = document.querySelector('.preview-image_wrap__38McN');
    return wrap ? wrap.querySelectorAll('.preview-image_productItem__GDGY2').length : -1;
    """))


if __name__ == "__main__":
    main()
