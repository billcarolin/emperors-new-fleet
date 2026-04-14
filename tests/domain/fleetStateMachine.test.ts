import { canTransition, transition, InvalidTransitionError } from '../../src/domain/fleetStateMachine';
import type { FleetState } from '../../src/persistence/fleetRepository';

describe('fleetStateMachine', () => {
  describe('canTransition', () => {
    it.each<[FleetState, FleetState]>([
      ['Docked', 'Preparing'],
      ['Preparing', 'Ready'],
      ['Preparing', 'FailedPreparation'],
      ['Ready', 'Deployed'],
      ['Deployed', 'InBattle'],
      ['InBattle', 'Victorious'],
      ['InBattle', 'Destroyed'],
    ])('%s → %s is valid', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });

    it.each<[FleetState, FleetState]>([
      ['Docked', 'Ready'],
      ['Docked', 'Deployed'],
      ['Preparing', 'Docked'],
      ['Preparing', 'Deployed'],
      ['Ready', 'Docked'],
      ['Ready', 'Preparing'],
      ['Deployed', 'Docked'],
      ['FailedPreparation', 'Preparing'],
      ['FailedPreparation', 'Ready'],
      ['Victorious', 'Deployed'],
      ['Destroyed', 'Docked'],
    ])('%s → %s is invalid', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  describe('transition', () => {
    it('returns the target state on a valid transition', () => {
      expect(transition('Docked', 'Preparing')).toBe('Preparing');
    });

    it('throws InvalidTransitionError for an invalid transition', () => {
      expect(() => transition('Docked', 'Deployed')).toThrow(InvalidTransitionError);
    });

    it('error message includes both states', () => {
      expect(() => transition('Ready', 'Docked')).toThrow(/Ready.*Docked/);
    });

    it('terminal states have no valid outgoing transitions', () => {
      const terminals: FleetState[] = ['FailedPreparation', 'Victorious', 'Destroyed'];
      const allStates: FleetState[] = [
        'Docked', 'Preparing', 'Ready', 'Deployed',
        'InBattle', 'Victorious', 'Destroyed', 'FailedPreparation',
      ];
      for (const from of terminals) {
        for (const to of allStates) {
          expect(canTransition(from, to)).toBe(false);
        }
      }
    });
  });
});
