import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ── 代币主表 ──────────────────────────────────────────
export const tokens = sqliteTable('tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull(),
  chainId: text('chain_id').notNull(),
  contractAddress: text('contract_address'),
  name: text('name'),
  launchTime: integer('launch_time'),
  firstSeenAt: text('first_seen_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniqChainContract: uniqueIndex('uniq_chain_contract').on(t.chainId, t.contractAddress),
}));

// ── 定时快照 ──────────────────────────────────────────
export const tokenSnapshots = sqliteTable('token_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tokenId: integer('token_id').references(() => tokens.id),
  source: text('source').notNull(),
  capturedAt: text('captured_at').default(sql`(datetime('now'))`),
  period: text('period'),
  price: real('price'),
  marketCap: real('market_cap'),
  liquidity: real('liquidity'),
  volume: real('volume'),
  holders: integer('holders'),
  kycHolders: integer('kyc_holders'),
  percentChange: real('percent_change'),
  top10HoldersPct: real('top10_holders_pct'),
  extraJson: text('extra_json'),
}, (t) => ({
  idxTokenTime: index('idx_snapshots_token').on(t.tokenId, t.capturedAt),
}));

// ── Alpha 代币追踪 ───────────────────────────────────
export const alphaTokens = sqliteTable('alpha_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull(),
  chainId: text('chain_id').notNull(),
  contractAddress: text('contract_address'),
  firstSeenAt: text('first_seen_at').default(sql`(datetime('now'))`),
  isNew: integer('is_new').default(1),
  matched: integer('matched').default(0),
}, (t) => ({
  uniqAlpha: uniqueIndex('uniq_alpha_chain').on(t.chainId, t.contractAddress),
}));

// ── Smart Money 信号 ─────────────────────────────────
export const smartMoneySignals = sqliteTable('smart_money_signals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  signalId: text('signal_id'),                     // API signalId for dedup
  chainId: text('chain_id'),
  ticker: text('ticker'),
  contractAddress: text('contract_address'),
  direction: text('direction'),
  alertPrice: real('alert_price'),
  maxGain: real('max_gain'),
  smartMoneyCount: integer('smart_money_count'),
  exitRate: integer('exit_rate'),
  status: text('status'),
  tagsJson: text('tags_json'),
  capturedAt: text('captured_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniqSignal: uniqueIndex('uniq_signal').on(t.chainId, t.contractAddress, t.direction, t.signalId),
}));

// ── 安全审计 ──────────────────────────────────────────
export const tokenAudits = sqliteTable('token_audits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chainId: text('chain_id'),
  contractAddress: text('contract_address'),
  riskLevel: text('risk_level'),
  buyTax: real('buy_tax'),
  sellTax: real('sell_tax'),
  riskItemsJson: text('risk_items_json'),
  auditedAt: text('audited_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniqAudit: uniqueIndex('uniq_audit').on(t.chainId, t.contractAddress),
}));

// ── 匹配结果 ──────────────────────────────────────────
export const matchResults = sqliteTable('match_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  alphaTokenId: integer('alpha_token_id').references(() => alphaTokens.id),
  tokenId: integer('token_id').references(() => tokens.id),
  symbol: text('symbol').notNull(),
  chainId: text('chain_id').notNull(),
  contractAddress: text('contract_address'),
  score: real('score').default(0),
  reasons: text('reasons'),  // JSON array of match reasons
  marketCap: real('market_cap'),
  volume: real('volume'),
  smartMoneyCount: integer('smart_money_count'),
  riskLevel: text('risk_level'),
  status: text('status').default('new'),  // new, reviewed, dismissed
  matchedAt: text('matched_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniqMatch: uniqueIndex('uniq_match').on(t.chainId, t.contractAddress),
}));

// ── 采集配置 ──────────────────────────────────────────
export const collectorConfig = sqliteTable('collector_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),
  enabled: integer('enabled').default(1),
  cronExpr: text('cron_expr').default('0 * * * *'),
  paramsJson: text('params_json').notNull(),
});

