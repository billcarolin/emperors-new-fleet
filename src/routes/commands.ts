import { Router } from 'express';
import { randomUUID } from 'crypto';

import type { PersistenceContext } from '../persistence/context';
import type { CommandQueue } from '../queue/types';

const ALLOWED_COMMAND_TYPES = new Set(['PrepareFleet', 'DeployFleet']);

export function createCommandRouter(ctx: PersistenceContext, queue: CommandQueue): Router {
  const router = Router();

  // POST /commands — submit a command
  router.post('/', (req, res) => {
    const { type, payload } = req.body as Record<string, unknown>;

    if (typeof type !== 'string' || !ALLOWED_COMMAND_TYPES.has(type)) {
      return res
        .status(400)
        .json({ error: `type must be one of: ${[...ALLOWED_COMMAND_TYPES].join(', ')}` });
    }
    if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) {
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

    return res.status(201).json(command);
  });

  // GET /commands/:id — retrieve command status
  router.get('/:id', (req, res) => {
    const command = ctx.commands.get(req.params.id);
    if (!command) return res.status(404).json({ error: 'Command not found' });
    return res.json(command);
  });

  return router;
}
