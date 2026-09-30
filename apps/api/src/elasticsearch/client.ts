import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env';
import { logger } from '../lib/logger';

export const es = new Client({ node: env.ELASTICSEARCH_URL, requestTimeout: 5_000, maxRetries: 1 });
export const INDEX = env.ELASTICSEARCH_INDEX;

export interface EmailDoc {
  id: string;
  userId: string;
  campaignId: string;
  senderId: string;
  senderEmail: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
}

let ensured = false;
export async function ensureIndex(): Promise<void> {
  if (ensured) return;
  const exists = await es.indices.exists({ index: INDEX });
  if (!exists) {
    await es.indices.create({
      index: INDEX,
      settings: { number_of_shards: 1, number_of_replicas: 0 },
      mappings: {
        properties: {
          id: { type: 'keyword' },
          userId: { type: 'keyword' },
          campaignId: { type: 'keyword' },
          senderId: { type: 'keyword' },
          senderEmail: { type: 'text', fields: { keyword: { type: 'keyword' } } },
          recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
          subject: { type: 'text' },
          body: { type: 'text' },
          status: { type: 'keyword' },
          scheduledAt: { type: 'date' },
          sentAt: { type: 'date' },
          createdAt: { type: 'date' },
        },
      },
    });
    logger.info({ index: INDEX }, 'created elasticsearch index');
  }
  ensured = true;
}

export async function bulkIndex(docs: EmailDoc[]): Promise<void> {
  if (docs.length === 0) return;
  await ensureIndex();
  const operations = docs.flatMap((d) => [{ index: { _index: INDEX, _id: d.id } }, d]);
  const res = await es.bulk({ operations, refresh: false });
  if (res.errors) {
    const first = res.items.find((i) => i.index?.error)?.index?.error;
    throw new Error(`bulk index reported errors: ${first?.reason ?? 'unknown'}`);
  }
}

export interface SearchParams {
  userId: string;
  q?: string;
  statuses?: string[];
  senderId?: string;
  from?: Date;
  to?: Date;
  dateField: 'scheduledAt' | 'sentAt';
  page: number;
  pageSize: number;
  sort: 'asc' | 'desc';
}

export async function searchEmailIds(p: SearchParams): Promise<{ ids: string[]; total: number }> {
  await ensureIndex();
  const filter: object[] = [{ term: { userId: p.userId } }];
  if (p.statuses?.length) filter.push({ terms: { status: p.statuses } });
  if (p.senderId) filter.push({ term: { senderId: p.senderId } });
  if (p.from || p.to) {
    filter.push({ range: { [p.dateField]: { ...(p.from ? { gte: p.from.toISOString() } : {}), ...(p.to ? { lte: p.to.toISOString() } : {}) } } });
  }
  const should: object[] = [];
  const q = p.q?.trim();
  if (q) {
    should.push({
      multi_match: { query: q, fields: ['recipient^3', 'subject^2', 'senderEmail', 'body'], fuzziness: 'AUTO' },
    });
    should.push({ wildcard: { 'recipient.keyword': { value: `*${q.toLowerCase()}*`, case_insensitive: true } } });
    should.push({ wildcard: { 'senderEmail.keyword': { value: `*${q.toLowerCase()}*`, case_insensitive: true } } });
  }
  const res = await es.search({
    index: INDEX,
    from: (p.page - 1) * p.pageSize,
    size: p.pageSize,
    track_total_hits: true,
    _source: false,
    sort: [{ [p.dateField]: { order: p.sort, missing: '_last' } }, { id: { order: 'asc' } }],
    query: { bool: { filter, ...(should.length ? { should, minimum_should_match: 1 } : {}) } },
  });
  const total = typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);
  return { ids: res.hits.hits.map((h) => String(h._id)), total };
}

export async function pingEs(): Promise<boolean> {
  try {
    return await es.ping();
  } catch {
    return false;
  }
}
