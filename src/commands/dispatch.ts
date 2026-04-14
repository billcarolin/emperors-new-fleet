import type { Command } from '../persistence/commandRepository';
import type { PersistenceContext } from '../persistence/context';
import { handlePrepareFleet } from './prepareFleetHandler';
import { handleDeployFleet } from './deployFleetHandler';

type CommandHandler = (command: Command, ctx: PersistenceContext) => Promise<void>;

export const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  PrepareFleet: handlePrepareFleet,
  DeployFleet: handleDeployFleet,
};
