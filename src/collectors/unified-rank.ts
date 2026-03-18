import { httpPost, log } from './base';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import { fetchTokenDynamic } from './token-dynamic';

const RANK_URL = '/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/unified/rank/list';

interface RankToken {
  symbol: string;
  tokenContractAddress?: string;
  marketCap?: string;
  liquidity?: string;
  price?: string;
  holders?: number;
  kycHolders?: number;
  percentChange5m?: string;
  percentChange1h?: string;
  percentChange4h?: string;
  percentChange24h?: string;
  volume5m?: string;
  volume1h?: string;
  volume4h?: string;
  volume24h?: string;
  launchTime?: number;
  holdersTop10Percent?: string;
  kolHolders?: number;
  kolHoldingPercent?: string;
  proHolders?: number;
  proHoldingPercent?: string;
  smartMoneyHolders?: number;
  smartMoneyHoldingPercent?: string;
  [key: string]: any;
}

function getVolumeByPeriod(token: RankToken, period: number): number {
  switch (period) {
    case 20: return parseFloat(token.volume5m || '0');
    case 30: return parseFloat(token.volume1h || '0');
    case 40: return parseFloat(token.volume4h || '0');
    case 50: return parseFloat(token.volume24h || '0');
    default: return parseFloat(token.volume1h || '0');
  }
}

function getChangeByPeriod(token: RankToken, period: number): number {
  switch (period) {
    case 20: return parseFloat(token.percentChange5m || '0');
    case 30: return parseFloat(token.percentChange1h || '0');
    case 40: return parseFloat(token.percentChange4h || '0');
    case 50: return parseFloat(token.percentChange24h || '0');
    default: return parseFloat(token.percentChange1h || '0');
  }
}

export async function collectUnifiedRank(params: any): Promise<number> {
  const source = 'unified-rank';
  const chainId = params.chainId || '56';
  const period = params.period || 30;

  log(source, `Fetching chainId=${chainId} period=${period}...`);

  const res = await httpPost(RANK_URL, params);
  if (!res.success || !res.data?.tokens) {
    log(source, `FAILED: ${JSON.stringify(res).slice(0, 200)}`);
    return 0;
  }

  const tokens: RankToken[] = res.data.tokens;
  let inserted = 0;

  for (const t of tokens) {
    if (!t.contractAddress || !t.symbol) continue;

    // Upsert token
    const existing = db.select()
      .from(schema.tokens)
      .where(and(
        eq(schema.tokens.chainId, chainId),
        eq(schema.tokens.contractAddress, t.contractAddress)
      ))
      .get();

    let tokenId: number;
    if (existing) {
      tokenId = existing.id;
      // Update name/launchTime if missing
      if (!existing.name && t.symbol) {
        db.update(schema.tokens)
          .set({ name: t.symbol })
          .where(eq(schema.tokens.id, tokenId))
          .run();
      }
      if (!existing.launchTime && t.launchTime) {
        db.update(schema.tokens)
          .set({ launchTime: t.launchTime })
          .where(eq(schema.tokens.id, tokenId))
          .run();
      }
    } else {
      const result = db.insert(schema.tokens)
        .values({
          symbol: t.symbol,
          chainId,
          contractAddress: t.contractAddress,
          name: t.symbol,
          launchTime: t.launchTime || null,
        })
        .run();
      tokenId = Number(result.lastInsertRowid);
    }

    // Insert snapshot
    const extra: Record<string, any> = {};
    for (const [k, v] of Object.entries(t)) {
      if (!['symbol', 'tokenContractAddress', 'marketCap', 'liquidity', 'price',
            'holders', 'kycHolders', 'launchTime', 'holdersTop10Percent'].includes(k)) {
        extra[k] = v;
      }
    }

    db.insert(schema.tokenSnapshots)
      .values({
        tokenId,
        source,
        period,
        price: parseFloat(t.price || '0'),
        marketCap: parseFloat(t.marketCap || '0'),
        liquidity: parseFloat(t.liquidity || '0'),
        volume: getVolumeByPeriod(t, period),
        holders: t.holders || 0,
        kycHolders: t.kycHolders || 0,
        percentChange: getChangeByPeriod(t, period),
        top10HoldersPct: parseFloat(t.holdersTop10Percent || '0'),
        extraJson: JSON.stringify(extra),
      })
      .run();

    // P8: 调用 Token Dynamic API 获取真实 KOL/SM/volume 数据
    const dyn = await fetchTokenDynamic(chainId, t.contractAddress);
    const dynRow = {
      chainId,
      contractAddress: t.contractAddress,
      price: (dyn ? parseFloat(dyn.price) : parseFloat(t.price || '0')) || null,
      volume5m: (dyn ? parseFloat(dyn.volume5m) : parseFloat(t.volume5m || '0')) || null,
      volume1h: (dyn ? parseFloat(dyn.volume1h) : parseFloat(t.volume1h || '0')) || null,
      volume4h: (dyn ? parseFloat(dyn.volume4h) : parseFloat(t.volume4h || '0')) || null,
      volume24h: (dyn ? parseFloat(dyn.volume24h) : parseFloat(t.volume24h || '0')) || null,
      percentChange5m: dyn ? parseFloat(dyn.percentChange5m) : parseFloat(t.percentChange5m || '0'),
      percentChange1h: dyn ? parseFloat(dyn.percentChange1h) : parseFloat(t.percentChange1h || '0'),
      percentChange4h: dyn ? parseFloat(dyn.percentChange4h) : parseFloat(t.percentChange4h || '0'),
      percentChange24h: dyn ? parseFloat(dyn.percentChange24h) : parseFloat(t.percentChange24h || '0'),
      marketCap: (dyn ? parseFloat(dyn.marketCap) : parseFloat(t.marketCap || '0')) || null,
      liquidity: (dyn ? parseFloat(dyn.liquidity) : parseFloat(t.liquidity || '0')) || null,
      holders: dyn ? parseInt(dyn.holders) || null : (t.holders || null),
      kycHolderCount: dyn ? parseInt(dyn.kycHolderCount) || null : (t.kycHolders || null),
      kolHolders: dyn ? parseInt(dyn.kolHolders) || null : null,
      kolHoldingPercent: dyn ? parseFloat(dyn.kolHoldingPercent) || null : null,
      proHolders: dyn ? parseInt(dyn.proHolders) || null : null,
      proHoldingPercent: dyn ? parseFloat(dyn.proHoldingPercent) || null : null,
      smartMoneyHolders: dyn ? parseInt(dyn.smartMoneyHolders) || null : null,
      smartMoneyHoldingPercent: dyn ? parseFloat(dyn.smartMoneyHoldingPercent) || null : null,
    };

    const existingDyn = db.select().from(schema.tokenDynamics)
      .where(and(eq(schema.tokenDynamics.chainId, chainId), eq(schema.tokenDynamics.contractAddress, t.contractAddress)))
      .get();

    if (existingDyn) {
      db.update(schema.tokenDynamics)
        .set({ ...dynRow, capturedAt: new Date().toISOString() })
        .where(eq(schema.tokenDynamics.id, existingDyn.id)).run();
    } else {
      db.insert(schema.tokenDynamics).values(dynRow).run();
    }

    inserted++;
    // Rate limit: 200ms delay per token
    await new Promise(r => setTimeout(r, 200));
  }

  log(source, `Saved ${inserted} tokens with dynamics (chainId=${chainId})`);
  return inserted;
}

