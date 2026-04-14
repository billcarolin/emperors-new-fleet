import type { Command } from '../persistence/commandRepository';
import type { PersistenceContext } from '../persistence/context';
import { ConcurrencyError } from '../persistence';
import { transition } from '../domain/fleetStateMachine';

const MAX_RESERVATION_RETRIES = 5;

/**
 * Handles PrepareFleetCommand:
 *   Docked → Preparing → Ready        (fuel reserved successfully)
 *   Docked → Preparing → FailedPreparation  (insufficient fuel or pool missing)
 *
 * Resource reservation uses optimistic locking with retry so the logic stays
 * correct if multiple workers are ever added.
 */
export async function handlePrepareFleet(command: Command, ctx: PersistenceContext): Promise<void> {
  const { fleetId } = command.payload as { fleetId: string };

  // 1. Validate fleet exists and is Docked
  const fleet = ctx.fleets.getOrThrow(fleetId);

  // 2. Transition Docked → Preparing
  ctx.fleets.update(fleet.id, fleet.version, (f) => ({
    ...f,
    state: transition(f.state, 'Preparing'),
  }));

  // 3. Attempt to reserve fuel (optimistic-lock retry loop)
  const reserved = reserveFuel(ctx, fleet.id);

  // 4. Transition Preparing → Ready | FailedPreparation
  const preparing = ctx.fleets.getOrThrow(fleet.id);
  ctx.fleets.update(preparing.id, preparing.version, (f) => ({
    ...f,
    state: transition(f.state, reserved ? 'Ready' : 'FailedPreparation'),
  }));
}

function reserveFuel(ctx: PersistenceContext, fleetId: string): boolean {
  for (let attempt = 0; attempt < MAX_RESERVATION_RETRIES; attempt++) {
    const fleet = ctx.fleets.getOrThrow(fleetId);
    const pool = ctx.resourcePools.getByType('FUEL');

    if (!pool) return false;

    const available = pool.total - pool.reserved;
    if (available < fleet.fuelRequired) return false;

    try {
      ctx.resourcePools.update(pool.id, pool.version, (p) => ({
        ...p,
        reserved: p.reserved + fleet.fuelRequired,
      }));
      return true;
    } catch (err) {
      if (err instanceof ConcurrencyError) continue;
      throw err;
    }
  }

  return false; // All retries exhausted
}
