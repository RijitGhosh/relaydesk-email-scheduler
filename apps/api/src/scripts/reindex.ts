import { indexEmailsById } from '../elasticsearch/indexer';
import { es } from '../elasticsearch/client';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

/** Repairs ES from Postgres (the source of truth). Safe to run any time. */
async function main(): Promise<void> {
  let cursor: string | undefined;
  let total = 0;
  for (;;) {
    const rows = await prisma.scheduledEmail.findMany({ orderBy: { id: 'asc' }, take: 500, select: { id: true }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.id;
    total += await indexEmailsById(rows.map((r) => r.id));
  }
  logger.info({ total }, 'reindex complete');
  console.log(`Reindexed ${total} emails`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([es.close(), prisma.$disconnect()]);
    process.exit();
  });
