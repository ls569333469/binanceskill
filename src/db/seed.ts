import { db } from './index';
import { collectorConfig, signalStrategyConfig } from './schema';
import { sql } from 'drizzle-orm';

const DEFAULT_CONFIGS = [
  // ── 5分钟级采集（P2新增） ──
  {
    name: 'trending_bsc_5m',
    cronExpr: '*/5 * * * *',
    paramsJson: JSON.stringify({
      rankType: 10, chainId: '56', period: 20,
      sortBy: 70, orderAsc: false, page: 1, size: 200,
      marketCapMin: 10000, kycHoldersMin: 10,
    }),
  },
  {
    name: 'trending_sol_5m',
    cronExpr: '*/5 * * * *',
    paramsJson: JSON.stringify({
      rankType: 10, chainId: 'CT_501', period: 20,
      sortBy: 70, orderAsc: false, page: 1, size: 200,
      marketCapMin: 10000, kycHoldersMin: 10,
    }),
  },
  // ── 1小时级采集 ──
  {
    name: 'trending_bsc_1h',
    cronExpr: '0 * * * *',
    paramsJson: JSON.stringify({
      rankType: 10, chainId: '56', period: 30,
      sortBy: 40, orderAsc: false, page: 1, size: 200,
      marketCapMin: 100000, volumeMin: 50000,
      kycHoldersMin: 100, auditFilter: [0, 1, 2],
      launchTimeMax: 129600,
    }),
  },
  {
    name: 'trending_sol_1h',
    cronExpr: '0 * * * *',
    paramsJson: JSON.stringify({
      rankType: 10, chainId: 'CT_501', period: 30,
      sortBy: 40, orderAsc: false, page: 1, size: 200,
      marketCapMin: 100000, volumeMin: 50000,
      kycHoldersMin: 100, auditFilter: [0, 1, 2],
      launchTimeMax: 129600,
    }),
  },
  // ── 4小时级采集 ──
  {
    name: 'trending_bsc_4h',
    cronExpr: '0 */4 * * *',
    paramsJson: JSON.stringify({
      rankType: 10, chainId: '56', period: 40,
      sortBy: 40, orderAsc: false, page: 1, size: 200,
      marketCapMin: 100000, volumeMin: 50000,
      kycHoldersMin: 100, auditFilter: [0, 1, 2],
      launchTimeMax: 129600,
    }),
  },
  {
    name: 'trending_sol_4h',
    cronExpr: '0 */4 * * *',
    paramsJson: JSON.stringify({
      rankType: 10, chainId: 'CT_501', period: 40,
      sortBy: 40, orderAsc: false, page: 1, size: 200,
      marketCapMin: 100000, volumeMin: 50000,
      kycHoldersMin: 100, auditFilter: [0, 1, 2],
      launchTimeMax: 129600,
    }),
  },
  // ── Smart Money ──
  {
    name: 'smart_money_inflow',
    cronExpr: '0 */4 * * *',
    paramsJson: JSON.stringify({
      chainIds: ['CT_501', '56'], period: '24h', tagType: 2,
    }),
  },
  {
    name: 'trading_signal',
    cronExpr: '0 * * * *',
    paramsJson: JSON.stringify({
      chainIds: ['CT_501', '56'], page: 1, pageSize: 50,
    }),
  },
  // ── Alpha ──
  {
    name: 'alpha_token_list',
    cronExpr: '0 * * * *',
    paramsJson: JSON.stringify({}),
  },
  // ── Social Hype ──
  {
    name: 'social_hype',
    cronExpr: '0 */4 * * *',
    paramsJson: JSON.stringify({
      chainId: '56', sentiment: 'All', socialLanguage: 'ALL',
      targetLanguage: 'en', timeRange: 1,
    }),
  },
  // ── Meme Rush ──
  {
    name: 'meme_rush_bsc',
    cronExpr: '0 */4 * * *',
    paramsJson: JSON.stringify({
      chainId: '56', rankType: 30, limit: 100,
    }),
  },
  {
    name: 'meme_rush_sol',
    cronExpr: '0 */4 * * *',
    paramsJson: JSON.stringify({
      chainId: 'CT_501', rankType: 30, limit: 100,
    }),
  },
  // ── Topic Rush（P2新增） ──
  {
    name: 'topic_rush_latest',
    cronExpr: '*/30 * * * *',
    paramsJson: JSON.stringify({
      chainId: 'CT_501', rankType: 10, sort: 10,
    }),
  },
  {
    name: 'topic_rush_viral',
    cronExpr: '0 * * * *',
    paramsJson: JSON.stringify({
      chainId: 'CT_501', rankType: 30, sort: 30,
    }),
  },
  // ── P3: Top Search ──
  {
    name: 'top_search_bsc',
    cronExpr: '0 * * * *',
    paramsJson: JSON.stringify({
      rankType: 11, chainId: '56', period: 50,
      sortBy: 40, orderAsc: false, page: 1, size: 100,
    }),
  },
  // ── P3: Meme Exclusive ──
  {
    name: 'meme_exclusive_bsc',
    cronExpr: '0 */4 * * *',
    paramsJson: JSON.stringify({ chainId: '56' }),
  },
  {
    name: 'meme_exclusive_sol',
    cronExpr: '0 */4 * * *',
    paramsJson: JSON.stringify({ chainId: 'CT_501' }),
  },
  // ── P3: Top Traders ──
  {
    name: 'top_traders_sol_30d',
    cronExpr: '0 */6 * * *',
    paramsJson: JSON.stringify({ chainId: 'CT_501', period: '30d' }),
  },
  {
    name: 'top_traders_bsc_30d',
    cronExpr: '0 */6 * * *',
    paramsJson: JSON.stringify({ chainId: '56', period: '30d' }),
  },
  // ── P3: Token Dynamics (on-demand for watchlist) ──
  {
    name: 'token_dynamics',
    cronExpr: '*/5 * * * *',
    paramsJson: JSON.stringify({}),
  },
];

