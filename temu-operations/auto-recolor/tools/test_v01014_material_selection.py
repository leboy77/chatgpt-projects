"""v0.10.14 回归：最前方弹窗、已选卡片防重复点击、重复图片计划拦截。"""
import json
import os
import sys

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
      root.id = 'temu-material-selection-test-v01014';
      root.style.cssText = [
        'position:fixed', 'left:10px', 'top:10px', 'width:640px', 'height:420px',
        'z-index:2147483646', 'background:white', 'display:flex', 'gap:8px'
      ].join(';');

      const active = document.createElement('div');
      active.className = 'MDL_innerWrapper active-test';
      active.style.cssText = 'width:300px;height:360px;background:#fff;position:relative';
      active.innerHTML = [
        '<div>本地上传</div>',
        '<div class="cardContainer selected" style="width:160px;height:180px;margin:10px">',
        '  <div class="thumb" style="width:150px;height:120px;background:#eee"></div>',
        '  <span class="material-name">test-image-1</span>',
        '</div>',
        '<span class="selection-count">已选 1 个</span>'
      ].join('');

      const stale = document.createElement('div');
      stale.className = 'MDL_innerWrapper stale-test';
      stale.style.cssText = 'width:300px;height:360px;background:#fff;position:relative';
      stale.innerHTML = '<div>本地上传</div><span>已选 0 个</span>';

      root.append(active, stale);
      document.body.appendChild(root);

      const countEl = active.querySelector('.selection-count');
      const card = active.querySelector('.cardContainer');
      const label = active.querySelector('.material-name');
      let clickCount = 0;
      card.addEventListener('click', () => {
        clickCount += 1;
        countEl.textContent = '已选 0 个';
      });

      const frontDialogIsActive = api.materialDialog() === active;
      const selectedResult = await api.selectCard(label, active);
      let duplicateError = '';
      try {
        await api.selectPlannedTargetsForRow(
          1,
          active,
          [{ name: 'same.jpg' }, 'same-1']
        );
      } catch (error) {
        duplicateError = String(error && error.message || error);
      }
      const output = {
        frontDialogIsActive,
        selectedResult,
        clickCount,
        duplicateError
      };
      root.remove();
      done(JSON.stringify(output));
    })().catch((error) => done(JSON.stringify({ error: String(error && error.message || error) })));
    """))
    if result.get("error"):
        raise AssertionError(result["error"])
    assert result["frontDialogIsActive"], result
    assert result["selectedResult"] == 1, result
    assert result["clickCount"] == 0, result
    assert "图片计划存在重复素材" in result["duplicateError"], result
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("重复素材点击防护测试: OK")


if __name__ == "__main__":
    main()
