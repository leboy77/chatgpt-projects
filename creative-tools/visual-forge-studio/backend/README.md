# Visual Forge 视觉生产自动化框架

这是一个可在本机直接运行的批量视觉生产 MVP，统一覆盖：

> 从扩展 `0.4.0` 起，Muse 扩展已改为纯扩展运行，不再连接本机 `127.0.0.1:8765`。本后端保留为独立本机工具、旧版本兼容和算法参考，不是当前扩展的必要组件。

产品、技术和变更基线统一维护在：

- `../docs/PRD.md`
- `../docs/技术设计文档.md`
- `../docs/CHANGELOG.md`

修改后端功能时必须同步更新上述文档。

## MUSE Visual Forge Studio

当前默认首页已经升级为面向 POD 商品团队的工作台：

- 类目化创作首页与深色三段式生产界面。
- 产品视觉裂变、Logo 多色、多 Logo 同色和商品多色四条真实任务入口。
- 创作历史、素材资产、模板配置、工厂切片、积分和账户页面。
- 浏览器本地演示登录，不替代正式环境中的服务端鉴权和租户隔离。
- 原版简洁生产页仍可从 `/classic` 打开。

启动服务后访问：

```text
http://127.0.0.1:8765/
```

完整功能走查、原站入口状态和待补业务素材见：

```text
..\docs\tuoluo-feature-map.md
```

浏览器冒烟测试使用 Edge DevTools Protocol，会实际进入工作台并提交一条产品视觉任务：

```powershell
# 先启动带调试端口的无头 Edge，再运行：
$env:CDP_PORT = "9224"
node .\tests\studio-browser-smoke.js
```

1. **单 Logo · 多色**：一个透明或纯色背景 Logo 生成多个品牌色版本。
2. **单色 · 多 Logo**：多个 Logo 文件统一换成同一个品牌色。
3. **单款 · 文生图与裂变**：从产品描述生成多个棚拍、生活方式、材质特写等场景版本。

所有任务都进入持久化队列，输出 PNG、`manifest.json`、`manifest.csv` 和 ZIP 下载包。默认使用离线演示模型，不消耗外部 API。网页与任务 API 基于 Python 标准库，唯一第三方运行时依赖是 Pillow。

## 快速启动

需要 Python 3.10+。

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m visualforge serve
```

打开 <http://127.0.0.1:8765>。任务数据默认保存在 `data/`，该目录已被 Git 忽略。

也可以直接安装命令行入口：

```powershell
python -m pip install -e .
visualforge serve
```

## 三个生产入口

网页端：

- 单 Logo 多色支持一次输入最多 30 个颜色，格式为 `#111111, #F4EFE6, #D4684F`。
- 单色多 Logo 支持一次上传最多 100 个文件。
- 产品裂变支持 1 到 12 张，预设比例为 1:1、3:2、2:3。

命令行：

```powershell
# 一个 Logo，多色
python -m visualforge logo-colors `
  --input .\samples\logo.png `
  --colors "#111111,#F4EFE6,#D4684F" `
  --output .\output\logo-colors

# 多 Logo，一色
python -m visualforge logo-color `
  .\samples\logo-a.png .\samples\logo-b.png `
  --color "#D4684F" `
  --output .\output\logo-batch

# 单款文生图与 4 个场景裂变
python -m visualforge generate `
  --prompt "极简白色陶瓷咖啡杯，哑光釉面，弧线手柄，保持产品外观和比例一致" `
  --count 4 `
  --output .\output\product-variants
