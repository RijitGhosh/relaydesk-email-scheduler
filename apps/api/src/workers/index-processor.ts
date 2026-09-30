import { indexEmailsById } from '../elasticsearch/indexer';
import { logger } from '../lib/logger';

export async function processIndexJob(emailIds: string[]): Promise<void> {
  const n = await indexEmailsById(emailIds);
  logger.debug({ indexed: n }, 'elasticsearch indexed');
}
