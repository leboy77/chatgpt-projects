"""比特浏览器(BitBrowser) + WebDriver 轻量客户端（无第三方依赖）。

用途：连接比特浏览器本地 API，接管指定窗口，并提供 JS 执行 / 截图 / 标签页管理等能力。
"""
import base64
import json
import http.client
import os
import sys
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BB_HOST = "127.0.0.1"
BB_PORT = 54345
WD_PORT = int(os.environ.get("TEMU_WD_PORT", "9515"))
HERE = os.path.dirname(os.path.abspath(__file__))
SESSION_FILE = os.path.join(HERE, ".session.json")


def _http(host, port, method, path, payload=None, timeout=180):
    conn = http.client.HTTPConnection(host, port, timeout=timeout)
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json; charset=utf-8"} if body else {}
    conn.request(method, path, body=body, headers=headers)
    resp = conn.getresponse()
    raw = resp.read().decode("utf-8", "replace")
    conn.close()
    try:
        return resp.status, json.loads(raw)
    except ValueError:
        return resp.status, raw


# ---------------------------------------------------------------- BitBrowser
def bb_call(path, payload=None, method="POST"):
    return _http(BB_HOST, BB_PORT, method, path, payload)


def bb_open(profile_id):
    """打开/复用窗口，返回 {ws, http, driver, pid, ...}"""
    status, data = bb_call("/browser/open", {"id": profile_id})
    if not data.get("success"):
        raise RuntimeError(f"打开窗口失败: {data}")
    return data["data"]


def bb_close(profile_id):
    return bb_call("/browser/close", {"id": profile_id})


def bb_info(profile_id):
    status, data = bb_call("/browser/list", {"page": 0, "pageSize": 200})
    for item in data["data"]["list"]:
        if item["id"] == profile_id:
            return item
    return None


# ---------------------------------------------------------------- WebDriver
W3C_KEY = "element-6066-11e4-a52e-4f735466cecf"


def _eid(item):
    """把 WebDriver 返回的元素对象转成元素 id 字符串。"""
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return item.get(W3C_KEY) or item.get("ELEMENT")
    return None


