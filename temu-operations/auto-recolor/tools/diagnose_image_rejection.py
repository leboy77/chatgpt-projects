"""读取当前图片合规弹窗、正在处理的商品计划和最近日志。"""
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
            if not wd.js("return !!window.__TEMU_IMG_BOT_API__;"):
                continue
            raw = wd.js("""
            const api = window.__TEMU_IMG_BOT_API__;
            const currentId = api.state.current && api.state.current.skc;
            const plan = currentId && api.state.imagePlan ? api.state.imagePlan[currentId] : null;
            const visited = [];
            const walk = (root, path) => {
              for (const el of root.querySelectorAll('*')) {
                const r = el.getBoundingClientRect();
                const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
                if (r.width > 0 && r.height > 0 && (/图片品质不佳|图片品质/.test(text)
                  || text === '取消' || text === '删除后继续上传')) {
                  visited.push({
                    path,
                    tag: el.tagName,
                    cls: String(el.className || '').slice(0, 120),
                    role: el.getAttribute('role') || '',
                    text: text.slice(0, 260),
                    rect: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}
                  });
                }
                if (el.shadowRoot) walk(el.shadowRoot, path + ' > ' + el.tagName.toLowerCase() + '#shadow');
              }
            };
            walk(document, 'document');
            for (const frame of document.querySelectorAll('iframe')) {
              try {
                if (frame.contentDocument) walk(frame.contentDocument, 'iframe');
              } catch (_) {}
            }
            const qualityCandidates = visited.filter(item => /图片品质不佳/.test(item.text));
            const modal = qualityCandidates.sort((a, b) => a.text.length - b.text.length)[0] || null;
            const allImages = [...document.querySelectorAll('img')].map(img => ({
              src: img.currentSrc || img.src,
              width: img.naturalWidth,
              height: img.naturalHeight
            })).filter(img => img.width || img.height).slice(-20);
            return JSON.stringify({
              current: api.state.current,
              status: api.state.status,
              phase: api.state.phase,
              error: api.state.error,
              plan,
              backMaterialNames: api.state.backMaterialNames,
              modalCandidates: qualityCandidates,
              cancelCandidates: visited.filter(item => item.text === '取消'),
              visibleNodes: visited,
              modalImages: allImages,
              logs: (api.state.logs || []).slice(-35).map(x => x.line)
            }, null, 2);
            """)
            print(raw)
            return
        except Exception:
            continue
    raise SystemExit("未找到插件页面")


if __name__ == "__main__":
    main()
