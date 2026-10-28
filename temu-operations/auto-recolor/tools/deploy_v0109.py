"""部署 v0.10.9：备份旧安装、复制到整理目录、生成安装包。"""
import hashlib
import os
import shutil
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(HERE, "extension")
DOCS = os.path.join(HERE, "docs")
DESKTOP = r"C:\Users\QZJLKJ\Desktop"
ORGANIZED = os.path.join(DESKTOP, "TEMU图片助手整理")
LOADED = os.path.join(DESKTOP, "TEMU图片助手v0.5.0", "TEMU图片助手v0.5.0")
LOCAL_INSTALL = os.path.join(os.environ["LOCALAPPDATA"], "TemuImageBot", "extension")
PACKAGE_DIR = os.path.join(ORGANIZED, "TEMU图片助手v0.10.9")
PACKAGE_ZIP = os.path.join(ORGANIZED, "TEMU图片助手v0.10.9.zip")


def digest_tree(root):
    result = {}
    for base, _, names in os.walk(root):
        for name in names:
            path = os.path.join(base, name)
            rel = os.path.relpath(path, root)
            with open(path, "rb") as fh:
                result[rel] = hashlib.sha256(fh.read()).hexdigest()
    return result


def copy_extension(target):
    target_abs = os.path.abspath(target)
    allowed = {
        os.path.abspath(LOADED),
        os.path.abspath(LOCAL_INSTALL),
        os.path.abspath(PACKAGE_DIR),
    }
    assert target_abs in allowed, f"拒绝写入未验证目录: {target_abs}"
    shutil.copytree(SOURCE, target_abs, dirs_exist_ok=True)
    manifest = os.path.join(target_abs, "manifest.json")
    with open(manifest, encoding="utf-8") as fh:
        assert '"version": "0.10.9"' in fh.read()
    print("已部署:", target_abs)


def main():
    stamp = time.strftime("%Y%m%d-%H%M%S")
    if os.path.isdir(LOADED):
        manifest_text = open(os.path.join(LOADED, "manifest.json"), encoding="utf-8").read()
        main_text = open(os.path.join(LOADED, "page", "main.js"), encoding="utf-8").read()
        if '"version": "0.10.8"' in manifest_text and "const VERSION = '0.10.8'" in main_text:
            backup_base = os.path.join(ORGANIZED, f"TEMU图片助手v0.10.8-backup-{stamp}")
            shutil.make_archive(backup_base, "zip", root_dir=LOADED)
            print("旧安装备份:", backup_base + ".zip")

    copy_extension(LOADED)
    copy_extension(LOCAL_INSTALL)
    copy_extension(PACKAGE_DIR)

    package_docs = os.path.join(PACKAGE_DIR, "docs")
    shutil.copytree(DOCS, package_docs, dirs_exist_ok=True)
    shutil.copy2(
        os.path.join(DOCS, "初次使用公告.md"),
        os.path.join(PACKAGE_DIR, "使用公告.md"),
    )

    if os.path.exists(PACKAGE_ZIP):
        os.remove(PACKAGE_ZIP)
    shutil.make_archive(PACKAGE_ZIP[:-4], "zip", root_dir=PACKAGE_DIR)
    print("安装包:", PACKAGE_ZIP)

    source_hash = digest_tree(SOURCE)
    loaded_hash = digest_tree(LOADED)
    package_hash = digest_tree(PACKAGE_DIR)
    for rel, value in source_hash.items():
        assert loaded_hash.get(rel) == value, f"运行目录校验失败: {rel}"
        assert package_hash.get(rel) == value, f"安装包目录校验失败: {rel}"
    print("复制校验: OK（manifest/page/background/README 等）")
    print("包大小: %.1f KB" % (os.path.getsize(PACKAGE_ZIP) / 1024))


if __name__ == "__main__":
    main()
