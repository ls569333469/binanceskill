# MEME Alpha Dashboard — P2 更新计划：信号交易管道

> 版本：v1.1 | 日期：2026-03-16 | 前置：P1 Bug修复 + P2 信号管道
> v1.1 变更：双入口策略(交易量驱动+SM驱动)、负面信号因子、MEME上涨驱动模型

---

## 0. P1遗留问题修复（P2前置）

> [!CAUTION]
> 以下3个严重问题必须在P2功能开发前修复。

### Bug #1：meme-rush 采集器未实现
- **位置**：`scheduler.ts:21-22` 仅占位
- **修复**：实现 `src/collectors/meme-rush.ts`
  - 调用 `POST /bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/rank/list`
  - 参数：`chainId`, `rankType`(10=新发/20=冲刺/30=已迁移), `limit=200`
  - User-Agent: `binance-web3/1.0 (Skill)`
  - 解析后 upsert 到 `tokens` + `token_snapshots` 表
  - 新增 Topic Rush 采集（见§2.2）

### Bug #2：smart_money_signals 无去重
- **位置**：`smart-money.ts:43-54` 每次纯 INSERT
- **修复方案**：
  - 在 `smart_money_signals` 表新增唯一约束 `(chainId, contractAddress, direction, signalId)`
  - 改用 `INSERT ... ON CONFLICT DO UPDATE`（更新 status/maxGain 等变化字段）

### Bug #3：social-hype period 类型不匹配
- **位置**：`social-hype.ts:80` 传入 `period: 'social_hype'`（字符串），但 schema 定义为 `integer`
- **修复**：改为 `period: null` 或在 schema 中将 period 类型改为 `text`

### Bug #4：SM Inflow 字段映射
- **位置**：`smart-money.ts:84-99`
- **问题**：官方返回字段 `ca`（非 `contractAddress`）、`inflow`、`traders`
- **修复**：修正字段映射：`t.ca || t.contractAddress`

### Bug #5：API查询性能
- **位置**：`server.ts:42-48, 196`
- **问题**：先全量取再内存 `.filter()`
- **修复**：改用 Drizzle `.where()` 条件过滤

---

## 1. MEME 上涨驱动模型

信号系统的底层逻辑基于 MEME 上涨的三层驱动模型：

```
叙事引爆（最先） → 聪明钱先行（紧随） → 散户FOMO放量（主升浪）
```

| 阶段 | 驱动力 | 可观测信号 | 对应数据源 |
|------|--------|-----------|----------|
| 第1层 | 叙事/事件引爆 | Topic Rush 新话题、Social Hype 攀升 | topic-rush, social-hype |
| 第2层 | Smart Money 先行建仓 | SM买入信号 smartMoneyCount≥3 | trading-signal, sm-inflow |
| 第3层 | 散户 FOMO + 交易量放大 | volume5m 激增、持币人数飙升 | unified-rank (5min) |

> [!IMPORTANT]
> **核心洞察**：交易量放大是滞后指标（第3层），SM买入是领先指标（第2层）。
> 因此系统采用**双入口策略**，同时用两种方式捕捉机会，积累数据后对比效果。

---

## 2. P2 核心目标

搭建**双入口信号交易管道**，支持两种并行策略A/B测试：

```
策略A（交易量驱动）：volume5m ≥ $100K → 观察 → SM+社交+趋势确认 → 买入
策略B（SM先行驱动）：SM买入信号出现 → 观察 → 交易量+社交确认 → 买入
```

**核心原则**：
- 先跑数据，再优化策略，所有策略参数可配置、可回测
- 两种入口并行运行，用 `entryMode` 字段区分，最终用数据验证哪个更优
- 不仅识别买入机会，也识别**危险信号**（SM卖出、FOMO衰退等）

---

## 3. 新增数据采集

### 2.1 5分钟级 Trending 采集

| 配置名 | Cron | API | 参数 |
|--------|------|-----|------|
| `trending_bsc_5m` | `*/5 * * * *` | unified-rank | `period=20, chainId='56', size=200, sortBy=70` |
| `trending_sol_5m` | `*/5 * * * *` | unified-rank | `period=20, chainId='CT_501', size=200, sortBy=70` |

