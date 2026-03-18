/**
 * Meme Exclusive Rank Collector (P3)
 * 
 * Fetches Binance's algorithm-scored ranking of Pulse-launched meme tokens.
 * 
 * API: GET /bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/exclusive/rank/list
 */
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import { httpGet, log } from './base';

interface MemeExclToken {
  chainId: string;
  contractAddress: string;
  symbol: string;
  rank: number;
  score: string;
  alphaStatus: number;
  price: string;
  percentChange: string;
  marketCap: string;
  liquidity: string;
  volume: string;
  volumeBnTotal: string;
  volumeBn7d: string;
  holders: string;
  kycHolders: string;
  uniqueTraderBn: number;
  impression: number;
  metaInfo?: { name?: string; icon?: string };
  aiNarrativeFlag?: number;
}

export async function collectMemeExclusive(chainId = '56'): Promise<number> {
  const source = 'meme-exclusive';
  log(source, `Collecting Meme Exclusive rank for chain ${chainId}...`);

  try {
    const res = await httpGet<{ tokens: MemeExclToken[] }>(
      `/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/exclusive/rank/list?chainId=${chainId}`
    );

    if (!res.success || !res.data?.tokens?.length) {
      log(source, 'No meme exclusive data returned');
      return 0;
    }

    const tokens = res.data.tokens;
    let saved = 0;

    for (const t of tokens) {
      if (!t.contractAddress) continue;

      const row = {
        chainId: t.chainId || chainId,
        contractAddress: t.contractAddress,
        symbol: t.symbol || null,
        name: t.metaInfo?.name || null,
        rank: t.rank || null,
        score: parseFloat(t.score) || null,
        alphaStatus: t.alphaStatus || null,
        price: parseFloat(t.price) || null,
        percentChange: parseFloat(t.percentChange) || null,
        marketCap: parseFloat(t.marketCap) || null,
        liquidity: parseFloat(t.liquidity) || null,
        volume: parseFloat(t.volume) || null,
        volumeBnTotal: parseFloat(t.volumeBnTotal) || null,
        volumeBn7d: parseFloat(t.volumeBn7d) || null,
        holders: parseInt(t.holders) || null,
        kycHolders: parseInt(t.kycHolders) || null,
        uniqueTraderBn: t.uniqueTraderBn || null,
        impression: t.impression || null,
        aiNarrativeFlag: t.aiNarrativeFlag || null,
      };

      const existing = db.select().from(schema.memeExclusiveRank)
        .where(and(
          eq(schema.memeExclusiveRank.chainId, row.chainId),
          eq(schema.memeExclusiveRank.contractAddress, row.contractAddress),
        )).get();

      if (existing) {
        db.update(schema.memeExclusiveRank)
          .set({ ...row, capturedAt: new Date().toISOString() })
          .where(eq(schema.memeExclusiveRank.id, existing.id)).run();
      } else {
        db.insert(schema.memeExclusiveRank).values(row).run();
      }
      saved++;
    }

    log(source, `Saved ${saved} meme exclusive tokens (chain ${chainId})`);
    return saved;
  } catch (e: any) {
    log(source, `Error: ${e.message}`);
    return 0;
  }
}
