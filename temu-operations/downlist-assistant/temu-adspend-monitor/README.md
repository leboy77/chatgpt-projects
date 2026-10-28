# Temu 商品推广花费监控

当前阶段完成：

- [PRD：需求、阈值、交互、验收](./PRD_Temu商品推广花费监控.md)
- [技术方案：接口、架构、暂停和幂等](./技术方案_Temu商品推广花费监控.md)
- [虚拟测试报告：路线选型](./虚拟测试报告_技术路线选型.md)
- [可加载扩展原型](./extension/README.md)

已验证：

- 指定比特窗口 `9e6f73cc742b4abc9015f31f8e75fbd7` 可连接。
- 实际序号为 `7512`，名称 `Y2-18`。
- 商品推广页可直接使用同源 `fetch` 读取今日推广明细。
- 两次只读请求均成功，单次约 `0.71 秒`。
- 当前店铺返回 19 条推广记录。
- 不需要刷新整个网页。
- 页面桥接集成测试成功，单次读取约 `0.72–0.79 秒`。
- 阈值、SPU 聚合、暂停/恢复幂等和页面 URL 校验的 28 项单元测试通过。

尚未执行：

- 真实推广暂停。
- 阈值命中后的真实状态核验。

推荐路线：页面主世界 `fetch`。真实 `StopAds` 必须先在用户指定的测试 SPU 上完成受控 UAT。

扩展原型默认是观察模式，不会自动暂停。开启自动暂停前必须勾选授权确认。

`v0.3.2` 修复不同店铺分页兼容：默认每页 20 条，遇到 `5000000` 自动退避重试，并兼容 496 条和 1875 条推广店铺。

![商品推广页实际悬浮窗](./test-artifacts/live-floating-panel.png)

## 验证文件

- [页面结构探测](./tests/probe_page.mjs)
- [页面刷新网络捕获](./tests/probe_network.mjs)
- [直接 fetch 测试](./tests/test_fetch.mjs)
- [技术路线模拟](./tests/route_simulation.mjs)
- [页面桥接集成测试](./tests/integration_bridge.mjs)
- [内容脚本集成测试](./tests/content_integration.mjs)
- [恢复投流集成测试](./tests/restore_integration.mjs)
- [核心规则单元测试](./tests/core.test.mjs)
- [直接 fetch 结果](./test-artifacts/fetch-test.json)
- [网络捕获结果](./test-artifacts/network-capture.json)
- [页面桥接结果](./test-artifacts/bridge-integration.json)
- [内容脚本结果](./test-artifacts/content-integration.json)
- [恢复投流结果](./test-artifacts/restore-integration.json)
- [模拟结果](./test-artifacts/route-simulation.json)