// ── 观察列表 ──────────────────────────────────────────
export const tokenWatchlist = sqliteTable('token_watchlist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tokenId: integer('token_id').references(() => tokens.id),
  chainId: text('chain_id').notNull(),
  contractAddress: text('contract_address').notNull(),
  symbol: text('symbol').notNull(),

  // 入场
  entryMode: text('entry_mode').notNull(),          // 'volume_driven' | 'sm_driven'
  entryReason: text('entry_reason').notNull(),      // 'volume_5m_100k' | 'sm_buy_signal'
  entryVolume: real('entry_volume'),
  entryPrice: real('entry_price'),
  enteredAt: text('entered_at').default(sql`(datetime('now'))`),

  // 信号评分
  smScore: real('sm_score').default(0),
  socialScore: real('social_score').default(0),
  trendScore: real('trend_score').default(0),
  inflowScore: real('inflow_score').default(0),
  kolScore: real('kol_score').default(0),
  hypeScore: real('hype_score').default(0),
  totalScore: real('total_score').default(0),
  negativeScore: real('negative_score').default(0),
  scoreUpdatedAt: text('score_updated_at'),

  // 状态
  status: text('status').default('watching'),       // watching|buy_signal|bought|expired|dismissed
  expiresAt: text('expires_at'),
  signalDetailsJson: text('signal_details_json'),
}, (t) => ({
  uniqWatch: uniqueIndex('uniq_watchlist').on(t.chainId, t.contractAddress),
  idxStatus: index('idx_watchlist_status').on(t.status),
}));

// ── Topic Rush 话题追踪 ──────────────────────────────
export const topicRushes = sqliteTable('topic_rushes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  topicId: text('topic_id').notNull(),
  chainId: text('chain_id').notNull(),
  name: text('name'),
  type: text('type'),
  aiSummary: text('ai_summary'),
  netInflow: real('net_inflow'),
  netInflow1h: real('net_inflow_1h'),
  netInflowAth: real('net_inflow_ath'),
  tokenSize: integer('token_size'),
  progress: text('progress'),
  tokensJson: text('tokens_json'),                  // 关联代币列表 JSON
  capturedAt: text('captured_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniqTopic: uniqueIndex('uniq_topic').on(t.topicId, t.chainId),
}));

// ── K线缓存 ──────────────────────────────────────────
export const tokenKlines = sqliteTable('token_klines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chainId: text('chain_id').notNull(),
  contractAddress: text('contract_address').notNull(),
  interval: text('interval').notNull(),             // '5min','1h','4h'
  timestamp: integer('timestamp').notNull(),
  open: real('open'),
  high: real('high'),
  low: real('low'),
  close: real('close'),
  volume: real('volume'),
  count: integer('count'),
}, (t) => ({
  uniqKline: uniqueIndex('uniq_kline').on(t.chainId, t.contractAddress, t.interval, t.timestamp),
}));

// ── 信号策略配置 ──────────────────────────────────────
export const signalStrategyConfig = sqliteTable('signal_strategy_config', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),
  enabled: integer('enabled').default(1),
  entryMode: text('entry_mode').notNull(),          // 'volume_driven' | 'sm_driven'

  // 入场条件
  entryVolume5mMin: real('entry_volume_5m_min').default(100000),
  entrySmCountMin: integer('entry_sm_count_min').default(3),

  // 信号权重
  weightSm: real('weight_sm').default(30),
  weightSocial: real('weight_social').default(20),
  weightTrend: real('weight_trend').default(25),
  weightInflow: real('weight_inflow').default(25),

  // P3 新增权重
  weightKol: real('weight_kol').default(0),
  weightHype: real('weight_hype').default(0),

  // 买入阈值
  buyThreshold: real('buy_threshold').default(70),
  watchExpireMinutes: integer('watch_expire_minutes').default(60),

  // P7: 回测止盈止损参数
  takeProfitPct: real('take_profit_pct').default(50),   // 止盈线 %
  stopLossPct: real('stop_loss_pct').default(20),       // 止损线 %
  timeoutHours: real('timeout_hours').default(4),        // 超时平仓(小时)

  paramsJson: text('params_json'),
});

