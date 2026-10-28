"""打包 v0.10.10 Markdown 文档。"""
import os
import zipfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = r"C:\Users\QZJLKJ\Desktop\TEMU图片助手整理\TEMU图片助手v0.10.10-Markdown文档.zip"
FILES = [
    (os.path.join(HERE, "extension", "README.md"), "README.md"),
    (os.path.join(HERE, "docs", "初次使用公告.md"), "初次使用公告.md"),
    (os.path.join(HERE, "docs", "需求文档.md"), "需求文档.md"),
    (os.path.join(HERE, "docs", "技术方案.md"), "技术方案.md"),
    (os.path.join(HERE, "docs", "修改建议清单.md"), "修改建议清单.md"),
    (os.path.join(HERE, "docs", "需求建议_第二批.md"), "需求建议_第二批.md"),
]

with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as archive:
    for source, name in FILES:
        archive.write(source, name)

with zipfile.ZipFile(OUTPUT) as archive:
    names = archive.namelist()
    assert len(names) == len(FILES)
    for _, name in FILES:
        assert name in names

print(OUTPUT)
