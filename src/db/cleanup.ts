import { db, schema } from './index';
import { sql, lt, and, eq } from 'drizzle-orm';
import { log } from '../collectors/base';

/**
 * 数据清理任务 — 每日凌晨3点运行
 */
export function runCleanup() {
  const source = 'cleanup';
  log(source, 'Starting data cleanup...');

  // 1. token_snapshots: 保留7天
  const snap7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const snapResult = db.delete(schema.tokenSnapshots)
    .where(lt(schema.tokenSnapshots.capturedAt, snap7d))
    .run();
  log(source, `Deleted ${snapResult.changes} old snapshots (>7d)`);

  // 2. token_klines: 5min保留3天, 其他保留7天
  const kline3d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const kline7d = snap7d;

  // For klines we need to use raw SQL since we're doing interval-based cleanup
  const k5mResult = db.run(sql`
    DELETE FROM token_klines
    WHERE interval = '5min' AND timestamp < ${Date.now() - 3 * 24 * 60 * 60 * 1000}
  `);
  const kOtherResult = db.run(sql`
    DELETE FROM token_klines
    WHERE interval != '5min' AND timestamp < ${Date.now() - 7 * 24 * 60 * 60 * 1000}
  `);
  log(source, `Deleted ${k5mResult.changes} 5min klines (>3d), ${kOtherResult.changes} other klines (>7d)`);

  // 3. token_watchlist: expired/dismissed 保留30天
  const watch30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const watchResult = db.run(sql`
    DELETE FROM token_watchlist
    WHERE status IN ('expired', 'dismissed')
    AND entered_at < ${watch30d}
  `);
  log(source, `Deleted ${watchResult.changes} old watchlist entries (>30d)`);

  // 4. smart_money_signals: 保留30天
  const sig30d = watch30d;
  const sigResult = db.delete(schema.smartMoneySignals)
    .where(lt(schema.smartMoneySignals.capturedAt, sig30d))
    .run();
  log(source, `Deleted ${sigResult.changes} old SM signals (>30d)`);

  // 5. topic_rushes: 保留14天
  const topic14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const topicResult = db.delete(schema.topicRushes)
    .where(lt(schema.topicRushes.capturedAt, topic14d))
    .run();
  log(source, `Deleted ${topicResult.changes} old topic rushes (>14d)`);

  log(source, 'Cleanup complete');
}
