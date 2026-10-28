"""校验下架 SKC ID 模板 xlsx 结构。"""
import re
import sys
import zipfile
import xml.dom.minidom

PATH = r"C:\Users\QZJLKJ\Downloads\7512\下架SKC清单-模板.xlsx"


def main():
    with zipfile.ZipFile(PATH) as archive:
        names = archive.namelist()
        assert "xl/worksheets/sheet1.xml" in names, names
        sheet = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")
        workbook = archive.read("xl/workbook.xml").decode("utf-8")
    doc = xml.dom.minidom.parseString(sheet)
    values = [node.firstChild.nodeValue for node in doc.getElementsByTagName("t")]
    sheet_name = re.search(r'name="([^"]+)"', workbook).group(1)
    print("sheet:", sheet_name)
    print("headers:", values)
    assert sheet_name == "下架SKC清单", sheet_name
    assert values[:2] == ["下架 SKC ID", "状态"], values
    print("模板结构: OK")


if __name__ == "__main__":
    main()
