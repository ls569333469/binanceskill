# MEME Alpha Trading Dashboard — 产品需求文档 (PRD)

> 版本：v2.1 | 日期：2026-03-14 | 状态：待开发

---

## 1. 项目概述

### 1.1 产品定位
构建MEME代币数据监控面板，自动采集链上热门MEME数据做数据储备，监控Binance Alpha新上线代币，一旦匹配到已储备的热门数据则即时通知用户。

### 1.2 核心价值
- **信息差**：比手动刷页面更快、更全面地发现潜力MEME代币
- **数据储备**：持续积累热门代币的历史数据，为交易决策提供依据
- **自动匹配**：Alpha新代币上线后自动与储备数据匹配，推送通知

### 1.3 不做什么
- ❌ 自动交易（Alpha无下单API，Spot后续按需接入）
- ❌ 实时秒级推送（使用1H/4H周期，非高频）

---

## 2. 技术栈

| 层 | 选型 | 版本 | 理由 |
|----|------|------|------|
| 后端框架 | **Hono** | latest | 极快、原生TypeScript、Web Standard |
| ORM | **Drizzle ORM** | latest | 全类型安全、轻量、SQL-like |
| 数据库 | **SQLite** | via better-sqlite3 | 零部署、单文件、够用 |
| 前端 | **Vite + React** | latest | 标准前端方案 |
| 调度 | **node-cron** | latest | 轻量定时任务 |
| 语言 | **TypeScript** | 5.x | 全栈类型安全 |
| 通知 | **OpenClaw** | 后期 | 演示比赛用 |
| 部署 | 本地 → RackNerd | - | 先本地快速测试 |

---

## 3. 数据源说明

### 3.1 Binance Skills API（已验证 10/10 通过）

| API | 用途 | 频率 | 认证 |
|-----|------|------|------|
| unified-rank | 热门代币排行（含过滤） | 1H | 无需 |
| smart-money-inflow | Smart Money 资金流入 | 4H | 无需 |
| trading-signal | Smart Money 交易信号 | 1H | 无需 |
| alpha-token-list | Alpha 代币全量列表 | 1H | 无需 |
| social-hype | 社交热度排行 | 4H | 无需 |
| meme-rush | Meme Rush 热点代币 | 4H | 无需 |
| token-audit | 代币安全审计（按需） | 按需 | 无需 |

### 3.2 API 性能（实测）
- 平均响应：**300-500ms**
- 无频率限制（20次连续请求无拒绝）
- 建议采集间隔：1H / 4H

### 3.3 后期数据源
- 6551 OpenNews MCP — 新闻公告实时推送
- 6551 OpenTwitter MCP — 社交媒体监控

---

## 4. 数据采集配置

### 4.1 默认过滤条件（基于前端验证）

| 参数 | API 字段 | 默认值 | 说明 |
|------|---------|--------|------|
| 链 | `chainId` | `"56"` / `"CT_501"` | BSC + Solana |
| 排行类型 | `rankType` | `10` | 热门 |
| 时间周期 | `period` | `30` / `40` | 1H / 4H |
| 市值最小 | `marketCapMin` | `100000` | $100K |
| 交易量最小 | `volumeMin` | `50000` | $50K |
| 币安持币人 | `kycHoldersMin` | `100` | 最小100人 |
| 审计过滤 | `auditFilter` | `[0,1,2]` | 已弃权+非冻结+非增发 |
| 币龄上限 | `launchTimeMax` | `129600` | 90天（单位：分钟） |
| 排序 | `sortBy` | `40` | 按市值 |
| 排序方向 | `orderAsc` | `false` | 降序 |

> ⚠️ 踩坑记录：`launchTimeMax` 接受**分钟值**，非SKILL文档标注的"timestamp ms"

### 4.2 参数详细映射

详见 [filter_mapping.md](../docs/filter_mapping.md)

---

## 5. 数据库设计

### 5.1 ER 关系

```
tokens (1) ──< (N) token_snapshots
tokens (1) ──< (1) token_audits
alpha_tokens (独立)
smart_money_signals (独立)
collector_config (系统配置)
```

### 5.2 Schema（Drizzle ORM TypeScript）

#### tokens — 代币主表
```typescript
export const tokens = sqliteTable('tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull(),
  chainId: text('chain_id').notNull(),       // '56' | 'CT_501'
  contractAddress: text('contract_address'),
  name: text('name'),
  launchTime: integer('launch_time'),
  firstSeenAt: text('first_seen_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniqChainContract: uniqueIndex('uniq_chain_contract').on(t.chainId, t.contractAddress),
}));
```

