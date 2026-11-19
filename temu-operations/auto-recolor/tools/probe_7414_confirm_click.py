"""测试 element.click() 是否能完成发起图片更新确认。"""
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
            if "material/image-task" in (wd.url() or ""):
                break
        except Exception:
            continue
    else:
        raise SystemExit("没找到图片更新任务页")
    print("dialog:", wd.js("""
    const input = [...document.querySelectorAll('input')]
      .find(i => i.placeholder === '可输入SPU、SKC或SKC货号' && i.offsetParent !== null);
    if (!input) return 'no-input';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '45687392555');
    input.dispatchEvent(new InputEvent('input', {bubbles:true, data:'45687392555', inputType:'insertText'}));
    input.dispatchEvent(new Event('change', {bubbles:true}));
    const scope = input.closest('[class*="MDL_innerWrapper"]')
      || input.closest('[class*="MDL_inner"]')
      || input.parentElement;
    const btn = [...scope.querySelectorAll('button')]
      .find(b => (b.innerText||'').trim() === '确认' && b.offsetParent !== null);
    if (!btn) return 'no-confirm';
    btn.click();
    return 'clicked';
    """))
    time.sleep(5)
    for h in wd.handles():
        try:
            wd.switch(h)
            u = wd.url() or ""
            if "images-edit" in u:
                print("edit:", u)
        except Exception:
            pass


if __name__ == "__main__":
    main()
