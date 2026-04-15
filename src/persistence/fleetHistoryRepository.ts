import type { FleetState } from './fleetRepository';

/**
 * Point-in-time snapshot of a single resource pool.
 */
export interface ResourceSnapshot {
  resourceType: string;
  total: number;
  reserved: number;
  available: number;
}

/**
 * Immutable record written once per fleet state transition.
 * Captures fleet identity, the transition itself, and the state of all
 * resource pools at the moment the transition occurred.
 */
export interface FleetHistoryRecord {
  id: string;
  timestamp: string; // ISO-8601
  fleetId: string;
  fleetName: string;
  shipCount: number;
  fuelRequired: number;
  fromState: FleetState;
  toState: FleetState;
  resources: ResourceSnapshot[];
}

export interface FleetHistoryRepository {
  /** Append a new record. */
  append(record: FleetHistoryRecord): void;
  /**
   * Return records whose timestamp falls within [from, to] (both inclusive,
   * both optional). Records are returned in insertion order.
   */
  query(filter?: { from?: Date; to?: Date }): FleetHistoryRecord[];
  /** Remove all records (for test isolation). */
  clear(): void;
}

export function createInMemoryFleetHistoryRepository(): FleetHistoryRepository {
  const records: FleetHistoryRecord[] = [];

  return {
    append(record: FleetHistoryRecord): void {
      records.push(record);
    },

    query(filter?: { from?: Date; to?: Date }): FleetHistoryRecord[] {
      if (!filter || (!filter.from && !filter.to)) {
        return [...records];
      }
      return records.filter((r) => {
        const ts = r.timestamp;
        if (filter.from && ts < filter.from.toISOString()) return false;
        if (filter.to && ts > filter.to.toISOString()) return false;
        return true;
      });
    },

    clear(): void {
      records.length = 0;
    },
  };
}
