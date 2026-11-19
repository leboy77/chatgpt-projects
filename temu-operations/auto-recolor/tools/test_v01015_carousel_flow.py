"""v0.10.15 真机测试：定向删除第 5 张轮播图并新增 icon128，安全演练不提交。"""
import base64
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

TEST_ID = "45687392555"
IMAGE = os.path.join(os.getcwd(), "extension", "icons", "icon128.png")


def find_handle(wd, needle):
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if needle in (wd.url() or ""):
                return handle
        except Exception:
            continue
    return None


def read_job(wd):
    return wd.js("""
    const api = window.__TEMU_IMG_BOT_API__;
    if (!api) return null;
    const job = api.getCarouselJob();
    return job ? JSON.stringify(job) : null;
    """)


def main():
    wd = bb.connect()
    task_handle = find_handle(wd, "material/image-task")
    if not task_handle:
        raise SystemExit("没有 material/image-task 标签页")
    wd.switch(task_handle)
    time.sleep(1)
    print("page:", wd.url())
    print("panel:", wd.js("""
    const host = document.getElementById('temu-image-bot-host');
    return host && host.shadowRoot
      ? host.shadowRoot.getElementById('verLine').innerText : 'NO_PANEL';
    """))

    with open(IMAGE, "rb") as fh:
        b64 = base64.b64encode(fh.read()).decode("ascii")

    started = wd.js("""
    const api = window.__TEMU_IMG_BOT_API__;
    if (!api) return 'NO_API';
    api.clearImageTaskJob();
    const bytes = Uint8Array.from(atob(arguments[0]), c => c.charCodeAt(0));
    const file = new File([bytes], 'icon128.png', {type:'image/png'});
    api.setCarouselFilesForTest([file]);
    const sr = document.getElementById('temu-image-bot-host').shadowRoot;
    sr.getElementById('carouselProductId').value = arguments[1];
    sr.getElementById('carouselDeleteIndex').value = '5';
    sr.getElementById('carouselAddImage').checked = true;
    sr.getElementById('carouselDryRun').checked = true;
    sr.getElementById('carouselStart').click();
    return 'started';
    """, [b64, TEST_ID])
    print("start:", started)
    assert started == "started", started

    job = None
    deadline = time.time() + 300
    while time.time() < deadline:
        time.sleep(2)
        handles = wd.handles()
        for handle in handles:
            try:
                wd.switch(handle)
                url = wd.url() or ""
                if "agentseller.temu.com" not in url:
                    continue
                raw = read_job(wd)
                if not raw:
                    continue
                current = json.loads(raw)
                print("job:", current.get("status"), "|", current.get("stage"), "|", current.get("progress"))
                if current.get("id", "").startswith("carousel-"):
                    job = current
                if job and job.get("status") in ("done", "failed", "stopped"):
                    break
            except Exception:
                continue
        if job and job.get("status") in ("done", "failed", "stopped"):
            break

    print("final job:", json.dumps(job, ensure_ascii=False, indent=2))
    assert job, "没有读到轮播图任务状态"
    if job.get("status") != "done":
        raise SystemExit(f"轮播图任务未完成：{job.get('progress') or job.get('error')}")
    assert "未提交" in (job.get("progress") or ""), job

    edit_handle = None
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if "goods/images-edit" not in (wd.url() or ""):
                continue
            raw = read_job(wd)
            if raw and json.loads(raw).get("id") == job.get("id"):
                edit_handle = handle
                break
        except Exception:
            continue
    assert edit_handle, "没有找到承载本任务的图片更新详情页"
    wd.switch(edit_handle)
    result = json.loads(wd.js("""
    const visible = el => !!(el && el.offsetParent !== null && el.getBoundingClientRect().width > 0);
    const wraps = [...document.querySelectorAll('[class*="preview-image_wrap"]')].filter(visible);
    const sr = document.getElementById('temu-image-bot-host').shadowRoot;
    const log = sr.getElementById('log');
    return JSON.stringify({
      counts: wraps.map(w => w.querySelectorAll('[class*="preview-image_productItem"]').length),
      log: log ? log.innerText.slice(-2500) : ''
    });
    """))
    print("carousel counts:", result["counts"])
    print("log tail:\n", result["log"])
    assert result["counts"], "没有找到轮播图"
    assert all(count == 5 for count in result["counts"]), result["counts"]
    assert "已删除第 5 张轮播图" in result["log"], result["log"]
    assert "已新增 1 张轮播图" in result["log"], result["log"]
    assert "未点击提交" in result["log"], result["log"]
    print("v0.10.15 轮播图删除+新增（未提交）: OK")


if __name__ == "__main__":
    main()
