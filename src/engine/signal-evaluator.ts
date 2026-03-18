import { db, schema } from '../db';
import { eq, and, gte, lte, desc, like, sql } from 'drizzle-orm';
import { log, httpGet } from '../collectors/base';
import { analyzeTrend } from './trend-analyzer';

/**
 * P7: 信号评估引擎 — 评估前主动拉取 Token Dynamic API
 * 六维: SM · 社交 · 趋势 · 流入 · 鲸鱼/KOL · 热度(Hype)
 */

// ── Token Dynamic API 实时拉取 ──
interface DynamicData {
  price: string; volume5m: string; volume1h: string; volume4h: string; volume24h: string;
  volume24hBuy: string; volume24hSell: string;
  count24h: string; count24hBuy: string; count24hSell: string;
  percentChange5m: string; percentChange1h: string; percentChange4h: string; percentChange24h: string;
  priceHigh24h: string; priceLow24h: string;
  marketCap: string; fdv: string; liquidity: string;
  holders: string; kycHolderCount: string;
  kolHolders: string; kolHoldingPercent: string;
  proHolders: string; proHoldingPercent: string;
  smartMoneyHolders: string; smartMoneyHoldingPercent: string;
}

async function fetchDynamicForEval(chainId: string, contractAddress: string): Promise<DynamicData | null> {
  try {
    const binanceChainId = chainId; // chainId is already in Binance format (56, CT_501, etc.)
    const res = await httpGet<DynamicData>(
      `/bapi/defi/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info?chainId=${binanceChainId}&contractAddress=${contractAddress}`
    );
    if (res.success && res.data) return res.data;
    return null;
  } catch (e: any) {
    log('signal-evaluator', `Dynamic fetch failed for ${contractAddress.slice(0, 10)}...: ${e.message}`);
    return null;
  }
}

function saveDynamicsToDb(chainId: string, contractAddress: string, data: DynamicData) {
  const row = {
    chainId, contractAddress,
    price: parseFloat(data.price) || null,
    volume5m: parseFloat(data.volume5m) || null,
    volume1h: parseFloat(data.volume1h) || null,
    volume4h: parseFloat(data.volume4h) || null,
    volume24h: parseFloat(data.volume24h) || null,
    volume24hBuy: parseFloat(data.volume24hBuy) || null,
    volume24hSell: parseFloat(data.volume24hSell) || null,
    count24h: parseInt(data.count24h) || null,
    count24hBuy: parseInt(data.count24hBuy) || null,
    count24hSell: parseInt(data.count24hSell) || null,
    percentChange5m: parseFloat(data.percentChange5m) || null,
    percentChange1h: parseFloat(data.percentChange1h) || null,
    percentChange4h: parseFloat(data.percentChange4h) || null,
    percentChange24h: parseFloat(data.percentChange24h) || null,
    priceHigh24h: parseFloat(data.priceHigh24h) || null,
    priceLow24h: parseFloat(data.priceLow24h) || null,
    marketCap: parseFloat(data.marketCap) || null,
    fdv: parseFloat(data.fdv) || null,
    liquidity: parseFloat(data.liquidity) || null,
    holders: parseInt(data.holders) || null,
    kycHolderCount: parseInt(data.kycHolderCount) || null,
    kolHolders: parseInt(data.kolHolders) || null,
    kolHoldingPercent: parseFloat(data.kolHoldingPercent) || null,
    proHolders: parseInt(data.proHolders) || null,
    proHoldingPercent: parseFloat(data.proHoldingPercent) || null,
    smartMoneyHolders: parseInt(data.smartMoneyHolders) || null,
    smartMoneyHoldingPercent: parseFloat(data.smartMoneyHoldingPercent) || null,
  };

  const existing = db.select().from(schema.tokenDynamics)
    .where(and(eq(schema.tokenDynamics.chainId, chainId), eq(schema.tokenDynamics.contractAddress, contractAddress))).get();

  if (existing) {
    db.update(schema.tokenDynamics).set({ ...row, capturedAt: new Date().toISOString() })
      .where(eq(schema.tokenDynamics.id, existing.id)).run();
  } else {
    db.insert(schema.tokenDynamics).values(row).run();
  }
}

