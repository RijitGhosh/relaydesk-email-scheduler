import { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { isProd } from '../config/env';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
};

 
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), details: err.issues },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
    return;
  }
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ success: false, error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
    return;
  }
  if ((err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } });
    return;
  }
  logger.error({ err: (err as Error).message, stack: isProd ? undefined : (err as Error).stack, path: req.path }, 'unhandled error');
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: isProd ? 'Something went wrong' : (err as Error).message } });
};
