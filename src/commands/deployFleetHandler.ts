import type { Command } from '../persistence/commandRepository';
import type { PersistenceContext } from '../persistence/context';
import { transition } from '../domain/fleetStateMachine';
import { recordTransition } from './recordTransition';
import { logger } from '../logger';

/**
 * Handles DeployFleetCommand:
 *   Ready → Deployed
 */
export async function handleDeployFleet(command: Command, ctx: PersistenceContext): Promise<void> {
  const { fleetId } = command.payload as { fleetId: string };
  const log = logger.child({ commandId: command.id, fleetId, handler: 'DeployFleet' });

  const fleet = ctx.fleets.getOrThrow(fleetId);
  log.info({ currentState: fleet.state }, 'deploying fleet');

  ctx.fleets.update(fleet.id, fleet.version, (f) => ({
    ...f,
    state: transition(f.state, 'Deployed'),
  }));
  recordTransition(ctx, fleet, 'Ready', 'Deployed');

  log.info('fleet deployed successfully');
}
