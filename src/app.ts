import express from 'express';

import type { PersistenceContext } from './persistence/context';
import type { CommandQueue } from './queue/types';
import { createFleetRouter } from './routes/fleets';
import { createCommandRouter } from './routes/commands';

export function createApp(ctx: PersistenceContext, queue: CommandQueue) {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/fleets', createFleetRouter(ctx));
  app.use('/commands', createCommandRouter(ctx, queue));

  return app;
}
