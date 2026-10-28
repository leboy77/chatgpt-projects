"""验证 SKC/SPU 表头识别，并在 TEMU 列表页真实执行一次 SPU 查询。"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402

LIST_URL = "https://agentseller.temu.com/goods/list#temu-image-bot"
SPU = "2368489203"
SHOT = os.path.join(os.getcwd(), "probes", "shots", "v098_spu_query.png")


def wait_api(wd):
    for _ in range(25):
        time.sleep(1)
        try:
            if wd.js("return !!(window.__TEMU_IMG_BOT_API__ && document.getElementById('temu-image-bot-host'));"):
                return
        except Exception:
            pass
    raise RuntimeError("扩展面板未就绪")


def main():
    wd = bb.connect()
    tab = wd.new_tab(LIST_URL)
    time.sleep(6)
    wd.switch(tab)
    wait_api(wd)

    parsed = json.loads(wd.js("""
    const api = window.__TEMU_IMG_BOT_API__;
    const skcOnly = api.extractProductEntries([['SKC ID','状态'],['90452917260','']], 'SPU');
    const spuOnly = api.extractProductEntries([['SPU ID','状态'],['2368489203','']], 'SKC');
    const both = api.extractProductEntries([['SKC ID','SPU ID','状态'],['90452917260','2368489203','']], 'SPU');
    return JSON.stringify({
      skcOnly: {type:skcOnly.idType, ids:skcOnly.entries.map(x=>x.id)},
      spuOnly: {type:spuOnly.idType, ids:spuOnly.entries.map(x=>x.id)},
      both: {type:both.idType, ids:both.entries.map(x=>x.id), col:both.idCol}
    });
    """))
    assert parsed["skcOnly"] == {"type": "SKC", "ids": ["90452917260"]}, parsed
    assert parsed["spuOnly"] == {"type": "SPU", "ids": [SPU]}, parsed
    assert parsed["both"]["type"] == "SPU" and parsed["both"]["ids"] == [SPU], parsed
    print("表头自动识别:", parsed)

    wd.js("""
    const api = window.__TEMU_IMG_BOT_API__;
    api.state.status = 'running';
    api.state.skcTimedOut = false;
    window.__spuResult = null;
    api.listSearchProduct(arguments[0], 'SPU')
      .then(result => { window.__spuResult = {ok:true, spu:result.spu}; })
      .catch(error => { window.__spuResult = {ok:false, error:String(error && error.message || error)}; });
    return 'started';
    """, [SPU])
    result = None
    for _ in range(30):
        time.sleep(1)
        raw = wd.js("return window.__spuResult ? JSON.stringify(window.__spuResult) : '';")
        if raw:
            result = json.loads(raw)
            break
    assert result and result.get("ok"), result
    assert result.get("spu") == SPU, result
    page = json.loads(wd.js("""
    const inputs = [...document.querySelectorAll('input')];
    const type = inputs.find(i => ['SKC','SKU','SPU'].includes(i.value));
    const search = inputs.find(i => i.placeholder === '多个查询请空格或逗号依次输入');
    return JSON.stringify({type:type ? type.value : '', value:search ? search.value : ''});
    """))
    assert page["type"] == "SPU" and page["value"] == SPU, page
    print("真实 SPU 查询: OK", result, page)
    print("截图:", wd.screenshot(SHOT))
    wd.close_tab(tab)


if __name__ == "__main__":
    main()