// ── 主评估函数 ──
export async function evaluateWatchlist(): Promise<number> {
  const source = 'signal-evaluator';
  const runId = `eval_${Date.now()}`;

  const strategies = db.select().from(schema.signalStrategyConfig)
    .where(eq(schema.signalStrategyConfig.enabled, 1)).all();

  // ★ P8修复: 按entryMode存储策略数组，不再互相覆盖 ★
  const stratArrayMap: Record<string, typeof strategies> = {};
  for (const s of strategies) {
    if (!stratArrayMap[s.entryMode]) stratArrayMap[s.entryMode] = [];
    stratArrayMap[s.entryMode].push(s);
  }

  const watchItems = db.select().from(schema.tokenWatchlist)
    .where(eq(schema.tokenWatchlist.status, 'watching')).all();

  if (!watchItems.length) {
    log(source, 'No watching items to evaluate');
    return 0;
  }

  log(source, `Evaluating ${watchItems.length} watching items...`);
  let evaluated = 0;

  for (const item of watchItems) {
    const matchingStrats = stratArrayMap[item.entryMode] || stratArrayMap['volume_driven'] || [];
    if (!matchingStrats.length) continue;

    // 使用第一个策略的权重做评分 (同mode权重应一致)
    const strat = matchingStrats[0];

    // ★ P7 核心: 评估前主动拉取 Token Dynamic API ★
    const dyn = await fetchDynamicForEval(item.chainId, item.contractAddress);
    if (dyn) {
      saveDynamicsToDb(item.chainId, item.contractAddress, dyn);
    }
    // 短暂延迟避免API限流
    await new Promise(r => setTimeout(r, 150));

    // ── 六维正向评分 (使用dynamics数据) ──
    const smResult = evaluateSmartMoney(item.chainId, item.contractAddress, dyn);
    const socialResult = evaluateSocialHype(item.chainId, item.contractAddress);
    const trendResult = evaluateTrend(item.chainId, item.contractAddress, dyn);
    const inflowResult = evaluateInflow(item.chainId, item.contractAddress, item.tokenId, dyn);
    const kolResult = evaluateKolWhale(item.chainId, item.contractAddress, dyn);
    const hypeResult = evaluateHype(item.chainId, item.contractAddress);

    // ── 负面信号扣分 ──
    const negResult = evaluateNegativeSignals(item.chainId, item.contractAddress, item.tokenId);

    // ── 六维加权综合评分 ──
    const rawScore =
      smResult.score * (strat.weightSm || 20) / 100 +
      socialResult.score * (strat.weightSocial || 10) / 100 +
      trendResult.score * (strat.weightTrend || 20) / 100 +
      inflowResult.score * (strat.weightInflow || 20) / 100 +
      kolResult.score * (strat.weightKol || 15) / 100 +
      hypeResult.score * (strat.weightHype || 15) / 100;

    const totalScore = Math.max(0, rawScore + negResult.penalty);

    // ★ P8修复: 找到分数满足的最佳策略(阈值最高的匹配策略) ★
    // 按阈值从高到低排序，找第一个满足的
    const sortedStrats = [...matchingStrats].sort((a, b) => (b.buyThreshold || 70) - (a.buyThreshold || 70));
    let matchedStrat: typeof strat | null = null;
    for (const st of sortedStrats) {
      if (totalScore >= (st.buyThreshold || 70)) {
        matchedStrat = st;
        break;
      }
    }

    const signalDetails = {
      sm: { score: smResult.score, ...smResult.details },
      social: { score: socialResult.score, ...socialResult.details },
      trend: { score: trendResult.score, ...trendResult.details },
      inflow: { score: inflowResult.score, ...inflowResult.details },
      kol: { score: kolResult.score, ...kolResult.details },
      hype: { score: hypeResult.score, ...hypeResult.details },
      negative: { penalty: negResult.penalty, ...negResult.details },
      rawScore, totalScore,
      buyThreshold: matchedStrat ? (matchedStrat.buyThreshold || 70) : (sortedStrats[sortedStrats.length - 1].buyThreshold || 70),
      matchedStrategy: matchedStrat?.name || null,
      hasDynamics: !!dyn,
    };

    let newStatus = 'watching';
    if (negResult.forceRemove) {
      newStatus = 'dismissed';
    } else if (matchedStrat) {
      newStatus = 'buy_signal';
      log(source, `🟢 BUY via ${matchedStrat.name} (threshold=${matchedStrat.buyThreshold}): ${item.symbol} score=${totalScore.toFixed(1)}`);
    } else if (totalScore < 40) {
      newStatus = 'dismissed';
    }

    db.update(schema.tokenWatchlist)
      .set({
        smScore: smResult.score,
        socialScore: socialResult.score,
        trendScore: trendResult.score,
        inflowScore: inflowResult.score,
        kolScore: kolResult.score,
        hypeScore: hypeResult.score,
        negativeScore: negResult.penalty,
        totalScore,
        status: newStatus,
        scoreUpdatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
        signalDetailsJson: JSON.stringify(signalDetails),
      })
      .where(eq(schema.tokenWatchlist.id, item.id))
      .run();

    // P8: 评估日志
    try {
      db.insert(schema.evaluationLogs)
        .values({
          runId,
          tokenSymbol: item.symbol,
          chainId: item.chainId,
          contractAddress: item.contractAddress,
          smScore: smResult.score,
          socialScore: socialResult.score,
          trendScore: trendResult.score,
          inflowScore: inflowResult.score,
          kolScore: kolResult.score,
          hypeScore: hypeResult.score,
          negativeScore: negResult.penalty,
          totalScore,
          prevStatus: item.status,
          newStatus,
          detailsJson: JSON.stringify(signalDetails),
        })
        .run();
    } catch (e) {}

    if (newStatus === 'dismissed') {
      log(source, `⚪ Dismissed: ${item.symbol} score=${totalScore.toFixed(1)} ${negResult.forceRemove ? '[FORCED]' : ''}`);
    }

    evaluated++;
  }

  // 清理7天前的评估日志
  const cleanupCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  try { db.delete(schema.evaluationLogs).where(lte(schema.evaluationLogs.evaluatedAt, cleanupCutoff)).run(); } catch (e) {}

  log(source, `Evaluated ${evaluated} items (runId: ${runId})`);
  return evaluated;
}

