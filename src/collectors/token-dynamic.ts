/**
 * Token Dynamic Data Collector (P3)
 * 
 * Fetches real-time multi-window data for tokens in the watchlist:
 * volume (5m/1h/4h/24h), buy/sell split, KOL/SM holding, etc.
 * 
 * API: GET /bapi/defi/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info
 */
import { db, schema } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import { httpGet, log } from './base';

interface DynamicData {
  price: string;
  volume5m: string; volume1h: string; volume4h: string; volume24h: string;
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

export async function fetchTokenDynamic(chainId: string, contractAddress: string): Promise<DynamicData | null> {
  try {
    const res = await httpGet<DynamicData>(
      `/bapi/defi/v4/public/wallet-direct/buw/wallet/market/token/dynamic/info?chainId=${chainId}&contractAddress=${contractAddress}`
    );
    if (res.success && res.data) return res.data;
    return null;
  } catch (e: any) {
    log('token-dynamic', `Error fetching ${contractAddress}: ${e.message}`);
    return null;
  }
}

/**
 * Collect dynamic data for all tokens currently in the watchlist with status 'watching'
 */
export async function collectTokenDynamics(): Promise<number> {
  const source = 'token-dynamic';
  log(source, 'Starting token dynamics collection (watchlist tokens)...');

  // Get all active tokens from watchlist (watching + buy_signal + bought)
  const watchTokens = db.select()
    .from(schema.tokenWatchlist)
    .where(sql`${schema.tokenWatchlist.status} IN ('watching', 'buy_signal', 'bought')`)
    .all();

  if (!watchTokens.length) {
    log(source, 'No watching tokens in watchlist');
    return 0;
  }

  log(source, `Fetching dynamics for ${watchTokens.length} watchlist tokens...`);
  let saved = 0;

  for (const token of watchTokens) {
    const data = await fetchTokenDynamic(token.chainId, token.contractAddress);
    if (!data) continue;

    const row = {
      chainId: token.chainId,
      contractAddress: token.contractAddress,
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
      .where(and(
        eq(schema.tokenDynamics.chainId, token.chainId),
        eq(schema.tokenDynamics.contractAddress, token.contractAddress),
      )).get();

    if (existing) {
      db.update(schema.tokenDynamics)
        .set({ ...row, capturedAt: new Date().toISOString() })
        .where(eq(schema.tokenDynamics.id, existing.id)).run();
    } else {
      db.insert(schema.tokenDynamics).values(row).run();
    }
    saved++;

    // Small delay to avoid rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  log(source, `Saved dynamics for ${saved}/${watchTokens.length} tokens`);
  return saved;
}
