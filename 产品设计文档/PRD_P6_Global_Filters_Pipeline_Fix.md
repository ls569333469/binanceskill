# PRD - P6: 全局过滤漏斗、信号管道修复与系统配置页重构

**生成时间**: 2026-03-17  
**前置阶段**: P3 (多维信号攻坚) → P4 (Deep Space Dark UI) → P5 (Paper Trading 自动回测)  
**本阶段目标**: 解决观察列表停滞、拦截垃圾合约、补齐策略入场参数的前端编辑入口

---

## 一、阶段背景与驱动问题

P5 完成后，系统虽然已经具备了从 `Buy Signal` → 自动纸面下单 → 止盈止损平仓 → 策略胜率统计的完整闭环，但实际运行中暴露了三个核心阻塞点：

1. **垃圾合约泛滥**: 热门代币列表中混入大量持币地址 ≤ 1、流动池接近 0 的诈骗 / 空壳 CA，污染了 Dashboard 展示和 Watchlist 评估。
2. **观察列表 (Watchlist) 完全停滞**: 长时间没有任何新代币流入打分队列，导致 Paper Trading 无新单产出。
3. **策略入场口径不可控**: `entryVolume5mMin` (5分钟最低交易量) 和 `entrySmCountMin` (SM入场人数) 两个关键入场门槛参数仅存在于后端配置，前端无法编辑。

---

## 二、核心修改清单

### 2.1 全局防黑盒过滤漏斗 (Global Filters)

**改动文件**: `src/server.ts` (后端 API 层) + `web/src/pages/SystemConfig.tsx` (前端配置页)

#### 后端实现

在 `/api/tokens` 的返回通道中，插入了一套硬性底线拦截过滤器，直接从数据库 `collectorConfig` 表读取 `global_filters` 键的 JSON 参数：

| 参数名 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `minBinanceHolders` | int | 最低币安 Web3 持币地址数 | 1 |
| `minLiquidity` | float | 最低资金池流动性 ($) | 10,000 |
| `minVolume24h` | float | 24小时最低交易量 ($) | 0 |
| `minMarketCap` | float | 最低市值 ($) | 0 |
| `maxMarketCap` | float | 最高市值上限 ($, 0=不限) | 0 |

```typescript
// src/server.ts: /api/tokens 端点 (lines 67-83)
const gfConfig = db.select().from(schema.collectorConfig)
  .where(eq(schema.collectorConfig.name, 'global_filters')).get();
const gfParams = gfConfig?.paramsJson ? JSON.parse(gfConfig.paramsJson) : {};

const cleanResult = result.filter(item => {
  const snap = item.latestSnapshot;
  if (!snap) return false;
  if (gfParams.minBinanceHolders && (snap.holders || 0) < gfParams.minBinanceHolders) return false;
  if (gfParams.minLiquidity && (snap.liquidity || 0) < gfParams.minLiquidity) return false;
  // ... 其余字段类似
  return true;
});
```

#### 前端配置面板

在 `SystemConfig.tsx` 中新增了"🛡️ 全局过滤"选项卡，采用 Deep Space Dark 面板卡片风格，包含上述 5 个参数的数值输入框和说明性文字。前端通过 `PUT /api/config/:name` 端点将修改实时写回 `collectorConfig` 表。

**前端数据水合 Bug 修复**：`fetchConfig()` 返回的是原生 JSON 数组 `[...]`，而非 `{ configs: [...] }` 对象，导致初始版本渲染时 `configs.find(c => c.name === 'global_filters')` 返回 `undefined` 而卡在"加载中"。修复方案：

```typescript
// 修正前
fetchConfig().then(d => setConfigs(d.configs || d.data || []))
// 修正后
fetchConfig().then(d => setConfigs(Array.isArray(d) ? d : (d.configs || d.data || [])))
```

---

### 2.2 观察列表 (Watchlist) 停滞 Bug 修复

**改动文件**: `src/engine/watchlist.ts` + `src/engine/signal-evaluator.ts` + `src/engine/matcher.ts`

#### 根因分析

系统的引擎代码在与 SQLite 交互时，使用 JavaScript 的 `new Date().toISOString()` 生成时间戳字符串。该方法产出的格式为 `2026-03-17T10:30:00.000Z`，其中包含的 `T` 字符与 SQLite 内部 `datetime()` 函数产出的格式 (`2026-03-17 10:30:00`) 不一致。

这意味着所有基于字符串对比的 SQL 时间查询（例如 `gte` / "≥ 某个时刻的记录"）全部失效 — 引擎误以为"最近没有任何新数据"，于是不再往 Watchlist 中写入新代币。

#### 修复方案

在 3 个引擎文件的所有时间戳生成点，统一替换为 SQLite 兼容格式：

```typescript
// 修正前
const since = new Date(Date.now() - someMs).toISOString();
// 修正后
const since = new Date(Date.now() - someMs).toISOString().replace('T', ' ').slice(0, 19);
```

**涉及修改点**:
- `watchlist.ts`: 5 处 `.toISOString()` 调用
- `signal-evaluator.ts`: 7 处 `.toISOString()` 调用
- `matcher.ts`: 1 处 `.toISOString()` 调用

修复后，Watchlist 立即恢复运转，当天即涌入 700+ 代币进入观察队列，82 个达标代币产出了买入信号 (`buy_signal`)。

---

### 2.3 策略入场口径回归

**改动文件**: `web/src/pages/SystemConfig.tsx`

在策略配置卡片中补齐了两个关键的入场阀门设置：

| 字段名 | 前端显示 | 说明 |
|--------|----------|------|
| `entryVolume5mMin` | 5分钟交易量下限 ($) | 代币近 5 分钟累计交易量不达标则不予入场 |
| `entrySmCountMin` | SM入场人数门槛 | Smart Money 买入地址数低于该值则不予入场 |