#### tokenSnapshots — 定时快照（核心数据）
```typescript
export const tokenSnapshots = sqliteTable('token_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tokenId: integer('token_id').references(() => tokens.id),
  source: text('source').notNull(),           // 'unified-rank' | 'meme-rush'
  capturedAt: text('captured_at').default(sql`(datetime('now'))`),
  period: integer('period'),                  // 30=1h, 40=4h
  price: real('price'),
  marketCap: real('market_cap'),
  liquidity: real('liquidity'),
  volume: real('volume'),
  holders: integer('holders'),
  kycHolders: integer('kyc_holders'),
  percentChange: real('percent_change'),
  top10HoldersPct: real('top10_holders_pct'),
  extraJson: text('extra_json'),              // 其余字段JSON存储
}, (t) => ({
  idxTokenTime: index('idx_snapshots_token').on(t.tokenId, t.capturedAt),
}));
```

#### alphaTokens — Alpha 代币追踪
```typescript
export const alphaTokens = sqliteTable('alpha_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull(),
  chainId: text('chain_id').notNull(),
  contractAddress: text('contract_address'),
  firstSeenAt: text('first_seen_at').default(sql`(datetime('now'))`),
  isNew: integer('is_new').default(1),        // 1=新发现
  matched: integer('matched').default(0),     // 1=已匹配到热门数据
}, (t) => ({
  uniqAlpha: uniqueIndex('uniq_alpha_chain').on(t.chainId, t.contractAddress),
}));
```

#### smartMoneySignals — Smart Money 信号
```typescript
export const smartMoneySignals = sqliteTable('smart_money_signals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chainId: text('chain_id'),
  ticker: text('ticker'),
  contractAddress: text('contract_address'),
  direction: text('direction'),               // 'buy' | 'sell'
  alertPrice: real('alert_price'),
  maxGain: real('max_gain'),
  smartMoneyCount: integer('smart_money_count'),
  status: text('status'),
  capturedAt: text('captured_at').default(sql`(datetime('now'))`),
});
```

#### tokenAudits — 安全审计
```typescript
export const tokenAudits = sqliteTable('token_audits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chainId: text('chain_id'),
  contractAddress: text('contract_address'),
  riskLevel: text('risk_level'),              // 'LOW' | 'MID' | 'HIGH'
  buyTax: real('buy_tax'),
  sellTax: real('sell_tax'),
  riskItemsJson: text('risk_items_json'),
  auditedAt: text('audited_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniqAudit: uniqueIndex('uniq_audit').on(t.chainId, t.contractAddress),
}));
```

#### collectorConfig — 采集配置（前端可编辑）
```typescript
export const collectorConfig = sqliteTable('collector_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),      // 'trending_bsc_1h'
  enabled: integer('enabled').default(1),
  cronExpr: text('cron_expr').default('0 * * * *'),
  paramsJson: text('params_json').notNull(),   // API参数JSON
});
```

---

## 6. 后端架构

### 6.1 目录结构
```
src/
├── server.ts              # Hono 入口 + API 路由
├── db/
│   ├── schema.ts          # Drizzle schema 定义
│   ├── index.ts           # DB 连接 + 初始化
│   └── seed.ts            # 默认配置数据
├── collectors/
│   ├── base.ts            # 采集器基类（HTTP请求封装）
│   ├── unified-rank.ts    # 热门代币
│   ├── smart-money.ts     # Smart Money 流入 + 信号
│   ├── alpha-list.ts      # Alpha 代币列表
│   ├── social-hype.ts     # 社交热度
│   ├── meme-rush.ts       # Meme Rush
│   └── token-audit.ts     # 安全审计（按需触发）
├── scheduler.ts           # node-cron 定时调度
├── matcher.ts             # Alpha ↔ 热门数据匹配引擎
└── routes/
    ├── tokens.ts           # GET /api/tokens
    ├── snapshots.ts        # GET /api/snapshots
    ├── signals.ts          # GET /api/signals
    ├── alpha.ts            # GET /api/alpha
    └── config.ts           # GET/PUT /api/config
```

### 6.2 REST API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/tokens` | GET | 代币列表（含最新快照数据） |
| `/api/tokens/:id/history` | GET | 代币历史快照（趋势分析用） |
| `/api/signals` | GET | Smart Money 信号列表 |
| `/api/alpha` | GET | Alpha 代币列表 |
| `/api/alpha/new` | GET | 新发现的 Alpha 代币 |
| `/api/config` | GET | 获取所有采集配置 |
| `/api/config/:name` | PUT | 更新采集配置（过滤条件/频率） |
| `/api/stats` | GET | 数据统计概览 |
| `/api/collector/run/:name` | POST | 手动触发某个采集器 |

