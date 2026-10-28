# 技术方案：Temu 商品推广实时花费监控与自动暂停

文档版本：V0.1  
编写日期：2026-10-22  
验证环境：比特浏览器窗口 ID `9e6f73cc742b4abc9015f31f8e75fbd7`，序号 `7512`，名称 `Y2-18`  
当前状态：只读原型已实现并通过单元/集成测试；真实暂停未执行

## 1. 结论

推荐采用纯 Chrome MV3 扩展：

```text
页面内悬浮窗 UI
    ↓
扩展调度器（alarms + 页面定时器）
    ↓
商品推广页 Content Script
    ↓                          ↓
页面主世界 fetch 桥接       页面状态/UI 健康检查
    ↓
Temu 同源数据接口
    ↓
SPU 聚合、阈值判断、自动暂停、重新读取核验
```

数据读取的最优路线是“页面主世界直接 `fetch`”：

- 当前页面上下文自动携带登录态。
- 不需要刷新整个网页。
- 不需要监听所有 XHR。
- 实测两次均返回 HTTP 200。
- 两次耗时分别为 `711 ms` 和 `706 ms`。
- 单次取得全部 19 条推广记录，`total=19`、`has_more=false`。

原型中的 `core.js + content.js + page-bridge.js` 已用相同页面进行集成测试：

- 返回 HTTP 200。
- 取得 19 条记录、19 个 SPU。
- 内容脚本端到端读取耗时 `772 ms`。
- 未产生页面错误和分页缺失。

DOM 文本只用于选择器健康检查和必要的展示兼容，不作为主要花费数据源。

## 2. 已核实的页面事实

### 2.1 目标页面

```text
页面标题：Temu | 商品推广
页面地址：https://ads.temu.com/ad-list.html
页面时区：Asia/Shanghai
```

比特浏览器调试连接由 `/browser/open` 动态返回，不能写死调试端口。本次返回：

```json
{
  "http": "127.0.0.1:50262",
  "seq": 7512,
  "name": "Y2-18",
  "pid": 20260
}
```

### 2.2 页面实际请求

点击页面数据区的“刷新”后捕获到的主要请求：

| 请求 | 作用 |
|---|---|
| `POST /api/v1/coconut/ad/ads_detail` | 推广明细、SPU、状态、花费、订单和每单成交花费 |
| `POST /api/v1/coconut/reports/queryReports` | 整体报表及趋势数据 |
| `POST /api/v1/coconut/ad/query_ad_advice` | 预算和推广建议 |
| `POST /api/v1/coconut/refund/query_refund_summary` | 退款/红包汇总 |

监控首版只需要 `ads_detail`。避免每轮额外读取报表、建议和退款信息。

### 2.3 明细请求

已捕获的请求体：

```json
{
  "ad_status": [],
  "ad_advice_types": [],
  "page_size": 10,
  "page_number": 1,
  "specific_query_info": "",
  "sort_by": 0,
  "sort_type": "desc",
  "start_time": 1792598400000,
  "end_time": 1792650982693,
  "need_calculate_goods_summary": true,
  "columns_type": 22,
  "selected_roas_type": 1,
  "filter_cooperative_ad_type": 0,
  "ad_phase": -1
}
```

实现时：

- `start_time` 使用页面时区当天 00:00:00。
- `end_time` 使用当前时间。
- 不同店铺对页长限制不一致：部分店铺接受 50 条，另一部分返回 `5000000`；20 条在两类店铺均可用。
- 扩展默认使用 `page_size=20`，20 条失败时自动降级为 10 条，不再默认发送不兼容的 50 条请求。
- 首屏返回 `total` 后动态计算页数，使用串行读取并按 `ad_id` 去重，避免并发请求触发限流。
- 每个分页请求遇到 `5000000` 时最多退避重试 5 次。
- 大店铺测试：1875 条记录使用每页 50 条可完整读取；496 条记录店铺使用每页 20 条完整读取约 35 秒。
- 请求使用相对路径，确保 Origin、Cookie 和页面上下文一致。

### 2.4 字段映射

每条 `result.ads_detail[]` 记录：