// ── 策略A/B默认配置 ──
const DEFAULT_STRATEGIES = [
  {
    name: 'strategy_a_volume',
    entryMode: 'volume_driven',
    entryVolume5mMin: 100000,
    entrySmCountMin: 0,
    weightSm: 20,
    weightSocial: 10,
    weightTrend: 20,
    weightInflow: 20,
    weightKol: 15,
    weightHype: 15,
    buyThreshold: 70,
    watchExpireMinutes: 60,
  },
  {
    name: 'strategy_b_sm',
    entryMode: 'sm_driven',
    entryVolume5mMin: 0,
    entrySmCountMin: 3,
    weightSm: 15,
    weightSocial: 15,
    weightTrend: 20,
    weightInflow: 15,
    weightKol: 25,
    weightHype: 10,
    buyThreshold: 65,
    watchExpireMinutes: 120,
  },
  {
    name: 'strategy_c_test_vol',
    entryMode: 'volume_driven',
    entryVolume5mMin: 5000, // Very low volume for testing
    entrySmCountMin: 0,
    weightSm: 10,
    weightSocial: 10,
    weightTrend: 20,
    weightInflow: 30,
    weightKol: 10,
    weightHype: 20,
    buyThreshold: 40, // Low threshold to force buy signals
    watchExpireMinutes: 30,
  },
  {
    name: 'strategy_d_test_sm',
    entryMode: 'sm_driven',
    entryVolume5mMin: 0,
    entrySmCountMin: 1, // Single SM signal is enough
    weightSm: 40,
    weightSocial: 10,
    weightTrend: 10,
    weightInflow: 20,
    weightKol: 10,
    weightHype: 10,
    buyThreshold: 45, // Low threshold
    watchExpireMinutes: 30,
  },
];

export function seedDefaults() {
  for (const cfg of DEFAULT_CONFIGS) {
    db.insert(collectorConfig)
      .values(cfg)
      .onConflictDoNothing()
      .run();
  }
  console.log(`[DB] Seeded ${DEFAULT_CONFIGS.length} default collector configs`);

  for (const strat of DEFAULT_STRATEGIES) {
    db.insert(signalStrategyConfig)
      .values(strat)
      .onConflictDoNothing()
      .run();
  }
  console.log(`[DB] Seeded ${DEFAULT_STRATEGIES.length} default signal strategies`);
}
