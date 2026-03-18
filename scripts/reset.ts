import { db, schema } from '../src/db';
import { sql } from 'drizzle-orm';

async function reset() {
  db.update(schema.paperTrades).set({
    status: 'open',
    exitPrice: null,
    exitReason: null,
    pnlPct: 0,
    pnlUsd: 0,
    closedAt: null,
    enteredAt: sql`(datetime('now'))`
  }).run();
  console.log('Open trades reinstated');
}
reset();
