import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { db, schema } from './db';
import { seedDefaults } from './db/seed';
import { startScheduler, runCollector, runAllNow } from './scheduler';
import { eq, desc, sql, and, like, gte } from 'drizzle-orm';
import { scanForEntry } from './engine/watchlist';
import { evaluateWatchlist } from './engine/signal-evaluator';
import { collectKlines } from './collectors/kline';

// ── Initialize ────────────────────────────────────────
seedDefaults();

const app = new Hono();
app.use('/*', cors());

// ── Health ────────────────────────────────────────────
app.get('/', (c) => c.json({ status: 'ok', service: 'MEME Alpha Dashboard API', time: new Date().toISOString() }));

// ── Stats ─────────────────────────────────────────────
app.get('/api/stats', (c) => {
  const tokenCount = db.select({ count: sql<number>`count(*)` }).from(schema.tokens).get()?.count || 0;
  const snapshotCount = db.select({ count: sql<number>`count(*)` }).from(schema.tokenSnapshots).get()?.count || 0;
  const alphaCount = db.select({ count: sql<number>`count(*)` }).from(schema.alphaTokens).get()?.count || 0;
  const alphaNew = db.select({ count: sql<number>`count(*)` }).from(schema.alphaTokens).where(eq(schema.alphaTokens.isNew, 1)).get()?.count || 0;
  const signalCount = db.select({ count: sql<number>`count(*)` }).from(schema.smartMoneySignals).get()?.count || 0;

  return c.json({
    tokens: tokenCount,
    snapshots: snapshotCount,
    alphaTokens: alphaCount,
    alphaNew,
    signals: signalCount,
  });
});

// ── Tokens ────────────────────────────────────────────
app.get('/api/tokens', (c) => {
  const chainId = c.req.query('chainId');
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');

  // Bug #5 fix: use Drizzle where() instead of in-memory filter
  let query = db.select()
    .from(schema.tokens)
    .orderBy(desc(schema.tokens.id))
    .limit(limit)
    .offset(offset);

  const tokenList = chainId
    ? query.all().filter(t => t.chainId === chainId) // TODO: use .where() once dynamic conditions supported
    : query.all();

  // Attach latest snapshot for each
  const result = tokenList.map(t => {
    const latest = db.select()
      .from(schema.tokenSnapshots)
      .where(eq(schema.tokenSnapshots.tokenId, t.id))
      .orderBy(desc(schema.tokenSnapshots.capturedAt))
      .limit(1)
      .get();

    return { ...t, latestSnapshot: latest || null };
  });

  // 获取全局防黑盒过滤器参数
  const gfConfig = db.select().from(schema.collectorConfig).where(eq(schema.collectorConfig.name, 'global_filters')).get();
  const gfParams = gfConfig && gfConfig.paramsJson ? JSON.parse(gfConfig.paramsJson) : {};

  // 执行底层清洗拦截
  const cleanResult = result.filter(item => {
    const snap = item.latestSnapshot;
    if (!snap) return false;
    if (gfParams.minBinanceHolders && (snap.holders || 0) < gfParams.minBinanceHolders) return false;
    if (gfParams.minLiquidity && (snap.liquidity || 0) < gfParams.minLiquidity) return false;
    if (gfParams.minVolume24h && (snap.volume || 0) < gfParams.minVolume24h) return false;
    if (gfParams.minMarketCap && (snap.marketCap || 0) < gfParams.minMarketCap) return false;
    if (gfParams.maxMarketCap && gfParams.maxMarketCap > 0 && (snap.marketCap || 0) > gfParams.maxMarketCap) return false;
    return true;
  });

  return c.json({ total: cleanResult.length, tokens: cleanResult });
});

