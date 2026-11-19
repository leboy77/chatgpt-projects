"""打印商品 ID 输入框的祖先结构，定位确认按钮作用域。"""
import os
import sys

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
    print(wd.js("""
    const input = [...document.querySelectorAll('input')]
      .find(i => i.placeholder === '可输入SPU、SKC或SKC货号' && i.offsetParent !== null);
    if (!input) return 'no-input';
    const out = [];
    let el = input;
    for (let i = 0; i < 16 && el; i += 1) {
      const bs = [...el.querySelectorAll('button')].map(b => (b.innerText||'').trim()).filter(Boolean);
      out.push({i, tag:el.tagName, cls:String(el.className||'').slice(0,100),
        text:(el.innerText||'').trim().slice(0,120), buttons:[...new Set(bs)].slice(0,10)});
      el = el.parentElement;
    }
    return JSON.stringify(out, null, 2);
    """))


if __name__ == "__main__":
    main()
