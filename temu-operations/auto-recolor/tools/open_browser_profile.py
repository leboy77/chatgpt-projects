"""打开/复用比特浏览器配置并建立调试会话。"""
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

PROFILE_ID = "9e6f73cc742b4abc9015f31f8e75fbd7"

info = bb.bb_open(PROFILE_ID)
port = str(info["http"]).split(":")[-1]
try:
    wd = bb.run_session(port)
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
    time.sleep(2)
    wd = bb.run_session(port)
print(info)
