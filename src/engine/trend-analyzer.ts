import { db, schema } from '../db';
import { eq, and, gte, desc } from 'drizzle-orm';
import { log } from '../collectors/base';
import { collectKlines } from '../collectors/kline';

interface KlineCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 分析K线技术趋势
 * 返回 0-100 的得分
 */
export async function analyzeTrend(
  chainId: string,
  contractAddress: string,
): Promise<{ score: number; details: Record<string, any> }> {
  const source = 'trend-analyzer';

  // 拉取最新K线（按需）
  await collectKlines({ chainId, contractAddress, interval: '5min', limit: 30 });

  // 读取最近的5min K线
  const candles = db.select()
    .from(schema.tokenKlines)
    .where(and(
      eq(schema.tokenKlines.chainId, chainId),
      eq(schema.tokenKlines.contractAddress, contractAddress),
      eq(schema.tokenKlines.interval, '5min'),
    ))
    .orderBy(desc(schema.tokenKlines.timestamp))
    .limit(20)
    .all()
    .reverse(); // 按时间正序

  if (candles.length < 6) {
    return { score: 0, details: { reason: 'insufficient_data', count: candles.length } };
  }

  let score = 0;
  const details: Record<string, any> = {};

  // ── 1. 连续阳线: 最近3根都是阳线 → +60
  const last3 = candles.slice(-3);
  const bullishCount = last3.filter(c => (c.close || 0) > (c.open || 0)).length;
  if (bullishCount === 3) {
    score += 60;
    details.consecutiveBullish = true;
  } else if (bullishCount >= 2) {
    score += 30;
    details.consecutiveBullish = false;
    details.bullishCount = bullishCount;
  }

  // ── 2. 1h价格变动: 最早 vs 最新价格
  const firstPrice = candles[0]?.close || 0;
  const lastPrice = candles[candles.length - 1]?.close || 0;
  if (firstPrice > 0) {
    const priceChange = ((lastPrice - firstPrice) / firstPrice) * 100;
    details.priceChange1h = priceChange;
    if (priceChange > 5) {
      score += 20;
      details.priceUp5pct = true;
    }
  }

  // ── 3. 交易量放大: 后3根均值 > 前3根均值 × 150%
  if (candles.length >= 6) {
    const prev3 = candles.slice(-6, -3);
    const prev3AvgVol = prev3.reduce((s, c) => s + (c.volume || 0), 0) / 3;
    const last3AvgVol = last3.reduce((s, c) => s + (c.volume || 0), 0) / 3;
    details.prevAvgVol = prev3AvgVol;
    details.lastAvgVol = last3AvgVol;

    if (prev3AvgVol > 0 && last3AvgVol > prev3AvgVol * 1.5) {
      score += 20;
      details.volumeExpanding = true;
    }
  }

  // ── 4. 突破前高: 最新价格 > 近20根最高价
  const recentHigh = Math.max(...candles.slice(0, -1).map(c => c.high || 0));
  if (lastPrice > recentHigh && recentHigh > 0) {
    score += 10;
    details.breakoutHigh = true;
  }

  // ── 负面: 长上影线（最近一根）
  const lastCandle = candles[candles.length - 1];
  if (lastCandle) {
    const body = Math.abs((lastCandle.close || 0) - (lastCandle.open || 0));
    const upperShadow = (lastCandle.high || 0) - Math.max(lastCandle.close || 0, lastCandle.open || 0);
    if (body > 0 && upperShadow > body * 2) {
      score -= 10;
      details.longUpperShadow = true;
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, details };
}
