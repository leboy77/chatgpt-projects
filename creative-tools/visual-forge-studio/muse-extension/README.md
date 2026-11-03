# Visual Forge for Muse

版本：`0.4.1`

这是一个 Chromium Manifest V3 扩展。它把 Muse 页面作为图片生成入口，并在扩展内部完成任务历史、图片处理、精确校色、ΔE2000 质检、ZIP 和目录归档。

当前版本**不需要启动 Python 后端，不调用 `127.0.0.1:8765`，也不依赖 `.env` 文件**。

产品和技术基线：

- `..\docs\PRD.md`
- `..\docs\技术设计文档.md`
- `..\docs\CHANGELOG.md`

修改扩展功能时必须同步更新上述文档。

## 首次配置

### 1. 安装扩展

1. 在 BitBrowser 或 Chrome 打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择：

```text
..\muse-extension
```

5. 打开或刷新 <https://muse.ai/>。
6. 点击扩展工具栏图标，打开页面内 `VF` 挂件。

扩展更新后需要执行：

1. 在 `chrome://extensions` 点击扩展“重新加载”。
2. 刷新 Muse 页面。

### 2. 选择归档目录

在挂件顶部点击“自动保存到授权目录”右侧的“选择”：

1. 扩展会打开独立的目录授权页。
2. 点击“选择或重新授权目录”。
3. 在系统窗口中选择任意可写文件夹。
4. 关闭授权页并返回 Muse。

后续任务会在授权文件夹中自动创建任务目录。

浏览器重启、扩展重载或浏览器撤销目录权限后，需要重新打开目录授权页并确认权限。已完成任务仍保留在 IndexedDB 中，可以通过任务卡重新授权并保存。

### 3. 配置图片模型

点击挂件右上角设置，打开扩展选项页：

- 演示模式：使用扩展内置占位图，不访问网络、不消耗模型额度。
- OpenAI 兼容模式：填写 API 地址、模型名称和 API Key。

默认示例：

```text
API 地址：https://api.openai.com/v1
模型名称：gpt-image-1
```

保存时会请求该模型域名的可选网络权限。API Key 保存在 `chrome.storage.local`。

> 当前产品按需求暂不提供 Windows Credential Manager、DPAPI 或 Native Messaging。任何能读取扩展数据的人都可能取得该 Key，因此不要在共享电脑或不可信浏览器配置中使用高权限密钥。

## 功能

### 商品配色

1. 添加一张商品主图。
2. 输入一个或多个 HEX 色号。
3. 可使用原生取色器、屏幕吸色、主图吸色和最近颜色。
4. 可选上传商品遮罩，选择商品主体、上装或下装。
5. Muse 对每个色号单独生成一张图片。
6. 扩展使用 Canvas 像素处理把商品区域校正到指定 HEX。
7. 计算 sRGB、Lab 和 ΔE2000：
   - `ΔE <= 3`：通过
   - `3 < ΔE <= 5`：复核
   - `ΔE > 5`：需重试
8. 成功结果自动保存到授权目录。
9. 失败色号可单独重试。

每个商品颜色输出：

```text
NN-色号.png              精确校色成品
NN-色号-muse-raw.png     Muse 原始结果
NN-色号-mask.png         实际使用遮罩
contact-sheet.png        颜色对比图
manifest.json
manifest.csv
README.txt
```

### Logo 多色

一个 Logo 生成最多 30 个颜色版本。扩展保留透明通道，不破坏抗锯齿边缘；纯色背景可自动去除。

### 多 Logo 同色

一次处理最多 100 个 Logo，并统一替换成同一个目标色。单个文件失败不会阻止其他文件处理。

### 产品文生图与裂变

直接由扩展调用所配置的图片模型：

- 一次生成 1-12 张。
- 支持 `1024x1024`、`1536x1024`、`1024x1536`。
- 自动使用 8 个场景方向：棚拍、生活方式、材质特写、节日、杂志、平铺、户外、礼品。
- 每张图片单独调用一次模型。
- 演示模式由 Canvas 本地生成确定性占位图。

### 印花套图

输入：

- 1 张白底商品图。
- 1 个参考图文件夹。

扩展会在浏览器内：

