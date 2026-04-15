import { VersionedEntity } from './types';

import { InMemoryRepository } from './InMemoryRepository';
import type { Repository } from './InMemoryRepository';

/**
 * Command lifecycle (see assignment).
 */
export type CommandStatus = 'Queued' | 'Processing' | 'Completed' | 'Failed';

/**
 * Minimal command entity for persistence.
 * Candidates can extend with attemptCount, timestamps, error, idempotency key, etc.
 */
export interface Command extends VersionedEntity {
  type: string;
  status: CommandStatus;
  payload: Record<string, unknown>;
  /** Human-readable business reason populated when status is Failed. */
  failureReason?: string;
}

export type CommandRepository = Repository<Command>;

export function createInMemoryCommandRepository(): CommandRepository {
  return new InMemoryRepository<Command>();
}
