"""v0.10.13 回归：素材中心只能读取当前弹窗，并逐次验证卡片选中。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    target = None
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if (
                "agentseller.temu.com" in (wd.url() or "")
                and wd.js("return !!window.__TEMU_IMG_BOT_API__;")
            ):
                target = handle
                break
        except Exception:
            continue
    if not target:
        raise SystemExit("找不到已加载插件的 TEMU 页面")
    wd.switch(target)

    result = json.loads(wd.js_async("""
    const done = arguments[arguments.length - 1];
    (async () => {
      const api = window.__TEMU_IMG_BOT_API__;
      const root = document.createElement('div');
      root.id = 'temu-material-selection-test';
      root.style.cssText = [
        'position:fixed', 'left:10px', 'top:10px', 'width:640px', 'height:420px',
        'z-index:2147483646', 'background:white', 'display:flex', 'gap:8px'
      ].join(';');

      const active = document.createElement('div');
      active.className = 'MDL_innerWrapper active-test';
      active.style.cssText = 'width:300px;height:360px;background:#fff;position:relative';
      active.innerHTML = [
        '<div>本地上传</div>',
        '<div class="cardContainer" style="width:160px;height:180px;margin:10px">',
        '  <div class="thumb" style="width:150px;height:120px;background:#eee"></div>',
        '  <span class="material-name">test-image-1</span>',
        '</div>',
        '<span class="selection-count">已选 0 个</span>'
      ].join('');

      const stale = document.createElement('div');
      stale.className = 'MDL_innerWrapper stale-test';
      stale.style.cssText = 'width:300px;height:360px;background:#fff;position:relative';
      stale.innerHTML = '<div>本地上传</div><span>已选 0 个</span>';

      root.append(active, stale);
      document.body.appendChild(root);

      const countEl = active.querySelector('.selection-count');
      const card = active.querySelector('.cardContainer');
      let selected = 0;
      card.addEventListener('click', () => {
        selected += 1;
        countEl.textContent = `已选 ${selected} 个`;
      });
      const label = active.querySelector('.material-name');

      const readActive = api.selectedCount(active);
      const selectedAfterClick = await api.selectCard(label, active);
      const readAfterClick = api.selectedCount(active);
      countEl.textContent = '已选 4 个';
      const activeFour = api.selectedCount(active);
      const staleDialogExists = !!stale.isConnected;
      root.remove();
      done(JSON.stringify({
        readActive,
        selectedAfterClick,
        readAfterClick,
        activeFour,
        staleDialogExists
      }));
    })().catch((error) => done(JSON.stringify({ error: String(error && error.message || error) })));
    """))
    if result.get("error"):
        raise AssertionError(result["error"])

    assert result["readActive"] == 0, result
    assert result["selectedAfterClick"] == 1, result
    assert result["readAfterClick"] == 1, result
    assert result["activeFour"] == 4, result
    assert result["staleDialogExists"], result
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("素材选中弹窗隔离测试: OK")


if __name__ == "__main__":
    main()