这两个参数通过 `PUT /api/strategy/:name` 端点保存到 `signalStrategyConfig` 表中。

---

## 三、改动文件汇总

| 文件路径 | 改动类型 | 说明 |
|----------|----------|------|
| `src/server.ts` | MODIFY | `/api/config` 初始化 global_filters; `/api/tokens` 应用清洗逻辑 |
| `src/engine/watchlist.ts` | MODIFY | 修正 5 处 SQLite 时间戳格式 |
| `src/engine/signal-evaluator.ts` | MODIFY | 修正 7 处 SQLite 时间戳格式 |
| `src/engine/matcher.ts` | MODIFY | 修正 1 处 SQLite 时间戳格式 |
| `web/src/pages/SystemConfig.tsx` | MODIFY | 新增全局过滤 Tab + 策略入场参数 + 修复数据水合 |

---

## 四、当前系统页面架构 (P6 更新后)

```
侧边栏 (7 路由)
┌──────────────────────────┐
│  M   MEME Alpha          │
├──────────────────────────┤
│  MEME 信号                │
│ 📊  市场总览  /           │  Dashboard.tsx     — 热门代币 + 全局过滤生效
│ 🎯  信号中心  /signals    │  SignalCenter.tsx   — SM信号 + 趋势 + AI话题
│ 📋  观察列表  /watchlist  │  Watchlist.tsx      — 6维打分 + 买入信号列表
├──────────────────────────┤
│  Alpha                    │
│ ⚡  Alpha 总览  /alpha    │  AlphaOverview.tsx
├──────────────────────────┤
│  系统                     │
│ 🚀  模拟回测  /paper      │  PaperTrading.tsx   — 虚拟钱包 + 策略胜率
│ ⚙️  系统配置  /config     │  SystemConfig.tsx   — 策略 | 全局过滤 | 采集器
├──────────────────────────┤
│  隐藏路由                  │
│ 🔍  /token/:cid/:addr    │  TokenDetail.tsx    — K线 + 六维雷达详情
└──────────────────────────┘
```

### SystemConfig 三选项卡结构

```
┌──────────────────────────────────────────────────┐
│ ✏️ 策略配置  |  🛡️ 全局过滤  |  📡 采集器 (21)  │
├──────────────────────────────────────────────────┤
│ Tab 1:                                           │
│   4 个策略卡片 (A量/B-SM/C测试量/D测试SM)        │
│   每张: 买入阈值 + 观察超时 + entryVol5mMin      │
│         + entrySmMin + 6维权重滑块               │
├──────────────────────────────────────────────────┤
│ Tab 2: 🛡️ 全局防黑盒漏斗                        │
│   minBinanceHolders / minLiquidity               │
│   minVolume24h / minMarketCap / maxMarketCap     │
├──────────────────────────────────────────────────┤
│ Tab 3: 📡 采集器列表                              │
│   21 项采集器的开关与 Cron 表达式查看              │
└──────────────────────────────────────────────────┘
```

---

## 五、数据库表总览 (累积至 P6)

| 归属 | 表名 | 用途 |
|------|------|------|
| P1 | `tokens`, `token_snapshots` | 代币主表 + 定时快照 |
| P1 | `smart_money_signals`, `smart_money_inflow` | SM 信号 + 流入 |
| P1 | `alpha_tokens`, `match_results` | Alpha 匹配系统 |
| P1 | `social_hype_entries` | 社交热度 |
| P1 | `meme_rush_tokens` | Meme Rush 热点 |
| P1 | `topic_rushes` | AI 话题 |
| P2 | `token_watchlist` | 观察列表 + 6维评分 |
| P2 | `token_klines` | K线数据 |
| P2 | `token_audits` | 安全审计 |
| P2 | `signal_strategy_config` | 策略 A/B/C/D (6维) |
| P2 | `collector_config` | 采集器配置 + **global_filters** |
| P3 | `token_dynamics` | 实时多窗口量价数据 |
| P3 | `top_traders` | PnL 排行 |
| P3 | `meme_exclusive_rank` | Pulse 算法评分 |
| P5 | `paper_wallets` | 模拟钱包 ($10,000 初始) |
| P5 | `paper_trades` | 模拟交易订单 |
| P5 | `strategy_backtest_stats` | 策略胜率回测统计 |

---

## 六、验证结果

| 验证项 | 结果 |
|--------|------|
| Watchlist 新代币流入 | ✅ 当天涌入 700+ 代币 |
| Buy Signal 产出 | ✅ 82 个买入信号 |
| 系统配置 - 策略配置卡片 | ✅ entryVol5m/entrySmMin 可编辑并保存 |
| 系统配置 - 全局过滤 Tab | ✅ 5 个参数正常渲染和保存 |
| Dashboard 热门代币过滤 | ✅ 低质量 CA 在后端被拦截 |
| Paper Trading 自动开仓 | ✅ 配合 Watchlist 正常运作 |

---

## 七、遗留项与后续建议

1. **全局过滤深度化**: 当前过滤仅应用于 `/api/tokens` 端点。建议后续在 Watchlist Scan 入口处也加入同样的底线拦截，从源头杜绝垃圾 CA 进入评分队列。
2. **信号评估过程可视化**: 用户希望能看到六维评估的实时流式过程展示，建议在 P7 增加"评估日志"或"打分过程回放"功能。
3. **Telegram/Discord 推送**: P5 计划中的 Webhook 推送功能尚未实装，建议作为 P7 的优先项。
4. **Alpha 模块清理**: Alpha 总览页面目前处于半休眠状态，建议评估是否在 P7 中正式废弃或重新定位。
