"""v0.9.4 无提交回归：状态统计 + Excel 运行汇总结构。"""
import base64
import json
import os
import sys
import time
import urllib.parse
import zipfile
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

HERE = os.getcwd()
SRC = open(os.path.join(HERE, "extension", "page", "main.js"), encoding="utf-8").read()
SOURCE_XLSX = r"C:\Users\QZJLKJ\Desktop\skc ID.xlsx"
OUT_XLSX = os.path.join(HERE, "probes", "v094_run_summary.xlsx")
OUT_SHOT = os.path.join(HERE, "probes", "shots", "v094_final.png")
LIST_URL = "https://agentseller.temu.com/goods/list"


def find_temu_tab(wd):
    for handle in wd.handles():
        try:
            wd.switch(handle)
            parsed = urllib.parse.urlparse(wd.url() or "")
            if parsed.hostname == "agentseller.temu.com":
                return handle
        except Exception:
            continue
    handle = wd.new_tab(LIST_URL)
    time.sleep(6)
    return handle


def main():
    wd = bb.connect()
    tab = find_temu_tab(wd)
    wd.switch(tab)
    print("测试页面:", wd.url())
    wd.js("""
    const old = document.getElementById('temu-image-bot-host');
    if (old) old.remove();
    window.__TEMU_IMG_BOT_V1__ = false;
    try {
      (0, eval)(%s);
      return 'injected';
    } catch (e) {
      return 'ERROR ' + e.message;
    }
    """ % json.dumps(SRC))
    time.sleep(2)

    logic = json.loads(wd.js("""
    const api = window.__TEMU_IMG_BOT_API__;
    if (!api) return JSON.stringify({ok:false, error:'debug api missing'});
    const snapshot = {
      skcs: ['skc-ok', 'skc-fail', 'skc-timeout', 'skc-pending'],
      skcStatuses: {
        'skc-ok': {status:'提交成功（平台处理中）', attempts:1},
        'skc-fail': {status:'失败：提交校验失败', attempts:2, lastReason:'提交校验失败'},
        'skc-timeout': {status:'超时跳过（超过 10 分钟）', attempts:1, lastReason:'超时'},
        'skc-pending': {status:'提交中', attempts:1}
      }
    };
    const stats = api.taskStats({id:'synthetic-task', snapshot});
    return JSON.stringify({
      ok: true,
      version: document.getElementById('temu-image-bot-host')
        .shadowRoot.getElementById('verLine').textContent,
      stats
    });
    """).replace("version v", ""))
    expected = {
        "total": 4,
        "success": 1,
        "failed": 1,
        "timedOut": 1,
        "pending": 1,
        "retryable": 2,
        "retrySkcs": ["skc-fail", "skc-timeout"],
    }
    for key, value in expected.items():
        actual = logic["stats"].get(key)
        assert actual == value, f"{key}: expected {value}, got {actual}"
    print("状态统计: OK", json.dumps(logic["stats"], ensure_ascii=False))

    with zipfile.ZipFile(SOURCE_XLSX) as source:
        parts = {
            name: base64.b64encode(source.read(name)).decode("ascii")
            for name in source.namelist()
        }
    encoded = wd.js("""
    const api = window.__TEMU_IMG_BOT_API__;
    const encoded = arguments[0];
    const files = {};
    for (const [name, b64] of Object.entries(encoded)) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      files[name] = bytes;
    }
    const snapshot = {
      skcs: ['skc-ok', 'skc-fail', 'skc-timeout', 'skc-pending'],
      skcStatuses: {
        'skc-ok': {status:'提交成功（平台处理中）', attempts:1, at:Date.now()},
        'skc-fail': {status:'失败：提交校验失败', attempts:2, at:Date.now()},
        'skc-timeout': {status:'超时跳过（超过 10 分钟）', attempts:1, at:Date.now()},
        'skc-pending': {status:'提交中', attempts:1, at:Date.now()}
      }
    };
    api.addRunSummarySheet(files, {fileName:'skc ID.xlsx'}, api.taskStats({id:'synthetic', snapshot}));
    const bytes = api.zipStore(files);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
    }
    return btoa(bin);
    """, [parts])
    with open(OUT_XLSX, "wb") as output:
        output.write(base64.b64decode(encoded))

    with zipfile.ZipFile(OUT_XLSX) as result:
        names = result.namelist()
        summary_paths = [name for name in names if name.startswith("xl/worksheets/sheet")]
        assert "xl/workbook.xml" in names
        workbook_xml = result.read("xl/workbook.xml").decode("utf-8")
        rel_xml = result.read("xl/_rels/workbook.xml.rels").decode("utf-8")
        content_xml = result.read("[Content_Types].xml").decode("utf-8")
        assert "运行汇总" in workbook_xml
        assert "worksheets/sheet" in rel_xml
        assert "spreadsheetml.worksheet+xml" in content_xml
        for path in summary_paths:
            ET.fromstring(result.read(path))
        summary_xml = result.read(summary_paths[-1]).decode("utf-8")
        assert "成功商品" in summary_xml
        assert "可重试商品" in summary_xml
        assert "skc-fail" in summary_xml
    print("Excel 运行汇总: OK ->", OUT_XLSX)

    try:
        import openpyxl
        book = openpyxl.load_workbook(OUT_XLSX, read_only=True, data_only=True)
        assert "运行汇总" in book.sheetnames
        sheet = book["运行汇总"]
        values = [cell.value for row in sheet.iter_rows() for cell in row]
        assert "成功商品" in values and 1 in values
        print("Excel 兼容性: OK（openpyxl 可打开）")
    except ImportError:
        print("Excel 兼容性: 跳过（未安装 openpyxl）")
    print("截图:", wd.screenshot(OUT_SHOT))


if __name__ == "__main__":
    main()
