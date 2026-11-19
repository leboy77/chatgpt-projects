"""只读探测 7414 窗口的标签页与 material/image-task 页面结构。"""
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

PROFILE_ID = "89055033d58245eb888f21ed12881776"  # seq 7414 / Y2-13
URL = "https://agentseller.temu.com/material/image-task"


def main():
    info = bb.bb_open(PROFILE_ID)
    debug_port = str(info["http"]).split(":")[-1]
    try:
        wd = bb.run_session(debug_port)
    except Exception:
        driver = info.get("driver")
        if not driver or not os.path.exists(driver):
            raise
        subprocess.Popen(
            [driver, f"--port={bb.WD_PORT}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        time.sleep(3)
        wd = bb.run_session(debug_port)
    print("profile:", PROFILE_ID, "debug:", info.get("http"))
    for handle in wd.handles():
        try:
            wd.switch(handle)
            print("-", wd.url() or "", "|", wd.title() or "")
        except Exception as exc:  # noqa: BLE001
            print("ERR", exc)

    handle = wd.find_tab("图片", url_keyword="material/image-task")
    if not handle:
        handle = wd.new_tab(URL)
        time.sleep(6)
    wd.switch(handle)
    print("current:", wd.url())
    print("title:", wd.title())

    snapshot = wd.js("""
    return JSON.stringify({
      url: location.href,
      buttons: [...document.querySelectorAll('button')]
        .filter(el => el.offsetParent !== null)
        .map(el => (el.innerText || '').trim())
        .filter(Boolean)
        .slice(0, 60),
      inputs: [...document.querySelectorAll('input')]
        .filter(el => el.offsetParent !== null)
        .map(el => ({placeholder: el.placeholder || '', type: el.type || '', value: el.value || ''}))
        .slice(0, 40),
      text: (document.body.innerText || '').slice(0, 1500)
    });
    """)
    print(snapshot)


if __name__ == "__main__":
    main()
