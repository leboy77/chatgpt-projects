"""走查：素材中心按钮的 DOM/禁用状态，并对比另一个商品。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

wd = bb.connect()


def report(label):
    print(f"\n===== {label} =====")
    print("url:", wd.url())
    print(wd.js("""
    const cells = [...document.querySelectorAll('td')].filter(td => (td.innerText||'').includes('素材中心'));
    if (!cells.length) return 'no 素材中心 cell';
    const cell = cells[0];
    const btn = [...cell.querySelectorAll('*')].find(el =>
      el.children.length === 0 && (el.innerText||'').trim() === '素材中心');
    if (!btn) return 'no button';
    const chain = [];
    let el = btn;
    for (let i = 0; i < 5 && el; i++) {
      chain.push({tag: el.tagName, cls: (el.className||'').toString().slice(0, 90),
                  disabled: el.getAttribute('aria-disabled'), testid: el.getAttribute('data-testid')});
      el = el.parentElement;
    }
    return JSON.stringify({chain, btnHtml: btn.parentElement.parentElement.outerHTML.slice(0, 900)}, null, 1);
    """))


tabs = []
for h in wd.handles():
    try:
        wd.switch(h)
        u = wd.url() or ""
        if "/goods/edit" in u:
            tabs.append((h, u))
    except Exception:
        continue

for i, (h, u) in enumerate(tabs):
    wd.switch(h)
    report(f"编辑页 {i}: {u}")