// ── SM维度 (0-100) — P7: 增加dynamics.smartMoneyHolders ──
function evaluateSmartMoney(chainId: string, contractAddress: string, dyn: DynamicData | null) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19); // 放宽到24h
  let score = 0;
  const details: Record<string, any> = {};

  // 主源1: SM信号表买入信号
  const buySignals = db.select().from(schema.smartMoneySignals)
    .where(and(
      eq(schema.smartMoneySignals.chainId, chainId),
      eq(schema.smartMoneySignals.contractAddress, contractAddress),
      eq(schema.smartMoneySignals.direction, 'buy'),
      gte(schema.smartMoneySignals.capturedAt, cutoff),
    )).all();

  if (buySignals.length > 0) {
    const maxSmCount = Math.max(...buySignals.map(s => s.smartMoneyCount || 0));
    details.buySignalCount = buySignals.length;
    details.maxSmCount = maxSmCount;
    if (maxSmCount >= 5) score = 80;
    else if (maxSmCount >= 3) score = 60;
    else score = 40;
  }

  // 主源2: SM inflow信号
  const inflowSignals = db.select().from(schema.smartMoneySignals)
    .where(and(
      eq(schema.smartMoneySignals.chainId, chainId),
      eq(schema.smartMoneySignals.contractAddress, contractAddress),
      eq(schema.smartMoneySignals.direction, 'inflow'),
      gte(schema.smartMoneySignals.capturedAt, cutoff),
    )).all();

  if (inflowSignals.length > 0) {
    const maxInflow = Math.max(...inflowSignals.map(s => s.alertPrice || 0));
    details.inflowAmount = maxInflow;
    if (maxInflow > 50000) score = Math.min(100, score + 20);
    else if (maxInflow > 10000) score = Math.min(100, score + 10);
  }

  // ★ P7新增: 从dynamics获取smartMoneyHolders ★
  if (dyn) {
    const smHolders = parseInt(dyn.smartMoneyHolders) || 0;
    details.dynSmHolders = smHolders;
    if (score === 0 && smHolders > 0) {
      // SM信号表无数据时用dynamics补充
      if (smHolders >= 5) score = 60;
      else if (smHolders >= 3) score = 45;
      else if (smHolders >= 1) score = 25;
    } else if (smHolders >= 3) {
      // SM信号表有数据时，dynamics作为加分
      score = Math.min(100, score + 10);
    }
  }

  return { score: Math.min(100, score), details };
}