| 业务字段 | 接口字段 |
|---|---|
| 推广 ID | `ad_id` |
| 商品 ID | `goods_id` |
| SPU ID | `spu_id` |
| 商品标题 | `goods_title` |
| 推广状态 | `ad_show_status` / `ad_show_status_list` |
| 今日花费（分） | `summary.spend.total.val` |
| 今日花费展示 | `summary.spend.total.trans_val` |
| 今日订单数 | `summary.order_pay_cnt.total.val` |
| 每单成交花费（分） | `summary.transaction_cost.total.val` |
| 日预算（分） | `budget` |

已验证 `budget=10000` 在页面显示为 `¥100.00`，因此金额数值按“分”处理。

状态代码已从页面运行时代码确认：

```text
8  = PROMOTION，推广中
7  = MANUAL_PAUSE，手动暂停
0  = INSUFFICIENT_BALANCE
1  = DAY_LIMIT
2  = SOLD_OUT
3  = REMOVED
4  = UNDER_REVIEW
5  = REVIEW_REJECTED
6  = PROMOTION_LIMIT
9  = DELETED
12 = ROAS_LIMIT
14 = MONTH_LIMIT
15 = GOODS_LIMIT
```

### 2.5 暂停接口

页面运行时暂停逻辑使用的请求：

```http
POST /api/v1/coconut/ad/modify_ads
Content-Type: application/json;charset=UTF-8
```

```json
{
  "modifyAdDtos": [
    {
      "goodsId": "607657423433664",
      "status": 2
    }
  ]
}
```

已从页面代码确认：

```text
status=0  StartAds
status=2  StopAds
status=3  deleteAds
```

该接口只完成静态链路验证，没有在当前真实推广上执行 `StopAds`。正式启用前必须做一次指定 SPU 的真实暂停 UAT。

## 3. 方案比较

### 3.1 页面主世界 fetch

做法：

```javascript
const response = await fetch("/api/v1/coconut/ad/ads_detail", {
  method: "POST",
  credentials: "include",
  headers: {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json;charset=UTF-8"
  },
  body: JSON.stringify(payload)
});
```

优点：

- 同源请求自动携带页面登录态。
- 不依赖页面刷新按钮。
- 数据结构完整，可准确取得 SPU 与金额。
- 请求量可控，不触发无关接口。

风险：

- Temu 可能调整请求字段或返回结构。
- 页面风控可能要求额外请求头。
- 该接口属于页面自身使用的接口，需要做契约检查和异常熔断。

本次最小请求头和页面 Cookie 已经成功，不依赖捕获到的临时 `x-phan-data`。

### 3.2 隔离世界 Content Script 直接 fetch

该方式通常也可运行，但与页面世界相比更容易出现 Origin、Cookie、风控 Header 和扩展权限差异。建议由 Content Script 负责消息和 UI，实际请求放入页面主世界桥接。

### 3.3 扩展后台 Service Worker fetch

不推荐用于数据读取：

- 扩展后台不天然处于 Temu 页面上下文。
- Cookie、同源请求头和风控签名可能不一致。
- 仍需依赖页面打开，却没有页面同源优势。

后台适合管理调度和本地状态，不适合作为 Temu 接口的唯一直连方。

### 3.4 点击“刷新数据”并监听网络

已验证可行，但缺点明显：

- 每次刷新会同时调用 4–6 个接口。
- 会触发无关报表、建议和退款请求。
- 依赖“刷新”控件和网络响应结构。
- 页面数据区会重绘，存在操作冲突。
- 不是长期无人值守的最佳路线。

### 3.5 DOM 文本轮询

优点是无额外网络请求，延迟低。缺点：

- 只能读取当前渲染页和当前列。
- 金额、订单和状态存在格式化与虚拟渲染问题。
- 表格分页、列自定义或文案变化会漏数。
- 无法稳定关联所有推广记录。

只作为接口失败时的页面健康提示，不作为计算依据。

## 4. 扩展架构

### 4.1 文件结构建议

```text
temu-adspend-monitor/
├── manifest.json
├── background.js
├── content.js
├── page-bridge.js
├── sidepanel.html
├── sidepanel.css
├── sidepanel.js
├── shared.js
├── icons/
└── tests/
```

### 4.2 权限

```json
{
  "permissions": [
    "storage",
    "tabs",
    "scripting"
  ],
  "host_permissions": [
    "https://ads.temu.com/*"
  ]
}
```

