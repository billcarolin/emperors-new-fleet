import { Router } from 'express';
import { randomUUID } from 'crypto';

import type { PersistenceContext } from '../persistence/context';
import type { CommandQueue } from '../queue/types';
import { logger } from '../logger';

const log = logger.child({ module: 'routes/commands' });

const ALLOWED_COMMAND_TYPES = new Set(['PrepareFleet', 'DeployFleet']);

export function createCommandRouter(ctx: PersistenceContext, queue: CommandQueue): Router {
  const router = Router();

  // POST /commands — submit a command
  router.post('/', (req, res) => {
    const { type, payload } = req.body as Record<string, unknown>;

    if (typeof type !== 'string' || !ALLOWED_COMMAND_TYPES.has(type)) {
      log.warn({ body: req.body }, 'POST /commands rejected: invalid command type');
      return res
        .status(400)
        .json({ error: `type must be one of: ${[...ALLOWED_COMMAND_TYPES].join(', ')}` });
    }
    if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
      log.warn({ type, body: req.body }, 'POST /commands rejected: payload must be an object');
      return res.status(400).json({ error: 'payload must be an object' });
    }

    const command = {
      id: randomUUID(),
      version: 0,
      type,
      status: 'Queued' as const,
      payload: (payload as Record<string, unknown>) ?? {},
    };
    ctx.commands.create(command);
    queue.enqueue(command.id);

    log.info({ commandId: command.id, type: command.type, payload: command.payload }, 'command queued');
    return res.status(201).json(command);
  });

  // GET /commands/:id — retrieve command status
  router.get('/:id', (req, res) => {
    const command = ctx.commands.get(req.params.id);
    if (!command) {
      log.info({ commandId: req.params.id }, 'GET /commands/:id — command not found');
      return res.status(404).json({ error: 'Command not found' });
    }
    return res.json(command);
  });

  return router;
}