**过滤条件**（宽松，只保留基本质量）：
```json
{
  "rankType": 10,
  "period": 20,
  "sortBy": 70,
  "orderAsc": false,
  "size": 200,
  "marketCapMin": 10000,
  "kycHoldersMin": 10
}
```

> [!WARNING]
> **数据量预估**：每5分钟 × 2链 × 最多200条 = 每天最多 **115,200 条快照**。  
> **必须配套数据清理策略**（见§6）。

### 2.2 Topic Rush 采集（新增）

| 配置名 | Cron | API | 说明 |
|--------|------|-----|------|
| `topic_rush_latest` | `*/30 * * * *` | Topic Rush GET | `rankType=10, sort=10` 最新话题 |
| `topic_rush_viral` | `0 * * * *` | Topic Rush GET | `rankType=30, sort=30` 热门话题 |

**API端点**：
```
GET https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/social-rush/rank/list
?chainId=CT_501&rankType=30&sort=30&asc=false
```

### 2.3 K线数据按需采集（新增）

当代币进入观察列表后，自动拉取其K线数据用于技术趋势分析。

**API端点**：
```
GET https://dquery.sintral.io/u-kline/v1/k-line/candles
?address={contractAddress}&platform={bsc|solana}&interval=5min&limit=100
```

---

## 4. 数据库 Schema 变更

### 3.1 新增表：token_watchlist（观察列表）

```typescript
export const tokenWatchlist = sqliteTable('token_watchlist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tokenId: integer('token_id').references(() => tokens.id),
  chainId: text('chain_id').notNull(),
  contractAddress: text('contract_address').notNull(),
  symbol: text('symbol').notNull(),

  // 入场原因
  entryMode: text('entry_mode').notNull(),         // 'volume_driven' | 'sm_driven'
  entryReason: text('entry_reason').notNull(),    // 'volume_5m_100k' | 'sm_buy_signal'
  entryVolume: real('entry_volume'),               // 入场时交易量
  entryPrice: real('entry_price'),                 // 入场时价格
  enteredAt: text('entered_at').default(sql`(datetime('now'))`),

  // 信号评分
  smScore: real('sm_score').default(0),            // Smart Money 得分
  socialScore: real('social_score').default(0),    // 社交热度得分
  trendScore: real('trend_score').default(0),      // 技术趋势得分
  inflowScore: real('inflow_score').default(0),    // 资金流入得分
  totalScore: real('total_score').default(0),      // 综合评分
  scoreUpdatedAt: text('score_updated_at'),

  // 状态
  status: text('status').default('watching'),      // watching|buy_signal|bought|expired|dismissed
  expiresAt: text('expires_at'),                   // 超时自动过期
  signalDetailsJson: text('signal_details_json'),  // 各维度详细评分JSON
}, (t) => ({
  uniqWatch: uniqueIndex('uniq_watchlist').on(t.chainId, t.contractAddress),
  idxStatus: index('idx_watchlist_status').on(t.status),
}));
```

### 3.2 新增表：topic_rushes（话题追踪）

```typescript
export const topicRushes = sqliteTable('topic_rushes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  topicId: text('topic_id').notNull(),
  chainId: text('chain_id').notNull(),
  name: text('name'),                              // 话题名称
  type: text('type'),                              // 话题类别
  aiSummary: text('ai_summary'),                   // AI分析摘要
  netInflow: real('net_inflow'),                   // 总净流入
  netInflow1h: real('net_inflow_1h'),              // 1h净流入
  netInflowAth: real('net_inflow_ath'),            // 历史最高
  tokenSize: integer('token_size'),                // 关联代币数
  progress: text('progress'),
  capturedAt: text('captured_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniqTopic: uniqueIndex('uniq_topic').on(t.topicId, t.chainId),
}));
```

### 3.3 新增表：token_klines（K线缓存）

