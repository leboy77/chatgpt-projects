# Visual Forge Studio

面向 POD 商品团队的图片生产工作区，包含两个可独立使用的部分：

- `backend/`：Python 本机批量视觉生产服务，支持 Logo 换色、多 Logo 同色、商品裂变、印花套图和本地任务队列。
- `muse-extension/`：Visual Forge for Muse `0.13.1`，支持图片与视频任务、精确校色、质检、ZIP 和目录归档。
- `dashboard/`：团队图片汇总看板，支持用户、项目、任务、图片、筛选、下载和统计。

两个部分共享产品和技术基线，运行方式不同：

- 当前 Muse 扩展为纯扩展运行，不依赖 Python 后端。
- Python 后端用于本机 API、旧版本兼容和图像算法参考。
- 模型 Key 只能通过本机环境变量或扩展设置保存，不应提交到仓库。

具体打开方式见 [统一使用入口](../../USAGE.md)：

- 后端打开 `http://127.0.0.1:8765/`。
- Muse 扩展从浏览器扩展页加载 `muse-extension/`。
- 团队看板从 `dashboard/` 启动，默认监听 `8766`。

## 文档

- [产品需求](docs/PRD.md)
- [技术设计](docs/技术设计文档.md)
- [变更记录](docs/CHANGELOG.md)
- [Muse 功能走查](docs/tuoluo-feature-map.md)
- [团队看板系统设计](docs/团队看板系统设计.md)

## 快速验证

后端：

```powershell
cd backend
python -m unittest discover -s tests -v
```

扩展：

```powershell
cd muse-extension
node --test .\tests\local-core.test.js `
  .\tests\local-archive.test.js `
  .\tests\local-model.test.js `
  .\tests\manifest.test.js `
  .\tests\command-parser.test.js `
  .\tests\prompt-templates.test.js `
  .\tests\muse-response.test.js `
  .\tests\zip-builder.test.js
```

团队看板：

```powershell
cd dashboard
python server.py --host 127.0.0.1 --port 8766
```

正式运行前请阅读各部分 README、模型输入一致性限制和目录授权说明。