### 6.3 采集调度

| 采集器 | Cron 表达式 | 链 | 说明 |
|--------|-----------|-----|------|
| unified-rank-1h | `0 * * * *` | BSC+SOL | 每整点 |
| unified-rank-4h | `0 */4 * * *` | BSC+SOL | 每4小时 |
| smart-money-inflow | `0 */4 * * *` | BSC+SOL | 每4小时 |
| trading-signal | `0 * * * *` | BSC+SOL | 每整点 |
| alpha-token-list | `0 * * * *` | 全量 | 每整点（差异更新） |
| social-hype | `0 */4 * * *` | BSC | 每4小时 |
| meme-rush | `0 */4 * * *` | BSC+SOL | 每4小时 |

---

## 7. 前端设计

### 7.1 页面规划

| 页面 | 路由 | 功能 |
|------|------|------|
| **Dashboard** | `/` | 总览：采集状态、今日新代币数、活跃信号数、数据量 |
| **热门代币** | `/tokens` | 表格展示全部代币 + 过滤 + 排序 + 点击查看详情 |
| **代币详情** | `/tokens/:id` | 代币历史数据、市值/持有人趋势图、安全审计结果 |
| **Smart Money** | `/signals` | 信号时间线 + 买卖方向标记 + 关联代币跳转 |
| **Alpha 监控** | `/alpha` | Alpha 代币列表 + 新上线高亮 + 匹配状态标记 |
| **配置** | `/config` | 采集器开关、过滤条件编辑、调度频率设置 |

### 7.2 Dashboard 数据卡片
- 已采集代币总数
- 24h 新发现代币数
- 活跃 Smart Money 信号数
- Alpha 代币总数 / 新增数
- 最近一次采集时间 + 状态
- 各采集器运行状态（绿/灰/红）

---

## 8. 执行计划

### Phase 1: 后端数据采集（预计 2-3 天）

| 步骤 | 任务 | 产出 |
|------|------|------|
| 1.1 | 项目初始化（TypeScript + Hono + Drizzle） | `package.json`, `tsconfig.json` |
| 1.2 | 数据库 Schema + 初始化 + 默认配置 | `src/db/` |
| 1.3 | 采集器基类（HTTP封装 + 错误处理 + 日志） | `src/collectors/base.ts` |
| 1.4 | unified-rank 采集器 | 热门代币入库 |
| 1.5 | alpha-list 采集器（差异更新） | Alpha 代币追踪 |
| 1.6 | smart-money + trading-signal 采集器 | 信号入库 |
| 1.7 | 定时调度器 | `src/scheduler.ts` |
| 1.8 | REST API 路由 | 数据查询接口 |
| 1.9 | 验证：启动后检查数据入库 | 通过 |

### Phase 2: 前端 Dashboard（预计 2-3 天）

| 步骤 | 任务 | 产出 |
|------|------|------|
| 2.1 | Vite + React 项目搭建 | 前端骨架 |
| 2.2 | Dashboard 总览页 | 数据卡片 + 状态 |
| 2.3 | 热门代币表格 + 过滤 | 核心数据面板 |
| 2.4 | Alpha 监控面板 | 新代币高亮 |
| 2.5 | Smart Money 信号面板 | 买卖信号时间线 |
| 2.6 | 配置管理页面 | 过滤条件可编辑 |
| 2.7 | 前后端联调 | 完整可用 |

### Phase 3: 匹配 & 通知（预计 1-2 天）

| 步骤 | 任务 | 产出 |
|------|------|------|
| 3.1 | Alpha ↔ 热门数据匹配引擎 | 自动标记匹配 |
| 3.2 | OpenClaw 通知集成 | 新匹配时推送 |
| 3.3 | 匹配日志 + 历史记录 | 可追溯 |

---

## 9. 验证方案

| 阶段 | 验证方式 |
|------|---------|
| Phase 1 | 启动后端 → 等待1H → 检查SQLite数据 → curl API 端点 |
| Phase 2 | 浏览器打开 Dashboard → 确认数据展示 → 测试筛选功能 |
| Phase 3 | 手动添加 Alpha 代币 → 确认匹配触发 → 检查通知 |

---

## 10. 参考文档

| 文档 | 路径 | 说明 |
|------|------|------|
| API 参数映射 | `docs/filter_mapping.md` | 前端筛选 ↔ API 参数对照 |
| Skills API 参考 | `docs/binance_skills_api_reference.md` | 早期爬取的API文档 |
| Skills 完整文档 | `docs/binance-skills-hub/skills/` | GitHub完整SKILL.md |
| 测试文件 | `产品设计文档/测试文件/` | API可行性和性能测试 |