```typescript
export const tokenKlines = sqliteTable('token_klines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chainId: text('chain_id').notNull(),
  contractAddress: text('contract_address').notNull(),
  interval: text('interval').notNull(),            // '5min','1h','4h'
  timestamp: integer('timestamp').notNull(),       // K线时间戳
  open: real('open'),
  high: real('high'),
  low: real('low'),
  close: real('close'),
  volume: real('volume'),
  count: integer('count'),
}, (t) => ({
  uniqKline: uniqueIndex('uniq_kline').on(t.chainId, t.contractAddress, t.interval, t.timestamp),
}));
```

### 4.4 新增表：signal_strategy_config（策略配置）

```typescript
export const signalStrategyConfig = sqliteTable('signal_strategy_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),           // 'strategy_a_volume' | 'strategy_b_sm'
  enabled: integer('enabled').default(1),
  entryMode: text('entry_mode').notNull(),         // 'volume_driven' | 'sm_driven'

  // 入场条件 — 策略A
  entryVolume5mMin: real('entry_volume_5m_min').default(100000), // $100K
  // 入场条件 — 策略B
  entrySmCountMin: integer('entry_sm_count_min').default(3),     // SM地址数≥3

  // 信号权重（两种策略可配不同权重）
  weightSm: real('weight_sm').default(30),         // Smart Money 权重
  weightSocial: real('weight_social').default(20), // 社交热度 权重
  weightTrend: real('weight_trend').default(25),   // 技术趋势 权重
  weightInflow: real('weight_inflow').default(25), // 资金流入 权重

  // 买入阈值
  buyThreshold: real('buy_threshold').default(70), // 综合评分≥70触发买入信号
  watchExpireMinutes: integer('watch_expire_minutes').default(60), // 观察超时(分钟)
  paramsJson: text('params_json'),                 // 其他可扩展参数
});
```

### 4.5 修改现有表

```diff
-- smart_money_signals 新增唯一约束
+ uniqSignal: uniqueIndex('uniq_signal').on(chainId, contractAddress, direction, capturedAt的日期部分)

-- token_snapshots.period 类型变更
- period: integer('period')
+ period: text('period')   // 兼容 '20'(5m), '30'(1h), '40'(4h), 'social_hype'
```

### 4.6 策略默认数据 (seed)

```typescript
// 策略A：交易量驱动
{ name: 'strategy_a_volume', entryMode: 'volume_driven',
  entryVolume5mMin: 100000, entrySmCountMin: 0,
  weightSm: 30, weightSocial: 20, weightTrend: 25, weightInflow: 25,
  buyThreshold: 70, watchExpireMinutes: 60 },

// 策略B：SM先行驱动
{ name: 'strategy_b_sm', entryMode: 'sm_driven',
  entryVolume5mMin: 0, entrySmCountMin: 3,
  weightSm: 20, weightSocial: 25, weightTrend: 25, weightInflow: 30,
  buyThreshold: 65, watchExpireMinutes: 120 },
```

> [!NOTE]
> 策略B的权重与策略A不同：SM权重降低（因为SM信号是入场条件，已经过滤了），
> 社交和资金流入权重提高（用来确认叙事扩散和FOMO启动）。

---

## 5. 信号评估引擎设计

### 5.1 双入口架构

```
┌─ 入口A（交易量驱动）──────────────────────────┐
│  unified-rank 5min → volume5m ≥ $100K         │
│  entryMode = 'volume_driven'                   │
└───────────────┬────────────────────────────────┘
                │
                ▼
         ┌──────────────┐      evaluateWatchlist()
         │  观察列表     │ ──→ 四维评估 → 综合评分 → 买入/观望
         │  watchlist   │
         └──────────────┘
                ▲
                │
┌─ 入口B（SM先行驱动）──────────────────────────┐
│  trading-signal → sm买入 & count ≥ 3           │
│  entryMode = 'sm_driven'                       │
└───────────────┴────────────────────────────────┘
```

**入场逻辑** (`src/engine/watchlist.ts`)：

