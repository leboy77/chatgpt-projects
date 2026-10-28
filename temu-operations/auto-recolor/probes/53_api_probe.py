"""探查比特浏览器本地 API 是否提供扩展相关接口。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

CANDIDATES = [
    ("GET", "/health", None),
    ("GET", "/status", None),
    ("GET", "/browser/ports", None),
    ("POST", "/browser/list", {"page": 0, "pageSize": 1}),
    ("POST", "/browser/extension/list", {"page": 0, "pageSize": 10}),
    ("POST", "/extension/list", {"page": 0, "pageSize": 10}),
    ("POST", "/browser/extension", {"page": 0, "pageSize": 10}),
    ("POST", "/plugin/list", {"page": 0, "pageSize": 10}),
    ("POST", "/browser/plugin/list", {"page": 0, "pageSize": 10}),
    ("GET", "/browser/extension/add", None),
    ("POST", "/browser/extension/add", {"browserId": "9e6f73cc742b4abc9015f31f8e75fbd7", "path": ""}),
    ("GET", "/api/extension/list", None),
    ("GET", "/version", None),
]

for method, path, payload in CANDIDATES:
    try:
        status, data = bb.bb_call(path, payload, method)
        text = json.dumps(data, ensure_ascii=False) if isinstance(data, (dict, list)) else str(data)
        print(f"{method:4s} {path:34s} -> {status} {text[:160]}")
    except Exception as exc:  # noqa: BLE001
        print(f"{method:4s} {path:34s} -> ERR {str(exc)[:80]}")