// ── 代币实时动态 (P3) ─────────────────────────────────
export const tokenDynamics = sqliteTable('token_dynamics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chainId: text('chain_id').notNull(),
  contractAddress: text('contract_address').notNull(),
  price: real('price'),
  volume5m: real('volume_5m'),
  volume1h: real('volume_1h'),
  volume4h: real('volume_4h'),
  volume24h: real('volume_24h'),
  volume24hBuy: real('volume_24h_buy'),
  volume24hSell: real('volume_24h_sell'),
  count24h: integer('count_24h'),
  count24hBuy: integer('count_24h_buy'),
  count24hSell: integer('count_24h_sell'),
  percentChange5m: real('percent_change_5m'),
  percentChange1h: real('percent_change_1h'),
  percentChange4h: real('percent_change_4h'),
  percentChange24h: real('percent_change_24h'),
  priceHigh24h: real('price_high_24h'),
  priceLow24h: real('price_low_24h'),
  marketCap: real('market_cap'),
  fdv: real('fdv'),
  liquidity: real('liquidity'),
  holders: integer('holders'),
  kycHolderCount: integer('kyc_holder_count'),
  kolHolders: integer('kol_holders'),
  kolHoldingPercent: real('kol_holding_percent'),
  proHolders: integer('pro_holders'),
  proHoldingPercent: real('pro_holding_percent'),
  smartMoneyHolders: integer('smart_money_holders'),
  smartMoneyHoldingPercent: real('smart_money_holding_percent'),
  capturedAt: text('captured_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniqDynamic: uniqueIndex('uniq_dynamic').on(t.chainId, t.contractAddress),
}));

// ── 顶级交易员 (P3) ──────────────────────────────────
export const topTraders = sqliteTable('top_traders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  address: text('address').notNull(),
  chainId: text('chain_id').notNull(),
  period: text('period').notNull(),             // '7d' | '30d'
  realizedPnl: real('realized_pnl'),
  winRate: real('win_rate'),
  totalVolume: real('total_volume'),
  totalTxCnt: integer('total_tx_cnt'),
  tags: text('tags'),                           // 'KOL','SM' etc
  topEarningTokensJson: text('top_earning_tokens_json'),
  capturedAt: text('captured_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniqTrader: uniqueIndex('uniq_trader').on(t.address, t.chainId, t.period),
}));

// ── Meme Exclusive 排行 (P3) ──────────────────────────
export const memeExclusiveRank = sqliteTable('meme_exclusive_rank', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chainId: text('chain_id').notNull(),
  contractAddress: text('contract_address').notNull(),
  symbol: text('symbol'),
  name: text('name'),
  rank: integer('rank'),
  score: real('score'),                         // Binance 算法评分
  alphaStatus: integer('alpha_status'),
  price: real('price'),
  percentChange: real('percent_change'),
  marketCap: real('market_cap'),
  liquidity: real('liquidity'),
  volume: real('volume'),
  volumeBnTotal: real('volume_bn_total'),       // 币安用户交易量
  volumeBn7d: real('volume_bn_7d'),
  holders: integer('holders'),
  kycHolders: integer('kyc_holders'),
  uniqueTraderBn: integer('unique_trader_bn'),  // 币安独立交易者
  impression: integer('impression'),            // 曝光次数
  aiNarrativeFlag: integer('ai_narrative_flag'), // AI叙事标志
  capturedAt: text('captured_at').default(sql`(datetime('now'))`),
}, (t) => ({
  uniqMemeExcl: uniqueIndex('uniq_meme_excl').on(t.chainId, t.contractAddress),
}));

