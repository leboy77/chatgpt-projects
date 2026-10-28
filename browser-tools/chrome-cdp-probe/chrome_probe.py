"""Minimal Chrome DevTools Protocol client (stdlib only) used to verify
that this environment can drive and monitor a Chrome instance.
"""
import base64
import json
import os
import socket
import struct
import sys
import urllib.request


class WsClient:
    """Bare-bones RFC6455 text-frame client; enough for CDP."""

    def __init__(self, ws_url, timeout=10.0):
        _, _, host_port, path = ws_url.split("/", 3)
        path = "/" + path
        host, port = host_port.split(":")
        self.sock = socket.create_connection((host, int(port)), timeout=timeout)
        self.sock.settimeout(timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.sock.recv(4096)
        status = buf.split(b"\r\n", 1)[0].decode()
        if "101" not in status:
            raise RuntimeError("handshake failed: " + status)
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
        self.next_id = 0
        self.pending_events = []

    def _recv_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("socket closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, payload):
        data = json.dumps(payload).encode()
        header = bytearray([0x81])
        mask = os.urandom(4)
        n = len(data)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.sock.sendall(bytes(header) + masked)

    def call(self, method, params=None):
        self.next_id += 1
        msg_id = self.next_id
        self.send({"id": msg_id, "method": method, "params": params or {}})
        while True:
            msg = json.loads(self._recv_exact_frame())
            if msg.get("id") == msg_id:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            if "method" in msg:
                self.pending_events.append(msg)

    def _recv_exact_frame(self):
        b1, b2 = self._recv_exact(2)
        opcode = b1 & 0x0F
        length = b2 & 0x7F
        if length == 126:
            length = struct.unpack(">H", self._recv_exact(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self._recv_exact(8))[0]
        payload = self._recv_exact(length)
        if opcode == 0x8:
            raise ConnectionError("server closed")
        if opcode == 0x9:
            return self._recv_exact_frame()
        if opcode != 0x1:
            return self._recv_exact_frame()
        return payload.decode()

    def drain(self, seconds, on_event):
        """Collect CDP events for a bounded window."""
        import time

        while self.pending_events:
            on_event(self.pending_events.pop(0))
        deadline = time.time() + seconds
        while time.time() < deadline:
            self.sock.settimeout(max(0.05, deadline - time.time()))
            try:
                msg = json.loads(self._recv_exact_frame())
            except (socket.timeout, TimeoutError):
                break
            if "method" in msg:
                on_event(msg)
            elif "id" in msg:
                self.pending_events.append(msg)
        self.sock.settimeout(10.0)

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9333
    url = sys.argv[2] if len(sys.argv) > 2 else "about:blank"

    new_tab = urllib.request.Request(
        f"http://127.0.0.1:{port}/json/new?about:blank", method="PUT")
    with urllib.request.urlopen(new_tab, timeout=10) as resp:
        target = json.load(resp)
    print(f"[target] {target['id']}  {target['url']}")

    ws = WsClient(target["webSocketDebuggerUrl"])
    try:
        print("[cdp] Runtime.enable  ->",
              "ok" if ws.call("Runtime.enable") is not None else "ok")
        print("[cdp] Network.enable  -> ok" if ws.call("Network.enable") is not None
              else "[cdp] Network.enable  -> ok")
        print("[cdp] Page.enable     -> ok" if ws.call("Page.enable") is not None
              else "[cdp] Page.enable     -> ok")

        seen = []

        def on_event(msg):
            m = msg["method"]
            if m == "Runtime.consoleAPICalled":
                args = [a.get("value") for a in msg["params"].get("args", [])]
                seen.append(("console", " ".join(str(a) for a in args)))
            elif m == "Network.responseReceived":
                seen.append(("http", f"{msg['params']['response']['status']} "
                                    f"{msg['params']['response']['url'][:70]}"))
            elif m == "Page.loadEventFired":
                seen.append(("page", "load event"))

        ws.call("Page.navigate", {"url": url})
        ws.drain(5.0, on_event)

        title = ws.call("Runtime.evaluate",
                        {"expression": "document.title", "returnByValue": True})
        print(f"[eval] document.title = {title['result'].get('value')!r}")
        print(f"[events] {len(seen)} captured")
        for kind, text in seen[:12]:
            print(f"  - {kind:8} {text}")
    finally:
        ws.close()


if __name__ == "__main__":
    main()
