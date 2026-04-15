import { Router } from 'express';

import type { PersistenceContext } from '../persistence/context';

export function createHistoryRouter(ctx: PersistenceContext): Router {
  const router = Router();

  /**
   * GET /history
   *
   * Returns fleet state transition history across all fleets.
   *
   * Query parameters (both optional, ISO-8601):
   *   from  — only records with timestamp >= from
   *   to    — only records with timestamp <= to
   *
   * Example:
   *   GET /history?from=2025-01-01T00:00:00.000Z&to=2025-12-31T23:59:59.999Z
   */
  router.get('/', (req, res) => {
    const { from, to } = req.query as { from?: string; to?: string };

    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (from !== undefined) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({ error: '`from` must be a valid ISO-8601 date string' });
      }
    }

    if (to !== undefined) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({ error: '`to` must be a valid ISO-8601 date string' });
      }
    }

    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ error: '`from` must not be after `to`' });
    }

    const records = ctx.fleetHistory.query({ from: fromDate, to: toDate });
    return res.json(records);
  });

  return router;
}
