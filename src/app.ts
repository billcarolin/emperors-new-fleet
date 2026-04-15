import express from 'express';
import { join } from 'path';

import type { PersistenceContext } from './persistence/context';
import type { CommandQueue } from './queue/types';
import { createFleetRouter } from './routes/fleets';
import { createCommandRouter } from './routes/commands';
import { createHistoryRouter } from './routes/history';

export function createApp(ctx: PersistenceContext, queue: CommandQueue) {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/fleets', createFleetRouter(ctx));
  app.use('/commands', createCommandRouter(ctx, queue));
  app.use('/history', createHistoryRouter(ctx));

  // Serve the API Explorer UI at /
  app.use(express.static(join(process.cwd(), 'public')));

  return app;
}