// ── 社交维度 (0-100) ──
function evaluateSocialHype(chainId: string, contractAddress: string) {
  let score = 0;
  const details: Record<string, any> = {};

  // 主源1: social-hype 快照
  const token = db.select().from(schema.tokens)
    .where(and(eq(schema.tokens.chainId, chainId), eq(schema.tokens.contractAddress, contractAddress))).get();

  if (token) {
    const socialSnap = db.select().from(schema.tokenSnapshots)
      .where(and(eq(schema.tokenSnapshots.tokenId, token.id), eq(schema.tokenSnapshots.source, 'social-hype')))
      .orderBy(desc(schema.tokenSnapshots.capturedAt)).limit(1).get();

    if (socialSnap?.extraJson) {
      try {
        const extra = JSON.parse(socialSnap.extraJson);
        details.socialHypeRank = extra.rank;
        details.sentiment = extra.sentiment;
        if (extra.rank && extra.rank <= 10) score = 90;
        else if (extra.rank && extra.rank <= 30) score = 70;
        else score = 40;
        if (extra.sentiment === 'Positive') score = Math.min(100, score + 10);
      } catch {}
    }

    // P7: 也查 unified-rank 快照中的社交数据
    if (score === 0) {
      const unifiedSnap = db.select().from(schema.tokenSnapshots)
        .where(and(eq(schema.tokenSnapshots.tokenId, token.id), eq(schema.tokenSnapshots.source, 'unified-rank')))
        .orderBy(desc(schema.tokenSnapshots.capturedAt)).limit(1).get();

      if (unifiedSnap) {
        score = 30; // 存在于统一排行榜中就给基础分
        details.inUnifiedRank = true;
      }
    }
  }

  // 主源2: Topic Rush 关联
  const cutoff4h = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const topics = db.select().from(schema.topicRushes)
    .where(gte(schema.topicRushes.capturedAt, cutoff4h)).all();

  for (const topic of topics) {
    if (!topic.tokensJson) continue;
    try {
      const topicTokens = JSON.parse(topic.tokensJson);
      const found = topicTokens.find((tt: any) =>
        tt.contractAddress === contractAddress || tt.ca === contractAddress
      );
      if (found) {
        score = Math.min(100, score + 25);
        details.topicName = topic.name;
        details.topicNetInflow1h = topic.netInflow1h;
        if ((topic.netInflow1h || 0) > 10000) {
          score = Math.min(100, score + 10);
          details.topicInflowHigh = true;
        }
        break;
      }
    } catch {}
  }

  return { score: Math.min(100, score), details };
}

// ── 趋势维度 (0-100) — P7: dynamics涨跌幅作主源 ──
function evaluateTrend(chainId: string, contractAddress: string, dyn: DynamicData | null) {
  let score = 0;
  const details: Record<string, any> = {};

  // ★ P7主源: Token Dynamic API 涨跌幅 ★
  if (dyn) {
    const pct5m = parseFloat(dyn.percentChange5m) || 0;
    const pct1h = parseFloat(dyn.percentChange1h) || 0;
    const pct4h = parseFloat(dyn.percentChange4h) || 0;
    const pct24h = parseFloat(dyn.percentChange24h) || 0;

    details.dynPct5m = pct5m;
    details.dynPct1h = pct1h;
    details.dynPct4h = pct4h;
    details.dynPct24h = pct24h;

    // 1h涨幅评分
    if (pct1h > 20) { score += 40; details.trend1hStrong = true; }
    else if (pct1h > 10) { score += 30; }
    else if (pct1h > 5) { score += 20; }
    else if (pct1h > 0) { score += 10; }

    // 5m短期动量
    if (pct5m > 5) { score += 20; details.momentum5m = true; }
    else if (pct5m > 2) { score += 10; }

    // 4h趋势确认
    if (pct4h > 10) { score += 15; details.trend4hConfirm = true; }
    else if (pct4h > 5) { score += 8; }

    // 多窗口共振加分（5m+1h+4h都涨）
    if (pct5m > 0 && pct1h > 0 && pct4h > 0) {
      score += 10;
      details.multiTimeframeUp = true;
    }

    // 下跌趋势扣分
    if (pct1h < -10) { score = Math.max(0, score - 20); details.trend1hDown = true; }
  }

  // 辅源: K线技术分析 (如果K线数据充足则额外加分)
  // 注意: 不再 await collectKlines，避免阻塞。用已有K线数据即可
  const candles = db.select().from(schema.tokenKlines)
    .where(and(
      eq(schema.tokenKlines.chainId, chainId),
      eq(schema.tokenKlines.contractAddress, contractAddress),
      eq(schema.tokenKlines.interval, '5min'),
    ))
    .orderBy(desc(schema.tokenKlines.timestamp))
    .limit(6).all().reverse();

  if (candles.length >= 6) {
    const last3 = candles.slice(-3);
    const bullishCount = last3.filter(c => (c.close || 0) > (c.open || 0)).length;
    if (bullishCount === 3) { score += 10; details.klineBullish3 = true; }
    details.klineDataAvailable = true;
  }

  return { score: Math.max(0, Math.min(100, score)), details };
}

