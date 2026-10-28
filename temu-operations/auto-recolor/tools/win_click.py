"""用 ctypes 做系统级鼠标点击（避开 PowerShell 引号与坐标换算问题）。

用法: python tools/win_click.py X Y
"""
import ctypes
import sys
import time

user32 = ctypes.windll.user32


def click(x: int, y: int):
    user32.SetCursorPos(int(x), int(y))
    time.sleep(0.25)
    user32.mouse_event(0x0002, 0, 0, 0, 0)  # LEFTDOWN
    time.sleep(0.09)
    user32.mouse_event(0x0004, 0, 0, 0, 0)  # LEFTUP


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    click(int(sys.argv[1]), int(sys.argv[2]))
    print("clicked", sys.argv[1], sys.argv[2])
