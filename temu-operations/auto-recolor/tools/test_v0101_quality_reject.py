"""验证图片品质弹窗：自动取消、记录文件名并返回专项错误。"""
import json
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    target = None
    for handle in wd.handles():
        try:
            wd.switch(handle)
            parsed = urllib.parse.urlparse(wd.url() or "")
            if parsed.hostname == "agentseller.temu.com" and wd.js("return !!window.__TEMU_IMG_BOT_API__;"):
                target = handle
                break
        except Exception:
            continue
    if not target:
        raise SystemExit("找不到 TEMU 插件页")
    wd.switch(target)
    wd.js("""
    document.getElementById('quality-test-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'quality-test-modal';
    modal.style.cssText = 'position:fixed;left:20px;top:20px;z-index:99999;background:white;padding:20px;border:1px solid #ccc';
    modal.innerHTML = '<div>图片品质不佳</div><div>本次上传图片中存在牛皮癣、LOGO等不符合平台图片规范的问题，请检查并重新上传</div>'
      + '<button id="quality-test-cancel">取消</button>';
    document.body.appendChild(modal);
    window.__qualityRejected = null;
    document.getElementById('quality-test-cancel').onclick = () => {
      window.__qualityCancelled = true;
      modal.remove();
    };
    window.__qualityCancelled = false;
    const api = window.__TEMU_IMG_BOT_API__;
    api.waitFor(() => false, {timeout:5000, interval:200, desc:'测试等待'})
      .catch(globalError => {
        api.rejectImageQualityIfAny('bad-image.jpg', ['bad-image.jpg'])
          .then(() => { window.__qualityRejected = {unexpected:true}; })
          .catch(error => {
            window.__qualityRejected = {
              globalCode:globalError.code || '',
              code:error.code || '',
              imageName:error.imageName || '',
              message:String(error.message || error)
            };
          });
      });
    return 'started';
    """)
    result = None
    for _ in range(20):
        time.sleep(0.3)
        raw = wd.js("return window.__qualityRejected ? JSON.stringify(window.__qualityRejected) : '';")
        if raw:
            result = json.loads(raw)
            break
    canceled = wd.js("return !!window.__qualityCancelled;")
    assert canceled, result
    assert result and result["globalCode"] == "IMAGE_QUALITY_REJECTED", result
    assert result and result["code"] == "IMAGE_QUALITY_REJECTED", result
    assert result["imageName"] == "bad-image.jpg", result
    assert "牛皮癣" in result["message"], result
    print(json.dumps({"cancelled": canceled, "error": result}, ensure_ascii=False, indent=2))
    print("图片品质弹窗专项处理: OK")


if __name__ == "__main__":
    main()
