import type { PersistenceContext } from '../persistence/context';
import type { CommandQueue } from './types';
import { COMMAND_HANDLERS } from '../commands/dispatch';

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
        drain().catch(() => {
          draining = false;
        });
      });
    }
  }

  async function processCommand(commandId: string): Promise<void> {
    const command = ctx.commands.get(commandId);
    if (!command) return;

    // Mark Processing
    ctx.commands.update(command.id, command.version, (c) => ({ ...c, status: 'Processing' }));

    const handler = COMMAND_HANDLERS[command.type];

    if (!handler) {
      const current = ctx.commands.getOrThrow(commandId);
      ctx.commands.update(commandId, current.version, (c) => ({ ...c, status: 'Failed' }));
      return;
    }

    try {
      // Re-fetch command with updated version after the Processing update
      const current = ctx.commands.getOrThrow(commandId);
      await handler(current, ctx);
      const done = ctx.commands.getOrThrow(commandId);
      ctx.commands.update(commandId, done.version, (c) => ({ ...c, status: 'Succeeded' }));
    } catch {
      const done = ctx.commands.getOrThrow(commandId);
      ctx.commands.update(commandId, done.version, (c) => ({ ...c, status: 'Failed' }));
    }
  }

  return {
    enqueue(commandId: string): void {
      pending.push(commandId);
      scheduleIfIdle();
    },

    start(): void {
      started = true;
      if (pending.length > 0) scheduleIfIdle();
    },

    stop(): void {
      started = false;
    },
  };
}