// ── 流入维度 (0-100) — P7: dynamics volume作主源 ──
function evaluateInflow(chainId: string, contractAddress: string, tokenId: number | null, dyn: DynamicData | null) {
  let score = 0;
  const details: Record<string, any> = {};

  // ★ P7主源: Token Dynamic API volume + 买卖比 ★
  if (dyn) {
    const vol5m = parseFloat(dyn.volume5m) || 0;
    const vol1h = parseFloat(dyn.volume1h) || 0;
    const vol24h = parseFloat(dyn.volume24h) || 0;
    const buyVol = parseFloat(dyn.volume24hBuy) || 0;
    const sellVol = parseFloat(dyn.volume24hSell) || 0;

    details.dynVol5m = vol5m;
    details.dynVol1h = vol1h;

    // 5m成交量评分
    if (vol5m > 500000) { score += 35; details.vol5mHigh = true; }
    else if (vol5m > 100000) { score += 25; }
    else if (vol5m > 50000) { score += 15; }
    else if (vol5m > 10000) { score += 8; }

    // 1h成交量评分
    if (vol1h > 1000000) { score += 25; details.vol1hHigh = true; }
    else if (vol1h > 500000) { score += 15; }
    else if (vol1h > 100000) { score += 8; }

    // 买卖比（买方力量更强）
    if (buyVol > 0 && sellVol > 0) {
      const buyRatio = buyVol / (buyVol + sellVol);
      details.buyRatio = buyRatio;
      if (buyRatio > 0.6) { score += 15; details.buyDominant = true; }
      else if (buyRatio > 0.55) { score += 8; }
    }
  }

  // 辅源: KYC持有人增长
  if (tokenId) {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const snapshots = db.select().from(schema.tokenSnapshots)
      .where(and(eq(schema.tokenSnapshots.tokenId, tokenId), gte(schema.tokenSnapshots.capturedAt, cutoff)))
      .orderBy(schema.tokenSnapshots.capturedAt).all();

    if (snapshots.length >= 2) {
      const firstKyc = snapshots[0]?.kycHolders || 0;
      const lastKyc = snapshots[snapshots.length - 1]?.kycHolders || 0;
      if (firstKyc > 0) {
        const kycGrowth = ((lastKyc - firstKyc) / firstKyc) * 100;
        details.kycHolderGrowth = kycGrowth;
        if (kycGrowth > 10) { score = Math.min(100, score + 10); details.kycGrowingFast = true; }
      }
    }
  }

  // 辅源: Topic Rush 话题净流入
  const cutoff4h = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const topics = db.select().from(schema.topicRushes)
    .where(gte(schema.topicRushes.capturedAt, cutoff4h)).all();

  for (const topic of topics) {
    if (!topic.tokensJson) continue;
    try {
      const topicTokens = JSON.parse(topic.tokensJson);
      const found = topicTokens.find((tt: any) =>
        tt.contractAddress === contractAddress || tt.ca === contractAddress
      );
      if (found && (topic.netInflow1h || 0) > 0) {
        score = Math.min(100, score + 10);
        details.topicInflowPositive = true;
        break;
      }
    } catch {}
  }

  return { score: Math.min(100, score), details };
}

