import { db, schema } from './src/db';
import { inArray } from 'drizzle-orm';

const names = [
  'trading_signal',
  'smart_money_inflow',
  'meme_exclusive_bsc',
  'meme_exclusive_sol',
  'social_hype',
  'meme_rush_bsc',
  'meme_rush_sol',
  'topic_rush_latest'
];

async function update() {
  await db.update(schema.collectorConfig)
    .set({ cronExpr: '*/1 * * * *' }) // Change to 1 minute
    .where(inArray(schema.collectorConfig.name, names));
    
  console.log('Collector config cron intervals successfully updated to 1 minute for testing.');
}

update().catch(console.error);