// ── Hot Tokens (P7: 多窗口丰富数据) ─────────────────
app.get('/api/tokens/hot', (c) => {
  const periodStr = c.req.query('period') || '1h';    // 5m | 1h | 4h | 24h
  const chainId = c.req.query('chainId');
  const limit = parseInt(c.req.query('limit') || '30');

  // P8修复: 混合方案 — 优先取period匹配的(unified-rank有完整数据)，再补充period=NULL
  const periodMap: Record<string, number> = { '5m': 20, '1h': 30, '4h': 40, '24h': 50 };
  const periodCode = periodMap[periodStr] || 30;

  const periodSnaps = db.select()
    .from(schema.tokenSnapshots)
    .where(sql`CAST(${schema.tokenSnapshots.period} AS INTEGER) = ${periodCode} AND ${schema.tokenSnapshots.tokenId} IS NOT NULL`)
    .orderBy(desc(schema.tokenSnapshots.capturedAt))
    .limit(500)
    .all();

  // 如果period匹配不足，用最新的有tokenId快照补充
  const fallbackSnaps = periodSnaps.length < 30
    ? db.select().from(schema.tokenSnapshots)
        .where(sql`${schema.tokenSnapshots.tokenId} IS NOT NULL`)
        .orderBy(desc(schema.tokenSnapshots.capturedAt))
        .limit(500).all()
    : [];

  const allSnaps = [...periodSnaps, ...fallbackSnaps];
  console.log(`[hot-tokens DEBUG] period=${periodStr} periodSnaps=${periodSnaps.length} fallback=${fallbackSnaps.length} combined=${allSnaps.length}`);

  // 去重: 同一token只保留最新快照
  const seen = new Set<number>();
  const uniqueSnaps = allSnaps.filter(s => {
    if (!s.tokenId || seen.has(s.tokenId)) return false;
    seen.add(s.tokenId);
    return true;
  });

  // 2) 拿token主表信息 + tokenDynamics
  const result = uniqueSnaps.slice(0, limit * 3).map(snap => {
    const token = db.select().from(schema.tokens)
      .where(eq(schema.tokens.id, snap.tokenId!))
      .get();
    if (!token) return null;
    if (chainId && token.chainId !== chainId) return null;

    // 联查 tokenDynamics
    const dyn = db.select().from(schema.tokenDynamics)
      .where(and(
        eq(schema.tokenDynamics.chainId, token.chainId),
        eq(schema.tokenDynamics.contractAddress, token.contractAddress || '')
      ))
      .get();

    return {
      id: token.id,
      symbol: token.symbol,
      name: token.name,
      chainId: token.chainId,
      contractAddress: token.contractAddress,
      launchTime: token.launchTime,
      firstSeenAt: token.firstSeenAt,
      // 快照基础数据
      price: snap.price,
      marketCap: snap.marketCap,
      volume: snap.volume,
      holders: snap.holders,
      kycHolders: snap.kycHolders,
      liquidity: snap.liquidity,
      percentChange: snap.percentChange,
      snapshotTime: snap.capturedAt,
      snapshotPeriod: snap.period,
      // dynamics 多窗口数据
      volume5m: dyn?.volume5m ?? null,
      volume1h: dyn?.volume1h ?? null,
      volume4h: dyn?.volume4h ?? null,
      volume24h: dyn?.volume24h ?? null,
      percentChange5m: dyn?.percentChange5m ?? null,
      percentChange1h: dyn?.percentChange1h ?? null,
      percentChange4h: dyn?.percentChange4h ?? null,
      percentChange24h: dyn?.percentChange24h ?? null,
      kolHolders: dyn?.kolHolders ?? null,
      kolHoldingPercent: dyn?.kolHoldingPercent ?? null,
      proHolders: dyn?.proHolders ?? null,
      smartMoneyHolders: dyn?.smartMoneyHolders ?? null,
      smartMoneyHoldingPercent: dyn?.smartMoneyHoldingPercent ?? null,
      dynamicsLiquidity: dyn?.liquidity ?? null,
      dynamicsMarketCap: dyn?.marketCap ?? null,
      dynamicsHolders: dyn?.holders ?? null,
      dynamicsKycHolders: dyn?.kycHolderCount ?? null,
      dynamicsTime: dyn?.capturedAt ?? null,
    };
  }).filter(Boolean) as any[];
  console.log(`[hot-tokens DEBUG] unique=${uniqueSnaps.length} result=${result.length}`);

  // P8修复: Dashboard展示不应用全局交易过滤器(那些是给watchlist/策略执行的)
  // 只保留基础质量过滤: 有价格数据
  const filtered = result.filter(t => t.price && t.price > 0);

  // P8修复: 按用户选择的时段排序，让5m/1h/4h/24h tab显示不同数据
  const volumeKey: Record<string, string> = { '5m': 'volume5m', '1h': 'volume1h', '4h': 'volume4h', '24h': 'volume24h' };
  const sortField = volumeKey[periodStr] || 'volume1h';
  const sorted = filtered.sort((a: any, b: any) => ((b[sortField] ?? b.volume ?? 0) - (a[sortField] ?? a.volume ?? 0)));

  return c.json({ total: sorted.length, period: periodStr, tokens: sorted.slice(0, limit) });
});

app.get('/api/tokens/:id/history', (c) => {
  const id = parseInt(c.req.param('id'));
  const limit = parseInt(c.req.query('limit') || '50');

  const history = db.select()
    .from(schema.tokenSnapshots)
    .where(eq(schema.tokenSnapshots.tokenId, id))
    .orderBy(desc(schema.tokenSnapshots.capturedAt))
    .limit(limit)
    .all();

  return c.json({ tokenId: id, snapshots: history });
});

// ── Alpha ─────────────────────────────────────────────
app.get('/api/alpha', (c) => {
  const limit = parseInt(c.req.query('limit') || '100');
  const tokens = db.select()
    .from(schema.alphaTokens)
    .orderBy(desc(schema.alphaTokens.firstSeenAt))
    .limit(limit)
    .all();
  return c.json({ total: tokens.length, tokens });
});

app.get('/api/alpha/new', (c) => {
  const tokens = db.select()
    .from(schema.alphaTokens)
    .where(eq(schema.alphaTokens.isNew, 1))
    .orderBy(desc(schema.alphaTokens.firstSeenAt))
    .all();
  return c.json({ total: tokens.length, tokens });
});

// ── Signals ───────────────────────────────────────────
app.get('/api/signals', (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const signals = db.select()
    .from(schema.smartMoneySignals)
    .orderBy(desc(schema.smartMoneySignals.capturedAt))
    .limit(limit)
    .all();
  return c.json({ total: signals.length, signals });
});

// ── Config ────────────────────────────────────────────
app.get('/api/config', (c) => {
  let configs = db.select().from(schema.collectorConfig).all();
  
  // 注入全系统级过滤漏斗默认配置
  if (!configs.find(c => c.name === 'global_filters')) {
    const defaultGlobalFilters = {
      minBinanceHolders: 1,
      minLiquidity: 10000,
      minVolume24h: 0,
      minMarketCap: 0,
      maxMarketCap: 0,
    };
    db.insert(schema.collectorConfig).values({
      name: 'global_filters',
      enabled: 1,
      cronExpr: 'always',
      paramsJson: JSON.stringify(defaultGlobalFilters)
    }).run();
    configs = db.select().from(schema.collectorConfig).all();
  }

  return c.json(configs.map(cfg => ({
    ...cfg,
    params: JSON.parse(cfg.paramsJson),
  })));
});

