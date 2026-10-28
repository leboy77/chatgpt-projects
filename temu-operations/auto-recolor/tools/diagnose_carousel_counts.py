"""检查当前编辑页各色值的轮播图 DOM 与实际渲染数量。"""
import json
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.join(os.getcwd(), "tools"))
import bb  # noqa: E402


def main():
    wd = bb.connect()
    for handle in wd.handles():
        try:
            wd.switch(handle)
            parsed = urllib.parse.urlparse(wd.url() or "")
            if parsed.hostname != "agentseller.temu.com" or "/goods/edit" not in parsed.path:
                continue
            if not wd.js("return !!window.__TEMU_IMG_BOT_API__;"):
                continue
            raw = wd.js("""
            const api=window.__TEMU_IMG_BOT_API__;
            const rows=api.specRows();
            const inspect=()=>rows.map((tr,index)=>{
              const cell=document.getElementById(`productSkcList[${index}].carouselImgsI18n.common`);
              const imgs=cell ? [...cell.querySelectorAll('img')] : [];
              const backgrounds=cell ? [...cell.querySelectorAll('*')]
                .map(el=>getComputedStyle(el).backgroundImage)
                .filter(value=>value && value !== 'none') : [];
              return {
                index,
                color:api.rowColorName(index),
                apiCount:api.carouselImgCount(index),
                cellExists:!!cell,
                visible:cell ? !!(cell.getBoundingClientRect().width || cell.getBoundingClientRect().height) : false,
                rect:cell ? (()=>{const r=cell.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}})():null,
                imgCount:imgs.length,
                imgSrcs:imgs.map(img=>img.currentSrc || img.src).filter(Boolean),
                backgrounds:backgrounds.slice(0,10),
                html:cell ? cell.innerHTML.replace(/\\s+/g,' ').slice(0,1000) : ''
              };
            });
            const before=inspect();
            const table=api.specRows()[0] && api.specRows()[0].closest('table');
            if(table) table.scrollIntoView({block:'center',behavior:'instant'});
            return JSON.stringify({before, tableFound:!!table, state:{
              status:api.state.status, phase:api.state.phase, cursor:api.state.cursor,
              current:api.state.current, error:api.state.error
            }}, null, 2);
            """)
            print(raw)
            import time
            time.sleep(2)
            print("SCROLLED:", wd.js("""
            const api=window.__TEMU_IMG_BOT_API__;
            return JSON.stringify(api.specRows().map((tr,index)=>({
              index,color:api.rowColorName(index),count:api.carouselImgCount(index),
              y:Math.round(tr.getBoundingClientRect().y)
            })), null, 2);
            """))
            return
        except Exception:
            continue
    raise SystemExit("找不到暂停的 TEMU 编辑页")


if __name__ == "__main__":
    main()
