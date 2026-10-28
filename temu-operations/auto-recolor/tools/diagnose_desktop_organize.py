"""检查桌面 TEMU 图片助手整理结果和当前开发版联接。"""
import json
import os

DESKTOP = r"C:\Users\QZJLKJ\Desktop"
LIVE = os.path.join(DESKTOP, "TEMU图片助手v0.5.0")


def main():
    rows = []
    for entry in os.scandir(DESKTOP):
        if "TEMU" not in entry.name:
            continue
        row = {
            "name": entry.name,
            "name_ascii": ascii(entry.name),
            "path": entry.path,
            "is_dir": entry.is_dir(follow_symlinks=False),
            "is_symlink": entry.is_symlink(),
            "is_reparse": bool(entry.stat(follow_symlinks=False).st_file_attributes & 0x400),
        }
        if entry.is_symlink():
            try:
                row["link_target"] = os.readlink(entry.path)
                row["link_target_ascii"] = ascii(os.readlink(entry.path))
            except OSError as exc:
                row["link_error"] = str(exc)
        if entry.is_dir(follow_symlinks=False):
            try:
                row["children"] = sorted(os.listdir(entry.path))[:30]
            except OSError as exc:
                row["children_error"] = str(exc)
        rows.append(row)
    manifest = os.path.join(LIVE, "TEMU图片助手v0.5.0", "manifest.json")
    print(json.dumps({
        "entries": rows,
        "live_manifest": manifest,
        "live_manifest_exists": os.path.exists(manifest),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
