// @ts-ignore
import cron from 'node-cron';
import { db, schema } from './db';
import { eq } from 'drizzle-orm';
import { log } from './collectors/base';
import { collectUnifiedRank } from './collectors/unified-rank';
import { collectAlphaList } from './collectors/alpha-list';
import { collectTradingSignals, collectSmartMoneyInflow } from './collectors/smart-money';
import { collectSocialHype } from './collectors/social-hype';
import { collectMemeRush } from './collectors/meme-rush';
import { collectTopicRush } from './collectors/topic-rush';
import { scanForEntry } from './engine/watchlist';
import { evaluateWatchlist } from './engine/signal-evaluator';
import { runCleanup } from './db/cleanup';
import { collectTokenDynamics } from './collectors/token-dynamic';
import { collectMemeExclusive } from './collectors/meme-exclusive';
import { collectTopTraders } from './collectors/top-traders';
import { executePaperBuy, monitorPaperPositions, checkMilestones } from './engine/paper-trader';

type CollectorFn = (params: any) => Promise<any>;

const COLLECTOR_MAP: Record<string, CollectorFn> = {
  // ── 采集器 ──
  'trending_bsc_5m': collectUnifiedRank,
  'trending_sol_5m': collectUnifiedRank,
  'trending_bsc_1h': collectUnifiedRank,
  'trending_sol_1h': collectUnifiedRank,
  'trending_bsc_4h': collectUnifiedRank,
  'trending_sol_4h': collectUnifiedRank,
  'trading_signal': collectTradingSignals,
  'smart_money_inflow': collectSmartMoneyInflow,
  'alpha_token_list': () => collectAlphaList(),
  'social_hype': collectSocialHype,
  'meme_rush_bsc': collectMemeRush,
  'meme_rush_sol': collectMemeRush,
  'topic_rush_latest': collectTopicRush,
  'topic_rush_viral': collectTopicRush,

  // ── P3 新增采集器 ──
  'top_search_bsc': collectUnifiedRank,
  'meme_exclusive_bsc': (p: any) => collectMemeExclusive(p.chainId || '56'),
  'meme_exclusive_sol': (p: any) => collectMemeExclusive(p.chainId || 'CT_501'),
  'top_traders_sol_30d': (p: any) => collectTopTraders(p.chainId || 'CT_501', p.period || '30d'),
  'top_traders_bsc_30d': (p: any) => collectTopTraders(p.chainId || '56', p.period || '30d'),
  'token_dynamics': async () => collectTokenDynamics(),

  // ── 信号管道 ──
  'watchlist_entry': async () => scanForEntry(),
  'signal_evaluate': async () => evaluateWatchlist(),
  'paper_trade_buy': async () => executePaperBuy(),
  'paper_trade_monitor': async () => { await monitorPaperPositions(); await checkMilestones(); },
  'data_cleanup': async () => { runCleanup(); return 0; },
};

const scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

export async function runCollector(name: string) {
  // 信号管道任务不需要查配置
  if (['watchlist_entry', 'signal_evaluate', 'paper_trade_buy', 'paper_trade_monitor'].includes(name)) {
    try {
      log('scheduler', `Running: ${name}`);
      await COLLECTOR_MAP[name]({});
    } catch (err: any) {
      log('scheduler', `ERROR [${name}]: ${err.message}`);
    }
    return;
  }

  const config = db.select()
    .from(schema.collectorConfig)
    .where(eq(schema.collectorConfig.name, name))
    .get();

  if (!config) {
    log('scheduler', `Config not found: ${name}`);
    return;
  }
  if (!config.enabled) {
    log('scheduler', `Skipped (disabled): ${name}`);
    return;
  }

  const fn = COLLECTOR_MAP[name];
  if (!fn) {
    log('scheduler', `No collector function for: ${name}`);
    return;
  }

  try {
    const params = JSON.parse(config.paramsJson);
    log('scheduler', `Running: ${name}`);
    await fn(params);
  } catch (err: any) {
    log('scheduler', `ERROR [${name}]: ${err.message}`);
  }
}

export function startScheduler() {
  const configs = db.select().from(schema.collectorConfig).all();

  for (const cfg of configs) {
    if (!cfg.enabled || !cfg.cronExpr) continue;

    const name = cfg.name;
    if (!cron.validate(cfg.cronExpr)) {
      log('scheduler', `Invalid cron: ${cfg.cronExpr} for ${name}`);
      continue;
    }

    const job = cron.schedule(cfg.cronExpr, () => runCollector(name));
    scheduledJobs.set(name, job);
    log('scheduler', `Scheduled: ${name} [${cfg.cronExpr}]`);
  }

  // ── 信号管道调度（固定 cron，不依赖 collectorConfig） ──
  const signalJobs: [string, string][] = [
    ['watchlist_entry', '*/1 * * * *'],
    ['signal_evaluate', '*/1 * * * *'],
    ['paper_trade_buy', '*/1 * * * *'],
    ['paper_trade_monitor', '*/1 * * * *'],
    ['data_cleanup', '0 3 * * *'],
  ];
  for (const [name, cronExpr] of signalJobs) {
    const job = cron.schedule(cronExpr, () => runCollector(name));
    scheduledJobs.set(name, job);
    log('scheduler', `Scheduled: ${name} [${cronExpr}]`);
  }

  log('scheduler', `Started ${scheduledJobs.size} jobs`);
}

export function stopScheduler() {
  for (const [name, job] of scheduledJobs) {
    job.stop();
    log('scheduler', `Stopped: ${name}`);
  }
  scheduledJobs.clear();
}

// Run all enabled collectors immediately (for testing)
export async function runAllNow() {
  const configs = db.select().from(schema.collectorConfig).all();
  for (const cfg of configs) {
    if (cfg.enabled) {
      await runCollector(cfg.name);
    }
  }
}
