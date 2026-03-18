import { db, schema } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { log } from '../collectors/base';

// ── Configuration ──
const TRADE_AMOUNT_USD = 100; // 模拟每单固定买入 $100

/**
 * 扫描 Watchlist 中的 buy_signal 并执行虚拟买单
 */
export async function executePaperBuy() {
  const source = 'paper-trader';

  // 1. 获取（或创建）默认的模拟钱包
  let wallet = db.select().from(schema.paperWallets).where(eq(schema.paperWallets.name, 'Main Portfolio')).get();
  if (!wallet) {
    db.insert(schema.paperWallets).values({ name: 'Main Portfolio', balance: 9999999 }).run();
    wallet = db.select().from(schema.paperWallets).where(eq(schema.paperWallets.name, 'Main Portfolio')).get()!;
  }

  // P7: 预加载策略配置，用于映射 entryMode → strategy name
  const stratConfigs = db.select().from(schema.signalStrategyConfig).all();
  const getStrategyName = (entryMode: string): string => {
    const matched = stratConfigs.find(s => s.entryMode === entryMode);
    return matched?.name || (entryMode === 'sm_driven' ? 'strategy_b_sm' : 'strategy_a_volume');
  };

  // 2. 查找看多且至今未买入的 token
  const signals = db.select().from(schema.tokenWatchlist)
    .where(eq(schema.tokenWatchlist.status, 'buy_signal'))
    .all();

  for (const signal of signals) {
    // 检查是否已经为这个信号下过单
    const existingTrade = db.select().from(schema.paperTrades)
      .where(eq(schema.paperTrades.watchlistId, signal.id))
      .get();
      
    if (existingTrade) continue; // 已经买过了

    // 获取最新快照价格 (优先用 dynamics，如果没有使用 snapshots 兜底)
    let snapPrice: number | null = null;
    const dyn = db.select().from(schema.tokenDynamics)
      .where(and(eq(schema.tokenDynamics.chainId, signal.chainId), eq(schema.tokenDynamics.contractAddress, signal.contractAddress)))
      .get();
    
    if (dyn && dyn.price) {
      snapPrice = dyn.price;
    } else if (signal.tokenId) {
      const fallbackSnap = db.select().from(schema.tokenSnapshots)
        .where(eq(schema.tokenSnapshots.tokenId, signal.tokenId))
        .orderBy(desc(schema.tokenSnapshots.capturedAt))
        .limit(1).get();
      if (fallbackSnap && fallbackSnap.price) snapPrice = fallbackSnap.price;
    } else if (signal.entryPrice) {
      snapPrice = signal.entryPrice;
    }

    if (!snapPrice) {
      log(source, `Skipping trade for ${signal.symbol}: No price data found.`);
      continue;
    }

    if (wallet.balance! < TRADE_AMOUNT_USD) {
      log(source, `Insufficient balance to buy ${signal.symbol}. Needs $${TRADE_AMOUNT_USD}, has $${wallet.balance}`);
      continue; // 余额不足
    }

    const price = snapPrice;
    const tokenAmount = TRADE_AMOUNT_USD / price;

    // P8修复: 优先从评估详情获取匹配到的策略名
    let strategyName = getStrategyName(signal.entryMode);
    if (signal.signalDetailsJson) {
      try {
        const details = JSON.parse(signal.signalDetailsJson);
        if (details.matchedStrategy) strategyName = details.matchedStrategy;
      } catch {}
    }

    db.transaction((tx) => {
      // 1. 扣除余额
      tx.update(schema.paperWallets)
        .set({ balance: (wallet!.balance || 0) - TRADE_AMOUNT_USD })
        .where(eq(schema.paperWallets.id, wallet!.id))
        .run();

      // 2. 写入订单
      tx.insert(schema.paperTrades).values({
        walletId: wallet!.id,
        watchlistId: signal.id,
        strategyUsed: strategyName,
        chainId: signal.chainId,
        contractAddress: signal.contractAddress,
        symbol: signal.symbol,
        entryPrice: price,
        positionSizeUsd: TRADE_AMOUNT_USD,
        tokenAmount: tokenAmount,
        status: 'open',
      }).run();

      // 3. 将 Watchlist 状态改为 bought
      tx.update(schema.tokenWatchlist)
        .set({ status: 'bought' })
        .where(eq(schema.tokenWatchlist.id, signal.id))
        .run();
    });

    log(source, `🟩 BOUGHT ${signal.symbol} at $${price?.toFixed(6)} [${strategyName}]`);
    // 更新本地余额以供循环里的下一单使用
    wallet.balance = (wallet.balance || 0) - TRADE_AMOUNT_USD;
  }
}