Content Script 只匹配商品推广页：

```json
{
  "matches": ["https://ads.temu.com/ad-list.html*"]
}
```

### 4.3 页面桥接

`background.js` 使用：

```javascript
chrome.scripting.executeScript({
  target: { tabId },
  world: "MAIN",
  files: ["page-bridge.js"]
});
```

`page-bridge.js`：

1. 监听 Content Script 的 `window.postMessage`。
2. 在页面主世界执行 `fetch`。
3. 返回脱敏后的 JSON，而不是返回 Cookie、Header 或原始敏感信息。
4. 对每个请求设置 `AbortController` 超时。
5. 同一个页面只初始化一次。

消息示例：

```json
{
  "source": "temu-adspend-content",
  "type": "fetchAdsDetail",
  "requestId": "unique-id",
  "startTime": 1792598400000,
  "endTime": 1792650982693,
  "pageNumber": 1,
  "pageSize": 50
}
```

### 4.4 调度

MV3 Service Worker 会被浏览器休眠，不能用普通后台 `setInterval` 承担长期定时。

推荐双层调度：

1. `chrome.alarms` 负责至少 30 秒粒度的恢复和跨页面唤醒。
2. 商品推广页 Content Script 使用可重置的 `setTimeout` 负责当前页面秒级调度。
3. 每次调度完成后根据最新设置计算下一个时间点。
4. 页面隐藏时不加快调度，避免触发限流。
5. 页面关闭后清除定时器和管理状态。

扩展只应在 `ads.temu.com/ad-list.html` 激活监控。

### 4.4.1 页面锁定

页面范围使用两层保护：

1. Manifest Content Script 只匹配 `https://ads.temu.com/ad-list.html*`。
2. 运行时使用 `isAdListUrl()` 校验 Origin 必须为 `https://ads.temu.com`、Path 必须为 `/ad-list.html`。

锁定信息：

```json
{
  "tabId": 123,
  "url": "https://ads.temu.com/ad-list.html?...",
  "title": "Temu | 商品推广",
  "lockedAt": "2026-10-22T07:00:00.000Z"
}
```

行为：

- 后台根据标签页 URL 启用或禁用扩展按钮。
- Content Script 只在精确匹配的推广页 URL 注入悬浮窗。
- Content Script 使用 Shadow DOM 隔离页面样式，浮动层宽约 `380px`，不压缩页面宽度。
- 悬浮窗通过 iframe 承载扩展界面，支持拖动、最小化、位置记忆和扩展图标显隐切换。
- 首次显示时查询当前活动推广标签页并写入 `lockedAdTab`。
- 后续所有消息通过 `lockedAdTab.tabId` 发送，不跟随活动标签页变化。
- 锁定标签页跳转后，后台删除 `lockedAdTab`。
- Content Script 每秒检查一次 URL；地址不符合推广页条件时立即移除悬浮窗、停止定时器并取消未完成请求。
- 后台拒绝为不在推广页的发送者注入主世界数据桥接。

### 4.5 数据流

```text
设置变更
  ↓
读取当前页时区当天起点
  ↓
分页请求 ads_detail
  ↓
校验 success / error_code / 字段类型
  ↓
按 spu_id 聚合
  ↓
读取 SPU 规则
  ↓
判断阈值
  ↓
命中 → 告警或暂停
  ↓
暂停 → 重新读取核验
  ↓
写入本地审计记录
```

## 5. 聚合与规则引擎

### 5.1 聚合

```javascript
const spendMinor = records.reduce(
  (sum, record) => sum + Number(record.summary?.spend?.total?.val || 0),
  0
);

const orderCount = records.reduce(
  (sum, record) =>
    sum + Number(record.summary?.order_pay_cnt?.total?.val || 0),
  0
);

const spendCny = spendMinor / 100;
const costPerOrderCny = orderCount > 0 ? spendCny / orderCount : null;
```

聚合只包含当前接口返回的记录。分页结果需要合并后再判断，禁止在第一页就执行暂停，除非 `has_more=false` 或已知所有目标记录都已被完整覆盖。

### 5.2 阈值

