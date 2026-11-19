"""校验文档同步并构建 TEMU 图片助手发布包。

用法：
  python tools/build_release.py --check   # 只校验
  python tools/build_release.py           # 校验 + 构建 zip
"""
import argparse
import json
import os
import re
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, "extension")
DOCS = os.path.join(ROOT, "docs")
RELEASE = os.path.join(ROOT, "release")

DOC_FILES = [
    ("README-插件.md", os.path.join(EXT, "README.md")),
    ("README.md", os.path.join(DOCS, "README.md")),
    ("PRD.md", os.path.join(DOCS, "PRD.md")),
    ("技术设计.md", os.path.join(DOCS, "技术设计.md")),
    ("CHANGELOG.md", os.path.join(DOCS, "CHANGELOG.md")),
    ("文档维护规范.md", os.path.join(DOCS, "文档维护规范.md")),
    ("初次使用公告.md", os.path.join(DOCS, "初次使用公告.md")),
    ("需求文档.md", os.path.join(DOCS, "需求文档.md")),
    ("技术方案.md", os.path.join(DOCS, "技术方案.md")),
    ("archive/README.md", os.path.join(DOCS, "archive", "README.md")),
    ("archive/需求文档.md", os.path.join(DOCS, "archive", "需求文档.md")),
    ("archive/技术方案.md", os.path.join(DOCS, "archive", "技术方案.md")),
    ("archive/修改建议清单.md", os.path.join(DOCS, "archive", "修改建议清单.md")),
    ("archive/需求建议_第二批.md", os.path.join(DOCS, "archive", "需求建议_第二批.md")),
]


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def current_version():
    manifest = json.loads(read(os.path.join(EXT, "manifest.json")))
    version = str(manifest["version"])
    main_text = read(os.path.join(EXT, "page", "main.js"))
    match = re.search(r"const VERSION = '([^']+)'", main_text)
    if not match:
        raise SystemExit("main.js 里找不到 VERSION")
    if match.group(1) != version:
        raise SystemExit(f"版本不一致：manifest={version}, main={match.group(1)}")
    return version


def check(version):
    required = [
        ("extension/README.md", os.path.join(EXT, "README.md")),
        ("docs/README.md", os.path.join(DOCS, "README.md")),
        ("docs/PRD.md", os.path.join(DOCS, "PRD.md")),
        ("docs/技术设计.md", os.path.join(DOCS, "技术设计.md")),
        ("docs/CHANGELOG.md", os.path.join(DOCS, "CHANGELOG.md")),
        ("docs/初次使用公告.md", os.path.join(DOCS, "初次使用公告.md")),
    ]
    missing = []
    for label, path in required:
        if not os.path.exists(path):
            missing.append(f"{label} 不存在")
            continue
        if f"v{version}" not in read(path):
            missing.append(f"{label} 未包含 v{version}")
    for name, path in DOC_FILES:
        if not os.path.exists(path):
            missing.append(f"文档缺失：{name} ({path})")
    if missing:
        raise SystemExit("文档同步校验失败：\n- " + "\n- ".join(missing))
    link_docs = [
        os.path.join(EXT, "README.md"),
        os.path.join(DOCS, "README.md"),
        os.path.join(DOCS, "PRD.md"),
        os.path.join(DOCS, "技术设计.md"),
        os.path.join(DOCS, "CHANGELOG.md"),
        os.path.join(DOCS, "文档维护规范.md"),
        os.path.join(DOCS, "初次使用公告.md"),
        os.path.join(DOCS, "需求文档.md"),
        os.path.join(DOCS, "技术方案.md"),
        os.path.join(DOCS, "archive", "README.md"),
        os.path.join(DOCS, "archive", "需求文档.md"),
        os.path.join(DOCS, "archive", "技术方案.md"),
        os.path.join(DOCS, "archive", "修改建议清单.md"),
        os.path.join(DOCS, "archive", "需求建议_第二批.md"),
    ]
    link_pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    broken = []
    for path in link_docs:
        text = read(path)
        for target in link_pattern.findall(text):
            target = target.strip()
            if target.startswith("<") and target.endswith(">"):
                target = target[1:-1]
            target = target.split("#", 1)[0].strip()
            if not target or target.startswith(("http://", "https://", "mailto:")):
                continue
            resolved = os.path.normpath(os.path.join(os.path.dirname(path), target))
            if not os.path.exists(resolved):
                broken.append(f"{os.path.relpath(path, ROOT)} -> {target}")
    if broken:
        raise SystemExit("文档链接校验失败：\n- " + "\n- ".join(broken))
    print(f"文档同步: OK (v{version})")


def build(version):
    os.makedirs(RELEASE, exist_ok=True)
    ext_zip = os.path.join(RELEASE, f"TEMU图片助手v{version}.zip")
    md_zip = os.path.join(RELEASE, f"TEMU图片助手v{version}-Markdown文档.zip")

    with zipfile.ZipFile(ext_zip, "w", zipfile.ZIP_DEFLATED) as archive:
        for base, _, names in os.walk(EXT):
            for name in names:
                path = os.path.join(base, name)
                arcname = os.path.relpath(path, EXT)
                archive.write(path, arcname)

    with zipfile.ZipFile(md_zip, "w", zipfile.ZIP_DEFLATED) as archive:
        for arcname, path in DOC_FILES:
            if arcname == "README-插件.md":
                # 文档包根目录已包含 PRD/技术设计等文件，插件 README 的链接改为同目录
                archive.writestr(arcname, read(path).replace("../docs/", "./"))
            else:
                archive.write(path, arcname)

    for path in (ext_zip, md_zip):
        print(f"已生成: {path} ({os.path.getsize(path) / 1024:.1f} KB)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="只校验文档同步")
    args = parser.parse_args()
    version = current_version()
    check(version)
    if not args.check:
        build(version)


if __name__ == "__main__":
    main()