app.put('/api/config/:name', async (c) => {
  const name = c.req.param('name');
  const body = await c.req.json();

  const updates: any = {};
  if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0;
  if (body.cronExpr) updates.cronExpr = body.cronExpr;
  if (body.params) updates.paramsJson = JSON.stringify(body.params);

  db.update(schema.collectorConfig)
    .set(updates)
    .where(eq(schema.collectorConfig.name, name))
    .run();

  return c.json({ success: true, name, updated: updates });
});

// ── Manual Trigger ────────────────────────────────────
app.post('/api/collector/run/:name', async (c) => {
  const name = c.req.param('name');
  try {
    await runCollector(name);
    return c.json({ success: true, collector: name });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/api/collector/run-all', async (c) => {
  try {
    await runAllNow();
    return c.json({ success: true, message: 'All collectors executed' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ── Audit ─────────────────────────────────────────────
import { auditToken, auditAllUnaudited } from './collectors/token-audit';

app.post('/api/audit/:chainId/:address', async (c) => {
  const chainId = c.req.param('chainId');
  const address = c.req.param('address');
  try {
    const result = await auditToken(chainId, address);
    return c.json({ success: true, audit: result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/api/audit/batch', async (c) => {
  try {
    const count = await auditAllUnaudited();
    return c.json({ success: true, audited: count });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.get('/api/audits', (c) => {
  const audits = db.select().from(schema.tokenAudits).all();
  return c.json({ total: audits.length, audits });
});

// ── Matches ───────────────────────────────────────────
import { runMatchingEngine } from './engine/matcher';

app.get('/api/matches', (c) => {
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '100');

  // Bug #5 fix: use where() for status filter
  const allMatches = status
    ? db.select().from(schema.matchResults)
        .where(eq(schema.matchResults.status, status))
        .orderBy(desc(schema.matchResults.score))
        .limit(limit)
        .all()
    : db.select().from(schema.matchResults)
        .orderBy(desc(schema.matchResults.score))
        .limit(limit)
        .all();

  return c.json({ total: allMatches.length, matches: allMatches });
});

app.post('/api/matches/run', async (c) => {
  try {
    const count = await runMatchingEngine();
    return c.json({ success: true, matchCount: count });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.put('/api/matches/:id/status', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { status: newStatus } = await c.req.json();
  db.update(schema.matchResults)
    .set({ status: newStatus })
    .where(eq(schema.matchResults.id, id))
    .run();
  return c.json({ success: true, id, status: newStatus });
});

// ── P2: Watchlist API ─────────────────────────────────
app.get('/api/watchlist', (c) => {
  const status = c.req.query('status');
  const entryMode = c.req.query('entryMode');
  const limit = parseInt(c.req.query('limit') || '100');

  let items = db.select().from(schema.tokenWatchlist)
    .orderBy(desc(schema.tokenWatchlist.totalScore))
    .limit(limit)
    .all();

  if (status) items = items.filter(i => i.status === status);
  if (entryMode) items = items.filter(i => i.entryMode === entryMode);

  // P8: join tokens table for launchTime
  const enriched = items.map(item => {
    let launchTime: number | null = null;
    if (item.tokenId) {
      const token = db.select().from(schema.tokens)
        .where(eq(schema.tokens.id, item.tokenId)).get();
      launchTime = token?.launchTime ?? null;
    }
    return { ...item, launchTime };
  });

  // 统计
  const all = db.select().from(schema.tokenWatchlist).all();
  const stats = {
    total: all.length,
    watching: all.filter(i => i.status === 'watching').length,
    buySignal: all.filter(i => i.status === 'buy_signal').length,
    bought: all.filter(i => i.status === 'bought').length,
    dismissed: all.filter(i => i.status === 'dismissed').length,
    volumeDriven: all.filter(i => i.entryMode === 'volume_driven').length,
    smDriven: all.filter(i => i.entryMode === 'sm_driven').length,
  };

  return c.json({ stats, items: enriched });
});

app.put('/api/watchlist/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { status: newStatus } = await c.req.json();
  db.update(schema.tokenWatchlist)
    .set({ status: newStatus })
    .where(eq(schema.tokenWatchlist.id, id))
    .run();
  return c.json({ success: true, id, status: newStatus });
});

app.post('/api/watchlist/scan', async (c) => {
  try {
    const result = await scanForEntry();
    return c.json({ success: true, ...result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/api/watchlist/evaluate', async (c) => {
  try {
    const count = await evaluateWatchlist();
    return c.json({ success: true, evaluated: count });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ── P2: Topics API ────────────────────────────────────
app.get('/api/topics', (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const topics = db.select().from(schema.topicRushes)
    .orderBy(desc(schema.topicRushes.capturedAt))
    .limit(limit)
    .all();
  return c.json({ total: topics.length, topics });
});

// ── P2: Strategy API ──────────────────────────────────
app.get('/api/strategy', (c) => {
  const strategies = db.select().from(schema.signalStrategyConfig).all();
  return c.json({ strategies });
});

app.put('/api/strategy/:name', async (c) => {
  const name = c.req.param('name');
  const body = await c.req.json();
  const { entryMode, ...updates } = body;
  db.update(schema.signalStrategyConfig)
    .set(updates)
    .where(eq(schema.signalStrategyConfig.name, name))
    .run();
  const updated = db.select().from(schema.signalStrategyConfig)
    .where(eq(schema.signalStrategyConfig.name, name)).get();
  return c.json({ success: true, strategy: updated });
});

// P7: 策略回测统计 API
app.get('/api/strategy/backtest-stats', (c) => {
  // Get strategy configs to know which strategies exist
  const stratConfigs = db.select().from(schema.signalStrategyConfig).all() as any[];
  // Get all closed paper trades for computation
  const allTrades = db.select().from(schema.paperTrades).all() as any[];
  
  // P8: Build watchlistId -> entryMode map for fallback matching
  const watchlistItems = db.select({ id: schema.tokenWatchlist.id, entryMode: schema.tokenWatchlist.entryMode })
    .from(schema.tokenWatchlist).all();
  const watchlistMap: Record<number, string> = {};
  for (const w of watchlistItems) { watchlistMap[w.id] = w.entryMode; }
  
  // For each strategy config, compute live stats from paper_trades
  const stats = stratConfigs.map((cfg: any) => {
    // Match trades: exact name match, prefix match, or via watchlist entry_mode
    const myTrades = allTrades.filter((t: any) => {
      if (t.strategyUsed === cfg.name) return true;
      // For volume_driven strategies, match volume_5m_* trades
      if (cfg.entryMode === 'volume_driven' && t.strategyUsed?.startsWith('volume_5m_')) return true;
      if (cfg.entryMode === 'volume_driven' && t.strategyUsed?.startsWith('strategy_a_') ) return true;
      if (cfg.entryMode === 'volume_driven' && t.strategyUsed?.startsWith('strategy_c_') ) return true;
      // For sm_driven strategies, match sm_* trades or strategy_b/d trades
      if (cfg.entryMode === 'sm_driven' && t.strategyUsed?.startsWith('sm_')) return true;
      if (cfg.entryMode === 'sm_driven' && t.strategyUsed?.startsWith('strategy_b_')) return true;
      if (cfg.entryMode === 'sm_driven' && t.strategyUsed?.startsWith('strategy_d_')) return true;
      // Fallback: match via watchlist entry_mode (for trades linked to sm_driven watchlist items)
      if (t.watchlistId && watchlistMap[t.watchlistId] === cfg.entryMode) return true;
      return false;
    });
    
    const closedTrades = myTrades.filter((t: any) => t.status === 'closed');
    const openTrades = myTrades.filter((t: any) => t.status === 'open');
    const winTrades = closedTrades.filter((t: any) => (t.pnlUsd || 0) > 0);
    const totalPnl = closedTrades.reduce((s: number, t: any) => s + (t.pnlUsd || 0), 0);
    const avgReturn = closedTrades.length > 0 
      ? closedTrades.reduce((s: number, t: any) => s + (t.pnlPct || 0), 0) / closedTrades.length 
      : 0;
    
    // Last trade time
    const times = myTrades.map((t: any) => t.closedAt || t.enteredAt).filter(Boolean).sort();
    const lastTime = times.length ? times[times.length - 1] : null;
    
    return {
      strategyName: cfg.name,
      totalTrades: closedTrades.length,
      winningTrades: winTrades.length,
      losingTrades: closedTrades.length - winTrades.length,
      winRate: closedTrades.length > 0 ? (winTrades.length / closedTrades.length) * 100 : 0,
      avgReturnPct: avgReturn,
      totalPnlUsd: totalPnl,
      openPositions: openTrades.length,
      lastTradeTime: lastTime,
    };
  });
  
  // Also add aggregate "全部策略" stats
  const allClosed = allTrades.filter((t: any) => t.status === 'closed');
  const allOpen = allTrades.filter((t: any) => t.status === 'open');
  const allWins = allClosed.filter((t: any) => (t.pnlUsd || 0) > 0);
  const allPnl = allClosed.reduce((s: number, t: any) => s + (t.pnlUsd || 0), 0);
  const allAvg = allClosed.length > 0 ? allClosed.reduce((s: number, t: any) => s + (t.pnlPct || 0), 0) / allClosed.length : 0;
  const allTimes = allTrades.map((t: any) => t.closedAt || t.enteredAt).filter(Boolean).sort();
  
  stats.push({
    strategyName: '__aggregate__',
    totalTrades: allClosed.length,
    winningTrades: allWins.length,
    losingTrades: allClosed.length - allWins.length,
    winRate: allClosed.length > 0 ? (allWins.length / allClosed.length) * 100 : 0,
    avgReturnPct: allAvg,
    totalPnlUsd: allPnl,
    openPositions: allOpen.length,
    lastTradeTime: allTimes.length ? allTimes[allTimes.length - 1] : null,
  });
  
  return c.json({ stats });
});

// ── P2: Klines API ────────────────────────────────────
app.get('/api/klines/:chainId/:address', async (c) => {
  const chainId = c.req.param('chainId');
  const address = c.req.param('address');
  const interval = c.req.query('interval') || '5min';

  // Auto-fetch if needed
  await collectKlines({ chainId, contractAddress: address, interval, limit: 100 });

  const klines = db.select().from(schema.tokenKlines)
    .where(and(
      eq(schema.tokenKlines.chainId, chainId),
      eq(schema.tokenKlines.contractAddress, address),
      eq(schema.tokenKlines.interval, interval),
    ))
    .orderBy(desc(schema.tokenKlines.timestamp))
    .limit(100)
    .all()
    .reverse();

  return c.json({ total: klines.length, klines });
});

// ── P3: Token Detail Aggregation ──────────────────────
app.get('/api/token-detail/:chainId/:address', async (c) => {
  const chainId = c.req.param('chainId');
  const address = c.req.param('address');

  // 1) Base token info + latest snapshot
  const token = db.select().from(schema.tokens)
    .where(and(eq(schema.tokens.chainId, chainId), eq(schema.tokens.contractAddress, address)))
    .get();

  let snapshot = null;
  if (token) {
    snapshot = db.select().from(schema.tokenSnapshots)
      .where(eq(schema.tokenSnapshots.tokenId, token.id))
      .orderBy(desc(schema.tokenSnapshots.capturedAt))
      .limit(1).get();
  }

  // 2) Watchlist entry (signal scores)
  const watchEntry = db.select().from(schema.tokenWatchlist)
    .where(and(eq(schema.tokenWatchlist.chainId, chainId), eq(schema.tokenWatchlist.contractAddress, address)))
    .get();

  // 3) Token dynamics
  const dynamics = db.select().from(schema.tokenDynamics)
    .where(and(eq(schema.tokenDynamics.chainId, chainId), eq(schema.tokenDynamics.contractAddress, address)))
    .get();

  // 4) Meme Exclusive rank
  const memeRank = db.select().from(schema.memeExclusiveRank)
    .where(and(eq(schema.memeExclusiveRank.chainId, chainId), eq(schema.memeExclusiveRank.contractAddress, address)))
    .get();

  // 5) Audit
  const audit = db.select().from(schema.tokenAudits)
    .where(and(eq(schema.tokenAudits.chainId, chainId), eq(schema.tokenAudits.contractAddress, address)))
    .get();

  // 6) Recent SM signals for this token
  const smSignals = token ? db.select().from(schema.smartMoneySignals)
    .where(eq(schema.smartMoneySignals.ticker, token.symbol || ''))
    .orderBy(desc(schema.smartMoneySignals.capturedAt))
    .limit(10).all() : [];

  return c.json({
    token: token || null,
    snapshot: snapshot || null,
    watchEntry: watchEntry || null,
    dynamics: dynamics || null,
    memeRank: memeRank || null,
    audit: audit ? { ...audit, riskItems: audit.riskItemsJson ? JSON.parse(audit.riskItemsJson) : [] } : null,
    smSignals,
  });
});

// ── P3: Token Dynamics API ────────────────────────────
app.get('/api/dynamics', (c) => {
  const chainId = c.req.query('chainId');
  const limit = parseInt(c.req.query('limit') || '100');

  let items = db.select().from(schema.tokenDynamics)
    .orderBy(desc(schema.tokenDynamics.capturedAt))
    .limit(limit)
    .all();

  if (chainId) items = items.filter(i => i.chainId === chainId);
  return c.json({ total: items.length, dynamics: items });
});

app.get('/api/dynamics/:chainId/:address', (c) => {
  const chainId = c.req.param('chainId');
  const address = c.req.param('address');

  const item = db.select().from(schema.tokenDynamics)
    .where(and(
      eq(schema.tokenDynamics.chainId, chainId),
      eq(schema.tokenDynamics.contractAddress, address),
    ))
    .get();

  return c.json({ data: item || null });
});

// ── P3: Top Traders API ───────────────────────────────
app.get('/api/traders', (c) => {
  const chainId = c.req.query('chainId') || 'CT_501';
  const period = c.req.query('period') || '30d';
  const limit = parseInt(c.req.query('limit') || '25');

  const traders = db.select().from(schema.topTraders)
    .where(and(
      eq(schema.topTraders.chainId, chainId),
      eq(schema.topTraders.period, period),
    ))
    .orderBy(desc(schema.topTraders.realizedPnl))
    .limit(limit)
    .all()
    .map(t => ({
      ...t,
      topEarningTokens: t.topEarningTokensJson ? JSON.parse(t.topEarningTokensJson) : [],
    }));

  return c.json({ total: traders.length, traders });
});

// ── P3: Meme Exclusive Rank API ───────────────────────
app.get('/api/meme-exclusive', (c) => {
  const chainId = c.req.query('chainId');
  const limit = parseInt(c.req.query('limit') || '50');

  let items = db.select().from(schema.memeExclusiveRank)
    .orderBy(desc(schema.memeExclusiveRank.score))
    .limit(limit)
    .all();

  if (chainId) items = items.filter(i => i.chainId === chainId);
  return c.json({ total: items.length, tokens: items });
});

// ── P5: Paper Trading & Strategy Rewards ────────────────
app.get('/api/paper-trading/wallet', (c) => {
  let wallet = db.select().from(schema.paperWallets).where(eq(schema.paperWallets.name, 'Main Portfolio')).get();
  if (!wallet) {
    db.insert(schema.paperWallets).values({ name: 'Main Portfolio', balance: 10000 }).run();
    wallet = db.select().from(schema.paperWallets).where(eq(schema.paperWallets.name, 'Main Portfolio')).get()!;
  }
  return c.json({ wallet });
});

app.get('/api/paper-trading/trades', (c) => {
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '100');
  
  let q = db.select().from(schema.paperTrades).orderBy(desc(schema.paperTrades.enteredAt));
  
  const rawTrades = status
    ? q.where(eq(schema.paperTrades.status, status)).limit(limit).all()
    : q.limit(limit).all();

  // P8: 为 open 单子附加实时数据
  const trades = rawTrades.map(t => {
    if (t.status !== 'open') return t;

    // 查 token_dynamics 获取当前价格
    const dyn = db.select().from(schema.tokenDynamics)
      .where(and(eq(schema.tokenDynamics.chainId, t.chainId), eq(schema.tokenDynamics.contractAddress, t.contractAddress)))
      .get();

    const currentPrice = dyn?.price ?? null;
    const currentPnlPct = currentPrice ? ((currentPrice - t.entryPrice) / t.entryPrice) * 100 : null;
    const currentPnlUsd = currentPrice ? (t.tokenAmount * currentPrice) - t.positionSizeUsd : null;
    const entryTime = new Date((t.enteredAt || '').replace(' ', 'T') + 'Z').getTime();
    const hoursHeld = (Date.now() - entryTime) / (1000 * 60 * 60);

    return {
      ...t,
      currentPrice,
      currentPnlPct,
      currentPnlUsd,
      hoursHeld: Math.round(hoursHeld * 10) / 10,
      dynamicsTime: dyn?.capturedAt ?? null,
    };
  });

  return c.json({ total: trades.length, trades });
});

app.get('/api/paper-trading/stats', (c) => {
  const stats = db.select().from(schema.strategyBacktestStats)
    .orderBy(desc(schema.strategyBacktestStats.winRate))
    .all();
    
  return c.json({ total: stats.length, stats });
});

// ── P8: 市值里程碑 API ───────────────────────────────
app.get('/api/milestones/:watchlistId', (c) => {
  const wlId = parseInt(c.req.param('watchlistId'));
  const milestones = db.select().from(schema.watchlistMilestones)
    .where(eq(schema.watchlistMilestones.watchlistId, wlId))
    .orderBy(schema.watchlistMilestones.milestoneMcap)
    .all();
  return c.json({ total: milestones.length, milestones });
});

app.get('/api/milestones', (c) => {
  const symbol = c.req.query('symbol');
  const limit = parseInt(c.req.query('limit') || '100');
  let milestones = db.select().from(schema.watchlistMilestones)
    .orderBy(desc(schema.watchlistMilestones.reachedAt))
    .limit(limit)
    .all();
  if (symbol) milestones = milestones.filter(m => m.symbol?.toLowerCase().includes(symbol.toLowerCase()));
  return c.json({ total: milestones.length, milestones });
});

// ── P8: Evaluation Logs API ───────────────────────────
app.get('/api/evaluation-logs', (c) => {
  const runId = c.req.query('runId');
  const symbol = c.req.query('symbol');
  const status = c.req.query('status');
  const limit = parseInt(c.req.query('limit') || '200');
  const offset = parseInt(c.req.query('offset') || '0');

  let query = db.select().from(schema.evaluationLogs)
    .orderBy(desc(schema.evaluationLogs.evaluatedAt))
    .limit(limit)
    .offset(offset);

  let logs = query.all();

  if (runId) logs = logs.filter(l => l.runId === runId);
  if (symbol) logs = logs.filter(l => l.tokenSymbol?.toLowerCase().includes(symbol.toLowerCase()));
  if (status) logs = logs.filter(l => l.newStatus === status);

  return c.json({ total: logs.length, logs });
});

app.get('/api/evaluation-logs/runs', (c) => {
  const limit = parseInt(c.req.query('limit') || '50');

  // Get distinct runIds with summary stats
  const allLogs = db.select().from(schema.evaluationLogs)
    .orderBy(desc(schema.evaluationLogs.evaluatedAt))
    .all();

  const runMap = new Map<string, {
    runId: string;
    evaluatedAt: string;
    totalEvaluated: number;
    buySignals: number;
    dismissed: number;
    watching: number;
  }>();

  for (const log of allLogs) {
    if (!runMap.has(log.runId)) {
      runMap.set(log.runId, {
        runId: log.runId,
        evaluatedAt: log.evaluatedAt || '',
        totalEvaluated: 0,
        buySignals: 0,
        dismissed: 0,
        watching: 0,
      });
    }
    const run = runMap.get(log.runId)!;
    run.totalEvaluated++;
    if (log.newStatus === 'buy_signal') run.buySignals++;
    else if (log.newStatus === 'dismissed') run.dismissed++;
    else if (log.newStatus === 'watching') run.watching++;
  }

  const runs = Array.from(runMap.values())
    .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))
    .slice(0, limit);

  return c.json({ total: runs.length, runs });
});

// ── P7: 社交热度排行 ────────────────────────────────
app.get('/api/social-hype', async (c) => {
  const chainId = c.req.query('chainId') || '56';
  const sentiment = c.req.query('sentiment') || 'All';
  const lang = c.req.query('lang') || 'zh';
  try {
    const { httpGet } = await import('./collectors/base');
    const params = new URLSearchParams({
      chainId, sentiment, socialLanguage: 'ALL',
      targetLanguage: lang, timeRange: '1',
    });
    const res = await httpGet(
      `/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/social/hype/rank/leaderboard?${params}`,
      'binance-web3/2.0 (Skill)'
    );
    const list = (res.data as any)?.leaderBoardList || [];
    const items = list.map((item: any) => ({
      symbol: item.metaInfo?.symbol || '',
      chainId: item.metaInfo?.chainId || chainId,
      contractAddress: item.metaInfo?.contractAddress || '',
      icon: item.metaInfo?.icon || '',
      socialHype: item.socialHypeInfo?.socialHype || 0,
      socialSummary: item.socialHypeInfo?.socialSummaryBrief || '',
      sentiment: item.socialHypeInfo?.sentiment || '',
      price: parseFloat(item.marketInfo?.price || '0'),
      marketCap: parseFloat(item.marketInfo?.marketCap || '0'),
      percentChange: parseFloat(item.marketInfo?.percentChange || '0'),
      volume24h: parseFloat(item.marketInfo?.volume24h || '0'),
    }));
    return c.json({ total: items.length, items });
  } catch (e: any) {
    return c.json({ total: 0, items: [], error: e.message });
  }
});

// ── P7: 大户持仓排行 ────────────────────────────────
app.get('/api/holders-rank', (c) => {
  const sortBy = c.req.query('sortBy') || 'kol'; // kol | pro | sm
  const limit = parseInt(c.req.query('limit') || '50');

  const dynamics = db.select().from(schema.tokenDynamics).all();

  const items = dynamics.map((d: any) => ({
    chainId: d.chainId,
    contractAddress: d.contractAddress,
    price: d.price,
    marketCap: d.marketCap,
    liquidity: d.liquidity,
    holders: d.holders,
    kycHolders: d.kycHolderCount,
    kolHolders: d.kolHolders || 0,
    kolHoldingPct: d.kolHoldingPercent || 0,
    proHolders: d.proHolders || 0,
    proHoldingPct: d.proHoldingPercent || 0,
    smHolders: d.smartMoneyHolders || 0,
    smHoldingPct: d.smartMoneyHoldingPercent || 0,
    updatedAt: d.capturedAt,
  }));

  // 按指定维度排序
  if (sortBy === 'pro') items.sort((a: any, b: any) => b.proHolders - a.proHolders);
  else if (sortBy === 'sm') items.sort((a: any, b: any) => b.smHolders - a.smHolders);
  else items.sort((a: any, b: any) => b.kolHolders - a.kolHolders);

  // 关联 symbol
  const result = items.slice(0, limit).map((item: any) => {
    const token = db.select().from(schema.tokens)
      .where(and(eq(schema.tokens.chainId, item.chainId), eq(schema.tokens.contractAddress, item.contractAddress)))
      .get();
    return { ...item, symbol: token?.symbol || '?' };
  });

  return c.json({ total: result.length, items: result });
});

// ── P7: 顶级交易者排行 ──────────────────────────────
app.get('/api/top-traders', (c) => {
  const chainId = c.req.query('chainId') || 'CT_501';
  const period = c.req.query('period') || '30d';
  const limit = parseInt(c.req.query('limit') || '25');

  const traders = db.select().from(schema.topTraders)
    .where(and(eq(schema.topTraders.chainId, chainId), eq(schema.topTraders.period, period)))
    .orderBy(desc(schema.topTraders.realizedPnl))
    .limit(limit)
    .all();

  const items = traders.map((t: any) => ({
    address: t.address,
    chainId: t.chainId,
    period: t.period,
    realizedPnl: t.realizedPnl,
    winRate: t.winRate,
    totalVolume: t.totalVolume,
    totalTxCnt: t.totalTxCnt,
    tags: t.tags,
    topEarningTokens: t.topEarningTokensJson ? JSON.parse(t.topEarningTokensJson) : [],
    updatedAt: t.capturedAt,
  }));

  return c.json({ total: items.length, items });
});

// ── P8b: Unified Activity Feed ───────────────────────
app.get('/api/activity-feed', (c) => {
  const limit = parseInt(c.req.query('limit') || '100');
  const symbol = c.req.query('symbol');
  const cutoffHours = parseInt(c.req.query('hours') || '24');
  const cutoff = new Date(Date.now() - cutoffHours * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

  interface FeedEvent {
    type: string;       // 'entry' | 'evaluate' | 'buy_signal' | 'dismissed' | 'sm_buy' | 'sm_sell' | 'trade_open' | 'trade_close'
    time: string;
    symbol: string;
    chainId: string;
    contractAddress: string;
    title: string;
    detail: string;
    score?: number;
    extra?: any;
  }

  const events: FeedEvent[] = [];

  // 1) Evaluation logs → evaluate / buy_signal / dismissed events
  let evalLogs = db.select().from(schema.evaluationLogs)
    .where(gte(schema.evaluationLogs.evaluatedAt, cutoff))
    .orderBy(desc(schema.evaluationLogs.evaluatedAt))
    .limit(300)
    .all();
  if (symbol) evalLogs = evalLogs.filter(l => l.tokenSymbol?.toLowerCase().includes(symbol.toLowerCase()));

  for (const log of evalLogs) {
    const changed = log.prevStatus !== log.newStatus;
    if (!changed && log.newStatus === 'watching') continue; // skip unchanged watching
    
    let type = 'evaluate';
    let title = `📊 ${log.tokenSymbol} 评估完成`;
    let detail = `SM:${log.smScore?.toFixed(0)} 社交:${log.socialScore?.toFixed(0)} 趋势:${log.trendScore?.toFixed(0)} 流入:${log.inflowScore?.toFixed(0)} KOL:${log.kolScore?.toFixed(0)} 热度:${log.hypeScore?.toFixed(0)}`;

    if (log.newStatus === 'buy_signal' && changed) {
      type = 'buy_signal';
      title = `🟢 ${log.tokenSymbol} 触发买入信号`;
      detail = `总分 ${log.totalScore?.toFixed(1)} 达到阈值 · ${detail}`;
    } else if (log.newStatus === 'dismissed' && changed) {
      type = 'dismissed';
      title = `⚪ ${log.tokenSymbol} 已移出观察`;
      detail = `总分 ${log.totalScore?.toFixed(1)} · ${log.negativeScore && log.negativeScore < 0 ? `扣分 ${log.negativeScore?.toFixed(0)}` : '低分淘汰'}`;
    }

    events.push({
      type, time: log.evaluatedAt || '', symbol: log.tokenSymbol || '',
      chainId: log.chainId || '', contractAddress: log.contractAddress || '',
      title, detail, score: log.totalScore || 0,
      extra: { smScore: log.smScore, socialScore: log.socialScore, trendScore: log.trendScore,
               inflowScore: log.inflowScore, kolScore: log.kolScore, hypeScore: log.hypeScore,
               negativeScore: log.negativeScore, prevStatus: log.prevStatus, newStatus: log.newStatus }
    });
  }

  // 2) SM signals → sm_buy / sm_sell events
  let smSignals = db.select().from(schema.smartMoneySignals)
    .where(gte(schema.smartMoneySignals.capturedAt, cutoff))
    .orderBy(desc(schema.smartMoneySignals.capturedAt))
    .limit(200)
    .all();
  if (symbol) smSignals = smSignals.filter(s => s.ticker?.toLowerCase().includes(symbol.toLowerCase()));

  for (const s of smSignals) {
    const isSell = s.direction === 'sell';
    events.push({
      type: isSell ? 'sm_sell' : 'sm_buy',
      time: s.capturedAt || '', symbol: s.ticker || '',
      chainId: s.chainId || '', contractAddress: s.contractAddress || '',
      title: `${isSell ? '🔴' : '💰'} ${s.ticker} 聪明钱${isSell ? '卖出' : s.direction === 'inflow' ? '流入' : '买入'}`,
      detail: `${s.smartMoneyCount || 0} 个SM地址 · ${s.chainId === '56' ? 'BSC' : 'SOL'}${s.alertPrice ? ` · $${s.alertPrice.toFixed(4)}` : ''}${s.maxGain ? ` · 最高涨幅 ${s.maxGain.toFixed(1)}%` : ''}`,
      extra: { direction: s.direction, smCount: s.smartMoneyCount, alertPrice: s.alertPrice, maxGain: s.maxGain, exitRate: s.exitRate }
    });
  }

  // 3) Watchlist entries (recent) → entry events  
  let watchEntries = db.select().from(schema.tokenWatchlist)
    .where(gte(schema.tokenWatchlist.enteredAt, cutoff))
    .orderBy(desc(schema.tokenWatchlist.enteredAt))
    .limit(100)
    .all();
  if (symbol) watchEntries = watchEntries.filter(w => w.symbol?.toLowerCase().includes(symbol.toLowerCase()));

  for (const w of watchEntries) {
    events.push({
      type: 'entry',
      time: w.enteredAt || '', symbol: w.symbol || '',
      chainId: w.chainId || '', contractAddress: w.contractAddress || '',
      title: `🔍 ${w.symbol} 入选观察列表`,
      detail: `${w.entryMode === 'volume_driven' ? '📊 交易量驱动' : '💰 聪明钱先行'} · ${w.entryReason || ''}`,
      extra: { entryMode: w.entryMode, entryReason: w.entryReason, entryVolume: w.entryVolume, status: w.status }
    });
  }

  // 4) Paper trades → trade events
  let trades = db.select().from(schema.paperTrades)
    .where(gte(schema.paperTrades.enteredAt, cutoff))
    .orderBy(desc(schema.paperTrades.enteredAt))
    .limit(50)
    .all();
  if (symbol) trades = trades.filter(t => t.symbol?.toLowerCase().includes(symbol.toLowerCase()));

  for (const t of trades) {
    events.push({
      type: t.status === 'closed' ? 'trade_close' : 'trade_open',
      time: (t.status === 'closed' ? t.closedAt : t.enteredAt) || '',
      symbol: t.symbol || '', chainId: t.chainId || '', contractAddress: t.contractAddress || '',
      title: `${t.status === 'closed' ? (t.pnlPct && t.pnlPct > 0 ? '💹' : '📉') : '🚀'} ${t.symbol} ${t.status === 'closed' ? '平仓' : '开仓'}`,
      detail: t.status === 'closed'
        ? `收益: ${t.pnlPct?.toFixed(1)}% · $${t.pnlUsd?.toFixed(2)} · 策略: ${t.strategyUsed}`
        : `买入 $${t.positionSizeUsd?.toFixed(2)} @ $${t.entryPrice?.toFixed(6)} · ${t.strategyUsed}`,
      score: t.pnlPct || undefined,
      extra: { status: t.status, pnlPct: t.pnlPct, pnlUsd: t.pnlUsd, strategy: t.strategyUsed }
    });
  }

  // Sort all events by time descending
  events.sort((a, b) => b.time.localeCompare(a.time));

  return c.json({ total: events.length, events: events.slice(0, limit) });
});

// ── Start ─────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3456');

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`\n🚀 MEME Alpha Dashboard API running at http://localhost:${PORT}`);
  console.log(`📊 Stats: http://localhost:${PORT}/api/stats`);
  console.log(`📋 Watchlist: http://localhost:${PORT}/api/watchlist`);
  console.log(`⚙️  Config: http://localhost:${PORT}/api/config\n`);

  // Start cron scheduler
  startScheduler();
});