/**
 * 监控现有持仓，触发止盈/止损/更新最大利润
 */
export async function monitorPaperPositions() {
  const source = 'paper-monitor';
  const openTrades = db.select().from(schema.paperTrades).where(eq(schema.paperTrades.status, 'open')).all();

  // P7: 从策略配置读取止盈止损参数（取第一个启用的策略，否则用默认值）
  const stratConfigs = db.select().from(schema.signalStrategyConfig)
    .where(eq(schema.signalStrategyConfig.enabled, 1)).all();

  for (const trade of openTrades) {
    // 找到该交易对应的策略配置
    const matchedStrat = stratConfigs.find(s => trade.strategyUsed?.includes(s.entryMode)) || stratConfigs[0];
    const takeProfitPct = matchedStrat?.takeProfitPct ?? 50;
    const stopLossPct = matchedStrat?.stopLossPct ?? 20;
    const timeoutHours = matchedStrat?.timeoutHours ?? 4;

    let currentPrice: number | null = null;
    const dyn = db.select().from(schema.tokenDynamics)
      .where(and(eq(schema.tokenDynamics.chainId, trade.chainId), eq(schema.tokenDynamics.contractAddress, trade.contractAddress)))
      .get();
      
    if (dyn && dyn.price) {
      currentPrice = dyn.price;
    } else {
      const token = db.select().from(schema.tokens)
        .where(and(eq(schema.tokens.chainId, trade.chainId), eq(schema.tokens.contractAddress, trade.contractAddress)))
        .get();
      if (token) {
        const fallbackSnap = db.select().from(schema.tokenSnapshots)
          .where(eq(schema.tokenSnapshots.tokenId, token.id))
          .orderBy(desc(schema.tokenSnapshots.capturedAt))
          .limit(1).get();
        if (fallbackSnap && fallbackSnap.price) currentPrice = fallbackSnap.price;
      }
    }

    if (!currentPrice) continue;

    const pnlPct = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
    
    // 更新期间最高涨幅记录 (Max Gain)
    if (pnlPct > (trade.maxGainPct || 0)) {
      db.update(schema.paperTrades)
        .set({ maxGainPct: pnlPct })
        .where(eq(schema.paperTrades.id, trade.id))
        .run();
    }

    // P7: 使用策略配置中的止盈止损参数
    let exitReason = null;
    if (pnlPct >= takeProfitPct) exitReason = 'take_profit';
    else if (pnlPct <= -stopLossPct) exitReason = 'stop_loss';
    const entryTimeStr = (trade.enteredAt || '').replace(' ', 'T') + 'Z';
    const entryTime = new Date(entryTimeStr).getTime();
    const hoursHeld = (Date.now() - entryTime) / (1000 * 60 * 60);
    if (!exitReason && hoursHeld > timeoutHours) {
      exitReason = 'timeout';
    }

    // 执行平仓
    if (exitReason) {
      const exitValueUsd = trade.tokenAmount * currentPrice;
      const pnlUsd = exitValueUsd - trade.positionSizeUsd;

      db.transaction((tx) => {
        // 1. 关闭订单
        tx.update(schema.paperTrades)
          .set({
            status: 'closed',
            exitPrice: currentPrice,
            exitReason: exitReason,
            pnlUsd: pnlUsd,
            pnlPct: pnlPct,
            closedAt: sql`(datetime('now'))`,
          })
          .where(eq(schema.paperTrades.id, trade.id))
          .run();

        // 2. 资金转回钱包并结算收益
        tx.update(schema.paperWallets)
          .set({ 
            balance: sql`balance + ${exitValueUsd}`,
            totalPnl: sql`total_pnl + ${pnlUsd}` 
          })
          .where(eq(schema.paperWallets.id, trade.walletId!))
          .run();
          
        // 3. 更新对应的统计数据 (Reward Tracker)
        updateStrategyStats(tx, trade.strategyUsed, pnlUsd, pnlPct);
      });

      log(source, `⬛ CLOSED ${trade.symbol} (${exitReason}) | PnL: ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}% ($${pnlUsd.toFixed(2)})`);
    }
  }
}

/**
 * 计算策略的历史胜率
 */
