import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { requireQueueAdmin } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { originGuard } from './middleware/security';
import { emailQueue, indexQueue } from './queues/queues';
import { api } from './routes';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Live BullMQ dashboard (waiting / delayed / active / completed / failed, retries). Auth-protected.
  const board = new ExpressAdapter();
  board.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue), new BullMQAdapter(indexQueue)], serverAdapter: board, options: { uiConfig: { boardTitle: 'RelayDesk Queues' } } });
  app.use('/admin/queues', helmet({ contentSecurityPolicy: false }), cookieParser(), requireQueueAdmin, board.getRouter());

  app.use(helmet());
  app.use(cors({ origin: [env.FRONTEND_URL], credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use('/api', originGuard, api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