// ── P5 模拟钱包 (市值与资金流) ───────────────────────
export const paperWallets = sqliteTable('paper_wallets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),        // 例: 'Main Portfolio'
  balance: real('balance').default(10000),      // 可用测试资金 USD
  totalPnl: real('total_pnl').default(0),       // 累计已实现盈亏
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ── P5 模拟交易记录 (Paper Trades) ──────────────────
export const paperTrades = sqliteTable('paper_trades', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  walletId: integer('wallet_id').references(() => paperWallets.id),
  watchlistId: integer('watchlist_id').references(() => tokenWatchlist.id),
  strategyUsed: text('strategy_used').notNull(),// 例: 'strategy_c_test_vol'
  
  chainId: text('chain_id').notNull(),
  contractAddress: text('contract_address').notNull(),
  symbol: text('symbol').notNull(),
  
  // 入场信息
  entryPrice: real('entry_price').notNull(),
  positionSizeUsd: real('position_size_usd').notNull(), // 买入花费的 USD
  tokenAmount: real('token_amount').notNull(),          // 买入获得的代币数
  enteredAt: text('entered_at').default(sql`(datetime('now'))`),
  
  // 运行中状态
  maxGainPct: real('max_gain_pct').default(0),  // 期间触碰的最高涨幅%
  
  // 出场/结算信息
  status: text('status').default('open'),       // 'open' | 'closed'
  exitPrice: real('exit_price'),
  exitReason: text('exit_reason'),              // 'take_profit' | 'stop_loss' | 'timeout'
  pnlUsd: real('pnl_usd'),
  pnlPct: real('pnl_pct'),
  closedAt: text('closed_at'),
}, (t) => ({
  idxTradeStatus: index('idx_trade_status').on(t.status),
  idxTradeStrategy: index('idx_trade_strategy').on(t.strategyUsed),
}));

// ── P5 策略回测统计 (Reward/Backtesting) ────────────
export const strategyBacktestStats = sqliteTable('strategy_backtest_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  strategyName: text('strategy_name').unique().notNull(),
  
  winRate: real('win_rate').default(0),         // 胜率 %
  avgReturnPct: real('avg_return_pct').default(0), // 平均收益率 %
  totalTrades: integer('total_trades').default(0),
  winningTrades: integer('winning_trades').default(0),
  losingTrades: integer('losing_trades').default(0),
  
  expectedValue: real('expected_value').default(0),// 期望 EV
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ── P8 评估运行日志 ────────────────────────────────────
export const evaluationLogs = sqliteTable('evaluation_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: text('run_id').notNull(),               // 每次批量评估的唯一ID
  tokenSymbol: text('token_symbol'),
  chainId: text('chain_id'),
  contractAddress: text('contract_address'),

  // 6维分数
  smScore: real('sm_score').default(0),
  socialScore: real('social_score').default(0),
  trendScore: real('trend_score').default(0),
  inflowScore: real('inflow_score').default(0),
  kolScore: real('kol_score').default(0),
  hypeScore: real('hype_score').default(0),
  negativeScore: real('negative_score').default(0),
  totalScore: real('total_score').default(0),

  // 结果
  prevStatus: text('prev_status'),               // 评估前状态
  newStatus: text('new_status'),                 // 评估后状态
  detailsJson: text('details_json'),             // 完整评分明细 JSON

  evaluatedAt: text('evaluated_at').default(sql`(datetime('now'))`),
}, (t) => ({
  idxLogRun: index('idx_eval_log_run').on(t.runId),
  idxLogTime: index('idx_eval_log_time').on(t.evaluatedAt),
}));

// ── P8: 市值里程碑（催化进程）────────────────────────
export const watchlistMilestones = sqliteTable('watchlist_milestones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  watchlistId: integer('watchlist_id').notNull(),     // tokenWatchlist.id
  chainId: text('chain_id').notNull(),
  contractAddress: text('contract_address').notNull(),
  symbol: text('symbol'),

  milestoneLabel: text('milestone_label').notNull(),   // '100K','200K','500K','1M','2M','5M','10M','20M'
  milestoneMcap: real('milestone_mcap').notNull(),      // 实际数值: 100000, 200000, ...
  actualMcap: real('actual_mcap'),                     // 达到时实际市值

  // 达到时的6维评分快照
  smScore: real('sm_score').default(0),
  socialScore: real('social_score').default(0),
  trendScore: real('trend_score').default(0),
  inflowScore: real('inflow_score').default(0),
  kolScore: real('kol_score').default(0),
  hypeScore: real('hype_score').default(0),
  totalScore: real('total_score').default(0),

  // 达到时附加数据
  holders: integer('holders'),
  smartMoneyHolders: integer('smart_money_holders'),
  kolHolders: integer('kol_holders'),
  volume24h: real('volume_24h'),

  reachedAt: text('reached_at').default(sql`(datetime('now'))`),
}, (t) => ({
  idxMilestoneWl: index('idx_milestone_wl').on(t.watchlistId),
  uniqMilestone: uniqueIndex('uniq_milestone').on(t.watchlistId, t.milestoneLabel),
}));
