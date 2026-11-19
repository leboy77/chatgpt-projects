"""v0.10.15 批量+多色测试：9542570366 -> 45687392555，安全演练不提交。"""
import base64
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

IDS = ["9542570366", "45687392555"]
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
    sr.getElementById('carouselProductIds').value = arguments[1];
    sr.getElementById('carouselDeleteIndex').value = '5';
    sr.getElementById('carouselAddImage').checked = true;
    sr.getElementById('carouselDryRun').checked = true;
    sr.getElementById('carouselStart').click();
    return 'started';
    """, [b64, "\n".join(IDS)])
    print("start:", started)
    assert started == "started", started

    job = None
    deadline = time.time() + 600
    while time.time() < deadline:
        time.sleep(2)
        for handle in wd.handles():
            try:
                wd.switch(handle)
                if "agentseller.temu.com" not in (wd.url() or ""):
                    continue
                raw = read_job(wd)
                if not raw:
                    continue
                current = json.loads(raw)
                print("job:", current.get("status"), "|", current.get("stage"),
                      "|", current.get("index"), "|", current.get("progress"))
                if str(current.get("id", "")).startswith("carousel-"):
                    job = current
                if job and job.get("status") in ("done", "failed", "stopped"):
                    break
            except Exception:
                continue
        if job and job.get("status") in ("done", "failed", "stopped"):
            break

    print("final job:", json.dumps(job, ensure_ascii=False, indent=2))
    assert job, "没有读到批次任务状态"
    if job.get("status") != "done":
        raise SystemExit(f"批次未完成：{job.get('progress') or job.get('error')}")
    assert job.get("ids") == IDS, job
    # index 是当前处理的零基下标；全部完成时停在最后一个 ID
    assert job.get("index") == len(IDS) - 1, job
    assert len(job.get("results") or []) == len(IDS), job

    first, second = job["results"]
    assert first["id"] == "9542570366", first
    assert first["wraps"] == 4, first
    assert first["counts"] == [7, 5, 5, 5], first
    assert second["id"] == "45687392555", second
    assert second["wraps"] == 1, second
    assert second["counts"] == [5], second
    assert "未提交" in job.get("progress", ""), job
    print("多色 4 组 + 批量 2 个 ID（未提交）: OK")


if __name__ == "__main__":
    main()
