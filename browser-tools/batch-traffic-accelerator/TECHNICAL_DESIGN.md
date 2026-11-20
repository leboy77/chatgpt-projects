# 指定规格流量加速插件技术设计

文档版本：`2.10`

实现版本：`v0.6.19`

最后更新：2026-11-19

## 1. 目标

把当前单批次执行器升级为持久化任务队列，并改为：

```text
任务 → 商品 → 地区查询 → 同地区所有站点
```

同时增加扫描互斥、进度、缓存版本、请求保护和导入诊断。

## 2. 当前实现

当前版本：`v0.6.19`。

现有结构：

```text
Side Panel
  → Service Worker
  → Content Script
  → TEMU Seller Central
```

当前主要数据：

```ts
type AppState = {
  config: Config;
  stations: Station[];
  pairs: Pair[];
  cacheMeta: CacheMeta | null;
  taskQueue: TaskDefinition[];
  queueState: QueueState;
  operationLock: OperationLock | null;
  logs: LogEntry[];
};
```

任务执行使用商品优先分组：

```ts
pairs.flatMap(pair =>
  groupEnabledStationsByRegion(pair)
);
```

每个地区组只查询一次商品，然后处理该地区全部站点。

## 3. v0.6.0 架构

```text
Side Panel
  ├─ 当前任务编辑器
  ├─ 任务队列
  ├─ 扫描/执行进度
  └─ 日志和结果

Service Worker
  ├─ 持久化任务队列
  ├─ 队列状态机
  ├─ 扫描/执行互斥锁
  └─ 进度转发和恢复

Content Script
  ├─ 商品列表扫描
  ├─ 流量分析查询
  ├─ 同地区站点遍历
  ├─ 资格、填价和提交
  └─ 请求异常识别

TEMU Seller Central
```

## 4. 数据模型

```ts
type TaskDefinition = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  storeContext: {
    storeName: string;
    host: string;
    region: "eu" | "us" | "global";
    boundAt: number;
  } | null;

  config: {
    productSource: "goodsList" | "tableImport";
    searchMode: "sku" | "category";
    skuKeyword: string;
    categoryPath: string;
    specName: string;
    idType: "SPU" | "SKC";
    region: "eu" | "us" | "global";
    duration: "long" | "30" | "14" | "7";
    taskIntervalSeconds: number;
    accelerationMode: "custom" | "priceTier" | "reduceThenTier";
    tierStrategy: "maxTraffic" | "minDiscount";
    fallbackReferencePrice: false;
    navigationGuard: boolean;
    dryRun: boolean;
  };

  stationSnapshot: Station[];
  cacheSnapshot: {
    pairs: Pair[];
    skuKeyword: string;
    specName: string;
    scannedAt: number;
    source: "page" | "import";
  };
};

type TaskRun = {
  taskId: string;
  status:
    | "queued"
    | "running"
    | "paused"
    | "done"
    | "stopped";
  currentProductId?: string;
  currentRegion?: "global" | "us" | "eu";
  currentStationCode?: string;
  items: TaskItemRun[];
};

type TaskItemRun = {
  id: string;
  pair: Pair;
  region: Region;
  stationCode: string;
  status:
    | "pending"
    | "running"
    | "success"
    | "exception"
    | "failed";
  retryable: boolean;
  submitted: boolean;
  attempts: number;
  stage: string;
  message: string;
};

type Pair = {
  spu: string;
  skc: string;
  idType?: "SPU" | "SKC";
};

type Station = {
  code: string;
  station: string;
  region: "eu" | "us" | "global";
  enabled: boolean;
  targetPrice: number | null;
  otherPrice: number | null;
  tierPrice: number | null;
};
```

应用状态保存：

```ts
type AppState = {
  storeBinding: {
    storeName: string;
    host: string;
    region: "eu" | "us" | "global";
    boundAt: number;
  } | null;
};
```

## 5. 队列状态机

```text
queued
  ↓
running
  ├─ paused
  ├─ done
  └─ stopped

paused
  ↓
running
```

规则：

