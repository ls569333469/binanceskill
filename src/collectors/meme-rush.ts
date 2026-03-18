import { httpPost, log } from './base';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';

const MEME_RUSH_URL = '/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/rank/list';

interface MemeRushToken {
  chainId?: string;
  contractAddress?: string;
  symbol?: string;
  name?: string;
  price?: string;
  priceChange?: string;
  marketCap?: string;
  liquidity?: string;
  volume?: string;
  holders?: number;
  progress?: string;
  protocol?: number;
  holdersTop10Percent?: string;
  holdersDevPercent?: string;
  holdersSniperPercent?: string;
  holdersInsiderPercent?: string;
  migrateStatus?: number;
  migrateTime?: number;
  createTime?: number;
  count?: number;
  countBuy?: number;
  countSell?: number;
  devAddress?: string;
  devSellPercent?: string;
  devMigrateCount?: number;
  tagDevWashTrading?: number;
  exclusive?: number;
  [key: string]: any;
}

export async function collectMemeRush(params: any): Promise<number> {
  const source = 'meme-rush';
  const chainId = params.chainId || '56';
  const rankType = params.rankType || 30; // 10=New, 20=Finalizing, 30=Migrated
  const limit = params.limit || 200;

  log(source, `Fetching chainId=${chainId} rankType=${rankType}...`);

  const res = await httpPost(MEME_RUSH_URL, {
    chainId,
    rankType,
    limit,
    ...params.filters,
  }, 'binance-web3/1.0 (Skill)');

  // data is a direct array
  const tokens: MemeRushToken[] = Array.isArray(res.data) ? res.data
    : (res.data?.tokens || res.data?.list || []);

  if (!tokens.length) {
    log(source, `No meme rush data for chainId=${chainId} rankType=${rankType}`);
    return 0;
  }

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
      if (!existing.name && t.name) {
        db.update(schema.tokens)
          .set({ name: t.name })
          .where(eq(schema.tokens.id, tokenId))
          .run();
      }
    } else {
      const result = db.insert(schema.tokens)
        .values({
          symbol: t.symbol,
          chainId,
          contractAddress: t.contractAddress,
          name: t.name || t.symbol,
          launchTime: t.createTime ? Math.floor(t.createTime / 1000) : null,
        })
        .run();
      tokenId = Number(result.lastInsertRowid);
    }

    // Build extra fields for JSON storage
    const extra: Record<string, any> = {};
    const skipFields = ['symbol', 'contractAddress', 'name', 'price', 'marketCap',
      'liquidity', 'holders', 'holdersTop10Percent', 'volume'];
    for (const [k, v] of Object.entries(t)) {
      if (!skipFields.includes(k) && v !== undefined && v !== null) {
        extra[k] = v;
      }
    }

    // Insert snapshot
    db.insert(schema.tokenSnapshots)
      .values({
        tokenId,
        source: `meme-rush-${rankType === 10 ? 'new' : rankType === 20 ? 'rising' : 'migrated'}`,
        period: null,
        price: parseFloat(t.price || '0'),
        marketCap: parseFloat(t.marketCap || '0'),
        liquidity: parseFloat(t.liquidity || '0'),
        volume: parseFloat(t.volume || '0'),
        holders: t.holders || 0,
        kycHolders: 0,
        percentChange: parseFloat(t.priceChange || '0'),
        top10HoldersPct: parseFloat(t.holdersTop10Percent || '0'),
        extraJson: JSON.stringify(extra),
      })
      .run();

    inserted++;
  }

  log(source, `Saved ${inserted} meme-rush tokens (chainId=${chainId} rankType=${rankType})`);
  return inserted;
}
