"""完成测试图裁剪并观察素材卡片名称。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def click_button(wd, dialog_text, label):
    rect = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const dlgs = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
      .filter(d => (d.innerText || '').includes(arguments[0]));
    const d = dlgs[dlgs.length - 1];
    if (!d) return null;
    const b = [...d.querySelectorAll('button')].filter(visible)
      .find(x => (x.innerText || '').trim() === arguments[1]);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});
    """, [dialog_text, label])
    if not rect:
        raise RuntimeError(f"找不到按钮 {label}")
    data = json.loads(rect)
    wd.mouse_click(data["x"], data["y"])


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

    # 等待裁剪尺寸加载
    for _ in range(30):
        vals = wd.js("""
        const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
        const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
          .find(x => (x.innerText || '').includes('待载剪'));
        if (!d) return null;
        const inputs = [...d.querySelectorAll('input')].filter(visible);
        return JSON.stringify(inputs.map(i => i.value));
        """)
        if vals and json.loads(vals) and all(json.loads(vals)):
            break
        time.sleep(1)
    print("crop inputs:", vals)
    set_result = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
      .find(x => (x.innerText || '').includes('待载剪'));
    if (!d) return 'no-dialog';
    const inputs = [...d.querySelectorAll('input')].filter(visible);
    if (inputs.length < 2) return 'too-few';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inputs[0], '1350');
    inputs[0].dispatchEvent(new Event('input', {bubbles:true}));
    inputs[0].dispatchEvent(new Event('change', {bubbles:true}));
    setter.call(inputs[1], '1800');
    inputs[1].dispatchEvent(new Event('input', {bubbles:true}));
    inputs[1].dispatchEvent(new Event('change', {bubbles:true}));
    return JSON.stringify(inputs.map(i => i.value));
    """)
    print("set:", set_result)
    time.sleep(1)
    click_button(wd, "待载剪", "确认裁剪")
    time.sleep(3)
    click_button(wd, "待保存", "保存")
    time.sleep(3)
    print("after crop:", wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    return JSON.stringify([...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
      .map(d => (d.innerText||'').slice(0,300)));
    """))

    # 搜索 icon128
    searched = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
      .find(x => (x.innerText || '').includes('本地上传'));
    if (!d) return 'no-material-dialog';
    const input = [...d.querySelectorAll('input')].find(i => i.placeholder === '请输入素材名称' && visible(i));
    if (!input) return 'no-search';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'icon128');
    input.dispatchEvent(new Event('input', {bubbles:true}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
    const scope = input.closest('[class*=reunitBlock]') || input.parentElement;
    const svg = [...scope.querySelectorAll('svg')].pop();
    if (svg && visible(svg)) svg.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
    return 'ok';
    """)
    print("search:", searched)
    time.sleep(3)
    print("cards:", wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const d = [...document.querySelectorAll('[class*=MDL_innerWrapper]')].filter(visible)
      .find(x => (x.innerText || '').includes('本地上传'));
    if (!d) return 'no-dialog';
    return JSON.stringify([...d.querySelectorAll('*')].filter(visible)
      .filter(el => /icon128/i.test(el.innerText || '') && el.querySelectorAll('*').length < 8)
      .slice(0, 20).map(el => ({tag:el.tagName, cls:String(el.className||'').slice(0,80),
        text:(el.innerText||'').trim().slice(0,120)})));
    """))


if __name__ == "__main__":
    main()
