import { httpGet, log } from './base';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';

const SOCIAL_HYPE_URL = '/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/social/hype/rank/leaderboard';

export async function collectSocialHype(params: any): Promise<number> {
  const source = 'social-hype';
  const chainIds: string[] = params.chainIds || ['CT_501', '56'];
  let total = 0;

  for (const chainId of chainIds) {
    log(source, `Fetching social hype for chainId=${chainId}...`);

    const queryParams = new URLSearchParams({
      chainId,
      sentiment: params.sentiment || 'All',
      socialLanguage: params.socialLanguage || 'ALL',
      targetLanguage: params.targetLanguage || 'en',
      timeRange: String(params.timeRange || 1),
    });

    const res = await httpGet(
      `${SOCIAL_HYPE_URL}?${queryParams.toString()}`,
      'binance-web3/2.0 (Skill)'
    );

    const list: any[] = res.data?.leaderBoardList || [];
    if (!list.length) {
      log(source, `No social hype data for chainId=${chainId}`);
      continue;
    }

    for (const item of list) {
      const meta = item.metaInfo || {};
      const market = item.marketInfo || {};
      const hype = item.socialHypeInfo || {};

      if (!meta.contractAddress) continue;

      // Upsert into tokens table for cross-referencing
      const existing = db.select()
        .from(schema.tokens)
        .where(
          and(
            eq(schema.tokens.chainId, chainId),
            eq(schema.tokens.contractAddress, meta.contractAddress)
          )
        ).get();

      let tokenId: number;
      if (existing) {
        tokenId = existing.id;
      } else {
        const inserted = db.insert(schema.tokens)
          .values({
            symbol: meta.symbol || 'UNKNOWN',
            chainId,
            contractAddress: meta.contractAddress,
            name: meta.symbol || '',
            launchTime: null,
          })
          .returning()
          .get();
        tokenId = inserted.id;
      }

      // Save snapshot with social hype data
      db.insert(schema.tokenSnapshots)
        .values({
          tokenId,
          source: 'social-hype',
          price: parseFloat(market.price || '0'),
          marketCap: parseFloat(market.marketCap || '0'),
          volume: parseFloat(market.volume24h || '0'),
          liquidity: parseFloat(market.liquidity || '0'),
          holders: 0,
          kycHolders: 0,
          percentChange: parseFloat(market.percentChange || '0'),
          period: null,
        })
        .run();

      total++;
    }

    log(source, `Saved ${list.length} social hype entries (chainId=${chainId})`);
  }

  return total;
}
