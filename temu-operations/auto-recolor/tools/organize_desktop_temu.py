"""将桌面 TEMU 图片助手文件统一移入一个目录，并保持开发版扩展路径可用。"""
import ctypes
import json
import os
import shutil
import subprocess

DESKTOP = r"C:\Users\QZJLKJ\Desktop"
DEST = os.path.join(DESKTOP, "TEMU图片助手整理")
LIVE_OUTER = os.path.join(DESKTOP, "TEMU图片助手v0.5.0")
LIVE_INNER = os.path.join(LIVE_OUTER, "TEMU图片助手v0.5.0")
LIVE_TARGET = os.path.join(DEST, "TEMU图片助手v0.5.0")
CORRUPTED_EMPTY = os.path.join(DESKTOP, "TEMU鍥剧墖鍔╂墜鏁寸悊")
MANIFEST = os.path.join(LIVE_INNER, "manifest.json")


def ensure_under_desktop(path):
    path = os.path.abspath(path)
    if os.path.commonpath([os.path.abspath(DESKTOP), path]) != os.path.abspath(DESKTOP):
        raise RuntimeError(f"路径不在桌面范围: {path}")
    return path


def remove_empty_corrupted_dir():
    if not os.path.isdir(CORRUPTED_EMPTY):
        return False
    ensure_under_desktop(CORRUPTED_EMPTY)
    if list(os.scandir(CORRUPTED_EMPTY)):
        raise RuntimeError("乱码目标目录不是空目录，拒绝删除")
    os.rmdir(CORRUPTED_EMPTY)
    return True


def create_hidden_junction(link_path, target_path):
    result = subprocess.run(
        ["cmd.exe", "/d", "/c", "mklink", "/J", link_path, target_path],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        raise RuntimeError(f"创建目录联接失败: {result.stdout} {result.stderr}")
    hidden = 0x2
    if not ctypes.windll.kernel32.SetFileAttributesW(link_path, hidden):
        raise RuntimeError("隐藏目录联接失败")


def main():
    remove_empty_corrupted_dir()
    os.makedirs(DEST, exist_ok=True)

    moved = []
    if os.path.isdir(LIVE_OUTER) and not os.path.islink(LIVE_OUTER):
        if os.path.exists(LIVE_TARGET):
            raise RuntimeError(f"目标运行目录已存在: {LIVE_TARGET}")
        shutil.move(LIVE_OUTER, LIVE_TARGET)
        moved.append((LIVE_OUTER, LIVE_TARGET))
        try:
            create_hidden_junction(LIVE_OUTER, LIVE_TARGET)
        except Exception:
            shutil.move(LIVE_TARGET, LIVE_OUTER)
            raise
    if not os.path.exists(MANIFEST):
        raise RuntimeError(f"扩展兼容路径失效: {MANIFEST}")

    for entry in sorted(os.scandir(DESKTOP), key=lambda item: item.name):
        if entry.name == os.path.basename(DEST) or entry.name == os.path.basename(LIVE_OUTER):
            continue
        if not entry.name.startswith("TEMU图片助手"):
            continue
        target = os.path.join(DEST, entry.name)
        if os.path.exists(target):
            raise RuntimeError(f"整理目标已存在，停止避免覆盖: {target}")
        shutil.move(entry.path, target)
        moved.append((entry.path, target))

    with open(MANIFEST, encoding="utf-8") as fh:
        version = json.load(fh)["version"]
    lines = [
        "TEMU图片助手桌面整理",
        "整理目录: " + DEST,
        "当前运行扩展: " + LIVE_OUTER + "（隐藏目录联接）",
        "扩展版本: " + version,
        "",
        "移动项目:",
    ]
    lines.extend(f"{source} -> {target}" for source, target in moved)
    with open(os.path.join(DEST, "整理清单.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

    print(json.dumps({
        "destination": DEST,
        "moved_count": len(moved),
        "live_manifest": MANIFEST,
        "live_manifest_exists": os.path.exists(MANIFEST),
        "version": version,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
