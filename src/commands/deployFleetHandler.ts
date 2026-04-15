import type { Command } from '../persistence/commandRepository';
import type { PersistenceContext } from '../persistence/context';
import { transition } from '../domain/fleetStateMachine';
import { recordTransition } from './recordTransition';

/**
 * Handles DeployFleetCommand:
 *   Ready → Deployed
 */
export async function handleDeployFleet(command: Command, ctx: PersistenceContext): Promise<void> {
  const { fleetId } = command.payload as { fleetId: string };

  const fleet = ctx.fleets.getOrThrow(fleetId);

  ctx.fleets.update(fleet.id, fleet.version, (f) => ({
    ...f,
    state: transition(f.state, 'Deployed'),
  }));
  recordTransition(ctx, fleet, 'Ready', 'Deployed');
}