- 队列一次只运行一个任务。
- 任务执行中不能删除。
- 排队中的任务可编辑、删除、拖动排序。
- 已暂停任务可删除；删除当前暂停任务时递增 `runToken`、清除操作锁、当前任务 ID 和当前索引。
- 队列执行位置定期保存。
- 浏览器重启后，`running` 任务恢复为 `paused`，等待人工确认。

## 6. 商品优先执行

### 6.1 店铺绑定与隔离

内容脚本从以下 DOM 读取店铺名称：

```text
[class*="account-info_mallInfo"]
[class*="account-info_accountInfo"]
```

新增消息：

```ts
{ type: "GET_STORE_CONTEXT" }
```

返回：

```ts
{
  storeName: string;
  host: string;
  region: "eu" | "us" | "global";
}
```

执行保护：

```text
页面当前店铺
  == 插件 storeBinding.storeName
  == task.storeContext.storeName
```

任一不一致：

1. 阻止创建或执行任务；
2. 不自动修改任务；
3. 写入“店铺不匹配”错误；
4. 要求用户切换回对应店铺或重新绑定并重建任务。

执行器先生成层级数据：

```ts
for (const pair of task.cacheSnapshot.pairs) {
  const stationGroups = groupStationsByRegion(task.stationSnapshot);
  for (const [region, stations] of stationGroups) {
    await ensureRegionPage(region);
    await queryProductOnce(pair);
    for (const station of stations) {
      await processStation(pair, station);
    }
  }
}
```

要求：

- 同一商品、同一地区只调用一次查询；
- 查询结果在当前地区内复用；
- 站点逐个打开、填价和提交；
- 全部站点完成后才进入下一商品；
- 每个站点完成后写入执行状态。

## 7. 扫描自动化和互斥

### 7.0 检索模式

```text
SKU 模糊查询：
  设置 SKU(模糊查询)
  输入货号 X

单类目检索：
  打开“商品分类”级联筛选
  按类目路径逐层选择
  可选货号 X 继续作为 SKU 二级过滤
  可选规格 Y
```

商品获取方式与上述检索方式同级：

```text
商品列表检索：
  从 goods/list 扫描并生成 SPU+SKC

表格商品 ID 导入：
  货号 | SPU ID | SKC ID | 启用(是/否) | 备注
```

表格每行生成 `{ idType, spu, skc }`，直接作为任务商品池，不触发商品列表扫描。旧 `SKC导入` 工作表仅把 12 位 ID 继续视为 SKC，11 位及以下 ID 按 SPU 兼容处理并记录导入日志。

商品规格筛选框在新版页面可能不存在。扫描器将 `请输入规格名称` 视为可选：如果找不到，点击一次“展开”后重试；仍找不到就继续按货号/类目扫描。规格 Y 在流量分析阶段继续使用。

区域枚举不改变商品列表候选缓存，但决定任务执行时使用的流量分析域名和站点集合。只执行 `station.region === config.region` 的启用站点。

### 7.1 自动选择页面

候选标签页：

1. 当前活动 `goods/list`；
2. 最近使用的其他 `goods/list`；
3. 自动新开 `https://agentseller.temu.com/goods/list`。

候选检测：

```text
content PING -> context.kind === "goods"
页面不包含“确认提交本页/放弃调整价格/继续调整”
```

不可用候选跳过，继续尝试下一个。

### 7.2 全局锁

```ts
type OperationLock =
  | { kind: "scan"; operationId: string; startedAt: number }
  | { kind: "execute"; taskId: string; startedAt: number }
  | null;
```

锁存放在 Service Worker 和 `chrome.storage.local`。

重复点击：

- 扫描锁存在时忽略新的扫描请求；
- UI 返回“正在扫描，请等待”；
- 不创建第二个并发流程。

### 7.3 扫描进度

Content Script 每页发送：

```ts
type ScanProgress = {
  operationId: string;
  page: number;
  currentPairs: number;
  uniquePairs: number;
  elapsedMs: number;
};
```

消息通过 Service Worker 持久化并转发给 Side Panel。

### 7.4 商品数据完整性监控

查询后调用：

```ts
waitForGoodsDataReady({
  previousSignature,
  previousPage,
  timeout: 45000,
  context: "商品查询结果"
});
```

