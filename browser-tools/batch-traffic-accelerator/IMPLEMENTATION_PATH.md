# 批量流量加速插件：实现路径

## 1. 结论

推荐采用 **Chrome Manifest V3 侧边栏 + 页面内容脚本 + 可替换的站点适配器**，先在 TEMU 卖家中心
`经营分析 > 流量分析` 页面完成“预演式批量增长”，再接入稳定的同源接口。

但不要把它实现为简单的“遍历所有立即增长按钮并连续点击”。正确形态是：

1. 读取当前店铺、站点、日期和全部商品行；
2. 按流量策略或自定义规则筛选商品；
3. 先生成匹配清单和影响预估，供用户确认；
4. 分批提交，逐项记录结果；
5. 轮询进度，失败项可单独重试；
6. 页面刷新、Side Panel 关闭或 Service Worker 重启后仍能恢复任务，且不会重复提交。

如果这个功能最终要成为探果/优办自己的产品能力，优先做法是 **服务端功能**，不是在探果网站外再套一层
浏览器插件。现有前端已经证明相关服务端流程存在；在网站内新增页面或复用现有面板的维护成本最低。

## 2. 已核实的现状

- 本机工作区原先为空，没有可继承的插件项目。
- 当前浏览器打开的是 `allinone.uban360.com` 的探果跨境电商后台，左侧已有“批量流量加速”和
  “批量退出流量加速”。
- 探果公开前端包含完整的流量加速界面和状态流程。
- 探果前端流量策略模型包含店铺、站点、商品范围、货号类型、核价币种、成本方式和让价策略等字段。
- 探果公开前端使用的接口族为：

  ```text
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/template/list
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/template/get
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/template/save
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/template/copy
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/template/delete
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/template/batch-delete
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/accelerate
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/progress
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/record/list
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/detail/list
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/match/list
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/exit/execute
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/exit/progress
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/exit/page
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/exit/detail/list
  /aipaas-cgw/ai-tools-kj/tools/temu/traffic/exit/match/list
  ```

这些是探果的站内接口，不是公开开放平台 API。独立第三方插件不应在未授权时直接复用。

- 本机已有“探果 POD 批量上品助手”，其成熟模式值得沿用：
  - Manifest V3；
  - Side Panel 作为独立控制台；
  - content script 执行页面动作；
  - Service Worker 持有可持久化状态机；
  - `chrome.alarms` 保活；
  - 锁定目标 `tabId`；
  - 失败重试、人工停止、历史记录和 DOM 诊断。
- TEMU 的“流量分析”是降价获取更多流量和曝光的运营功能，页面入口为“立即增长”，不是网络带宽加速。

## 3. 推荐架构

```text
Side Panel
  控制台：规则、预演、进度、停止、记录、导出
       |
       v
Service Worker
  任务状态机、队列、幂等键、重试、持久化、目标标签页锁定
       |
       v
Content Script（隔离世界）
  页面识别、DOM 读取、表格翻页、用户交互、结果校验
       |
       v
MAIN World Bridge（可选）
  只读捕获 fetch/XHR 响应，向内容脚本转发商品列表和提交结果
       |
       v
TemuPageProvider（主适配器）
  DOM 读取 + 同源接口提交 + 页面结果校验
```

关键原则是 **控制层与站点适配层分离**。以后接欧洲站、不同后台版本或探果自有接口时，只替换 Provider：

```ts
interface TrafficProvider {
  getContext(): Promise<{
    mallId: string;
    siteId: string;
    dateRange: string;
    pageUrl: string;
  }>;

  listProducts(filter: TrafficFilter): Promise<ProductRow[]>;
  preview(strategy: TrafficStrategy, products: ProductRow[]): Promise<MatchPreview>;
  accelerate(items: TrafficItem[], idempotencyKey: string): Promise<SubmitResult>;
  getProgress(traceId: string): Promise<ProgressSnapshot>;
  verify(item: TrafficItem): Promise<VerificationResult>;
}
```

## 4. 页面数据层

### 4.1 首选数据源

优先读取页面已经拿到的同源响应，而不是直接解析视觉元素：

1. 在 `document_start` 注入 MAIN World bridge；
2. 包装 `fetch` 和 `XMLHttpRequest`，只读取克隆后的响应；
3. 使用 URL 白名单识别流量分析商品列表、匹配和提交接口；
4. 通过 `window.postMessage` 将脱敏后的结构化数据发给 content script；
5. DOM 作为兜底和最终校验。

禁止修改请求或响应，禁止注入第三方远程脚本，禁止采集与业务流程无关的 cookie、密码或聊天数据。

### 4.2 DOM 兜底

优先使用语义锚点：

- 页面标题包含“流量分析”；
- 二级页签或操作按钮包含“立即增长”；
- 表格使用 `role=table`、`role=row` 或平台自身的稳定测试属性；
- 列名通过表头文本映射，不依赖 `td:nth-child(n)` 的固定序号；
- 所有商品身份都来自复合键，不依赖展示顺序。

建议的稳定身份：

```text
mallId + siteId + productId + skuId/skcId
```

如果页面只提供商品 ID，则：

```text
mallId + siteId + productId
```

### 4.3 全量读取

必须支持：

- 当前页读取；
- 页大小切换；
- 全量分页；
- 日期、站点和搜索条件快照；
- 加载完成判定；
- 去重；
- 中断后从页游标恢复；
- 导出原始行和标准化后的行。

## 5. 规则与预演

第一版建议支持这些筛选条件：

- 店铺；
- 站点；
- 搜索词、分类、商品 ID/SKU；
- 当前曝光、访问、转化率、销量和流量等级的范围；
- 当前申报价、成本、毛利额和毛利率；
- 最低可申报价；
- 是否已处于流量增长状态；
- 是否缺货或不可售；
- 排除货号清单；
- 每批商品上限。

