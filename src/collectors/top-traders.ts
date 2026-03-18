/**
 * Top Traders (Address PnL Rank) Collector (P3)
 * 
 * Fetches top-performing trader addresses with PnL, win rate, and their top earning tokens.
 * 
 * API: GET /bapi/defi/v1/public/wallet-direct/market/leaderboard/query
 */
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import { httpGet, log } from './base';

interface TraderData {
  address: string;
  realizedPnl: string;
  winRate: string;
  totalVolume: string;
  totalTxCnt: number;
  tags: { tagName: string }[];
  topEarningTokens: { tokenAddress: string; tokenSymbol: string; realizedPnl: string; profitRate: string }[];
  genericAddressTagList?: { tagName: string }[];
}

export async function collectTopTraders(chainId = 'CT_501', period = '30d'): Promise<number> {
  const source = 'top-traders';
  log(source, `Collecting top traders for chain ${chainId}, period ${period}...`);

  try {
    const res = await httpGet<{ data: TraderData[]; pages: number }>(
      `/bapi/defi/v1/public/wallet-direct/market/leaderboard/query?tag=ALL&pageNo=1&chainId=${chainId}&pageSize=25&sortBy=0&orderBy=0&period=${period}`
    );

    if (!res.success || !res.data?.data?.length) {
      log(source, 'No trader data returned');
      return 0;
    }

    const traders = res.data.data;
    let saved = 0;

    for (const t of traders) {
      if (!t.address) continue;

      const tagNames = (t.genericAddressTagList || t.tags || []).map((tag: any) => tag.tagName || tag).filter(Boolean).join(',');

      const row = {
        address: t.address,
        chainId,
        period,
        realizedPnl: parseFloat(t.realizedPnl) || null,
        winRate: parseFloat(t.winRate) || null,
        totalVolume: parseFloat(t.totalVolume) || null,
        totalTxCnt: t.totalTxCnt || null,
        tags: tagNames || null,
        topEarningTokensJson: t.topEarningTokens ? JSON.stringify(t.topEarningTokens) : null,
      };

      const existing = db.select().from(schema.topTraders)
        .where(and(
          eq(schema.topTraders.address, t.address),
          eq(schema.topTraders.chainId, chainId),
          eq(schema.topTraders.period, period),
        )).get();

      if (existing) {
        db.update(schema.topTraders)
          .set({ ...row, capturedAt: new Date().toISOString() })
          .where(eq(schema.topTraders.id, existing.id)).run();
      } else {
        db.insert(schema.topTraders).values(row).run();
      }
      saved++;
    }

    log(source, `Saved ${saved} top traders (${chainId} ${period})`);
    return saved;
  } catch (e: any) {
    log(source, `Error: ${e.message}`);
    return 0;
  }
}