// ── KOL/鲸鱼维度 (0-100) — P7: 直接用刚拉取的dynamics ──
function evaluateKolWhale(chainId: string, contractAddress: string, dyn: DynamicData | null) {
  let score = 0;
  const details: Record<string, any> = {};

  // ★ P7主源: 刚拉取的 Token Dynamic API 数据 ★
  const kolCount = dyn ? (parseInt(dyn.kolHolders) || 0) : 0;
  const proCount = dyn ? (parseInt(dyn.proHolders) || 0) : 0;
  const smCount = dyn ? (parseInt(dyn.smartMoneyHolders) || 0) : 0;
  const kolPct = dyn ? (parseFloat(dyn.kolHoldingPercent) || 0) : 0;
  const proPct = dyn ? (parseFloat(dyn.proHoldingPercent) || 0) : 0;

  details.kolHolders = kolCount;
  details.proHolders = proCount;
  details.smHolders = smCount;

  // 如果dynamics没拿到，尝试从DB中已有的token_dynamics读取
  if (!dyn) {
    const dbDyn = db.select().from(schema.tokenDynamics)
      .where(and(eq(schema.tokenDynamics.chainId, chainId), eq(schema.tokenDynamics.contractAddress, contractAddress))).get();
    if (dbDyn) {
      const dk = dbDyn.kolHolders || 0, dp = dbDyn.proHolders || 0, ds = dbDyn.smartMoneyHolders || 0;
      details.kolHolders = dk; details.proHolders = dp; details.smHolders = ds;
      details.fromDb = true;
      // 用DB值重新评分
      if (dk >= 5) score += 30; else if (dk >= 2) score += 20; else if (dk >= 1) score += 10;
      if (dp >= 10) score += 25; else if (dp >= 5) score += 15; else if (dp >= 2) score += 8;
      if (ds >= 5) score += 25; else if (ds >= 3) score += 15; else if (ds >= 1) score += 8;
      return { score: Math.min(100, score), details };
    }
  }

  // KOL 持仓评分
  if (kolCount >= 5) score += 30;
  else if (kolCount >= 2) score += 20;
  else if (kolCount >= 1) score += 10;

  // Pro 持仓评分
  if (proCount >= 10) score += 25;
  else if (proCount >= 5) score += 15;
  else if (proCount >= 2) score += 8;

  // SM 持仓评分
  if (smCount >= 5) score += 25;
  else if (smCount >= 3) score += 15;
  else if (smCount >= 1) score += 8;

  // 持仓占比加成
  if (kolPct >= 5) score += 10;
  if (proPct >= 10) score += 10;
  details.kolHoldingPct = kolPct;
  details.proHoldingPct = proPct;

  return { score: Math.min(100, score), details };
}

// ── 热度/Hype 维度 (0-100) ──
function evaluateHype(chainId: string, contractAddress: string) {
  let score = 0;
  const details: Record<string, any> = {};

  // Meme Exclusive 排行 — Binance Pulse 算法评分
  const meme = db.select().from(schema.memeExclusiveRank)
    .where(and(eq(schema.memeExclusiveRank.chainId, chainId), eq(schema.memeExclusiveRank.contractAddress, contractAddress))).get();

  if (meme) {
    details.pulseScore = meme.score;
    details.pulseRank = meme.rank;
    details.impression = meme.impression;
    details.alphaStatus = meme.alphaStatus;

    if ((meme.score || 0) >= 4) score += 35;
    else if ((meme.score || 0) >= 3) score += 25;
    else if ((meme.score || 0) >= 2) score += 15;
    else score += 5;

    if ((meme.rank || 999) <= 5) score += 20;
    else if ((meme.rank || 999) <= 15) score += 12;
    else if ((meme.rank || 999) <= 30) score += 6;

    if ((meme.impression || 0) >= 50000) score += 15;
    else if ((meme.impression || 0) >= 10000) score += 10;
    else if ((meme.impression || 0) >= 1000) score += 5;

    if (meme.alphaStatus === 1) { score += 10; details.onAlpha = true; }

    if ((meme.volumeBnTotal || 0) >= 1e7) score += 10;
    else if ((meme.volumeBnTotal || 0) >= 1e6) score += 5;
  }

  // Top Search 数据
  const token = db.select().from(schema.tokens)
    .where(and(eq(schema.tokens.chainId, chainId), eq(schema.tokens.contractAddress, contractAddress))).get();

  if (token) {
    const searchSnap = db.select().from(schema.tokenSnapshots)
      .where(and(eq(schema.tokenSnapshots.tokenId, token.id), eq(schema.tokenSnapshots.source, 'top-search')))
      .orderBy(desc(schema.tokenSnapshots.capturedAt)).limit(1).get();

    if (searchSnap) { score = Math.min(100, score + 15); details.topSearchPresent = true; }
  }

  return { score: Math.min(100, score), details };
}