```typescript
// 每5分钟执行
async function scanForEntry() {
  // --- 入口A：交易量驱动 ---
  // 查最近5min快照中 volume5m ≥ strategy_a.entryVolume5mMin 的代币
  // 不在watchlist中的 → 插入，entryMode='volume_driven'

  // --- 入口B：SM先行驱动 ---
  // 查最近1h内 trading-signal 中 direction='buy' 且
  // smartMoneyCount ≥ strategy_b.entrySmCountMin 的代币
  // 不在watchlist中的 → 插入，entryMode='sm_driven'
}
```

### 5.2 四维正向评分（0-100）

#### Smart Money 评分

| 条件 | 得分 |
|------|------|
| trading-signal 有 buy 信号且 smartMoneyCount ≥ 5 | 80 |
| trading-signal 有 buy 信号且 smartMoneyCount ≥ 3 | 60 |
| smart-money-inflow 净流入 > $50K | +20 |
| smart-money-inflow 净流入 > $10K | +10 |

#### 社交热度评分

| 条件 | 得分 |
|------|------|
| Social Hype 排名前10 | 90 |
| Social Hype 排名前30 | 70 |
| 有 Topic Rush 热门话题关联 | +20 |
| Topic Rush 话题净流入1h > $10K | +10 |
| sentiment = Positive | +10 |

#### 技术趋势评分

| 条件 | 得分 |
|------|------|
| 5min K线：连续3根阳线 | 60 |
| 价格在1h内上涨 > 5% | +20 |
| 交易量持续放大（后3根 > 前3根均值×150%） | +20 |
| 价格破前高 | +10 |

#### 资金流入评分

| 条件 | 得分 |
|------|------|
| unified-rank 交易量5min持续增长 | 60 |
| 币安持币人数1h增长 > 10% | +20 |
| Topic Rush 话题净流入为正 | +20 |

### 5.3 负面信号因子（关键新增）

> [!WARNING]
> 负面信号直接扣减总分，严重负面信号可触发**强制移出**观察列表。

#### 扣分因子

| 危险信号 | 扣分 | 含义 |
|---------|------|------|
| SM信号 direction='sell' 出现 | -25 | 聪明钱在跑 |
| exitRate > 70% | -20 | 大部分SM已退出 |
| volume5m 连续3期下降 | -15 | FOMO衰退 |
| K线出现长上影线 | -10 | 上方抛压重 |
| sentiment = Negative | -15 | 社区情绪转负 |
| 流入减少趋势（inflow1h 转负） | -15 | 资金流出 |
| Top10持有者占比 > 80% | -10 | 筹码过度集中 |

#### 强制移出条件（status→'dismissed'）

| 条件 | 说明 |
|------|------|
| 审计 riskLevel = 'HIGH' | 合约高风险 |
| SM sell 信号数 > buy 信号数 | 聪明钱净卖出 |
| volume5m 归零（连续2期 < $1K） | 流动性消失 |
| 超过 watchExpireMinutes 未触发买入 | 超时过期 |

### 5.4 综合评分公式

```
rawScore = smScore × weightSm/100
         + socialScore × weightSocial/100
         + trendScore × weightTrend/100
         + inflowScore × weightInflow/100

totalScore = max(0, rawScore + 负面扣分总和)
```

- `totalScore ≥ buyThreshold` → status = **'buy_signal'** 🟢
- `totalScore ≥ 40` → status = **'watching'** 🟡（继续观察）
- `totalScore < 40` 或触发强制条件 → status = **'dismissed'** ⚪

### 5.5 两种策略的权重差异

| 权重 | 策略A（交易量驱动） | 策略B（SM先行） | 设计原因 |
|------|-------------------|-----------------|----------|
| SM | **30%** | **20%** | B用SM做入场，评分中降低避免重复 |
| 社交 | 20% | **25%** | B需更多社交确认叙事扩散 |
| 趋势 | 25% | 25% | 两者都需技术确认 |
| 流入 | 25% | **30%** | B需资金流入确认FOMO启动 |
| 买入阈值 | **70** | **65** | B入场更早，阈值稍低 |
| 超时 | 60min | **120min** | B给更多时间等待确认信号 |

---

