"""只读复核刚刚完成的批量+多色安全演练结果，不创建新任务。"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

IDS = ["9542570366", "45687392555"]


def main():
    wd = bb.connect()
    raw = None
    for handle in wd.handles():
        try:
            wd.switch(handle)
            if "agentseller.temu.com" not in (wd.url() or ""):
                continue
            value = wd.js("""
            const api = window.__TEMU_IMG_BOT_API__;
            if (!api) return null;
            const job = api.getCarouselJob();
            return job ? JSON.stringify(job) : null;
            """)
            if value:
                data = json.loads(value)
                if data.get("ids") == IDS and data.get("status") == "done":
                    raw = value
                    break
        except Exception:
            continue
    assert raw, "没有找到已完成的批量任务"
    job = json.loads(raw)
    print(json.dumps(job, ensure_ascii=False, indent=2))
    assert len(job.get("results") or []) == 2, job
    first, second = job["results"]
    assert first["id"] == "9542570366", first
    assert first["wraps"] == 4 and first["counts"] == [7, 5, 5, 5], first
    assert second["id"] == "45687392555", second
    assert second["wraps"] == 1 and second["counts"] == [5], second
    assert "未提交" in job.get("progress", ""), job
    print("批量+多色结果复核: OK")


if __name__ == "__main__":
    main()
