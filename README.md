# ChatGPT Projects

一个面向跨境电商、浏览器自动化、视觉生产与 AI 工作流整理的项目合集。

[English](README.en.md) | 中文

## 项目简介

本仓库收录 8 个可运行项目和 1 个聊天历史迁移工具，覆盖 Temu 运营、页面分析、
浏览器扩展、POD 视觉生产、本地脚本和 Codex 会话归档。

所有项目都强调三点：

- **可执行**：包含源码、模板、测试和运行说明，不只保留想法或截图。
- **可迁移**：依赖、环境变量、启动方式、排除文件和迁移风险均有清单。
- **需复核**：涉及平台操作、价格、合规、图片版权和模型输出时，必须人工确认。

配套的 Temu SOP 与市场研究仓库：
[temu-sop-agent-toolkit](https://github.com/leboy77/temu-sop-agent-toolkit)

最近更新：2026-11-17

## 快速入口

- [使用入口与操作方法](USAGE.md)：说明每个项目从哪里打开、如何安装和第一次使用。
- [全部项目迁移清单](项目迁移包清单.md)：换电脑或迁移环境时逐项核对依赖和风险。
- [Codex 聊天记录导出](chat-tools/codex-history-export/)：导出 Markdown、JSONL、附件和校验清单。

## 项目分类

### Temu 运营工具

| 项目 | 说明 |
| --- | --- |
| [全球价格申报核价助手](temu-operations/price-checker/) | 批量导入 SKC 和国家价格，比较平台价与申报价，支持预览、分批、暂停和重试。 |
| [下架助手合集](temu-operations/downlist-assistant/) | 自动下架、主图归档、广告花费监控、表格辅助和旧版本地助手。 |
| [商品自动复色助手](temu-operations/auto-recolor/) | 按 SKC/SPU 批量新增色值、补图、填写规格并提交，包含任务队列和诊断工具。 |

### 分析与浏览器工具

| 项目 | 说明 |
| --- | --- |
| [Temu 商品首图采集器](reverse-engineering/temu-image-collector/) | 采集首图和轮播图，导出商品标题，过滤推荐区和广告，并生成 ZIP。 |
| [批量流量加速 Demo](browser-tools/batch-traffic-accelerator/) | 按流量、转化、价格和毛利筛选商品，预演让价影响并模拟分批执行。 |
| [Chrome CDP 页面探针](browser-tools/chrome-cdp-probe/) | 仅依赖 Python 标准库的 Chrome DevTools Protocol 客户端。 |

### 创意与视觉生产

| 项目 | 说明 |
| --- | --- |
| [Visual Forge Studio](creative-tools/visual-forge-studio/) | POD 视觉生产后端与 Muse 扩展，支持 Logo 换色、商品配色、产品裂变、校色质检和归档。 |
| [暖砂图腾背景生成器](creative-tools/background-generator/) | 使用 Python 和 Pillow 生成可复现的商品背景图。 |

### AI 工作流与迁移

| 项目 | 说明 |
| --- | --- |
| [Codex History Export](chat-tools/codex-history-export/) | 导出本机 Codex 会话的可读稿、原始 JSONL、附件、索引和 SHA-256 清单。 |

## 推荐使用顺序

1. 阅读对应项目的 `README.md` 和已知限制。
2. 先用演示、预览或观察模式验证字段、状态和导出结果。
3. 使用小样本确认页面结构、价格口径和权限。
4. 再执行真实批量操作，并保留失败记录和人工复核结果。

## 安全与范围

- 仓库不保存真实账号 Cookie、API Key、浏览器用户目录和运行数据库。
- 不包含原始内部文档、客户数据或未脱敏的聊天记录。
- Temu 操作需要遵守平台规则，不得绕过验证码、风控或访问限制。
- 自动复色、下架、流量加速和广告操作都应在小样本验证后再扩大范围。
- 商品图片、商标和图案的版权与商用授权由使用者确认。

## 仓库结构

```text
temu-operations/       Temu 核价、下架、广告监控和自动复色
reverse-engineering/   Temu 页面与图片采集分析
browser-tools/         浏览器扩展和 DevTools Protocol 工具
creative-tools/        Visual Forge、Muse 扩展和图像生成脚本
chat-tools/            Codex 聊天历史迁移
archive/               空目录和归档说明
USAGE.md               所有项目的打开方式
项目迁移包清单.md       跨电脑迁移指南
```

本项目主要用于自有业务工具开发、流程验证和工程归档。使用前请确认账号权限、
平台规则、数据边界和内容授权。