```

## 接入真实图片模型

复制环境变量模板并填入图片模型 Key：

```powershell
Copy-Item .env.example .env
```

```dotenv
IMAGE_PROVIDER=openai
IMAGE_API_BASE_URL=https://api.openai.com/v1
IMAGE_API_KEY=sk-...
IMAGE_MODEL=gpt-image-1
```

接口适配器位于 `visualforge/providers.py`。当前支持：

- `mock`：本地确定性演示图，用于开发、队列测试和离线验收。
- `openai`：OpenAI Images API，以及请求/响应结构相同的兼容接口。

适配器只依赖 `generate(prompt, size, quality) -> PNG/JPEG bytes` 这一最小协议。接入 ComfyUI、Flux、Stable Diffusion 或企业内网模型时，新增一个实现该协议的类，并在 `build_provider()` 注册即可，不需要改任务队列或页面。

> 文生图模型不能天然保证多张图的商品结构完全一致。正式商品生产中，应接入支持参考图/图生图的模型，并将产品主图作为编辑输入；“锁定产品一致性”提示词只能降低漂移，不能替代图生图或局部蒙版控制。

## 处理逻辑

Logo 换色不是简单的颜色映射：

- 已有透明通道的图片会保留抗锯齿边缘，只替换 RGB，不破坏 alpha。
- 纯色背景会从边缘做连通区域识别，再移除背景，避免把图形内部的白色细节一并删掉。
- 默认裁切透明边界并保留 12px 安全边距。
- 输出每张图片均计算 SHA-256，清单中包含源文件、颜色、尺寸和哈希。

产品裂变会自动组合 8 个场景方向并循环使用：

`studio`、`lifestyle`、`detail`、`seasonal`、`editorial`、`flat_lay`、`outdoor`、`gift`。

## API

启动服务后可直接调用：

```text
POST /api/jobs                      创建任务（multipart）
GET  /api/jobs                      最近任务
GET  /api/jobs/{id}                 任务状态与结果
GET  /api/jobs/{id}/download        下载 ZIP
GET  /api/health                    服务与模型状态
```

创建任务的表单字段：

| 字段 | 说明 |
| --- | --- |
| `kind` | `logo_recolor`、`logo_color_batch`、`product_generate` |
| `options` | JSON 字符串，参数见下 |
| `files` | Logo 图片；产品裂变可不传 |

Logo 多色：

```json
{"colors":["#111111","#D4684F"],"remove_background":"auto","trim":true}
```

多 Logo 一色：

```json
{"color":"#D4684F","remove_background":"auto","trim":true}
```

产品裂变：

```json
{"prompt":"极简白色陶瓷杯","count":4,"size":"1024x1024","quality":"high"}
```

如需使用指定的裂变提示词，可传 `prompts` 字符串数组替代自动场景模板。

Muse 页面连接器位于 `../muse-extension/`。加载该 Chromium 扩展后，可在 Muse 对话框输入 `/vf` 指令；连接器只处理用户主动提交的命令，不读取普通聊天内容。

商品多色链路使用：

```text
/vf product-colors #1D2A44,#8C1A2D,#6B6F45 --names 藏青,酒红,橄榄绿 --region lower
```

Muse 按色号逐张生成商品图；Visual Forge 随后通过商品差异区域自动识别或用户遮罩提取目标区域，以保留纹理和明暗的方式校正到目标 HEX，并用 ΔE2000 输出 `pass`、`review`、`retry` 质检结果。每个任务同时生成 Muse 原图、遮罩、校色图、横向对比图及 JSON/CSV 清单。

产品裂变的“印花套图”支持白底商品图加参考图文件夹：参考图按 24MB 自动分批并归档为小于 25MB 的 ZIP，每张参考图单独生成一张新图。可选择逐张稳定模式，或每批最多 4 张的 Muse Agent 批量模式。批量模式严格核对独立图片数量，禁止拼图；数量不匹配时停止自动映射以避免串图。可选择保持原始背景或让背景随印花风格变化。

成功任务会自动归档到桌面 `VisualForge商品图` 文件夹，并按日期和任务建立子文件夹。可通过 `VISUALFORGE_EXPORT_DIR` 修改统一归档位置。

印花套图的归档目录会进一步拆分为同级的 `生成图` 和 `拼图与清单` 两个子文件夹；后者包含对比拼图、README、JSON 和 CSV。

## 工程结构

```text
visualforge/
  server.py       HTTP 服务、上传与 ZIP 下载
  pipelines.py    三类生产流水线
  imaging.py      透明通道、抠边、换色、清单
  providers.py    图像模型适配器
  store.py        SQLite 持久化任务队列
  worker.py       异步 worker、重试、重启恢复
  web/            无构建步骤的本地操作端
tests/            单元测试与服务端端到端测试
```

运行测试：

```powershell
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
```

## 上线前必须补充

当前版本定位为单机自动化 MVP：

- 面向公网部署前，增加登录鉴权、租户隔离、限流与上传病毒扫描。
- 多机部署时，将本地 worker 轮询替换为 Redis/Celery、RQ 或云任务队列。
- 若产品生产要求高一致性，扩展 provider 的参考图/图生图接口、遮罩编辑和人工审核节点。
- 正式商用前，补充模型供应商的数据合规、版权、人物与品牌元素审核策略。

