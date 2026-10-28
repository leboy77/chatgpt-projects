"""验证精确主图计划：成功项跳过、失败项固定分配、缺图及时报错。"""
import json
import os
import sys
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

    result = json.loads(wd.js("""
    const api = window.__TEMU_IMG_BOT_API__;
    const old = {
      skcs: api.state.skcs,
      statuses: api.state.skcStatuses,
      config: api.state.config,
      used: api.state.usedFrontImages,
      plan: api.state.imagePlan,
      backs: api.state.backPlanNames
    };
    api.state.skcs = ['a', 'b', 'c'];
    api.state.skcStatuses = {
      a: {status:'提交成功'},
      b: {status:'失败：测试'},
      c: {status:'待处理'}
    };
    api.state.config = {...api.state.config, n:2, x:2};
    api.state.usedFrontImages = ['f1'];
    api.state.imagePlan = {};
    api.state.backPlanNames = ['back1', 'back2'];
    const files = [1,2,3,4,5,6,7].map(i => ({name:'f' + i + '.jpg'}));
    const allocated = api.allocateFrontPlan(files);

    api.state.imagePlan = {b:{frontNames:['f2','f3'], backNames:['back1','back2']}};
    const assigned = api.ensureImagePlan(files);
    let shortage = '';
    try {
      api.allocateFrontPlan(files.slice(0, 2));
    } catch (error) {
      shortage = String(error.message || error);
    }
    const output = {
      plan: allocated.plan,
      selected: allocated.selectedFiles.map(file => file.name),
      pending: allocated.pendingCount,
      ensurerAssigned: assigned,
      ensuredPlan: api.state.imagePlan,
      shortage
    };
    api.state.skcs = old.skcs;
    api.state.skcStatuses = old.statuses;
    api.state.config = old.config;
    api.state.usedFrontImages = old.used;
    api.state.imagePlan = old.plan;
    api.state.backPlanNames = old.backs;
    return JSON.stringify(output);
    """))
    assert result["pending"] == 2, result
    assert result["selected"] == ["f2.jpg", "f3.jpg", "f4.jpg", "f5.jpg"], result
    assert result["plan"]["b"]["frontNames"] == ["f2", "f3"], result
    assert result["plan"]["c"]["frontNames"] == ["f4", "f5"], result
    assert result["ensuredPlan"]["c"]["frontNames"] == ["f4", "f5"], result
    assert "主图不够" in result["shortage"], result
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("精确图片计划测试: OK")


if __name__ == "__main__":
    main()
