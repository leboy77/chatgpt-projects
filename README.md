# ChatGPT Projects Archive

这里汇总整理 ChatGPT 工作目录中已完成的项目。仓库按用途分为 Temu 运营工具、逆向分析、浏览器工具和创意工具；Temu 下架助手内部又拆分为多个独立子项目。

最近同步：2026-11-03。

不知道从哪个入口开始，先看 [使用入口与操作方法](USAGE.md)。

## 项目导航

| 分类 | 项目 | 原目录 | 主要内容 |
| --- | --- | --- | --- |
| Temu 运营工具 | [全球价格申报核价助手](temu-operations/price-checker/) | `美区自动核价` | Chrome 扩展、核价规则、SKC/国家价格导入、测试与文档 |
| Temu 运营工具 | [下架助手合集](temu-operations/downlist-assistant/) | `下架保存` | 自动下架扩展、广告花费监控、表格工具和旧版原生助手 |
| Temu 运营工具 | [商品自动复色助手](temu-operations/auto-recolor/) | `temu自动复色` | 批量新增色值、补图、提交、任务队列、材质图和诊断工具 |
| 逆向分析 | [Temu 商品首图采集器](reverse-engineering/temu-image-collector/) | `temu图片下载逆向` | 首图/轮播图采集、商品标题导出、推荐区过滤、逆向报告和调试工具 |
| 浏览器工具 | [Chrome CDP 页面探针](browser-tools/chrome-cdp-probe/) | `测试` | 仅依赖 Python 标准库的 Chrome DevTools Protocol 客户端 |
| 浏览器工具 | [批量流量加速 Demo](browser-tools/batch-traffic-accelerator/) | `批量流量加速` | 流量规则筛选、价格与毛利预演、分批执行、CSV 导出和侧边栏 Demo |
| 创意工具 | [暖砂图腾背景生成器](creative-tools/background-generator/) | `New project` | 程序化生成商品背景图和示例成品 |
| 创意工具 | [Visual Forge Studio](creative-tools/visual-forge-studio/) | `整理`、`MUSE知识库` | POD 视觉生产后端、Muse 扩展、校色质检、文档和测试 |
| 空项目记录 | [空目录说明](archive/README.md) | `日常` | 原目录没有文件，因此没有可上传内容 |

## 仓库整理规则

- 保留各项目的源码、文档、扩展构建产物、模板和必要测试代码。
- 不提交 `node_modules`、Python 缓存、本地浏览器配置、临时测试输出、下载结果和浏览记录。
- 不提交可能包含账号、商品或运行状态的截图、采集结果和临时 JSON。
- 原项目目录没有被修改；本仓库中的内容是经过分类和清理的副本。

## 使用提醒

Temu 相关项目会操作商家后台。正式运行前请先阅读各项目文档并使用预览或试运行模式，遵守平台规则，并确认账号、价格、商品和图片数据的处理权限。
