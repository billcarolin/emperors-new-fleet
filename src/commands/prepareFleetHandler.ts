import type { Logger } from 'pino';
import type { Command } from '../persistence/commandRepository';
import type { PersistenceContext } from '../persistence/context';
import { ConcurrencyError } from '../persistence';
import { transition } from '../domain/fleetStateMachine';
import { recordTransition } from './recordTransition';
import { logger } from '../logger';

const MAX_RESERVATION_RETRIES = 5;

type ReservationResult =
  | { reserved: true }
  | { reserved: false; reason: string };

/**
 * Handles PrepareFleetCommand:
 *   Docked → Preparing → Ready        (fuel reserved successfully)
 *   Docked → Preparing → FailedPreparation  (insufficient fuel or pool missing)
 *
 * Throws when the fleet ends in FailedPreparation so the command queue marks
 * the command Failed and persists the business reason on the command record.
 *
 * Resource reservation uses optimistic locking with retry so the logic stays
 * correct if multiple workers are ever added.
 */
export async function handlePrepareFleet(command: Command, ctx: PersistenceContext): Promise<void> {
  const { fleetId } = command.payload as { fleetId: string };
  const log = logger.child({ commandId: command.id, fleetId, handler: 'PrepareFleet' });

  // 1. Validate fleet exists and is Docked
  const fleet = ctx.fleets.getOrThrow(fleetId);
  log.info({ currentState: fleet.state, fuelRequired: fleet.fuelRequired }, 'preparing fleet');

  // 2. Transition Docked → Preparing
  ctx.fleets.update(fleet.id, fleet.version, (f) => ({
    ...f,
    state: transition(f.state, 'Preparing'),
  }));
  recordTransition(ctx, fleet, 'Docked', 'Preparing');
  log.info('fleet transitioned to Preparing');

  // 3. Attempt to reserve fuel (optimistic-lock retry loop)
  const result = reserveFuel(ctx, fleet.id, command.id, log);

  // 4. Transition Preparing → Ready | FailedPreparation
  const preparing = ctx.fleets.getOrThrow(fleet.id);
  const finalState = result.reserved ? 'Ready' : 'FailedPreparation';
  ctx.fleets.update(preparing.id, preparing.version, (f) => ({
    ...f,
    state: transition(f.state, finalState),
  }));
  recordTransition(ctx, preparing, 'Preparing', finalState);

  if (result.reserved) {
    log.info({ finalState }, 'fleet preparation succeeded — fuel reserved');
  } else {
    log.warn({ finalState, reason: result.reason }, 'fleet preparation failed — throwing so command is marked Failed');
    throw new PrepareFleetFailureError(result.reason);
  }
}

/**
 * Thrown when PrepareFleet ends in FailedPreparation due to a business
 * constraint (no pool, insufficient fuel, retries exhausted). The message
 * is the human-readable reason stored on the command record.
 */
export class PrepareFleetFailureError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PrepareFleetFailureError';
    Object.setPrototypeOf(this, PrepareFleetFailureError.prototype);
  }
}

function reserveFuel(
  ctx: PersistenceContext,
  fleetId: string,
  commandId: string,
  log: Logger,
): ReservationResult {
  for (let attempt = 1; attempt <= MAX_RESERVATION_RETRIES; attempt++) {
    const fleet = ctx.fleets.getOrThrow(fleetId);
    const pool  = ctx.resourcePools.getByType('FUEL');

    if (!pool) {
      log.error({ commandId }, 'FUEL resource pool not found — cannot reserve fuel');
      return { reserved: false, reason: 'FUEL resource pool is not configured' };
    }

    const available = pool.total - pool.reserved;

    if (available < fleet.fuelRequired) {
      const reason = `Insufficient FUEL: required ${fleet.fuelRequired} units but only ${available} available`;
      log.warn(
        { fuelRequired: fleet.fuelRequired, available, poolTotal: pool.total, poolReserved: pool.reserved },
        'insufficient fuel available for reservation',
      );
      return { reserved: false, reason };
    }

    try {
      ctx.resourcePools.update(pool.id, pool.version, (p) => ({
        ...p,
        reserved: p.reserved + fleet.fuelRequired,
      }));
      log.info(
        { fuelReserved: fleet.fuelRequired, attempt, poolReservedAfter: pool.reserved + fleet.fuelRequired },
        'fuel reserved successfully',
      );
      return { reserved: true };
    } catch (err) {
      if (err instanceof ConcurrencyError) {
        log.warn(
          { attempt, maxAttempts: MAX_RESERVATION_RETRIES, poolId: pool.id },
          'concurrency conflict during fuel reservation — retrying',
        );
        continue;
      }
      log.error({ err, attempt }, 'unexpected error during fuel reservation');
      throw err;
    }
  }

  const reason = `FUEL reservation failed after ${MAX_RESERVATION_RETRIES} concurrent conflict retries`;
  log.error({ maxAttempts: MAX_RESERVATION_RETRIES }, reason);
  return { reserved: false, reason };
}
