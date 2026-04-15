import express, { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import pinoHttp from 'pino-http';

import type { PersistenceContext } from './persistence/context';
import type { CommandQueue } from './queue/types';
import { logger } from './logger';
import { createFleetRouter } from './routes/fleets';
import { createCommandRouter } from './routes/commands';
import { createHistoryRouter } from './routes/history';

export function createApp(ctx: PersistenceContext, queue: CommandQueue) {
  const app = express();

  // Structured HTTP access log: logs method, url, status, responseTime for every request.
  app.use(pinoHttp({
    logger,
    // Reduce noise: health checks are logged at debug rather than info.
    customLogLevel(_req, res) {
      if (res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    // Silence /health from info logs to avoid log spam in production monitoring.
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
  }));

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/fleets', createFleetRouter(ctx));
  app.use('/commands', createCommandRouter(ctx, queue));
  app.use('/history', createHistoryRouter(ctx));

  // Serve the API Explorer UI at /
  app.use(express.static(join(process.cwd(), 'public')));

  // Global error handler — catches any unhandled error thrown from a route or middleware.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error(
      {
        err,
        method: req.method,
        url: req.url,
        body: req.body,
      },
      'unhandled error in request pipeline',
    );
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