1. 过滤非图片和超过 24MB 的单张参考图。
2. 按文件名排序，最多处理前 200 张。
3. 每批最多 4 张，原始总大小尽量不超过 24MB。
4. 生成必须小于 25MB 的 ZIP；超出时继续拆分。
5. 逐张模式每次给 Muse 一张参考图。
6. 4 张 Agent 模式每批上传白底图和 ZIP，要求 Muse 返回数量一致的独立图片。
7. 批量结果数量不符、等待不完整或出现 `Delivery not confirmed` 时，不映射错误图片，自动降级为逐张生成。
8. 每张参考图只输出一张新图，禁止拼图和九宫格。
9. 保持白底图背景，或让背景随印花风格改变。
10. 失败参考图可单独重试。

## Muse 对话指令

```text
/vf colors #111111,#FFFFFF [--sku 货号]
/vf color #D4684F [--sku 货号]
/vf generate 产品描述 --count 4 --size 1024x1024 --quality high [--sku 货号]
/vf product-colors #1D2A44,#8C1A2D --names 藏青,酒红 --region lower [--sku 货号]
```

扩展只拦截用户主动输入并以 `/vf` 开头的消息，不读取历史聊天或普通对话。

## 任务历史和存储

任务记录保存在扩展 IndexedDB：

```text
visualforge-extension
├─ jobs      任务状态、参数、输出元数据和缩略图
├─ assets    原始图片 Blob、JSON、CSV
└─ settings  用户授权的目录 Handle
```

模型配置和最近使用颜色保存在 `chrome.storage.local`。

浏览器重启、扩展重载或 Muse 页面刷新会中断当时正在执行的生成任务；已完成任务不受影响。被中断的任务会标记为失败，需要重新开始。

## 归档结构

普通任务：

```text
授权目录\
└─ 模块名_货号_YYYY-MM-DD_HH-mm-ss\
   ├─ 输出图片
   ├─ 源图
   ├─ manifest.json
   ├─ manifest.csv
   └─ README.txt
```

印花套图一次开始只创建一个任务根目录：

```text
授权目录\
└─ 印花套图_货号_YYYY-MM-DD_HH-mm-ss\
   ├─ 生成图\
   │  ├─ 批次01_...
   │  └─ 批次02_...
   └─ 拼图与清单\
      ├─ 批次01_pattern-contact-sheet.png
      ├─ 批次01_manifest.json
      ├─ 批次01_manifest.csv
      ├─ 商品主图.png
      └─ README.txt
```

任务目录或同一秒创建的同名任务已存在时，会自动追加 `_2`、`_3`。

## 测试

语法检查：

```powershell
cd .\muse-extension
node --check .\local-core.js
node --check .\local-store.js
node --check .\local-model.js
node --check .\local-archive.js
node --check .\local-jobs.js
node --check .\background.js
node --check .\content.js
node --check .\sidepanel.js
node --check .\options.js
```

单元测试：

```powershell
node --test .\tests\local-core.test.js `
  .\tests\local-archive.test.js `
  .\tests\local-model.test.js `
  .\tests\manifest.test.js `
  .\tests\command-parser.test.js `
  .\tests\zip-builder.test.js
```

扩展消息测试：

```powershell
node .\tests\background-smoke.js
```

用带扩展加载能力的 Edge 启动调试端口后：

```powershell
node .\tests\extension-page-smoke.js 9335
```

该测试会实际加载扩展页面、创建 IndexedDB 任务并运行：

- Logo 多色。
- 商品配色和 ΔE。
- 内置产品生图。
- 印花批量归档。
- 页面重载后的历史恢复。
- 模型设置页。

完整虚拟全流程：

```powershell
node .\tests\full-flow-virtual.js
```

测试会自动启动隔离浏览器和虚拟 Muse 页面，使用虚拟目录跑完五个生产入口，不消耗真实模型额度，也不写入个人目录。

## 当前限制

- 浏览器关闭后不能继续执行生成任务。
- 扩展 Service Worker 休眠不影响已完成的 IndexedDB 数据，但不是常驻任务服务器。
- 目录授权由 File System Access API 管理，权限失效时必须重新授权。
- 模型 Key 只保存在扩展本地存储，不具备操作系统级密钥保护。
- Muse 页面改版可能影响输入框、附件、发送按钮或结果图片识别。
- 不确保恢复已经中断的模型请求或 Muse 生成请求。

