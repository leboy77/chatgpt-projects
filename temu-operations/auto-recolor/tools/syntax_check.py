"""把 JS 源码交给浏览器解析，检查语法是否正确（不执行）。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

path = sys.argv[1]
src = open(path, encoding="utf-8").read()

wd = bb.connect()
for h in wd.handles():
    try:
        wd.switch(h)
        if "agentseller.temu.com" in (wd.url() or ""):
            break
    except Exception:
        continue
print("页面:", wd.url())

# 分块传输，避免单次请求过大
res = wd.js(
    "window.__src = %s;"
    "try { new Function(window.__src); return 'SYNTAX OK (' + window.__src.length + ' chars)'; }"
    "catch (e) { return 'SYNTAX ERROR: ' + e.message; }"
    % json.dumps(src)
)
print(res)