class WD:
    def __init__(self, session_id, port=None):
        self.session_id = session_id
        self.port = port or WD_PORT

    # ---- low level
    def _call(self, method, path, payload=None, timeout=180):
        return _http("127.0.0.1", self.port, method, f"/session/{self.session_id}{path}",
                     payload, timeout=timeout)

    def js(self, script, args=None, timeout=180):
        """执行同步 JS（script 为函数体，需自己写 return），返回 value。"""
        status, data = self._call("POST", "/execute/sync",
                                  {"script": script, "args": args or []}, timeout=timeout)
        if isinstance(data, dict) and isinstance(data.get("value"), dict) and "error" in data["value"]:
            raise RuntimeError(f"JS 失败: {data['value'].get('message')}")
        if not isinstance(data, dict) or "value" not in data:
            raise RuntimeError(f"JS 失败: {status} {str(data)[:400]}")
        return data["value"]

    def js_async(self, script, args=None, timeout=180):
        status, data = self._call(
            "POST", "/execute/async",
            {"script": script, "args": args or []},
            timeout=timeout)
        return data["value"]

    # ---- pages
    def handles(self):
        return self._call("GET", "/window/handles")[1]["value"]

    def switch(self, handle):
        return self._call("POST", "/window", {"handle": handle})

    def title(self):
        return self._call("GET", "/title")[1].get("value")

    def url(self):
        return self._call("GET", "/url")[1].get("value")

    def navigate(self, url):
        return self._call("POST", "/url", {"url": url})

    def new_tab(self, url="about:blank"):
        self._call("POST", "/window/new", {"type": "tab"})
        handles = self.handles()
        # chromedriver 返回新句柄在最后一个
        self.switch(handles[-1])
        if url and url != "about:blank":
            self.navigate(url)
        return handles[-1]

    def close_tab(self, handle=None):
        if handle:
            self.switch(handle)
        self._call("DELETE", "/window")

    def screenshot(self, path):
        status, data = self._call("GET", "/screenshot")
        with open(path, "wb") as fh:
            fh.write(base64.b64decode(data["value"]))
        return path

    # ---- helpers
    def find(self, using, value):
        """查找元素，返回 element id；找不到抛异常。"""
        status, data = self._call("POST", "/element", {"using": using, "value": value})
        eid = _eid(data.get("value")) if isinstance(data, dict) else None
        if not eid:
            items = self.find_all(using, value)
            eid = _eid(items[0]) if items else None
        if not eid:
            raise RuntimeError(f"未找到元素: {value}")
        return eid

    def find_all(self, using, value):
        status, data = self._call("POST", "/elements", {"using": using, "value": value})
        items = data.get("value", []) if isinstance(data, dict) else []
        return [e for e in (_eid(x) for x in items) if e]

    def el_click(self, element_id):
        return self._call("POST", f"/element/{element_id}/click", {})

    def el_text(self, element_id):
        return self._call("GET", f"/element/{element_id}/text")[1].get("value", "")

    def el_attr(self, element_id, name):
        return self._call("GET", f"/element/{element_id}/attribute/{name}")[1].get("value")

    def el_rect(self, element_id):
        return self._call("GET", f"/element/{element_id}/rect")[1].get("value")

    def el_send_keys(self, element_id, text):
        """原生输入（会触发真实键盘事件，React 受控组件也能识别）。"""
        return self._call("POST", f"/element/{element_id}/value",
                          {"text": text, "value": [*text]})

    def el_clear(self, element_id):
        """清空输入框（WebDriver clear，等价真实全选删除）。"""
        return self._call("POST", f"/element/{element_id}/clear", {})

    def upload_file(self, element_id, paths):
        """给 input[type=file] 设置本地文件（不会弹出系统文件框）。

        paths 可以是单个路径字符串或路径列表。
        """
        if isinstance(paths, str):
            paths = [paths]
        return self._call("POST", f"/element/{element_id}/value", {"text": "\n".join(paths)})

    def click_text(self, text, tag="*", index=0, timeout=15):
        """按可见文本原生点击（XPath），返回 True/False。"""
        xpath = f"(//{tag}[normalize-space(text())={json.dumps(text)}])[{index + 1}]"
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                eid = self.find("xpath", xpath)
                self.el_click(eid)
                return True
            except Exception:  # noqa: BLE001
                time.sleep(0.5)
        return False

    def click_xpath(self, xpath, timeout=15):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                eid = self.find("xpath", xpath)
                self.el_click(eid)
                return True
            except Exception:  # noqa: BLE001
                time.sleep(0.5)
        return False

    def mouse_click(self, x, y, button=0):
        """真实鼠标点击（W3C actions），坐标是 CSS 像素。"""
        payload = {"actions": [{
            "type": "pointer", "id": "mouse", "parameters": {"pointerType": "mouse"},
            "actions": [
                {"type": "pointerMove", "duration": 60, "x": int(x), "y": int(y),
                 "origin": "viewport"},
                {"type": "pointerDown", "button": button},
                {"type": "pointerUp", "button": button},
            ]}]}
        return self._call("POST", "/actions", payload)

    def mouse_scroll(self, x, y, delta_y=600, delta_x=0):
        payload = {"actions": [{
            "type": "wheel", "id": "wheel", "actions": [
                {"type": "scroll", "duration": 120, "x": int(x), "y": int(y),
                 "deltaX": int(delta_x), "deltaY": int(delta_y), "origin": "viewport"},
            ]}]}
        return self._call("POST", "/actions", payload)

    def press_key(self, key, code=None):
        """真实键盘按键。支持 'ENTER'/'ESC'/'TAB'/'SPACE' 或直接传 WebDriver 键值(如 '\\uE007')。"""
        named = {
            "ENTER": "\uE007",
            "RETURN": "\uE007",
            "ESC": "\uE00C",
            "ESCAPE": "\uE00C",
            "TAB": "\uE004",
            "SPACE": "\uE00D",
            "BACKSPACE": "\uE003",
            "DELETE": "\uE017",
        }
        value = named.get(str(key).upper(), key)
        payload = {"actions": [{
            "type": "key", "id": "keyboard", "actions": [
                {"type": "keyDown", "value": value},
                {"type": "keyUp", "value": value},
            ]}]}
        return self._call("POST", "/actions", payload)

    def type_text(self, text):
        """逐字符真实键盘输入（对 @ / 中文等不适用，建议配合 sendKeys）。"""
        actions = []
        for ch in text:
            actions.append({"type": "keyDown", "value": ch})
            actions.append({"type": "keyUp", "value": ch})
        return self._call("POST", "/actions",
                          {"actions": [{"type": "key", "id": "keyboard", "actions": actions}]})

    def set_value(self, css_or_js_finder, text):
        """用原生 setter 触发 React onChange 的赋值方式。"""
        return self.js("""
        const el = %s;
        if (!el) return 'not-found';
        const proto = el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, %s);
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
        return 'ok';
        """ % (css_or_js_finder, json.dumps(text, ensure_ascii=False)))

    def find_tab(self, *keywords, url_keyword=None):
        """按标题关键字（任一命中）或 URL 关键字找标签页句柄。"""
        for handle in self.handles():
            try:
                self.switch(handle)
                title = self.title() or ""
                url = self.url() or ""
            except Exception:
                continue
            if url_keyword and url_keyword in url:
                return handle
            if keywords and any(k in title for k in keywords):
                return handle
        return None

    def wait_js(self, script, timeout=30, interval=0.4):
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            try:
                last = self.js(script)
                if last:
                    return last
            except Exception as exc:  # noqa: BLE001
                last = f"ERR {exc}"
            time.sleep(interval)
        return last


def connect():
    """复用已有 session（tools/.session.json）。"""
    if not os.path.exists(SESSION_FILE):
        raise RuntimeError("没有会话，请先 run_session()")
    with open(SESSION_FILE, encoding="utf-8") as fh:
        sid = json.load(fh)["sessionId"]
    return WD(sid)


def run_session(debugger_port):
    """新建 chromedriver session 并附着到指定调试端口。"""
    caps = {"capabilities": {"alwaysMatch": {
        "goog:chromeOptions": {"debuggerAddress": f"127.0.0.1:{debugger_port}"}}}}
    status, data = _http("127.0.0.1", WD_PORT, "POST", "/session", caps)
    if "value" not in data or "sessionId" not in data.get("value", {}):
        raise RuntimeError(f"建立会话失败: {status} {str(data)[:400]}")
    sid = data["value"]["sessionId"]
    with open(SESSION_FILE, "w", encoding="utf-8") as fh:
        json.dump({"sessionId": sid, "debuggerPort": debugger_port}, fh)
    return WD(sid)


def ensure_session(profile_id):
    """确保有一个可用会话：优先复用，失效则重新建立。返回 (WD, info)。"""
    info = bb_open(profile_id)
    port = str(info["http"]).split(":")[-1]
    try:
        wd = connect()
        _, data = wd._call("GET", "/window/handles")
        if isinstance(data, dict) and "value" in data and not isinstance(data["value"], dict):
            return wd, info
    except Exception:  # noqa: BLE001
        pass
    return run_session(port), info
