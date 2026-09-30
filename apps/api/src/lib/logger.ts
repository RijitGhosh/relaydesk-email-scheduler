import pino from 'pino';
import { env, isProd } from '../config/env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: ['*.password', '*.accessToken', '*.access_token', '*.client_secret', '*.smtpPass', 'req.headers.cookie', 'req.headers.authorization'],
    censor: '[redacted]',
  },
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
});
