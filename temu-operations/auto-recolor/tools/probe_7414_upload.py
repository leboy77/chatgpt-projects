"""在素材中心本地上传测试图，观察裁剪/入库状态（不提交最终表单）。"""
import base64
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

IMAGE = os.path.join(os.getcwd(), "extension", "icons", "icon128.png")


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

    # 确保素材中心已打开
    opened = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const has = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
      .some(d => (d.innerText || '').includes('本地上传'));
    return has;
    """)
    if not opened:
        raise SystemExit("素材中心未打开，请先运行 probe_7414_material.py")
    with open(IMAGE, "rb") as fh:
        b64 = base64.b64encode(fh.read()).decode("ascii")
    uploaded = wd.js("""
    const b64 = arguments[0];
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const file = new File([bytes], 'icon128.png', {type:'image/png'});
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const dialogs = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
      .filter(d => (d.innerText || '').includes('本地上传'));
    const dlg = dialogs[dialogs.length - 1];
    const input = dlg && [...dlg.querySelectorAll('input[type=file]')].find(i => i.multiple);
    if (!input) return 'no-input';
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
    return 'ok';
    """, [b64])
    print("upload:", uploaded)
    time.sleep(4)
    out = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const dialogs = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
      .map(d => ({text:(d.innerText||'').slice(0,500),
        buttons:[...d.querySelectorAll('button')].filter(visible).map(b=>(b.innerText||'').trim()).filter(Boolean)}));
    return JSON.stringify({dialogs, bodyText:(document.body.innerText||'').slice(0,300)});
    """)
    print(out)


if __name__ == "__main__":
    main()
