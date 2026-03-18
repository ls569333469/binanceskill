import { httpPost, log } from './base';
import { db, schema } from '../db';

const TOPIC_RUSH_URL = '/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/social-rush/rank/list';

interface TopicItem {
  topicId?: string;
  name?: string;
  type?: string;
  aiSummary?: string;
  topicNetInflow?: number;
  topicNetInflow1h?: number;
  topicNetInflowAth?: number;
  tokenSize?: number;
  progress?: string;
  deepAnalysisFlag?: number;
  tokens?: any[];
  [key: string]: any;
}

export async function collectTopicRush(params: any): Promise<number> {
  const source = 'topic-rush';
  const chainId = params.chainId || 'CT_501';
  const rankType = params.rankType || 30;  // 10=Latest, 20=Rising, 30=Viral
  const sort = params.sort || 30;          // 10=Latest, 20=NetInflow, 30=TokenSize

  log(source, `Fetching chainId=${chainId} rankType=${rankType}...`);

  const res = await httpPost(TOPIC_RUSH_URL, {
    chainId,
    rankType,
    sort,
    asc: false,
  }, 'binance-web3/1.0 (Skill)');

  const topics: TopicItem[] = Array.isArray(res.data) ? res.data
    : (res.data?.topics || res.data?.list || []);

  if (!topics.length) {
    log(source, `No topics for chainId=${chainId}`);
    return 0;
  }

  let saved = 0;

  for (const t of topics) {
    const tid = t.topicId || t.name || `topic_${saved}`;

    // Upsert topic
    db.insert(schema.topicRushes)
      .values({
        topicId: tid,
        chainId,
        name: t.name || '',
        type: t.type || '',
        aiSummary: t.aiSummary || '',
        netInflow: t.topicNetInflow || 0,
        netInflow1h: t.topicNetInflow1h || 0,
        netInflowAth: t.topicNetInflowAth || 0,
        tokenSize: t.tokenSize || 0,
        progress: t.progress || '',
        tokensJson: t.tokens ? JSON.stringify(t.tokens) : null,
      })
      .onConflictDoUpdate({
        target: [schema.topicRushes.topicId, schema.topicRushes.chainId],
        set: {
          aiSummary: t.aiSummary || '',
          netInflow: t.topicNetInflow || 0,
          netInflow1h: t.topicNetInflow1h || 0,
          netInflowAth: t.topicNetInflowAth || 0,
          tokenSize: t.tokenSize || 0,
          progress: t.progress || '',
          tokensJson: t.tokens ? JSON.stringify(t.tokens) : null,
          capturedAt: new Date().toISOString(),
        },
      })
      .run();

    saved++;
  }

  log(source, `Saved ${saved} topics (chainId=${chainId} rankType=${rankType})`);
  return saved;
}
