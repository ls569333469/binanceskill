import { db, schema } from '../src/db';
import { sql } from 'drizzle-orm';

async function resetPaperTrading() {
  // 1. Delete all paper trades
  db.delete(schema.paperTrades).run();
  console.log('✅ Deleted all paper trades');

  // 2. Delete backtest stats
  db.delete(schema.strategyBacktestStats).run();
  console.log('✅ Deleted backtest stats');

  // 3. Reset wallet balance to $10,000
  db.update(schema.paperWallets).set({
    balance: 10000,
    totalPnl: 0,
  }).run();
  console.log('✅ Reset wallet balance to $10,000');

  // 4. Verify
  const trades = db.select().from(schema.paperTrades).all();
  const wallet = db.select().from(schema.paperWallets).all();
  console.log(`Trades remaining: ${trades.length}`);
  console.log(`Wallet: balance=$${wallet[0]?.balance}, totalPnl=$${wallet[0]?.totalPnl}`);
}

resetPaperTrading();
