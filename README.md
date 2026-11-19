# ChatGPT Projects · 跨境电商自动化工具箱

**把重复的 Temu 操作、页面研究和商品视觉生产，变成可检查、可复用、可迁移的工具。**

[English](README.en.md) · [快速开始](#三分钟体验) · [项目目录](#项目目录) · [迁移指南](项目迁移包清单.md)

这不是一份提示词合集。

这里是一组已经拆到源码、浏览器扩展、测试、运行说明和迁移清单的实用项目。
你可以直接加载扩展、启动本地网页、处理商品数据，也可以把其中的流程拆走，
改造成自己的运营系统。

最近更新：2026-11-19

<p align="center">
  <img src="browser-tools/batch-traffic-accelerator/demo-preview.png" alt="Temu batch traffic accelerator demo" width="920">
</p>

<p align="center">
  <sub>批量流量加速 Demo：规则筛选、价格与毛利预演、分批执行和结果记录。</sub>
</p>

## 为什么值得收藏

很多自动化项目停在截图、Prompt 或半成品脚本。这个仓库关注的是“最后能不能跑起来”：

- **源码完整**：浏览器扩展包含 manifest、页面脚本、侧边栏和测试。
- **结果可解释**：价格、毛利、市场容量和任务状态由脚本计算，不靠模型编造。
- **默认更安全**：先预览、再小批量、保留失败记录，结果未知时不盲目重试。
- **方便迁移**：依赖、环境变量、缓存目录、密钥边界和换电脑步骤都有说明。
- **中英双语**：中文首页和英文介绍同步维护，方便公开分享和团队协作。

## 三分钟体验

### 1. 先看一个真实交互 Demo

```powershell
git clone https://github.com/leboy77/chatgpt-projects.git
cd chatgpt-projects
Start-Process .\browser-tools\batch-traffic-accelerator\demo\preview.html
```

不需要安装依赖，不需要连接店铺账号。

### 2. 启动 Visual Forge 本机工作台

```powershell
cd creative-tools\visual-forge-studio\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m visualforge serve
```

打开：

```text
http://127.0.0.1:8765/
```

默认使用本地演示模型，不消耗外部 API 额度。

### 3. 找到适合你的入口

完整安装和操作说明：

- [使用入口与操作方法](USAGE.md)
- [全部项目迁移清单](项目迁移包清单.md)
- [Codex 聊天记录导出](chat-tools/codex-history-export/)

## 适合谁

- 正在运营 Temu 美国、欧洲站点，想减少重复操作的团队。
- 想把核价、下架、复色和图片流程工具化的业务负责人。
- 需要研究浏览器页面、DOM、CDP 和电商工作流的开发者。
- 想参考“从 AI 对话到可执行工具”完整落地过程的人。

## 项目目录

### Temu 运营

| 项目 | 解决什么问题 |
| --- | --- |
| [全球价格申报核价助手](temu-operations/price-checker/) | 批量导入 SKC 与国家价格，比较平台价和申报价，支持预览、分批、暂停和重试。 |
| [下架助手合集](temu-operations/downlist-assistant/) | 处理下架、主图归档、广告花费监控、Excel 清单和旧版本地助手。 |
| [商品自动复色助手](temu-operations/auto-recolor/) | 批量新增色值、补主图与背面图、填写规格、提交任务并回写状态。 |

### 采集、分析与浏览器工具

| 项目 | 解决什么问题 |
| --- | --- |
| [Temu 商品首图采集器](reverse-engineering/temu-image-collector/) | 采集首图和轮播图，导出标题，过滤推荐区和广告，生成 ZIP。 |
| [批量流量加速 Demo](browser-tools/batch-traffic-accelerator/) | 按流量、转化、价格和毛利筛选商品，预演让价影响并模拟批量执行。 |
| [Chrome CDP 页面探针](browser-tools/chrome-cdp-probe/) | 用 Python 标准库连接 Chrome DevTools Protocol，检查页面和网络事件。 |

### 视觉与创意生产

| 项目 | 解决什么问题 |
| --- | --- |
| [Visual Forge Studio](creative-tools/visual-forge-studio/) | POD 视觉生产后端与 Muse 扩展，支持 Logo 换色、商品配色、产品裂变、质检和归档。 |
| [暖砂图腾背景生成器](creative-tools/background-generator/) | 用 Python 和 Pillow 生成可复现的商品背景图。 |

### AI 工作流

| 项目 | 解决什么问题 |
| --- | --- |
| [Codex History Export](chat-tools/codex-history-export/) | 把本机 Codex 会话导出为 Markdown、JSONL、附件和 SHA-256 校验清单。 |
| [Temu SOP 与市场研究](https://github.com/leboy77/temu-sop-agent-toolkit) | 独立仓库，包含欧洲 Y2、美国 Y1 POD 的市场分析与运营框架。 |

## 这个仓库的设计原则

> **确定性的计算交给脚本，模型负责解释；高风险动作交给人工确认。**

- 价格、销量窗口、集中度和任务状态必须可追溯。
- 不把累计销量当成近 30 天销量。
- 不绕过验证码、平台风控和访问限制。
- 自动操作先预览、小批量验证，再扩大范围。
- 不提交 Cookie、API Key、客户数据、运行数据库和未脱敏聊天记录。

## 仓库结构

```text
temu-operations/       Temu 核价、下架、广告监控和自动复色
reverse-engineering/   Temu 页面与图片采集分析
browser-tools/         浏览器扩展和 DevTools Protocol 工具
creative-tools/        Visual Forge、Muse 扩展和图像生成
chat-tools/            Codex 聊天历史迁移
archive/               空目录与归档说明
USAGE.md               所有项目的打开方式
项目迁移包清单.md       跨电脑迁移和依赖核对
```

## 使用边界

项目用于自有业务工具开发、流程验证和工程参考。正式操作前，请确认账号权限、
平台规则、数据边界、图片版权和图案商用授权。

如果这些工具帮你节省了时间，欢迎点一个 Star，让更多正在做跨境电商自动化的人找到它。