```javascript
const spendHit =
  rule.spendLimitCny > 0 && spendCny >= rule.spendLimitCny;

const costPerOrderHit =
  rule.costPerOrderLimitCny > 0 &&
  orderCount > 0 &&
  costPerOrderCny >= rule.costPerOrderLimitCny;

const hit = spendHit || costPerOrderHit;
```

金额内部使用整数分存储，显示时再格式化，避免浮点误差。

### 5.3 暂停目标

优先使用 `ad_show_status === 8` 的记录。

如果一个 SPU 同时有多条记录：

- 聚合所有记录的花费与订单。
- 命中后只提交状态为推广中的记录。
- 请求体按记录生成 `goodsId`。
- `ad_id` 可用于审计关联，但页面暂停逻辑当前使用 `goodsId`。

## 6. 状态机与幂等

```text
IDLE
  → CHECKING
  → OBSERVING
  → TRIGGER_PENDING
  → PAUSING
  → PAUSE_VERIFYING
  → PAUSED_VERIFIED

任意读取/写操作异常
  → RETRY_WAIT / MANUAL_REVIEW / STOPPED
```

幂等键：

```text
{localDate}:{spuId}:{ruleId}:{ruleType}:{thresholdMinor}
```

规则：

- 观察模式不产生暂停幂等键。
- 真实暂停请求发出前先写入 `pauseAttemptedAt`。
- 收到成功响应后重新读取状态。
- 状态变为 `7` 才写入 `PAUSED_VERIFIED`。
- 请求超时后先读取远程状态，禁止直接重提。
- 同一幂等键当天成功后不再自动操作。

## 7. 暂停实现

### 7.1 前置检查

- 页面为商品推广页。
- 用户已授权当前规则。
- 数据读取成功且分页完整。
- 至少一条规则命中。
- 至少一条目标记录状态为推广中。
- 没有正在进行的暂停批次。
- 当日没有成功暂停记录。

### 7.2 请求

```javascript
await bridgeRequest({
  type: "modifyAds",
  body: {
    modifyAdDtos: targets.map((record) => ({
      goodsId: record.goods_id,
      status: 2
    }))
  }
});
```

### 7.3 响应判定

接口成功：

- `success === true`。
- `error_code === 1000000`。
- `result.createGoodsFailMap` 中不包含目标 `goodsId`。

接口失败或目标出现在失败映射中：

- 记录平台错误。
- 不标记成功。
- 触发远程状态复核。

### 7.4 后置核验

重新请求 `ads_detail`，等待最多 10 秒，检查目标 SPU 的所有目标记录：

- 状态 `7`：暂停成功。
- 状态仍为 `8`：标记“暂停未生效”。
- 状态为其他：标记“状态异常，需人工复核”。
- 请求失败：标记“结果未知，需人工复核”。

### 7.5 暂停记录

暂停请求被平台接受后，扩展立即写入 `pauseRecords`：

```json
{
  "recordId": "2026-10-22:7840050509:spend:5000,cpa:2000",
  "spuId": "7840050509",
  "goodsIds": ["607657423433664"],
  "pausedAt": "2026-10-22T07:00:00.000Z",
  "spendCny": 52.4,
  "restoreStatus": "available"
}
```

记录框展示暂停时间、SPU ID、商品 ID、触发花费、每单花费、触发规则和恢复状态。最多保留 200 条。

### 7.6 手动恢复投流

恢复入口只出现在扩展提交过暂停请求的记录上。请求：

```json
{
  "modifyAdDtos": [
    {
      "goodsId": "607657423433664",
      "status": 0
    }
  ]
}
```

其中 `status=0` 为页面代码确认的 `StartAds`。

恢复流程：

1. 用户点击记录中的“恢复被暂停的投流”。
2. 显示“恢复后可能继续产生费用”的确认提示。
3. 将记录状态写入 `restore_requested`。
4. 提交 `StartAds`。
5. 重新读取推广明细。
6. 所有目标商品状态为 `8` 时标记 `restored`。
7. 状态未变化时标记 `restore_verify_failed`，保留按钮供人工再次操作。

恢复操作只允许一个请求同时执行，并避开正在进行的监控读取。

已使用模拟响应完成恢复流程集成测试：

