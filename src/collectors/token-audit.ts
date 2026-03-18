import { httpPost, log } from './base';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const AUDIT_URL = '/bapi/defi/v1/public/wallet-direct/security/token/audit';

/**
 * Audit a single token by chain + contract address.
 */
export async function auditToken(chainId: string, contractAddress: string) {
  const source = 'token-audit';
  log(source, `Auditing ${contractAddress} on chainId=${chainId}...`);

  const res = await httpPost(AUDIT_URL, {
    binanceChainId: chainId,
    contractAddress,
    requestId: randomUUID(),
  }, 'binance-web3/1.4 (Skill)');

  const data = res.data;
  if (!data) {
    log(source, `No audit data returned for ${contractAddress}`);
    return null;
  }

  const riskItems = data.riskItems || [];
  const riskHits = riskItems.filter((r: any) => r.riskHit);

  // Upsert into token_audits table (matching actual schema columns)
  const existing = db.select()
    .from(schema.tokenAudits)
    .where(and(
      eq(schema.tokenAudits.chainId, chainId),
      eq(schema.tokenAudits.contractAddress, contractAddress),
    ))
    .get();

  const auditRow = {
    chainId,
    contractAddress,
    riskLevel: data.riskLevel || 'unknown',
    buyTax: parseFloat(data.buyTax || '0'),
    sellTax: parseFloat(data.sellTax || '0'),
    riskItemsJson: JSON.stringify(riskItems),
  };

  if (existing) {
    db.update(schema.tokenAudits)
      .set(auditRow)
      .where(eq(schema.tokenAudits.id, existing.id))
      .run();
  } else {
    db.insert(schema.tokenAudits).values(auditRow).run();
  }

  log(source, `Audit: ${contractAddress} => ${data.riskLevel || 'unknown'} (${riskHits.length} risks hit)`);
  return data;
}

/**
 * Batch audit all tracked tokens that haven't been audited yet.
 */
export async function auditAllUnaudited(): Promise<number> {
  const source = 'token-audit-batch';
  const tokens = db.select().from(schema.tokens).all();
  let audited = 0;

  for (const t of tokens) {
    const existing = db.select()
      .from(schema.tokenAudits)
      .where(and(
        eq(schema.tokenAudits.chainId, t.chainId),
        eq(schema.tokenAudits.contractAddress, t.contractAddress),
      ))
      .get();
    if (existing) continue;

    try {
      await auditToken(t.chainId, t.contractAddress);
      audited++;
      await new Promise(r => setTimeout(r, 300));
    } catch (err: any) {
      log(source, `Failed: ${t.symbol} — ${err.message}`);
    }
  }

  log(source, `Batch complete: ${audited} new audits`);
  return audited;
}
