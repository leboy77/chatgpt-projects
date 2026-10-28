"""安装 TEMU 图片助手扩展到比特浏览器窗口（Preferences 注册 unpacked 扩展）。

用法：
  python tools/install_ext.py prepare
  python tools/install_ext.py patch  <profileDir>      # 需要该窗口已关闭
  python tools/install_ext.py id
"""
import base64
import hashlib
import json
import os
import shutil
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(HERE, "extension")
INSTALL_DIR = os.path.join(os.environ["LOCALAPPDATA"], "TemuImageBot", "extension")
BROWSER_CACHE = os.path.join(os.environ["APPDATA"], "BitBrowser", "BrowserCache")


def id_from_key_b64(key_b64: str) -> str:
    der = base64.b64decode(key_b64)
    digest = hashlib.sha256(der).digest()[:16]
    return "".join(chr(ord("a") + (b >> 4)) + chr(ord("a") + (b & 0xF)) for b in digest)


def read_manifest():
    with open(os.path.join(SRC_DIR, "manifest.json"), encoding="utf-8") as fh:
        return json.load(fh)


def ext_id() -> str:
    manifest = read_manifest()
    key = manifest.get("key")
    if not key:
        raise SystemExit("manifest.json 里没有 key，无法固定扩展 ID")
    return id_from_key_b64(key)


def prepare():
    manifest = read_manifest()
    eid = ext_id()
    if os.path.exists(INSTALL_DIR):
        shutil.rmtree(INSTALL_DIR)
    shutil.copytree(SRC_DIR, INSTALL_DIR, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    print("扩展目录 :", INSTALL_DIR)
    print("扩展 ID  :", eid)
    print("名称/版本:", manifest["name"], manifest["version"])
    # 校验复制结果
    copied = json.load(open(os.path.join(INSTALL_DIR, "manifest.json"), encoding="utf-8"))
    assert id_from_key_b64(copied["key"]) == eid
    for f in ("background.js", "content/bridge.js", "page/main.js", "icons/icon128.png"):
        assert os.path.exists(os.path.join(INSTALL_DIR, f)), f
    print("复制校验 : OK")
    return eid


def patch_profile(profile_dir):
    eid = ext_id()
    pref_path = os.path.join(profile_dir, "Default", "Preferences")
    if not os.path.exists(pref_path):
        raise SystemExit(f"找不到 Preferences: {pref_path}")

    backup = pref_path + f".bak-{time.strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(pref_path, backup)

    with open(pref_path, encoding="utf-8") as fh:
        data = json.load(fh)

    settings = data.setdefault("extensions", {}).setdefault("settings", {})
    api = ["storage", "scripting", "activeTab"]
    hosts = ["https://agentseller.temu.com/*"]
    settings[eid] = {
        "active_permissions": {
            "api": api,
            "explicit_host": hosts,
            "manifest_permissions": [],
            "scriptable_host": hosts,
        },
        "granted_permissions": {
            "api": api,
            "explicit_host": hosts,
            "manifest_permissions": [],
            "scriptable_host": hosts,
        },
        "from_webstore": False,
        "location": 4,           # Manifest::UNPACKED
        "path": INSTALL_DIR,
        "state": 1,              # ENABLED
        "was_installed_by_default": False,
        "was_installed_by_oem": False,
    }

    with open(pref_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    print("已写入扩展注册:", eid)
    print("  profile:", profile_dir)
    print("  备份   :", backup)


def list_profiles():
    if not os.path.isdir(BROWSER_CACHE):
        return []
    return [os.path.join(BROWSER_CACHE, d) for d in os.listdir(BROWSER_CACHE)
            if os.path.isdir(os.path.join(BROWSER_CACHE, d, "Default"))]


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "prepare"
    if cmd == "id":
        print(ext_id())
    elif cmd == "prepare":
        prepare()
    elif cmd == "patch":
        patch_profile(sys.argv[2])
    elif cmd == "profiles":
        for p in list_profiles():
            print(p)
    else:
        raise SystemExit(__doc__)