// ── 负面信号评估 ──
function evaluateNegativeSignals(chainId: string, contractAddress: string, tokenId: number | null) {
  let penalty = 0;
  let forceRemove = false;
  const details: Record<string, any> = {};
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

  // 1. SM sell 信号
  const sellSignals = db.select().from(schema.smartMoneySignals)
    .where(and(
      eq(schema.smartMoneySignals.chainId, chainId),
      eq(schema.smartMoneySignals.contractAddress, contractAddress),
      eq(schema.smartMoneySignals.direction, 'sell'),
      gte(schema.smartMoneySignals.capturedAt, cutoff),
    )).all();

  if (sellSignals.length > 0) { penalty -= 25; details.smSellCount = sellSignals.length; }

  // 2. exitRate > 70%
  const buySignals = db.select().from(schema.smartMoneySignals)
    .where(and(
      eq(schema.smartMoneySignals.chainId, chainId),
      eq(schema.smartMoneySignals.contractAddress, contractAddress),
      eq(schema.smartMoneySignals.direction, 'buy'),
      gte(schema.smartMoneySignals.capturedAt, cutoff),
    )).all();

  const maxExitRate = Math.max(0, ...buySignals.map(s => s.exitRate || 0));
  if (maxExitRate > 70) { penalty -= 20; details.highExitRate = maxExitRate; }

  // 3. SM sell > buy → 强制移出
  if (sellSignals.length > buySignals.length && sellSignals.length > 0) {
    forceRemove = true; details.smNetSell = true;
  }

  // 4. 审计高风险 → 强制移出
  const audit = db.select().from(schema.tokenAudits)
    .where(and(eq(schema.tokenAudits.chainId, chainId), eq(schema.tokenAudits.contractAddress, contractAddress))).get();

  if (audit?.riskLevel === 'HIGH') { forceRemove = true; details.highRiskAudit = true; }

  // 5. volume5m 连续下降
  if (tokenId) {
    const recentSnaps = db.select().from(schema.tokenSnapshots)
      .where(and(
        eq(schema.tokenSnapshots.tokenId, tokenId),
        gte(schema.tokenSnapshots.capturedAt, new Date(Date.now() - 30 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)),
      ))
      .orderBy(desc(schema.tokenSnapshots.capturedAt)).limit(3).all();

    if (recentSnaps.length >= 3) {
      const vols = recentSnaps.map(s => s.volume || 0);
      if (vols[0] < vols[1] && vols[1] < vols[2]) { penalty -= 15; details.volumeDecreasing = true; }
      if (vols[0] < 1000 && vols[1] < 1000) { forceRemove = true; details.volumeNearZero = true; }
    }
  }

  // 6. Sentiment negative
  if (tokenId) {
    const socialSnap = db.select().from(schema.tokenSnapshots)
      .where(and(eq(schema.tokenSnapshots.tokenId, tokenId), eq(schema.tokenSnapshots.source, 'social-hype')))
      .orderBy(desc(schema.tokenSnapshots.capturedAt)).limit(1).get();

    if (socialSnap?.extraJson) {
      try {
        const extra = JSON.parse(socialSnap.extraJson);
        if (extra.sentiment === 'Negative') { penalty -= 15; details.negativeSentiment = true; }
      } catch {}
    }
  }

  return { penalty, forceRemove, details };
}
