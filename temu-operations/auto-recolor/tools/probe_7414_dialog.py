"""只读探测「发起图片/视频更新」弹窗结构（不提交）。"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if "material/image-task" in (wd.url() or ""):
                break
        except Exception:
            continue
    else:
        raise SystemExit("没找到 material/image-task 标签页")

    print("page:", wd.url())
    clicked = wd.js("""
    const btn = [...document.querySelectorAll('button')]
      .find(el => (el.innerText || '').trim() === '发起图片/视频更新');
    if (!btn) return 'not-found';
    btn.click();
    return 'clicked';
    """)
    print("click:", clicked)
    time.sleep(3)
    snapshot = wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const dialogs = [...document.querySelectorAll('[role=dialog],[class*=MDL_innerWrapper],[class*=modal],[class*=Modal]')]
      .filter(visible);
    return JSON.stringify({
      dialogCount: dialogs.length,
      dialogs: dialogs.slice(0, 4).map(d => ({
        cls: String(d.className || '').slice(0, 120),
        text: (d.innerText || '').slice(0, 900),
        inputs: [...d.querySelectorAll('input')].filter(visible).map(i => ({
          type: i.type, placeholder: i.placeholder || '', value: i.value || '',
          cls: String(i.className || '').slice(0, 80)
        })),
        buttons: [...d.querySelectorAll('button')].filter(visible)
          .map(b => ({text: (b.innerText || '').trim(), cls: String(b.className || '').slice(0, 80)}))
      })),
      bodyDialogs: [...document.body.children].filter(visible)
        .filter(el => /modal|dialog|MDL/i.test(String(el.className || '')))
        .map(el => ({cls: String(el.className || '').slice(0, 120), text: (el.innerText || '').slice(0, 500)}))
    });
    """)
    print(snapshot)


if __name__ == "__main__":
    main()