就绪条件：

```text
页面不包含“正在获取商品数据/请勿关闭此页面”
表格 SPU/SKC 签名连续 1.2 秒稳定
当前页读取行数 >= min(pageSize, resultTotal - 已完成数量)
```

平台结果总数优先读取分页区域：

```text
共有 N 条
或 共 N 条
```

顶部“全部 N”只在无法读取分页总数时作为回退。分页读取完成后再次校验：

```js
rawCount === finalTotal
```

不一致时抛出错误，Side Panel 不更新 `pairs` 和 `cacheMeta`，因此旧缓存不会被不完整结果覆盖。

商品表存在虚拟滚动时，扫描器自动查找包含 `tbody tr` 的最长纵向滚动容器，分步滚动并累计 SPU/SKC，结束后恢复原滚动位置。验证样本中首屏只有 8 组，自动滚动后读取到 143 组。

产品总数与 SPU/SKC 配对数分开统计：

```text
productKey = spu || skc
productCount = unique(productKey)
pairCount = unique(spu + ":" + skc)
```

平台“共有 N 条”与 `productCount` 比较。一个商品存在多个 SKC 时允许 `pairCount > productCount`。

查询前记录当前货号和规格输入值；如果输入值已经与任务参数一致，则复用当前结果，避免重复查询造成 0 条中间态。已有商品列表存在但全部扫描失败时，不再自动新开页面，只提示刷新现有页面。

## 8. 请求保护

### 8.1 间隔

```text
默认：15 秒
抖动：0～3 秒
最小：8 秒
```

间隔发生在不同商品之间，也用于降低连续提交压力。

### 8.2 限流熔断

检测文本：

```text
请求频繁
操作频繁
系统繁忙
操作过快
稍后重试
请勿重复
```

命中后：

1. 当前项标记 `failed + retryable`；
2. 整个队列暂停；
3. 写入熔断时间；
4. 禁止自动继续请求；
5. 用户手动继续或重试。

## 9. Excel 导入诊断

### 9.1 解析结果

```ts
type ImportDiagnostics = {
  sheetFound: boolean;
  rowsFound: number;
  rowsWithValidCode: number;
  explicitEnabled: number;
  targetPricePresent: number;
  otherPricePresent: number;
  invalidPriceCells: Array<{
    countryCode: string;
    column: string;
    rawValue: string;
  }>;
  finalEnabled: number;
};
```

### 9.2 价格解析

支持：

```text
数字
¥100
￥100
100.00
1,000.00
100元
RMB 100
```

解析失败不能静默当成空值，必须进入诊断。

### 9.2.1 自闭合空单元格

Excel 会把空格式单元格写成：

```xml
<c r="F6" s="16"/>
```

解析器必须先将它识别为一个独立的空单元格。旧正则只匹配成对的 `<c>...</c>`，自闭合单元格会吞并后续单元格，直到遇到下一个 `</c>`，从而产生错误的 `17/18` 价格。

v0.6.3 使用：

```js
/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
```

自闭合分支的单元格正文固定为空，不读取后续单元格。

### 9.3 v0.4.2 附件结论

附件版本：`0.4.2`。

导入判定：

```ts
enabled =
  row.enabled ||
  Number.isFinite(row.targetPrice);
```

说明：

- 其他规格价格不会触发启用；
- 若 Excel 仅德国站目标价格可解析，则只启用德国站是预期行为；
- 尚未取得异常 Excel，不能确认跨电脑异常的具体根因；
- v0.6.0 用诊断数据区分表头、价格解析和数据填写问题。

## 10. 消息协议

```ts
type ContentRequest =
  | { type: "PING" }
  | { type: "SCAN_GOODS"; config: TaskConfig; operationId: string }
  | {
      type: "RUN_PRODUCT_STATIONS";
      taskId: string;
      pair: Pair;
      region: Region;
      stations: Station[];
      config: TaskConfig;
    }
  | { type: "FILL_TRAFFIC_PRICES"; config: TaskConfig }
  | { type: "PREVIEW_ACCELERATION_TIERS"; config: TaskConfig };
```