function updateStrategyStats(tx: any, strategyName: string, pnlUsd: number, pnlPct: number) {
  let stats = tx.select().from(schema.strategyBacktestStats).where(eq(schema.strategyBacktestStats.strategyName, strategyName)).get();
  
  if (!stats) {
    tx.insert(schema.strategyBacktestStats).values({
      strategyName: strategyName,
      totalTrades: 1,
      winningTrades: pnlUsd > 0 ? 1 : 0,
      losingTrades: pnlUsd <= 0 ? 1 : 0,
      winRate: pnlUsd > 0 ? 100 : 0,
      avgReturnPct: pnlPct,
    }).run();
    return;
  }

  const newTotal = stats.totalTrades + 1;
  const newWins = stats.winningTrades + (pnlUsd > 0 ? 1 : 0);
  const newLosses = stats.losingTrades + (pnlUsd <= 0 ? 1 : 0);
  const newWinRate = (newWins / newTotal) * 100;
  
  // EMA (指数移动平均) 或简单平均来算 return
  const newAvgPct = ((stats.avgReturnPct * stats.totalTrades) + pnlPct) / newTotal;

  tx.update(schema.strategyBacktestStats).set({
    totalTrades: newTotal,
    winningTrades: newWins,
    losingTrades: newLosses,
    winRate: newWinRate,
    avgReturnPct: newAvgPct,
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(schema.strategyBacktestStats.id, stats.id)).run();
}

// ── P8: 市值里程碑检查 ──────────────────────────────

const MILESTONES = [
  { label: '100K', mcap: 100_000 },
  { label: '200K', mcap: 200_000 },
  { label: '500K', mcap: 500_000 },
  { label: '1M',   mcap: 1_000_000 },
  { label: '2M',   mcap: 2_000_000 },
  { label: '5M',   mcap: 5_000_000 },
  { label: '10M',  mcap: 10_000_000 },
  { label: '20M',  mcap: 20_000_000 },
];

/**
 * 检查观察列表中的token是否达到新的市值里程碑
 * 每个里程碑记录当时的6维评分和dynamics数据
 */
export async function checkMilestones() {
  const source = 'milestones';

  // 获取所有活跃token
  const activeTokens = db.select().from(schema.tokenWatchlist)
    .where(sql`${schema.tokenWatchlist.status} IN ('watching', 'buy_signal', 'bought')`)
    .all();

  let recorded = 0;

  for (const wt of activeTokens) {
    // 获取当前dynamics
    const dyn = db.select().from(schema.tokenDynamics)
      .where(and(eq(schema.tokenDynamics.chainId, wt.chainId), eq(schema.tokenDynamics.contractAddress, wt.contractAddress)))
      .get();

    const currentMcap = dyn?.marketCap ?? 0;
    if (!currentMcap || currentMcap < MILESTONES[0].mcap) continue;

    // 获取最近的评估日志（6维分数）
    const evalLog = db.select().from(schema.evaluationLogs)
      .where(and(eq(schema.evaluationLogs.chainId, wt.chainId), eq(schema.evaluationLogs.contractAddress, wt.contractAddress)))
      .orderBy(desc(schema.evaluationLogs.evaluatedAt))
      .limit(1).get();

    // 获取已有里程碑
    const existingMs = db.select().from(schema.watchlistMilestones)
      .where(eq(schema.watchlistMilestones.watchlistId, wt.id))
      .all();
    const reachedLabels = new Set(existingMs.map(m => m.milestoneLabel));

    // 检查每个里程碑
    for (const ms of MILESTONES) {
      if (currentMcap >= ms.mcap && !reachedLabels.has(ms.label)) {
        try {
          db.insert(schema.watchlistMilestones).values({
            watchlistId: wt.id,
            chainId: wt.chainId,
            contractAddress: wt.contractAddress,
            symbol: wt.symbol,
            milestoneLabel: ms.label,
            milestoneMcap: ms.mcap,
            actualMcap: currentMcap,
            // 6维评分
            smScore: evalLog?.smScore ?? 0,
            socialScore: evalLog?.socialScore ?? 0,
            trendScore: evalLog?.trendScore ?? 0,
            inflowScore: evalLog?.inflowScore ?? 0,
            kolScore: evalLog?.kolScore ?? 0,
            hypeScore: evalLog?.hypeScore ?? 0,
            totalScore: evalLog?.totalScore ?? 0,
            // 附加数据
            holders: dyn?.holders ?? null,
            smartMoneyHolders: dyn?.smartMoneyHolders ?? null,
            kolHolders: dyn?.kolHolders ?? null,
            volume24h: dyn?.volume24h ?? null,
          }).run();
          recorded++;
          log(source, `📍 ${wt.symbol} 突破 ${ms.label} (实际: $${currentMcap.toLocaleString()}) [总分: ${evalLog?.totalScore?.toFixed(1) ?? '-'}]`);
        } catch (e: any) {
          // uniqueIndex 冲突 = 已存在，忽略
          if (!e.message?.includes('UNIQUE')) throw e;
        }
      }
    }
  }

  if (recorded > 0) log(source, `✅ 记录了 ${recorded} 个新里程碑`);
}