## 6. 新增 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/watchlist` | GET | 观察列表（支持 ?status=watching/buy_signal） |
| `/api/watchlist/:id` | PUT | 更新状态（dismissed/bought） |
| `/api/watchlist/evaluate` | POST | 手动触发信号评估 |
| `/api/topics` | GET | Topic Rush 话题列表 |
| `/api/strategy` | GET/PUT | 策略配置（权重/阈值） |
| `/api/klines/:chainId/:address` | GET | 获取K线数据（自动缓存） |

---

## 7. 数据清理策略

| 表 | 清理规则 | 频率 |
|----|---------|------|
| `token_snapshots` | 保留7天内数据 + 每个代币每天保留1条(取最高交易量) | 每日凌晨 |
| `token_klines` | 保留3天内5min级别，7天内1h级别 | 每日凌晨 |
| `token_watchlist` | status=expired/dismissed 保留30天 | 每周 |
| `smart_money_signals` | 保留30天 | 每周 |
| `topic_rushes` | 保留14天 | 每周 |

---

## 8. 后端目录结构更新

```diff
  src/
  ├── server.ts
  ├── scheduler.ts
  ├── db/
  │   ├── schema.ts          # + 4张新表
  │   ├── index.ts
- │   └── seed.ts            # 更新默认配置
+ │   ├── seed.ts            # + 5min采集 + topic rush + 策略配置
+ │   └── cleanup.ts         # 新增：数据清理任务
  ├── collectors/
  │   ├── base.ts
  │   ├── unified-rank.ts
  │   ├── alpha-list.ts
  │   ├── smart-money.ts     # 修复：去重 + 字段映射
  │   ├── social-hype.ts     # 修复：period类型
  │   ├── token-audit.ts
+ │   ├── meme-rush.ts       # 新增：Meme Rush采集
+ │   ├── topic-rush.ts      # 新增：Topic Rush采集
+ │   └── kline.ts           # 新增：K线按需采集
  ├── engine/
  │   ├── matcher.ts          # 保留：Alpha匹配
+ │   ├── watchlist.ts        # 新增：观察列表入场逻辑
+ │   ├── signal-evaluator.ts # 新增：多维信号评估引擎
+ │   └── trend-analyzer.ts   # 新增：K线技术分析
```

---

## 9. 前端更新

### 新增页面

| 页面 | 路由 | 功能 |
|------|------|------|
| **观察列表** | `/watchlist` | 核心面板：实时展示候选代币 + 各维度得分 |
| **策略配置** | `/strategy` | 权重/阈值/入场条件可视化编辑 + A/B策略对比 |

### 观察列表页面设计

```
┌──────────────────────────────────────────────────────────────────────┐
│  📋 观察列表       [🔄评估] [⚙️策略]  入口: [全部▼]  状态: [全部▼]  │
├──────────────────────────────────────────────────────────────────────┤
│ Symbol │Chain│ Price  │ Vol5m │ 入口 │ SM │社交│趋势│流入│ 总分│ 状态  │
│ PEPE   │ BSC │ $0.01  │ $150K │ 📊量 │ 85 │ 70 │ 60 │ 75 │ 73.5│ 🟢买入│
│ BONK   │ SOL │ $0.003 │  $30K │ 💰SM │ 70 │ 80 │ 55 │ 60 │ 66.5│ 🟢买入│
│ DOGE   │ SOL │ $0.30  │ $120K │ 📊量 │ 40 │ 80 │ 55 │ 60 │ 57.5│ 🟡观察│
│ WIF    │ SOL │ $0.50  │  $15K │ 💰SM │ 60 │ 30 │ 40 │ 35 │ 42.0│ 🟡观察│
│ XYZ    │ BSC │ $0.005 │ $105K │ 📊量 │ 20 │ 10 │ 40 │ 35 │ 26.0│ ⚪移出│
└──────────────────────────────────────────────────────────────────────┘
  📊量 = 交易量驱动入场(策略A)    💰SM = SM先行驱动入场(策略B)
```

### 策略对比看板（新增）

