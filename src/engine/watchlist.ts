import { db, schema } from '../db';
import { eq, and, gte, desc, or, sql } from 'drizzle-orm';
import { log } from '../collectors/base';

/**
 * 双入口观察列表入场扫描 — 每5分钟执行
 */
export async function scanForEntry(): Promise<{ volumeEntries: number; smEntries: number }> {
  const source = 'watchlist-entry';
  let volumeEntries = 0;
  let smEntries = 0;

  // 加载策略配置
  const strategies = db.select().from(schema.signalStrategyConfig)
    .where(eq(schema.signalStrategyConfig.enabled, 1)).all();

  const volumeStrats = strategies.filter(s => s.entryMode === 'volume_driven');
  const smStrats = strategies.filter(s => s.entryMode === 'sm_driven');

  // ── 入口A: 交易量驱动 ──
  if (volumeStrats.length > 0) {
    const minVol = Math.min(...volumeStrats.map(s => s.entryVolume5mMin ?? 100000));

    // 查最近10分钟的5min快照中交易量达标的
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const snapshots = db.select()
      .from(schema.tokenSnapshots)
      .where(and(
        gte(schema.tokenSnapshots.capturedAt, cutoff),
        gte(schema.tokenSnapshots.volume, minVol),
      ))
      .all();

    // 取唯一 tokenId
    const seenTokenIds = new Set<number>();
    for (const snap of snapshots) {
      if (!snap.tokenId || seenTokenIds.has(snap.tokenId)) continue;
      seenTokenIds.add(snap.tokenId);

      // 查 token 详情
      const token = db.select().from(schema.tokens)
        .where(eq(schema.tokens.id, snap.tokenId)).get();
      if (!token || !token.contractAddress) continue;

      // 检查是否已在 watchlist
      const existing = db.select().from(schema.tokenWatchlist)
        .where(and(
          eq(schema.tokenWatchlist.chainId, token.chainId),
          eq(schema.tokenWatchlist.contractAddress, token.contractAddress),
        )).get();

      if (existing) continue;

      // 获取最长的过期时间
      const maxExpireMins = Math.max(...volumeStrats.map(s => s.watchExpireMinutes ?? 60));
      const expireMs = maxExpireMins * 60 * 1000;
      const expiresAt = new Date(Date.now() + expireMs).toISOString().replace('T', ' ').slice(0, 19);

      db.insert(schema.tokenWatchlist)
        .values({
          tokenId: token.id,
          chainId: token.chainId,
          contractAddress: token.contractAddress,
          symbol: token.symbol,
          entryMode: 'volume_driven',
          entryReason: `volume_5m_${Math.floor((snap.volume || 0) / 1000)}k`,
          entryVolume: snap.volume || 0,
          entryPrice: snap.price || 0,
          status: 'watching',
          expiresAt,
        })
        .onConflictDoNothing()
        .run();

      volumeEntries++;
    }

    if (volumeEntries > 0) {
      log(source, `入口A: ${volumeEntries} new volume-driven entries (vol >= $${minVol / 1000}K)`);
    }
  }

  // ── 入口B: SM先行驱动 ──
  if (smStrats.length > 0) {
    const minSmCount = Math.min(...smStrats.map(s => s.entrySmCountMin ?? 3));

    // 查最近24小时内的SM买入信号 (放宽时间以便种子数据能进入)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const signals = db.select()
      .from(schema.smartMoneySignals)
      .where(and(
        eq(schema.smartMoneySignals.direction, 'buy'),
        gte(schema.smartMoneySignals.capturedAt, cutoff),
        gte(schema.smartMoneySignals.smartMoneyCount, minSmCount),
      ))
      .all();

    for (const sig of signals) {
      if (!sig.contractAddress || !sig.chainId) continue;

      // 检查是否已在 watchlist
      const existing = db.select().from(schema.tokenWatchlist)
        .where(and(
          eq(schema.tokenWatchlist.chainId, sig.chainId),
          eq(schema.tokenWatchlist.contractAddress, sig.contractAddress),
        )).get();

      if (existing) continue;

      // 查 token 表获取 tokenId
      const token = db.select().from(schema.tokens)
        .where(and(
          eq(schema.tokens.chainId, sig.chainId),
          eq(schema.tokens.contractAddress, sig.contractAddress),
        )).get();

      const maxExpireMins = Math.max(...smStrats.map(s => s.watchExpireMinutes ?? 120));
      const expireMs = maxExpireMins * 60 * 1000;
      const expiresAt = new Date(Date.now() + expireMs).toISOString().replace('T', ' ').slice(0, 19);

      try {
        db.insert(schema.tokenWatchlist)
          .values({
            tokenId: token?.id || null,
            chainId: sig.chainId,
            contractAddress: sig.contractAddress,
            symbol: sig.ticker || token?.symbol || 'UNKNOWN',
            entryMode: 'sm_driven',
            entryReason: `sm_buy_count_${sig.smartMoneyCount}`,
            entryVolume: 0,
            entryPrice: sig.alertPrice || 0,
            status: 'watching',
            expiresAt,
          })
          .onConflictDoNothing()
          .run();
        smEntries++;
      } catch (e) {
        log(source, `Failed to insert SM entry for ${sig.contractAddress}`);
      }
    }

    if (smEntries > 0) {
      log(source, `入口B: ${smEntries} new SM-driven entries (count >= ${minSmCount})`);
    }
  }

  // ── 超时过期处理 ──
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.update(schema.tokenWatchlist)
    .set({ status: 'expired' })
    .where(and(
      eq(schema.tokenWatchlist.status, 'watching'),
      gte(sql`${now}`, schema.tokenWatchlist.expiresAt),
    ))
    .run();

  return { volumeEntries, smEntries };
}
