"""在 7414 的图片更新任务页走一遍：打开表单、输入测试 ID、确认跳转（不提交）。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

TEST_ID = "45687392555"


def visible_button_rect(wd, text):
    raw = wd.js("""
    const text = arguments[0];
    const el = [...document.querySelectorAll('button')]
      .filter(b => (b.innerText || '').trim() === text && b.offsetParent !== null)
      .pop();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height});
    """, [text])
    return json.loads(raw) if raw else None


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

    if not wd.js("""
    return [...document.querySelectorAll('input')]
      .some(i => i.placeholder === '可输入SPU、SKC或SKC货号' && i.offsetParent !== null);
    """):
        rect = visible_button_rect(wd, "发起图片/视频更新")
        if not rect:
            raise SystemExit("找不到发起按钮")
        wd.mouse_click(rect["x"], rect["y"])
        time.sleep(2)

    eid = wd.find("css selector", 'input[placeholder="可输入SPU、SKC或SKC货号"]')
    wd.el_clear(eid)
    wd.el_send_keys(eid, TEST_ID)
    time.sleep(1)
    print("输入:", wd.js("""
    const i = [...document.querySelectorAll('input')]
      .find(x => x.placeholder === '可输入SPU、SKC或SKC货号' && x.offsetParent !== null);
    return i ? i.value : 'not-found';
    """))

    rect = visible_button_rect(wd, "确认")
    if not rect:
        raise SystemExit("找不到确认按钮")
    wd.mouse_click(rect["x"], rect["y"])
    print("已点击确认，等待跳转…")
    time.sleep(6)

    print("current:", wd.url())
    print("title:", wd.title())
    for handle in wd.handles():
        try:
            wd.switch(handle)
            print("-", wd.url() or "", "|", wd.title() or "")
        except Exception:
            pass

    wd.switch(wd.find_tab("图片", url_keyword="material/image-task"))
    print("active-after:", wd.url())


if __name__ == "__main__":
    main()