```
┌─────────────────────────────────────────────┐
│  📊 策略A/B 对比               过去7天数据  │
├─────────────────────────────────────────────┤
│           │  策略A(交易量) │  策略B(SM先行) │
│ 入场次数  │     45         │     12         │
│ 买入信号  │      8         │      5         │
│ 平均入场价│   较高(第3层)  │   较低(第2层)  │
│ 信号准确率│   待积累       │   待积累       │
└─────────────────────────────────────────────┘
```

---

## 10. 调度器更新

| 任务 | Cron | 说明 |
|------|------|------|
| **trending_bsc_5m** | `*/5 * * * *` | 5min BSC 热门 |
| **trending_sol_5m** | `*/5 * * * *` | 5min Solana 热门 |
| **watchlist_entry_volume** | `*/5 * * * *` | 入口A：volume5m ≥ $100K 入观察列表 |
| **watchlist_entry_sm** | `*/5 * * * *` | 入口B：SM买入 count≥3 入观察列表 |
| **signal_evaluate** | `*/5 * * * *` | 对观察列表执行信号评估（含负面信号检测） |
| **topic_rush** | `*/30 * * * *` | Topic Rush 话题采集 |
| **meme_rush_bsc** | `0 */4 * * *` | Meme Rush BSC（修复） |
| **meme_rush_sol** | `0 */4 * * *` | Meme Rush Solana（修复） |
| **data_cleanup** | `0 3 * * *` | 每日凌晨3点数据清理 |
| 其余现有任务 | 不变 | trending_1h/4h, sm, alpha 等 |

---

## 11. 执行步骤

### Step 1：修复P1遗留Bug（预计2-3h）
- [ ] 修复 smart_money_signals 去重
- [ ] 修复 social-hype period 类型
- [ ] 修复 SM Inflow 字段映射
- [ ] 修复 tokens/matches API 查询性能
- [ ] 实现 meme-rush 采集器

### Step 2：Schema扩展 + 新采集器（预计3-4h）
- [ ] 新增4张表（watchlist, topic_rushes, token_klines, signal_strategy_config）
- [ ] 实现 topic-rush 采集器
- [ ] 实现 kline 按需采集器
- [ ] 更新 seed.ts（5min采集 + 策略A/B默认配置）
- [ ] 新增 5min 采集配置

### Step 3：双入口信号引擎（预计4-5h）
- [ ] 实现 watchlist.ts 双入口入场逻辑（volume + SM）
- [ ] 实现 signal-evaluator.ts 四维评估 + 负面信号扣分
- [ ] 实现 trend-analyzer.ts K线分析
- [ ] 新增 API 端点（watchlist, topics, strategy, klines）
- [ ] 更新 scheduler（双入口 + 评估任务）

### Step 4：数据清理 + 前端（预计3-4h）
- [ ] 实现 cleanup.ts 数据清理
- [ ] 前端新增观察列表页面（含双入口标记 📊/💰）
- [ ] 前端新增策略A/B对比看板
- [ ] 前后端联调

### Step 5：跑数据 + 策略优化（持续）
- [ ] 启动系统，两种策略并行积累数据
- [ ] 对比策略A vs 策略B的入场次数、信号准确率
- [ ] 调整权重和阈值
- [ ] 确定最优策略或混合使用

---

## 12. 验证方案

| 阶段 | 验证方式 |
|------|---------|
| Bug修复 | 启动后端 → curl各API → 确认数据正确入库 |
| 5min采集 | 等待5分钟 → 检查新快照 → 确认volume5m字段 |
| 入口A | 手动设低阈值(vol≥$1K) → 确认代币自动入列 entryMode='volume_driven' |
| 入口B | 确认SM信号采集后 → 自动入列 entryMode='sm_driven' |
| 信号评估 | 手动触发 `/api/watchlist/evaluate` → 检查正向评分+负面扣分 |
| 负面信号 | 找一个SM sell信号的代币 → 确认扣分生效 |
| Topic Rush | 检查 topic_rushes 表数据 → 确认AI摘要入库 |
| 策略对比 | 跑24h后 → 对比两种入口的入场数和得分分布 |
| 前端 | 浏览器验证观察列表 + 策略对比看板 |
