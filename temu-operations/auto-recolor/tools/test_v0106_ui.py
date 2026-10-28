"""检查任务页货号、检查清单和高亮保存准备按钮。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if "agentseller.temu.com" not in (wd.url() or ""):
                continue
            raw = wd.js("""
            const host=document.getElementById('temu-image-bot-host');
            if (!host || !host.shadowRoot) return null;
            const sr=host.shadowRoot;
            const artNo=sr.getElementById('artNo');
            const button=sr.getElementById('prepareTask');
            const panel=sr.getElementById('preparePanel');
            const rect=button.getBoundingClientRect();
            const pane=sr.querySelector('.pane.active');
            const paneRect=pane.getBoundingClientRect();
            return JSON.stringify({
              version:sr.getElementById('verLine').innerText,
              artNoInputs:sr.querySelectorAll('#artNo').length,
              artNo:artNo ? artNo.value : '',
              selectedTask:sr.querySelector('.taskRow.active .name')?.innerText || '',
              importCards:sr.querySelectorAll('.importCard').length,
              checklist:[...sr.querySelectorAll('.prepareCheckItem')].map(el=>el.innerText),
              panelClass:panel.className,
              buttonClass:button.className,
              buttonText:button.innerText,
              buttonVisible:rect.width>0 && rect.height>0 && rect.top < paneRect.bottom && rect.bottom > paneRect.top,
              buttonRect:{x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height)},
              paneRect:{x:Math.round(paneRect.x),y:Math.round(paneRect.y),w:Math.round(paneRect.width),h:Math.round(paneRect.height)}
            });
            """)
            if raw:
                print(raw)
                return
        except Exception as exc:
            print("ERR", str(exc)[:160])
    raise SystemExit("未找到面板")


if __name__ == "__main__":
    main()
