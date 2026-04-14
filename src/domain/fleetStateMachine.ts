import type { FleetState } from '../persistence/fleetRepository';

const VALID_TRANSITIONS: Record<FleetState, FleetState[]> = {
  Docked: ['Preparing'],
  Preparing: ['Ready', 'FailedPreparation'],
  Ready: ['Deployed'],
  Deployed: ['InBattle'],
  InBattle: ['Victorious', 'Destroyed'],
  Victorious: [],
  Destroyed: [],
  FailedPreparation: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: FleetState,
    public readonly to: FleetState,
  ) {
    super(`Invalid fleet state transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
    Object.setPrototypeOf(this, InvalidTransitionError.prototype);
  }
}

export function canTransition(from: FleetState, to: FleetState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function transition(from: FleetState, to: FleetState): FleetState {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
  return to;
}
