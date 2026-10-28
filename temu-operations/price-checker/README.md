# Temu 全球价格申报核价助手

这是一个面向 Temu Agent Center「上新生命周期管理 → 价格申报中」的浏览器扩展预研项目。

当前阶段交付：

- 产品需求文档（PRD）
- 技术方案与浏览器自动化路线对比
- 可执行的核价规则、SKC 导入和任务规划核心代码
- 模拟 Temu 页面行为的自动化测试
- 交互式路线沙盘
- MV3 扩展开发版：1000 条 SKC 导入、59 个国家、两步价格设置、50 条自动分批和循环核价

## 文档

- [产品需求文档](docs/PRD.md)
- [技术设计](docs/TECHNICAL_DESIGN.md)
- [技术路线评估](docs/ROUTE_EVALUATION.md)
- [测试计划](docs/TEST_PLAN.md)
- [虚拟测试结果](docs/VIRTUAL_TEST_RESULTS.md)
- [浏览器与目标页面诊断](docs/BROWSER_DIAGNOSTICS.md)
- [开发状态](docs/DEVELOPMENT_STATUS.md)
- [59 个国家清单](docs/COUNTRY_LIST.md)

## 本地验证

```powershell
node --test tests/*.test.mjs
node tools/simulate.mjs
node tools/build-extension.mjs
```

核心规则采取保守默认值：

- 用户填写的是每站点「申报价」，单位为人民币。
- 国家价格表只要填写 RMB 价格，就会自动勾选该国家；未填写价格才保持禁用。
- 平台价大于或等于申报价时，直接保留平台价并提交。
- 平台价低于申报价时，自动还价至申报价或单独设置的还价目标。
- 同一站点/SKC 的 SKU 价格跨越申报价时，系统排除该组并提示人工处理。
- 正式模式点击“开始自动核价”后按批次自动提交；测试时可开启“仅预览”。
- 执行期间可点击“暂停任务”；进入提交阶段后需等待明确提交结果。
- 同一个 Excel 同时维护 SKC 和 59 个国家的 RMB 价格方案。
- 最近方案自动恢复，也可以另存为命名方案。
- 重复核价默认跳过已提交成功的 SKU。
- 页面临时失败最多自动重试 3 次；提交结果未知时停止并要求人工核对。

## 当前验证状态

已完成 Temu 真实页面联调，包括 100 个 SKC 导入、59 个国家选择、站点价格读取、重新报价、提交确认和任务预览。

扩展安装目录：`dist/extension`。在 Chrome 或比特浏览器的扩展程序页面选择“加载已解压的扩展程序”，指向该目录。

分发压缩包：`outputs/01a162b3-08c8-7590-b359-1c4c46f2e054/Temu全球核价助手-v0.6.1.zip`。
