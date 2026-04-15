import { randomUUID } from 'crypto';

import type { Fleet, FleetState } from '../persistence/fleetRepository';
import type { PersistenceContext } from '../persistence/context';
import type { ResourceSnapshot } from '../persistence/fleetHistoryRepository';

/**
 * Snapshots all resource pools and appends a FleetHistoryRecord.
 * Call this immediately after every fleet state transition.
 */
export function recordTransition(
  ctx: PersistenceContext,
  fleet: Fleet,
  fromState: FleetState,
  toState: FleetState,
): void {
  const resources = snapshotResources(ctx);

  ctx.fleetHistory.append({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    fleetId: fleet.id,
    fleetName: fleet.name,
    shipCount: fleet.shipCount,
    fuelRequired: fleet.fuelRequired,
    fromState,
    toState,
    resources,
  });
}

function snapshotResources(ctx: PersistenceContext): ResourceSnapshot[] {
  // Resource pools are queried via the repository's type-scan. We capture all
  // known types so the history record is self-contained.
  const types = ['FUEL', 'HYPERDRIVE_CORE', 'BATTLE_DROIDS'] as const;
  const snapshots: ResourceSnapshot[] = [];

  for (const type of types) {
    const pool = ctx.resourcePools.getByType(type);
    if (pool) {
      snapshots.push({
        resourceType: pool.resourceType,
        total: pool.total,
        reserved: pool.reserved,
        available: pool.total - pool.reserved,
      });
    }
  }

  return snapshots;
}