`v0.6.0` 已接入 `RUN_PRODUCT_STATIONS`：内容脚本先查询一次商品，再遍历该地区站点。`RUN_TRAFFIC_ITEM` 保留用于兼容单项页面测试。

## 11. 异常分类

```ts
type FailureKind =
  | "config_exception"
  | "retryable_failure"
  | "submitted_unknown";
```

映射：

- 无资格、价格超限、缺站点行：`config_exception`
- 请求频繁、超时、网络、页面未响应：`retryable_failure`
- 已最终确认但无明确结果：`submitted_unknown`

`submitted_unknown` 重试前必须提示核对平台，避免重复提交。

## 11.1 自动档位匹配

档位 DOM：

```text
档位容器：div[class*="flux-shift-table_item__"]
排除项：包含 beforeItem
价格区：div[class*="rightCnt"]
选中态：class 包含 itemActive
```

候选条件：

```ts
const eligible = tiers.filter((tier) =>
  tier.prices.every((price) => targetPrice <= price + 0.001)
);
```

选择策略按档位平均对应申报价格计算：

```ts
maxTraffic  -> 最低 averagePrice
minDiscount -> 最高 averagePrice
```

选择时点击档位容器，并等待同一容器的 `itemActive` 出现。确认选中后直接点击“立即加速”，不进入“调整申报价”弹窗。

`PREVIEW_ACCELERATION_TIERS` 只读取和计算，不点击档位、不提交。侧边栏用该消息实现“检查当前弹窗”。

模式隔离：

```text
custom     保持“去获取 → 调整申报价 → 确认”原流程
priceTier  跳过申报价弹窗，读取档位 → 点击档位 → 立即加速
reduceThenTier
           有“去获取”：按指定规格/其他规格价格填价并提交
           无“去获取”或填价无效：回退到 priceTier 档位匹配
```

`reduceThenTier` 从 `flux-shift-table_infoItem` 中读取 SKU 标签顺序，并把每个档位的价格数组按相同索引映射：

```ts
required = sku.matchesTargetSpec ? targetPrice : otherPrice;
eligible = tier.prices.every(
  (tierPrice, index) => required[index] <= tierPrice
);
```

如果同时满足的档位为空，按产品规则允许回退到现有最高流量档位，并在 `message` 和日志中标记 `usedFallback=true`。临时性错误不进入回退，仍按可重试失败处理。

### 自定义填价价格来源

```ts
configured =
  matchesTarget
    ? station.targetPrice
    : station.otherPrice;

missingPrice =
  configured == null ||
  configured === "" ||
  !Number.isFinite(Number(configured));

valid =
  !missingPrice &&
  price > 0 &&
  price <= referencePrice;
```

参考申报价只作为 `referencePrice` 上限参与校验，不参与价格赋值。任一必需价格缺失时，整个站点 `canSubmit=false`。

旧任务迁移会将 `fallbackReferencePrice` 写为 `false`，防止历史任务继续按参考价提交。

### 价格回读

填写价格后等待 700ms，重新读取每个 SKU 输入框：

```ts
actualPrice = Number(input.value);
readbackMismatch = Math.abs(actualPrice - expectedPrice) > 0.001;
```

确认申报价后、点击“立即加速”前，再次打开“去获取”，按 SKU 名称核对平台已保存值：

```text
实际输入框值 == 目标规格价格 / 其他规格价格
```

不一致则停止提交，返回 `mismatches: [{ sku, expected, actual }]`。

最终确认后重新定位目标站点行，要求：

```text
站点行包含“流量加速中/查看效果”
且不再包含“立即开启”
```

否则记录为“已提交但结果不明”，不记为普通成功。

## 11.2 解析占位价清理

历史导入中出现多个站点同时使用指定规格价格 `17` 或 `18`，启用列均为“否”。根因是自闭合空单元格解析错误，不是业务填写。

清理条件：

```text
数值型指定规格价格至少 3 个
且所有数值均等于 17 或 18
```

迁移会将当前站点和任务快照中的占位价置空，并清除由占位价推导出的启用状态。导入诊断显示清理数量和占位价格。

该迁移只在 schema 升级时执行。解析器修复后，后续导入的空白价格保持为空，不再依赖价格值猜测。

