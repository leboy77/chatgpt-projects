"""端到端演练测试（dryRun=true，不会提交）：
1) 把本地图片构造成 File 存进页面 IndexedDB，模拟“导入文件夹”
2) 写入任务状态，跳到带标记的列表页
3) 每次页面跳转后重新注入脚本（模拟扩展的 MAIN world 注入）
4) 轮询任务状态与日志
"""
import base64
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

HERE = os.getcwd()
SRC = open(os.path.join(HERE, "extension", "page", "main.js"), encoding="utf-8").read()
LIST_URL = "https://agentseller.temu.com/goods/list"
BOT_URL = LIST_URL + "#temu-image-bot"

SKCS = [sys.argv[1]] if len(sys.argv) > 1 else ["46350409750"]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 1
X = int(sys.argv[3]) if len(sys.argv) > 3 else 2
FRONT_SKIP = int(sys.argv[4]) if len(sys.argv) > 4 else 0

FRONT_DIR = r"C:\Users\QZJLKJ\Desktop\DWRG主图"
BACK_DIR = r"C:\Users\QZJLKJ\Desktop\DWRG背面图"


def read_b64(path):
    with open(path, "rb") as fh:
        return base64.b64encode(fh.read()).decode()


front_names = sorted(
    [f for f in os.listdir(FRONT_DIR) if f.lower().endswith((".jpg", ".jpeg", ".png"))],
    key=lambda n: [int(t) if t.isdigit() else t for t in __import__("re").split(r"(\d+)", n)],
)
back_names = sorted(
    [f for f in os.listdir(BACK_DIR) if f.lower().endswith((".jpg", ".jpeg", ".png"))],
    key=lambda n: [int(t) if t.isdigit() else t for t in __import__("re").split(r"(\d+)", n)],
)

wd = bb.connect()
tab = None
for h in wd.handles():
    try:
        wd.switch(h)
        if "agentseller.temu.com" in (wd.url() or ""):
            tab = h
            break
    except Exception:
        continue
if not tab:
    tab = wd.new_tab(LIST_URL)
    time.sleep(8)
wd.switch(tab)
print("测试标签页:", wd.url())

# ---------------------------------------------------------------- 1) 准备数据
print("切到列表页…")
wd.navigate(LIST_URL)
time.sleep(6)

print("写入图片 File 到 IndexedDB（模拟文件夹导入）…")
wd.js("""
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('temu-image-bot', 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const db = await open();
for (const k of ['frontFiles', 'backFiles']) {
  await new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete(k);
    tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error);
  });
}
return 'cleared';
""")
for kind, folder, names in (("frontFiles", FRONT_DIR, front_names), ("backFiles", BACK_DIR, back_names)):
    picked = (names[FRONT_SKIP:] if kind == "frontFiles" else names)
    picked = picked[: N if kind == "frontFiles" else len(names)]
    for name in picked:
        b64 = read_b64(os.path.join(folder, name))
        mime = "image/png" if name.lower().endswith(".png") else "image/jpeg"
        res = wd.js("""
        const name = arguments[0], b64 = arguments[1], mime = arguments[2], key = arguments[3];
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const file = new File([bytes], name, {type: mime});
        window.__tmpFile = file;
        return name + ':' + file.size;
        """, [name, b64, mime, kind])
        # 存入 IndexedDB
        wd.js("""
        const key = arguments[0];
        const file = window.__tmpFile;
        const open = () => new Promise((res, rej) => {
          const r = indexedDB.open('temu-image-bot', 1);
          r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        const db = await open();
        const existing = await new Promise((res, rej) => {
          const tx = db.transaction('kv', 'readonly');
          const rq = tx.objectStore('kv').get(key);
          rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error);
        });
        existing.push(file);
        await new Promise((res, rej) => {
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(existing, key);
          tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error);
        });
        return key + ' total=' + existing.length;
        """, [kind])
        print("   ", res)

wd.js("""
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('temu-image-bot', 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const db = await open();
const put = (k, v) => new Promise((res, rej) => {
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(v, k);
  tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error);
});
await put('frontDirName', 'DWRG主图');
await put('backDirName', 'DWRG背面图');
await put('task', {
  status: 'running', phase: 'LIST_SEARCH', cursor: 0, retry: 0,
  config: {artNo: 'DWRG', n: %d, x: %d, cropW: 1350, cropH: 1800, autoSubmit: true, dryRun: true},
  skcs: %s, frontCursor: 0, frontCursorStart: 0, current: null,
  backMaterialNames: [], error: null, logs: []
});
return 'task written';
""" % (N, X, json.dumps(SKCS)))

# ---------------------------------------------------------------- 2) 驱动
print("开始演练…")
wd.navigate(BOT_URL)
time.sleep(5)

deadline = time.time() + 9 * 60
last_status = None
while time.time() < deadline:
    try:
        wd.switch(tab)
        url = wd.url() or ""
        injected = wd.js("return !!window.__TEMU_IMG_BOT_V1__;")
        if not injected:
            wd.js("try { (0, eval)(%s); return 'injected'; } catch(e) { return 'ERR ' + e.message; }" % json.dumps(SRC))
            time.sleep(1)
        st = wd.js("""
        const open = () => new Promise((res, rej) => {
          const r = indexedDB.open('temu-image-bot', 1);
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
        const db = await open();
        const t = await new Promise((res, rej) => {
          const tx = db.transaction('kv', 'readonly');
          const rq = tx.objectStore('kv').get('task');
          rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
        });
        if (!t) return 'no-task';
        return JSON.stringify({status: t.status, phase: t.phase, cursor: t.cursor,
          frontCursor: t.frontCursor, err: t.error, logs: (t.logs || []).slice(-8).map(l => l.line)});
        """)
        data = json.loads(st) if st.startswith("{") else {"status": st}
        if data.get("status") != last_status or data.get("phase"):
            print(f"[{time.strftime('%H:%M:%S')}] {url} | {data.get('status')} / {data.get('phase')} / cursor={data.get('cursor')} / front={data.get('frontCursor')}")
            last_status = data.get("status")
        if (data.get("logs") or []) and data.get("status") != "running":
            for line in data["logs"]:
                print("    ", line)
        if data.get("status") in ("paused", "done", "idle"):
            print("结束:", data.get("status"), data.get("err"))
            break
    except Exception as exc:  # noqa: BLE001
        print("轮询异常:", str(exc)[:120])
    time.sleep(4)

print("shot:", wd.screenshot(os.path.join(HERE, "probes", "shots", "dryrun_final.png")))

print("== 最终日志 ==")
print(wd.js("""
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('temu-image-bot', 1);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const db = await open();
const t = await new Promise((res, rej) => {
  const tx = db.transaction('kv', 'readonly');
  const rq = tx.objectStore('kv').get('task');
  rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
});
return (t.logs || []).map(l => l.line).join('\\n');
"""))
