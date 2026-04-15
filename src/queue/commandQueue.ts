import type { PersistenceContext } from '../persistence/context';
import type { CommandQueue } from './types';
import { COMMAND_HANDLERS } from '../commands/dispatch';
import { logger } from '../logger';

const log = logger.child({ module: 'commandQueue' });

/**
 * In-memory command queue with a single background worker.
 *
 * Commands are processed one at a time in FIFO order. Enqueueing a command
 * while the worker is idle kicks off draining immediately via setImmediate,
 * keeping the hot path synchronous and non-blocking.
 */
export function createCommandQueue(ctx: PersistenceContext): CommandQueue {
  const pending: string[] = [];
  let draining = false;
  let started = false;

  async function drain(): Promise<void> {
    while (started && pending.length > 0) {
      const commandId = pending.shift()!;
      await processCommand(commandId);
    }
    draining = false;
  }

  function scheduleIfIdle(): void {
    if (!draining && started) {
      draining = true;
      setImmediate(() => {
        drain().catch((err) => {
          log.error({ err }, 'unexpected error in command queue drain loop');
          draining = false;
        });
      });
    }
  }

  async function processCommand(commandId: string): Promise<void> {
    const command = ctx.commands.get(commandId);
    if (!command) {
      log.error({ commandId }, 'command not found in repository — skipping');
      return;
    }

    const cmdLog = log.child({ commandId, commandType: command.type });

    // Mark Processing
    ctx.commands.update(command.id, command.version, (c) => ({ ...c, status: 'Processing' }));
    cmdLog.info('command processing started');

    const handler = COMMAND_HANDLERS[command.type];

    if (!handler) {
      const failureReason = `No handler registered for command type: ${command.type}`;
      cmdLog.error({ failureReason }, 'no handler registered for command type — marking Failed');
      const current = ctx.commands.getOrThrow(commandId);
      ctx.commands.update(commandId, current.version, (c) => ({ ...c, status: 'Failed', failureReason }));
      return;
    }

    try {
      // Re-fetch command with updated version after the Processing update
      const current = ctx.commands.getOrThrow(commandId);
      await handler(current, ctx);
      const done = ctx.commands.getOrThrow(commandId);
      ctx.commands.update(commandId, done.version, (c) => ({ ...c, status: 'Completed' }));
      cmdLog.info('command execution completed');
    } catch (err) {
      const failureReason = err instanceof Error ? err.message : 'An unexpected error occurred';
      cmdLog.error({ err, failureReason }, 'command handler threw an error — marking Failed');
      const done = ctx.commands.getOrThrow(commandId);
      ctx.commands.update(commandId, done.version, (c) => ({ ...c, status: 'Failed', failureReason }));
    }
  }

  return {
    enqueue(commandId: string): void {
      log.debug({ commandId }, 'command enqueued');
      pending.push(commandId);
      scheduleIfIdle();
    },

    start(): void {
      started = true;
      log.info('command queue worker started');
      if (pending.length > 0) scheduleIfIdle();
    },

    stop(): void {
      started = false;
      log.info('command queue worker stopped');
    },
  };
}
