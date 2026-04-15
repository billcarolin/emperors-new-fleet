import { Router } from 'express';
import { randomUUID } from 'crypto';

import type { PersistenceContext } from '../persistence/context';
import { logger } from '../logger';

const log = logger.child({ module: 'routes/fleets' });

export function createFleetRouter(ctx: PersistenceContext): Router {
  const router = Router();

  // POST /fleets — create a fleet
  router.post('/', (req, res) => {
    const { name, shipCount, fuelRequired } = req.body as Record<string, unknown>;

    if (typeof name !== 'string' || !name.trim()) {
      log.warn({ body: req.body }, 'POST /fleets rejected: name is required');
      return res.status(400).json({ error: 'name is required' });
    }
    if (typeof shipCount !== 'number' || shipCount < 1) {
      log.warn({ body: req.body }, 'POST /fleets rejected: invalid shipCount');
      return res.status(400).json({ error: 'shipCount must be a positive number' });
    }
    if (typeof fuelRequired !== 'number' || fuelRequired < 0) {
      log.warn({ body: req.body }, 'POST /fleets rejected: invalid fuelRequired');
      return res.status(400).json({ error: 'fuelRequired must be a non-negative number' });
    }

    const fleet = {
      id: randomUUID(),
      version: 0,
      name: name.trim(),
      shipCount,
      fuelRequired,
      state: 'Docked' as const,
    };
    ctx.fleets.create(fleet);
    log.info({ fleetId: fleet.id, name: fleet.name }, 'fleet created');
    return res.status(201).json(fleet);
  });

  // GET /fleets/:id — retrieve a fleet
  router.get('/:id', (req, res) => {
    const fleet = ctx.fleets.get(req.params.id);
    if (!fleet) {
      log.info({ fleetId: req.params.id }, 'GET /fleets/:id — fleet not found');
      return res.status(404).json({ error: 'Fleet not found' });
    }
    return res.json(fleet);
  });

  // PATCH /fleets/:id — update mutable fleet properties (name, shipCount, fuelRequired)
  router.patch('/:id', (req, res) => {
    const fleet = ctx.fleets.get(req.params.id);
    if (!fleet) {
      log.info({ fleetId: req.params.id }, 'PATCH /fleets/:id — fleet not found');
      return res.status(404).json({ error: 'Fleet not found' });
    }

    const { name, shipCount, fuelRequired } = req.body as Record<string, unknown>;

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      log.warn({ fleetId: req.params.id, body: req.body }, 'PATCH /fleets/:id rejected: invalid name');
      return res.status(400).json({ error: 'name must be a non-empty string' });
    }
    if (shipCount !== undefined && (typeof shipCount !== 'number' || shipCount < 1)) {
      log.warn({ fleetId: req.params.id, body: req.body }, 'PATCH /fleets/:id rejected: invalid shipCount');
      return res.status(400).json({ error: 'shipCount must be a positive number' });
    }
    if (fuelRequired !== undefined && (typeof fuelRequired !== 'number' || fuelRequired < 0)) {
      log.warn({ fleetId: req.params.id, body: req.body }, 'PATCH /fleets/:id rejected: invalid fuelRequired');
      return res.status(400).json({ error: 'fuelRequired must be a non-negative number' });
    }

    ctx.fleets.update(req.params.id, fleet.version, (f) => ({
      ...f,
      ...(typeof name === 'string' && { name: name.trim() }),
      ...(typeof shipCount === 'number' && { shipCount }),
      ...(typeof fuelRequired === 'number' && { fuelRequired }),
    }));

    log.info({ fleetId: req.params.id }, 'fleet updated');
    return res.json(ctx.fleets.getOrThrow(req.params.id));
  });

  return router;
}
