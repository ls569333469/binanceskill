import { httpGet, log } from './base';
import { db, schema } from '../db';

const KLINE_URL = 'https://dquery.sintral.io/u-kline/v1/k-line/candles';

interface KlineCandle {
  openTime?: number;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
  closeTime?: number;
  count?: number;
  [key: string]: any;
}

function chainIdToPlatform(chainId: string): string {
  if (chainId === '56') return 'bsc';
  if (chainId === 'CT_501' || chainId === '501') return 'solana';
  return 'bsc';
}

export async function collectKlines(params: {
  chainId: string;
  contractAddress: string;
  interval?: string;
  limit?: number;
}): Promise<number> {
  const source = 'kline';
  const { chainId, contractAddress } = params;
  const interval = params.interval || '5min';
  const limit = params.limit || 100;
  const platform = chainIdToPlatform(chainId);

  log(source, `Fetching ${interval} klines for ${contractAddress} on ${platform}...`);

  const url = `${KLINE_URL}?address=${contractAddress}&platform=${platform}&interval=${interval}&limit=${limit}`;

  try {
    const res = await httpGet(url, 'binance-web3/1.0 (Skill)');

    const candles: KlineCandle[] = Array.isArray(res.data) ? res.data
      : (res.data?.candles || res.data?.klines || []);

    if (!candles.length) {
      log(source, `No kline data for ${contractAddress}`);
      return 0;
    }

    let saved = 0;

    for (const c of candles) {
      const ts = c.openTime || c.closeTime || 0;
      if (!ts) continue;

      db.insert(schema.tokenKlines)
        .values({
          chainId,
          contractAddress,
          interval,
          timestamp: ts,
          open: parseFloat(c.open || '0'),
          high: parseFloat(c.high || '0'),
          low: parseFloat(c.low || '0'),
          close: parseFloat(c.close || '0'),
          volume: parseFloat(c.volume || '0'),
          count: c.count || 0,
        })
        .onConflictDoUpdate({
          target: [
            schema.tokenKlines.chainId,
            schema.tokenKlines.contractAddress,
            schema.tokenKlines.interval,
            schema.tokenKlines.timestamp,
          ],
          set: {
            open: parseFloat(c.open || '0'),
            high: parseFloat(c.high || '0'),
            low: parseFloat(c.low || '0'),
            close: parseFloat(c.close || '0'),
            volume: parseFloat(c.volume || '0'),
            count: c.count || 0,
          },
        })
        .run();
      saved++;
    }

    log(source, `Saved ${saved} kline candles for ${contractAddress}`);
    return saved;
  } catch (err: any) {
    log(source, `Error fetching klines: ${err.message}`);
    return 0;
  }
}