规则应先计算为统一结构：

```ts
type TrafficStrategy = {
  mallId: string;
  siteIds: string[];
  productScope: "CURRENT_FILTER" | "MANUAL" | "SPECIFIED_CODE";
  productCodeType?: "SKU" | "SKC";
  productCodes?: string[];
  costMode: "MANUAL_COST" | "LAST_PURCHASE" | "AVERAGE_COST";
  minProfit?: number;
  minPrice?: number;
  maxDiscountRate?: number;
  duration?: number;
  excludeKeys: string[];
};
```

执行前必须显示预演：

- 页面总商品数；
- 命中数；
- 排除数及原因；
- 去重后的待处理数；
- 价格区间；
- 预计每档让价和毛利影响；
- 预计批次数量；
- 需要用户确认的高风险项。

没有预演就不允许正式提交。

## 6. 提交和恢复

### 6.1 任务状态机

```text
idle
  -> scanning
  -> previewing
  -> waiting_confirmation
  -> submitting
  -> polling
  -> completed

任意执行态 -> stopping -> stopped
任意执行态 -> paused/error -> resuming
```

每项商品单独维护：

```text
queued | submitting | accepted | succeeded | failed | skipped | unknown
```

`accepted` 只表示请求已被接受，不等于平台已完成加速。必须以后台进度或页面结果二次确认。

### 6.2 幂等和防重复

幂等键至少包含：

```text
shopId + siteId + productId + skuId + strategyVersion + dateBucket
```

提交前先写入本地 journal，状态从 `queued` 改为 `submitting`；收到响应后写入 trace ID。
如果页面刷新或扩展重启，遇到 `submitting/unknown` 的项先查平台状态，不能直接重提。

### 6.3 限流与失败处理

- 默认并发为 `1`，验证接口承载能力后再增加；
- 每批数量做成配置，推荐起步 `5-10` 个商品；
- 对 `429`、登录失效、验证码、风控和未知错误分类处理；
- 登录失效、验证码和风控立即暂停，等待人工处理；
- 只对瞬时网络错误和明确可重试错误自动重试；
- 连续失败达到阈值时停止整个任务；
- 停止请求在完成当前单项后生效。

不要绕过验证码、频控、平台限额或风控，也不要伪造自然流量。

## 7. UI 设计

Side Panel 固定为四段：

1. 连接状态：店铺、站点、页面、登录状态、最后同步时间；
2. 策略：模板、筛选条件、毛利底线、批次上限；
3. 预演与执行：命中数、风险项、开始、暂停、停止；
4. 结果：进度条、成功/失败/待确认、失败原因、重试、CSV 导出。

页面内只增加一个轻量入口：

```text
[批量加速] 命中 37 项
```

点击后打开 Side Panel。不要在页面正文覆盖大面积浮层，也不要把规则编辑器塞进 DOM 注入的阴影框。

## 8. 关于“窗口 7414”

本机检查未发现 `7414` 端口。`7414` 因此不应被硬编码为网络地址、窗口句柄或业务身份。

启动任务时应锁定并持久化：

```ts
type ExecutionTarget = {
  tabId: number;
  origin: string;
  path: string;
  shopId: string;
  siteId: string;
  capturedAt: number;
};
```

如果“7414”是内部调试窗口编号，它只适合作为开发期定位信息。恢复任务时用 `tabId + URL + shopId`
重新校验，窗口编号变化不应影响业务状态。

## 9. 分阶段落地

### Phase 0：契约取证

产出一份脱敏的 Discovery 包：

- 目标完整 URL；
- 页面截图；
- 商品表一页的 DOM 快照；
- 一次“立即增长”成功和失败的网络请求；
- 商品列表、提交、进度接口的请求字段和响应字段；
- 页面成功状态和失败状态的截图。

验收：可以明确区分“请求成功”“平台已受理”“增长已生效”。

### Phase 1：只读 MVP

- Side Panel 骨架；
- 页面识别；
- 当前页和全量分页读取；
- 复合键去重；
- 规则筛选；
- 匹配预演；
- CSV 导出。

验收：对同一页面，预演数量与平台页面一致，重复运行不产生重复行。

### Phase 2：小批量执行

- 单店铺、单站点；
- 每批最多 5 项；
- 用户确认后执行；
- 单项状态、停止、失败重试；
- 任务 journal 和进度弹窗。

验收：20 个商品全部可追溯；停止后最多多完成 1 项；重启扩展不重复提交。

### Phase 3：策略模板和多店铺

- 策略模板 CRUD；
- 店铺和站点批量选择；
- 模板版本化；
- 定时预演但手动确认；
- 完整记录和失败导出。

验收：切换店铺不会串店、串站点或复用错误任务。

### Phase 4：增强

- 退出流量加速；
- 多站点差异规则；
- 结果回写 ERP；
- 成功率、耗时、毛利变化报表；
- 页面版本兼容检测和告警。

## 10. 实施优先级

最高优先级：

- Provider 边界；
- 复合键；
- 预演；
- journal 与幂等；
- 登录/验证码/风控暂停；
- 页面版本检测。

可以后置：

- 高并发；
- 自动选择最优价格；
- AI 自动调价；
- 无人值守定时提交；
- 多账号共享云端任务。

## 11. 下一步需要补齐的信息

当前没有直接打开目标 `经营分析 > 流量分析` 页，因此还缺少 TEMU 当前版本的：

- 精确路由；
- 商品列表接口和字段；
- “立即增长”提交接口；
- 提交后的进度轮询方式；
- 页面上的成功/失败判定。

拿到 Phase 0 的脱敏 Discovery 包后，就可以直接开始 Phase 1 的 MV3 工程，不需要再改整体架构。
