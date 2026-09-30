import fs from 'node:fs';
import path from 'node:path';
import { isProd } from '../config/env';
import { prisma } from '../lib/prisma';
import { createSender } from '../services/sender.service';

/**
 * DEVELOPMENT ONLY. Does not bypass auth: sign in with Google once, then run
 *   SEED_USER_EMAIL=you@gmail.com npm run db:seed
 * to add a fresh Ethereal sender to that account and write sample-leads.csv at the repo root.
 */
async function main(): Promise<void> {
  if (isProd) throw new Error('Refusing to seed in production');
  const email = process.env.SEED_USER_EMAIL?.toLowerCase();
  if (!email) throw new Error('Set SEED_USER_EMAIL to the Google account you signed in with');
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user ${email}. Sign in with Google first.`);
  const sender = await createSender(user.id, { displayName: 'Demo Sender', hourlyLimit: 5 });
  const rows = ['email,name', ...Array.from({ length: 12 }, (_, i) => `lead${i + 1}@example.com,Lead ${i + 1}`)];
  fs.writeFileSync(path.resolve(__dirname, '../../../../sample-leads.csv'), `${rows.join('\n')}\n`);
  console.log(`Created sender ${sender.email} (hourly limit 5, handy for demoing the rate limiter) and sample-leads.csv`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