## 11.3 环境迁移包

环境 JSON：

```ts
type EnvironmentPackage = {
  format: "temu-batch-traffic-environment";
  formatVersion: 1;
  pluginVersion: string;
  exportedAt: string;
  storeBinding: StoreBinding;
  state: {
    config: Config;
    stations: Station[];
    pairs: Pair[];
    cacheMeta: CacheMeta | null;
    taskQueue: TaskDefinition[];
    queueState: QueueState;
    importDiagnostics: ImportDiagnostics | null;
    storeBinding: StoreBinding;
    logs: LogEntry[];
  };
};
```

侧边栏环境迁移流程：

```text
导出当前环境
  → JSON 下载

导入环境包
  → 格式和版本校验
  → 店铺名称匹配校验
  → 覆盖确认
  → 写入 chrome.storage.local
```

安全规则：

- 环境不包含 Cookie、账号密码、代理或指纹；
- 导入时 `running` 任务改为 `paused`；
- 所有任务 `fallbackReferencePrice` 强制为 `false`；
- 当前操作锁未释放时拒绝导入；
- 通用安装包不内置具体店铺环境；环境包必须由原店铺主动导出；
- 店铺不匹配时拒绝导入。

## 12. 版本和发布

每次更新：

1. 修改 `manifest.json` 版本；
2. 更新 `PRD.md`、`TECHNICAL_DESIGN.md`、`README.md`、`IMPLEMENTATION_PATH.md`；
3. 运行语法、导入、UI、扩展和真实页面测试；
4. 打包为：

```text
batch-traffic-accelerator-v<version>.zip
```

5. 同步到当前 BitBrowser 安装目录并原地重载。

## 13. 测试计划

### 自动化

- 任务快照独立性；
- 队列持久化和顺序；
- 商品优先排序；
- 同地区同商品只查询一次；
- 扫描锁重复点击；
- 扫描进度；
- 缓存过期自动扫描；
- Excel 诊断；
- 请求频繁自动暂停；
- 可重试失败重试；
- 提交边界分类。
- 暂停任务删除和队列指针清理；
- 档位解析、候选计算和两种选择策略；
- 旧版 `17` 占位价迁移与导入清理。

### 真实页面

- DWRG、ZSK 多个任务队列；
- 德国、法国同地区执行；
- 同商品多站点；
- 无资格商品；
- 请求频繁熔断；
- 浏览器重启后队列恢复。

## 14. 迁移

Schema 14-16：

1. 商品记录增加 `idType`，旧 `SKC导入` 中的 11 位及以下 ID 按 SPU 修正为 `spu` 字段。
2. 表格来源任务写入 `config.productSource = "tableImport"`。
3. 已确认未提交且报“缺少 SPU ID”的执行项恢复为 `pending`，任务和队列保持暂停。
4. Schema 16 追加一条一次性迁移汇总，写明 SPU/SKC 数量、恢复的执行项数量和“请手动继续”。
5. 侧边栏恢复状态时，从 `cacheMeta.source` 恢复 `page/import` 来源；缺少来源时按商品池和 `productSource` 推导，避免重载后显示“尚未载入商品”。

### 14.1 Content script 自恢复

所有侧边栏到 TEMU 页面的 `tabs.sendMessage` 统一经过 `sendTabMessage`：

1. 首次消息失败且错误为 `Receiving end does not exist` 时，调用 `chrome.scripting.executeScript` 注入 `content/content.js`；
2. 等待 300ms 后重试原消息一次；
3. 记录 `contentScriptRecoverySequence`，执行器在任务日志中追加恢复成功日志；
4. 注入失败时不循环重试，返回明确错误并暂停队列。

该机制处理扩展原地重载后旧隔离世界失效的问题，不依赖刷新页面，避免丢失当前筛选和弹窗状态。

店铺比较统一经过 `normalizeStoreName`，移除末尾的“0 人关注/1.2 万人关注”等动态展示文本，再去除空白并转小写。店铺主名称仍必须完全一致。

### 14.2 商品 ID 类型控件兼容

