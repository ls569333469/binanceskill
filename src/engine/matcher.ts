/**
 * Alpha Matching Engine
 * 
 * Cross-references:
 *  1. Alpha new tokens (isNew=1)
 *  2. Trending tokens (in token_snapshots)
 *  3. Smart Money signals
 *  4. Token audits (risk level)
 * 
 * Produces scored match results.
 */
import { db, schema } from '../db';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import { log } from '../collectors/base';

interface MatchCandidate {
  alphaTokenId: number;
  tokenId: number | null;
  symbol: string;
  chainId: string;
  contractAddress: string;
  score: number;
  reasons: string[];
  marketCap: number;
  volume: number;
  smartMoneyCount: number;
  riskLevel: string;
}

export async function runMatchingEngine(): Promise<number> {
  const source = 'match-engine';
  log(source, 'Starting Alpha matching engine...');

  // 1. Get all new Alpha tokens
  const alphaNew = db.select()
    .from(schema.alphaTokens)
    .where(eq(schema.alphaTokens.isNew, 1))
    .all();

  if (!alphaNew.length) {
    log(source, 'No new Alpha tokens to match');
    return 0;
  }
  log(source, `Found ${alphaNew.length} new Alpha tokens`);

  // 2. Get all tracked tokens with latest snapshots
  const trackedTokens = db.select()
    .from(schema.tokens)
    .all();

  // 3. Get all Smart Money signals (recent)
  const signals = db.select()
    .from(schema.smartMoneySignals)
    .orderBy(desc(schema.smartMoneySignals.capturedAt))
    .limit(200)
    .all();

  // 4. Get all audits
  const audits = db.select()
    .from(schema.tokenAudits)
    .all();

  // Build lookup maps
  const tokenByAddress = new Map<string, typeof trackedTokens[0]>();
  for (const t of trackedTokens) {
    if (t.contractAddress) {
      tokenByAddress.set(`${t.chainId}:${t.contractAddress.toLowerCase()}`, t);
    }
  }

  const signalByAddress = new Map<string, typeof signals[0][]>();
  for (const s of signals) {
    if (s.contractAddress) {
      const key = `${s.chainId}:${s.contractAddress.toLowerCase()}`;
      if (!signalByAddress.has(key)) signalByAddress.set(key, []);
      signalByAddress.get(key)!.push(s);
    }
  }

  const auditByAddress = new Map<string, typeof audits[0]>();
  for (const a of audits) {
    if (a.contractAddress) {
      auditByAddress.set(`${a.chainId}:${a.contractAddress!.toLowerCase()}`, a);
    }
  }

  // 5. Match and score
  const matches: MatchCandidate[] = [];

  for (const alpha of alphaNew) {
    if (!alpha.contractAddress) continue;
    const key = `${alpha.chainId}:${alpha.contractAddress.toLowerCase()}`;
    
    let score = 0;
    const reasons: string[] = [];

    // Base score: Alpha token = 10 points
    score += 10;
    reasons.push('Alpha 新代币 (+10)');

    // Check if trending (exists in tracked tokens)
    const tracked = tokenByAddress.get(key);
    let marketCap = 0;
    let volume = 0;
    let tokenId: number | null = null;

    if (tracked) {
      tokenId = tracked.id;
      score += 20;
      reasons.push('热门排行榜上榜 (+20)');

      // Get latest snapshot for market data
      const snapshot = db.select()
        .from(schema.tokenSnapshots)
        .where(eq(schema.tokenSnapshots.tokenId, tracked.id))
        .orderBy(desc(schema.tokenSnapshots.capturedAt))
        .limit(1)
        .get();

      if (snapshot) {
        marketCap = snapshot.marketCap || 0;
        volume = snapshot.volume || 0;

        // Market cap scoring
        if (marketCap >= 1_000_000) { score += 15; reasons.push(`市值 >$1M (+15)`); }
        else if (marketCap >= 100_000) { score += 10; reasons.push(`市值 >$100K (+10)`); }
        else if (marketCap >= 10_000) { score += 5; reasons.push(`市值 >$10K (+5)`); }

        // Volume scoring
        if (volume >= 500_000) { score += 15; reasons.push(`交易量 >$500K (+15)`); }
        else if (volume >= 100_000) { score += 10; reasons.push(`交易量 >$100K (+10)`); }
        else if (volume >= 10_000) { score += 5; reasons.push(`交易量 >$10K (+5)`); }

        // Positive change
        if ((snapshot.percentChange || 0) > 0) {
          score += 5;
          reasons.push(`价格上涨 ${(snapshot.percentChange || 0).toFixed(1)}% (+5)`);
        }

        // KYC holders
        if ((snapshot.kycHolders || 0) >= 500) { score += 10; reasons.push(`币安持有 >500 (+10)`); }
        else if ((snapshot.kycHolders || 0) >= 100) { score += 5; reasons.push(`币安持有 >100 (+5)`); }
      }
    }

    // Smart Money signal match
    const sigs = signalByAddress.get(key) || [];
    let smCount = 0;
    if (sigs.length > 0) {
      const buySigs = sigs.filter(s => s.direction !== 'sell');
      smCount = buySigs.reduce((acc, s) => acc + (s.smartMoneyCount || 0), 0);
      if (smCount > 0) {
        score += 25;
        reasons.push(`Smart Money 买入信号 x${buySigs.length} (${smCount} 地址) (+25)`);
      }
    }

    // Audit risk
    const audit = auditByAddress.get(key);
    let riskLevel = 'unknown';
    if (audit) {
      riskLevel = audit.riskLevel || 'unknown';
      if (riskLevel === 'LOW') { score += 10; reasons.push('审计低风险 (+10)'); }
      else if (riskLevel === 'MEDIUM') { score += 0; reasons.push('审计中风险 (±0)'); }
      else if (riskLevel === 'HIGH') { score -= 20; reasons.push('审计高风险 (-20)'); }
    }

    // Only keep matches with meaningful score (> base 10)
    if (score > 10) {
      matches.push({
        alphaTokenId: alpha.id,
        tokenId,
        symbol: alpha.symbol,
        chainId: alpha.chainId,
        contractAddress: alpha.contractAddress,
        score,
        reasons,
        marketCap,
        volume,
        smartMoneyCount: smCount,
        riskLevel,
      });
    }
  }

  // Sort by score desc
  matches.sort((a, b) => b.score - a.score);

  // 6. Upsert into match_results
  let inserted = 0;
  for (const m of matches) {
    const existing = db.select()
      .from(schema.matchResults)
      .where(and(
        eq(schema.matchResults.chainId, m.chainId),
        eq(schema.matchResults.contractAddress, m.contractAddress!),
      ))
      .get();

    const row = {
      alphaTokenId: m.alphaTokenId,
      tokenId: m.tokenId,
      symbol: m.symbol,
      chainId: m.chainId,
      contractAddress: m.contractAddress,
      score: m.score,
      reasons: JSON.stringify(m.reasons),
      marketCap: m.marketCap,
      volume: m.volume,
      smartMoneyCount: m.smartMoneyCount,
      riskLevel: m.riskLevel,
      status: 'new',
    };

    if (existing) {
      db.update(schema.matchResults)
        .set({ ...row, matchedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) })
        .where(eq(schema.matchResults.id, existing.id))
        .run();
    } else {
      db.insert(schema.matchResults).values(row).run();
      inserted++;
    }
  }

  log(source, `Matching complete: ${matches.length} matches (${inserted} new), top score: ${matches[0]?.score || 0}`);
  return matches.length;
}
