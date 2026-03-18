# PRD - P5: 纸面模拟交易与奖励回测池 (Paper Trading & Reward Backtesting)

## 1. 目标
在完善 P2~P4 的 6 维评分及 UI 重构后，P5 的核心目标是将 Watchlist 中产生的“买入信号”闭环，通过虚拟资金进行模拟买入，并在后续时间段内监控其最高涨幅（Max Gain）和最终盈亏（PnL），以此来“奖励”或“惩罚”对应的进场策略，实现模型的自证闭环。

## 2. 新增核心数据库设计 (Schema Extensions)

### 2.1 模拟钱包 (`paper_wallets`)
用于存储全局或者单策略的虚拟可用资金。
- `id` / `balance` (当前余额，默认 $10,000) / `totalPnL` (总浮动盈亏)

### 2.2 模拟订单 (`paper_trades`)
核心扩展表，用于记录基于信号下单的每一笔交易生命周期。
- `id` / `watchlistId` (关联触发该交易的具体信号)
- `strategyUsed` (基于哪个策略触发，例如 `strategy_c_test_vol`)
- `symbol` / `chainId` / `contractAddress`
- `entryPrice` (买入均价) / `entryTime` (买入时间)
- `positionSize` (持仓 USD 价值) / `amount` (代币数量)
- `status` (`open` 活跃中 / `closed` 已平仓)
- `exitPrice` (卖出均价) / `exitTime` (卖出时间) 
- `pnl` (已实现盈亏绝对值) / `pnlPercent` (盈亏比 %)
- `maxGain` (持仓期间触碰的最高涨幅 %)

### 2.3 策略回测总结 (`strategy_backtest_stats`)
**奖励回测评价体系的核心表**。
- `strategyName` (如 `strategy_a_volume`)
- `winRate` (胜率，pnl > 0 的单子占比)
- `avgReturn` (平均单笔收益率)
- `totalTrades` (总交易笔数)
- `expectedValue` (策略期望 EV)

## 3. 核心引擎流程

### 3.1 监听并开仓 (`executePaperBuy()`)
- 每 1 分钟，配合 `signal_evaluate`，系统侦测到 Watchlist 出现状态为 `buy_signal` (例如综合得分突破阈值 65 分) 且未被交易的代币。
- 如果模拟钱包余额充足，系统按照当前市场价格（来自最近一次 `tokenSnapshots`），划扣固定仓位（例如 $100），在 `paper_trades` 插入一条 `open` 状态的新记录。

### 3.2 跟踪与平仓 (`monitorPaperPositions()`)
- 后台任务自动遍历所有 `status == 'open'` 的订单。
- 提取最新的代币价格：
  - 更新订单的 `maxGain` (如果最新价格 > 历史最高，则刷新)。
  - **触发止盈 (Take Profit)**：如果未实现利润 > +50%，系统强制按当前价平仓。
  - **触发止损 (Stop Loss)**：如果亏损幅度 < -20%，系统强制按当前价割肉平仓。
  - **触发超时 (Time Stop)**：持仓超过 4 小时且失去热度，自动清仓。
- 一旦平仓，记录 `exitPrice`，更新 `paper_wallets` 余额，并将单笔的 `pnl` 归档。

### 3.3 奖励结算体系 (Reward Update)
基于完成（`closed`）的订单，重新结算对应 `strategyName` 在 `strategy_backtest_stats` 中的胜率。
前端将直接通过这套“胜率表”来指导用户：“你该给社交热度的权重加一点，还是聪明钱权重减一点？”。

## 4. 前端展示 (UI - Paper Trading)
在左侧 Sidebar 新增 **[回测系统] (Paper Trades)**。页面将采用 Deep Space Dark 风格。

1. **Top Bar**: 展示当前钱包余额、累计 PnL、整体胜率。
2. **Strategy Leaderboard (策略奖励排行榜)**: 
   展示策略A、策略B、测试策略C、测试策略D 的累计胜率。
3. **Active Positions (活跃持仓)**: 热图显示当前持仓的 PnL%。
4. **History (历史记录)**: 展示最近平仓单的买入原因、平仓原因（止盈/止损）和盈亏绝对值。

## 5. 极速测试策略 (已实装)
为配合测试环节，我们在 `seed.ts` 中新增了两套测试专用策略，大幅拉低门槛：
- `strategy_c_test_vol`: 微小交易量驱动，只要存在 >$5000 交易额并叠加极低分数即可瞬间触发买入信号。
- `strategy_d_test_sm`: 极度聪明钱敏感，只要侦测到 **1 个** 聪明钱地址的动作，立刻跟单买入。
