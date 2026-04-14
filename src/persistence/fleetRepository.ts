import { VersionedEntity } from './types';

import { InMemoryRepository } from './InMemoryRepository';
import type { Repository } from './InMemoryRepository';

/**
 * Fleet lifecycle states (see assignment domain model).
 * Candidates will enforce valid transitions.
 */
export type FleetState =
  | 'Docked'
  | 'Preparing'
  | 'Ready'
  | 'Deployed'
  | 'InBattle'
  | 'Victorious'
  | 'Destroyed'
  | 'FailedPreparation';

/**
 * Fleet entity.
 */
export interface Fleet extends VersionedEntity {
  name: string;
  shipCount: number;
  fuelRequired: number;
  state: FleetState;
}

export type FleetRepository = Repository<Fleet>;

export function createInMemoryFleetRepository(): FleetRepository {
  return new InMemoryRepository<Fleet>();
}
