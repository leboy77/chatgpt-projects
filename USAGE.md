# 使用入口

这个仓库是分类归档，不是所有项目共用一个启动入口。先按下面的表判断要打开哪一种。

| 想使用的项目 | 从哪里打开 | 入口 |
| --- | --- | --- |
| Temu Market Lab 网页分析台 | 浏览器网页 | 专项仓库 `temu-sop-agent-toolkit/webapp/start.ps1` |
| Visual Forge 后端 | 浏览器网页 | `creative-tools/visual-forge-studio/backend/` |
| Visual Forge Muse 扩展 | 浏览器扩展 | `creative-tools/visual-forge-studio/muse-extension/` |
| 批量流量加速 Demo | 浏览器扩展或 HTML 预览 | `browser-tools/batch-traffic-accelerator/` |
| 全球价格申报核价助手 | 浏览器扩展 | `temu-operations/price-checker/dist/extension/` |
| 商品自动复色助手 | 浏览器扩展 | `temu-operations/auto-recolor/extension/` |
| Temu 下架助手 | 浏览器扩展 | `temu-operations/downlist-assistant/temu-downlist-extension/` |
| Temu 商品首图采集器 | 浏览器扩展 | `reverse-engineering/temu-image-collector/temu-image-collector/` |
| 暖砂图腾背景生成器 | 命令行 | `creative-tools/background-generator/make_background.py` |
| Chrome CDP 页面探针 | 命令行 | `browser-tools/chrome-cdp-probe/chrome_probe.py` |

## 一、浏览器扩展的通用打开方式

Chrome 或 Edge：

1. 打开 `chrome://extensions` 或 `edge://extensions`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择上表对应的扩展目录，目录内必须有 `manifest.json`。
5. 打开扩展对应的业务页面并刷新。
6. 点击浏览器工具栏中的扩展图标，或在页面右侧打开工作面板。

比特浏览器：

1. 打开“扩展中心”。
2. 选择“添加自定义扩展”。
3. 选择“添加本地扩展”。
4. 选择扩展目录。
5. 重启对应浏览器窗口后生效。

扩展升级后，通常需要在扩展管理页点击“重新加载”，然后刷新业务页面。

## 二、Temu Market Lab 网页分析台

项目位于单独的本机仓库 `temu-sop-agent-toolkit`。进入该仓库后运行：

```powershell
.\webapp\start.ps1
```

浏览器地址：

```text
http://127.0.0.1:8766/
```

使用顺序：

1. 选择美国 Y1 POD 或欧洲 Y2。
2. 选择币种、销量窗口和数据日期。
3. 上传类目 CSV、加载样本，或从浏览器插件发送采集数据。
4. 查看价格带、集中度、新上架信号和商品明细。
5. 填写业务补充后点击“OpenAI 解读”。

OpenAI Key 放在专项仓库的 `webapp/.env` 或本机环境变量
`OPENAI_API_KEY` 中，不要填写到网页或提交到 Git。

## 三、Visual Forge Studio

### 3.1 Python 后端

进入：

```powershell
cd creative-tools\visual-forge-studio\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m visualforge serve
```

浏览器打开：

```text
http://127.0.0.1:8765/
```

如果 8765 已被其他服务占用，用命令行参数修改端口，具体以项目 README 为准。

### 3.2 Muse 扩展

扩展目录：

```text
creative-tools\visual-forge-studio\muse-extension
```

使用顺序：

1. 按“浏览器扩展通用打开方式”加载扩展。
2. 打开并刷新 `https://muse.ai/`。
3. 点击扩展图标，打开 `VF` 工作面板。
4. 首次使用时选择归档目录。
5. 在设置页选择演示模式，或配置 OpenAI 兼容图片模型。
6. 从商品配色、Logo 多色、多 Logo 同色、产品裂变或印花套图中选择任务。

建议第一次先用演示模式，确认任务、图片数量、ZIP 和归档目录都正常，再配置真实模型。

## 四、批量流量加速 Demo

项目目录：

```text
browser-tools\batch-traffic-accelerator
```

快速预览：

```powershell
Start-Process .\demo\preview.html
```

作为扩展使用：

1. 加载上述项目根目录，根目录内包含 `manifest.json`。
2. 点击浏览器工具栏中的“批量流量加速 Demo”。
3. 在侧边栏中设置筛选条件、目标让价和单批商品数。
4. 点击“预演”，检查命中数、排除原因和毛利影响。
5. 点击“开始执行”，查看成功、失败和待确认记录。
6. 完成后导出 CSV。

当前版本只执行模拟流程，不会修改 Temu 真实商品价格，也不会调用内部提交接口。

## 五、Temu 运营扩展

### 全球价格申报核价助手

加载目录：

```text
temu-operations\price-checker\dist\extension
```

打开 Temu Agent Center 的“上新生命周期管理 → 价格申报中”，然后点击扩展图标。首次使用先导入 SKC Excel，核对站点、申报价和国家价格表，再开启“仅预览”检查。

### 商品自动复色助手

加载目录：

```text
temu-operations\auto-recolor\extension
```

打开 Temu 商家后台的商品列表。扩展加载后会出现右侧工作台。先阅读项目中的“初次使用公告”，准备 SKC/SPU 清单、主图和背面图，再保存准备并预检。

### Temu 下架助手

加载目录：

```text
temu-operations\downlist-assistant\temu-downlist-extension
```

打开 Temu 商品列表并刷新页面，使用页面中的下架、图片保存和任务面板。正式批量操作前先用少量 SPU 和模板文件验证。

## 六、Temu 商品首图采集器

加载目录：

```text
reverse-engineering\temu-image-collector\temu-image-collector
```

使用顺序：

1. 打开 `www.temu.com` 的商品搜索或类目列表页。
2. 点击商品卡片左侧的“采集”，或使用“全选可采集”。
3. 选择简单、多首图或完整采集模式。
4. 需要标题表时勾选“采集商品标题”。
5. 可选择保存目录，然后点击“开始采集”。
6. 完成后得到 ZIP，包含图片、`采集结果.json` 和可选的 `商品标题.xlsx`。

只处理当前已经加载的商品卡片；滚动加载后需要重新选择。

## 七、命令行小工具

### 暖砂图腾背景生成器

```powershell
cd creative-tools\background-generator
python -m pip install Pillow
python make_background.py
```

生成文件：

```text
creative-tools\background-generator\图案适配背景_暖砂图腾.png
```

### Chrome CDP 页面探针

先用调试端口启动浏览器，例如：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9333 `
  --user-data-dir="$env:TEMP\chrome-cdp-probe" `
  about:blank
```

再运行：

```powershell
python browser-tools\chrome-cdp-probe\chrome_probe.py 9333 https://example.com
```

脚本会输出页面标题、控制台事件和网络响应摘要。

## 使用顺序建议

1. 先看项目 README 和已知限制。
2. 扩展先加载演示模式或仅预览模式。
3. 用小样本验证字段、状态和导出结果。
4. 确认真实页面字段、价格口径和权限后再扩大批量。
5. 不提交 API Key、Cookie、账号资料、客户数据和运行结果。