- `StartAds` 请求状态为 `0`。
- 恢复后重新读取到状态 `8`。
- 暂停记录状态更新为 `restored`。
- 审计结果写入 `RESTORED_VERIFIED`。
- 测试使用模拟响应，没有修改当前真实推广。

## 8. 时间与数据新鲜度

- 使用页面时区计算自然日起点。
- 页面报告接口当前显示 `Asia/Shanghai`。
- `end_time` 使用请求发出时刻。
- 不让浏览器本地系统时区与页面时区不一致时产生跨日错误。
- 若接口返回 `update_at`，面板应展示该更新时间。
- 刷新间隔只代表请求频率，不代表平台底层数据必然实时。

建议默认 60 秒；风控场景允许 30 秒，但不建议低于 30 秒。

## 9. 错误码

| 错误码 | 含义 |
|---|---|
| `WRONG_PAGE` | 当前不是商品推广页 |
| `LOGIN_REQUIRED` | 登录失效 |
| `CAPTCHA_REQUIRED` | 页面要求人机校验 |
| `FETCH_TIMEOUT` | 数据请求超时 |
| `API_SCHEMA_CHANGED` | 返回结构不符合契约 |
| `API_RATE_LIMITED` | 429 或平台限流 |
| `PAGINATION_INCOMPLETE` | 分页数据不完整 |
| `INVALID_AMOUNT` | 金额字段异常 |
| `RULE_NOT_ARMED` | 当前为观察模式 |
| `STATUS_NOT_ACTIONABLE` | 记录不是推广中 |
| `PAUSE_ALREADY_ATTEMPTED` | 当前幂等键已尝试 |
| `PAUSE_REJECTED` | 暂停接口明确拒绝 |
| `PAUSE_RESULT_UNKNOWN` | 暂停结果未知 |
| `PAUSE_VERIFY_FAILED` | 重新读取后状态未变为暂停 |

## 10. 测试计划

### 10.1 单元测试

- 分转元、阈值比较和浮点误差。
- SPU 聚合。
- 订单数为 0 的每单花费。
- 状态代码映射。
- 自动暂停前置条件。
- 幂等键和当日去重。
- 暂停结果分类。

### 10.2 契约测试

- `success=true` 且 `error_code=1000000`。
- `ads_detail` 数组。
- 必填字段存在。
- `spend.total.val` 为数字。
- `page_number`、`has_more`、`total` 一致。
- 未知字段可忽略。

### 10.3 集成测试

- 页面主世界 fetch 成功。
- 网络超时、429、登录失效。
- 单页和多页数据。
- 同一 SPU 多条记录。
- 状态 8 命中、状态 7 跳过。
- 暂停响应成功并核验到状态 7。
- 暂停响应超时但远程已暂停。
- 暂停响应成功但远程未变化。

### 10.4 真实 UAT

正式自动暂停前，只对一个指定 SPU 执行：

1. 观察模式运行至少 3 个周期。
2. 人工确认阈值和数据。
3. 开启自动暂停。
4. 制造或等待一次命中。
5. 确认只暂停一次。
6. 重新读取状态代码 `7`。
7. 核对审计记录。

当前没有可安全使用的已确认测试 SPU，因此本次未执行真实暂停。

## 11. 发布策略

### Phase 1：只读观察

- 安装扩展。
- 直接 fetch。
- 展示花费、订单和规则命中。
- 不做任何写操作。

### Phase 2：受控暂停

- 只允许单个已确认 SPU。
- 默认关闭。
- 每次开启均需确认。
- 保存完整审计。

### Phase 3：全量

- 仅在 Phase 2 连续通过后开放。
- 保留每日暂停次数上限和全局紧急停止。

## 12. 残余风险

| 风险 | 处理 |
|---|---|
| Temu 接口字段变化 | 契约校验、错误熔断、集中适配层 |
| 平台数据延迟 | 展示更新时间、最低 30 秒、命中前复核 |
| 风控与临时请求头 | 页面主世界请求、退避、人机校验时停止 |
| 自动暂停误操作 | 默认观察、显式授权、只处理推广中、幂等 |
| 暂停响应不明确 | 先读状态，不盲目重提 |
| 多 SPU 记录聚合错误 | 完整分页后聚合，按 SPU 和 adId 双重记录 |
| MV3 定时器休眠 | alarms 加页面定时器双层调度 |
