import { httpGet, log } from './base';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';

const ALPHA_URL = '/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list';

interface AlphaToken {
  symbol: string;
  tokenContractAddress?: string;
  chainId?: string;
  [key: string]: any;
}

export async function collectAlphaList(): Promise<{ total: number; newCount: number }> {
  const source = 'alpha-list';
  log(source, 'Fetching Alpha token list...');

  const res = await httpGet(ALPHA_URL, 'binance-alpha/1.0.0 (Skill)');
  if (!res.data) {
    log(source, `FAILED: ${JSON.stringify(res).slice(0, 200)}`);
    return { total: 0, newCount: 0 };
  }

  // Response is an array directly, or data.tokens
  const tokens: AlphaToken[] = Array.isArray(res.data) ? res.data : (res.data as any).tokens || [];
  let newCount = 0;

  for (const t of tokens) {
    if (!t.contractAddress) continue;

    const chainId = t.chainId || 'unknown';
    const existing = db.select()
      .from(schema.alphaTokens)
      .where(and(
        eq(schema.alphaTokens.chainId, chainId),
        eq(schema.alphaTokens.contractAddress, t.contractAddress)
      ))
      .get();

    if (!existing) {
      db.insert(schema.alphaTokens)
        .values({
          symbol: t.symbol || 'UNKNOWN',
          chainId,
          contractAddress: t.contractAddress,
          isNew: 1,
          matched: 0,
        })
        .run();
      newCount++;
    }
  }

  log(source, `Total: ${tokens.length} | New: ${newCount}`);
  return { total: tokens.length, newCount };
}