`queryTrafficItem` 使用 `QUERY_ID_TYPE_VALUES = Set("SPU", "SKC", "SKU")` 定位只读类型输入框。切换类型后重新查询控件，避免 React 重渲染后继续读取旧 DOM 节点。

Schema 17 会把未提交且报“没有找到商品 ID 类型选择框”的执行项恢复为 `pending`，任务和队列保持暂停。

### 14.3 系统性异常熔断

`detectSystemicStationFailure` 检查单个商品的站点结果。至少 3 个站点全部为未提交的 `exception/failed`，且错误文本完全一致时返回系统错误。正常无资格、未找到站点行等业务结果不触发。

触发后任务、队列和当前 run 均设为 `paused`，当前商品未提交项恢复为 `pending`，不继续下一商品。

### 14.4 单执行租约

后台保存 `traffic_spec_execution_lease`：

```ts
type ExecutionLease = {
  ownerId: string;
  acquiredAt: number;
  renewedAt: number;
  expiresAt: number;
};
```

执行页面每 15 秒续租 60 秒。其他页面申请失败后不能启动队列。非执行页面请求暂停时，后台直接更新持久化队列状态并广播 `QUEUE_FORCE_PAUSED`。

### 14.5 状态压缩

持久化任务时只保存发生变化的执行项。恢复时通过任务快照中的商品、站点和分组重建完整项目，再叠加已保存状态。

500ms 防抖保存只作用于滑动进度；暂停、继续、任务加入队列和执行结束使用立即保存。日志在持久化前截断到任务 1000 条、队列 500 条。

### 14.6 UI 渲染预算

- 隐藏步骤页不渲染；
- 切换步骤时重新渲染目标页；
- 执行时间线只显示最近 80 个非待处理项；
- 日志仍只渲染最近 120 条。

性能测试以 3800 个执行项验证：DOM 节点约 1600 个，持久化状态约 0.07 MB。

大规模实际队列验证：

```text
优化前：
  DOM 约 40505
  持久化约 2.37 MB
  6422 个执行项全部写入存储

优化后：
  DOM 约 2454
  持久化约 0.41 MB
  仅保存 494 个已变化项目
  页面恢复后仍重建 6422 个完整执行项
```

### 14.7 价格弹窗根节点

`findPriceModalRoot` 从可见“调整申报价”标题向上查找至少包含 2 个可见规格行的容器。确认和取消按钮通过 `findVisibleButtonIn` 在该容器内定位。

确认后的关闭检查改为 `!findPriceModalRoot()`，等待上限 15 秒。

现场进一步确认：确认按钮未关闭弹窗的原因是部分填写价格高于超级流量加权参考申报价。旧实现从固定 `cells[3]` 读取参考价，实际页面结构并不固定；同时任务配置未显式传入 `guardReferencePrice`。

修复规则：

- 从整行文本提取参考申报价格；
- `guardReferencePrice !== false` 时默认开启上限校验；
- 超价行使 `canSubmit=false`，直接进入配置异常，不点击确认。

### 14.8 自适应间隔状态

任务执行快照增加：

```ts
rateControl: {
  configuredSeconds: number;
  currentSeconds: number;
  minimumSeconds: number;
  healthyStreak: number;
}
```

无请求频繁时从 10 秒开始，连续 3 个无 `failed` 商品后降低 1 秒，最低 8 秒。请求频繁时恢复到配置上限。

### 14.9 批量查询限制

实际页面按 SKC 查询后，结果行只包含 SPU，不包含 SKC。SKC-only 任务无法安全地把多 ID 返回行映射回原任务，因此批量查询等待后续 SPU-SKC 映射能力。

## 15. 当前开放问题

真实提交链路仍存在：

1. 继续让价确认弹窗超时；
2. 加速弹窗加载超时；
3. 最终确认后状态回读失败。

这些问题的根因尚未完成真实页面复现。第 3 类可能已经产生平台提交，重试前必须人工核对，不能按普通可重试失败自动处理。

从 v0.5.2 迁移：

1. 当前配置转换为第一个任务草稿；
2. 当前站点和缓存复制到任务快照；
3. 当前日志迁移到任务日志；
4. 保留当前启用站点、价格和缓存；
5. 不自动启动迁移后的任务。
