import { httpPost, log } from './base';
import { db, schema } from '../db';
import { eq, and, sql } from 'drizzle-orm';

const SIGNAL_URL = '/bapi/defi/v1/public/wallet-direct/buw/wallet/web/signal/smart-money';
const INFLOW_URL = '/bapi/defi/v1/public/wallet-direct/tracker/wallet/token/inflow/rank/query';

interface SignalItem {
  signalId?: number;
  ticker?: string;
  contractAddress?: string;
  chainId?: string;
  direction?: string;
  alertPrice?: number;
  maxGain?: number;
  smartMoneyCount?: number;
  exitRate?: number;
  status?: string;
  [key: string]: any;
}

export async function collectTradingSignals(params: any): Promise<number> {
  const source = 'trading-signal';
  const chainIds: string[] = params.chainIds || ['CT_501', '56'];
  let total = 0;

  for (const chainId of chainIds) {
    log(source, `Fetching signals for chainId=${chainId}...`);

    const res = await httpPost(SIGNAL_URL, {
      chainId,
      page: params.page || 1,
      pageSize: params.pageSize || 50,
    }, 'binance-web3/1.0 (Skill)');

    // API returns data as a direct array
    const items: SignalItem[] = Array.isArray(res.data) ? res.data
      : (res.data?.items || res.data?.list || []);

    if (!items.length) {
      log(source, `No signals for chainId=${chainId}`);
      continue;
    }

    for (const s of items) {
      const sigId = s.signalId?.toString() || `${chainId}_${s.contractAddress}_${Date.now()}`;
      const addr = s.contractAddress || '';
      if (!addr) continue;

      const row = {
        signalId: sigId,
        chainId: s.chainId || chainId,
        ticker: s.ticker || '',
        contractAddress: addr,
        direction: s.direction || 'signal',
        alertPrice: parseFloat(s.alertPrice?.toString() || '0'),
        maxGain: parseFloat(s.maxGain?.toString() || '0'),
        smartMoneyCount: s.smartMoneyCount || s.count || 0,
        exitRate: s.exitRate || 0,
        status: s.status || 'active',
        tagsJson: s.tokenTag ? JSON.stringify(s.tokenTag) : null,
      };

      // Upsert: insert or update on conflict
      db.insert(schema.smartMoneySignals)
        .values(row)
        .onConflictDoUpdate({
          target: [
            schema.smartMoneySignals.chainId,
            schema.smartMoneySignals.contractAddress,
            schema.smartMoneySignals.direction,
            schema.smartMoneySignals.signalId,
          ],
          set: {
            maxGain: row.maxGain,
            exitRate: row.exitRate,
            status: row.status,
            smartMoneyCount: row.smartMoneyCount,
            alertPrice: row.alertPrice,
            capturedAt: sql`(datetime('now'))`,
          },
        })
        .run();
      total++;
    }

    log(source, `Saved ${items.length} signals (chainId=${chainId})`);
  }

  return total;
}

export async function collectSmartMoneyInflow(params: any): Promise<number> {
  const source = 'smart-money-inflow';
  const chainIds: string[] = params.chainIds || ['CT_501', '56'];
  let total = 0;

  for (const chainId of chainIds) {
    log(source, `Fetching inflow for chainId=${chainId}...`);

    const res = await httpPost(INFLOW_URL, {
      chainId,
      period: params.period || '24h',
      tagType: params.tagType || 2,
    });

    const tokens: any[] = res.data?.items || res.data?.list || res.data || [];
    if (!Array.isArray(tokens) || !tokens.length) {
      log(source, `No inflow data for chainId=${chainId}`);
      continue;
    }

    for (const t of tokens) {
      // Bug #4 fix: official API returns `ca` not `contractAddress`
      const addr = t.ca || t.contractAddress || '';
      if (!addr) continue;

      const sigId = `inflow_${chainId}_${addr}`;
      const row = {
        signalId: sigId,
        chainId,
        ticker: t.tokenName || t.symbol || t.ticker || '',
        contractAddress: addr,
        direction: 'inflow',
        alertPrice: parseFloat(t.price || '0'),
        maxGain: 0,
        smartMoneyCount: t.traders || t.smartMoneyCount || t.count || 0,
        exitRate: 0,
        status: 'active',
      };

      db.insert(schema.smartMoneySignals)
        .values(row)
        .onConflictDoUpdate({
          target: [
            schema.smartMoneySignals.chainId,
            schema.smartMoneySignals.contractAddress,
            schema.smartMoneySignals.direction,
            schema.smartMoneySignals.signalId,
          ],
          set: {
            alertPrice: row.alertPrice,
            smartMoneyCount: row.smartMoneyCount,
            ticker: row.ticker,
            capturedAt: sql`(datetime('now'))`,
          },
        })
        .run();
      total++;
    }

    log(source, `Saved ${tokens.length} inflow records (chainId=${chainId})`);
  }

  return total;
}
