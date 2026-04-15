import { createPersistenceContext } from '../../src/persistence/context';
import { handlePrepareFleet, PrepareFleetFailureError } from '../../src/commands/prepareFleetHandler';

function makeContext(fuelTotal: number) {
  const ctx = createPersistenceContext();
  ctx.resourcePools.create({
    id: 'pool-fuel',
    version: 0,
    resourceType: 'FUEL',
    total: fuelTotal,
    reserved: 0,
  });
  return ctx;
}

function makeFleet(ctx: ReturnType<typeof makeContext>, id: string, fuelRequired: number) {
  ctx.fleets.create({
    id,
    version: 0,
    name: `Fleet ${id}`,
    shipCount: 5,
    fuelRequired,
    state: 'Docked',
  });
  const prepareCmd = { id: `cmd-${id}`, version: 0, type: 'PrepareFleet', status: 'Queued' as const, payload: { fleetId: id } };
  ctx.commands.create(prepareCmd);
  return prepareCmd;
}

describe('handlePrepareFleet', () => {
  it('transitions fleet Docked → Ready when fuel is available', async () => {
    const ctx = makeContext(1000);
    const cmd = makeFleet(ctx, 'f1', 200);

    await handlePrepareFleet(cmd, ctx);

    expect(ctx.fleets.getOrThrow('f1').state).toBe('Ready');
  });

  it('transitions fleet Docked → FailedPreparation and throws when fuel is insufficient', async () => {
    const ctx = makeContext(100);
    const cmd = makeFleet(ctx, 'f1', 200);

    await expect(handlePrepareFleet(cmd, ctx)).rejects.toThrow(PrepareFleetFailureError);
    expect(ctx.fleets.getOrThrow('f1').state).toBe('FailedPreparation');
  });

  it('failure message includes required and available fuel amounts', async () => {
    const ctx = makeContext(100);
    const cmd = makeFleet(ctx, 'f1', 200);

    await expect(handlePrepareFleet(cmd, ctx)).rejects.toThrow(/required 200.*100 available/i);
  });

  it('transitions fleet Docked → FailedPreparation and throws when no fuel pool exists', async () => {
    const ctx = createPersistenceContext(); // no pool
    ctx.fleets.create({ id: 'f1', version: 0, name: 'F1', shipCount: 5, fuelRequired: 100, state: 'Docked' });
    const cmd = { id: 'cmd1', version: 0, type: 'PrepareFleet', status: 'Queued' as const, payload: { fleetId: 'f1' } };
    ctx.commands.create(cmd);

    await expect(handlePrepareFleet(cmd, ctx)).rejects.toThrow(PrepareFleetFailureError);
    expect(ctx.fleets.getOrThrow('f1').state).toBe('FailedPreparation');
  });

  it('failure message mentions pool not configured when pool is missing', async () => {
    const ctx = createPersistenceContext();
    ctx.fleets.create({ id: 'f1', version: 0, name: 'F1', shipCount: 5, fuelRequired: 100, state: 'Docked' });
    const cmd = { id: 'cmd1', version: 0, type: 'PrepareFleet', status: 'Queued' as const, payload: { fleetId: 'f1' } };
    ctx.commands.create(cmd);

    await expect(handlePrepareFleet(cmd, ctx)).rejects.toThrow(/not configured/i);
  });

  it('throws on an invalid initial state (not Docked)', async () => {
    const ctx = makeContext(1000);
    ctx.fleets.create({ id: 'f1', version: 0, name: 'F1', shipCount: 5, fuelRequired: 100, state: 'Ready' });
    const cmd = { id: 'cmd1', version: 0, type: 'PrepareFleet', status: 'Queued' as const, payload: { fleetId: 'f1' } };
    ctx.commands.create(cmd);

    await expect(handlePrepareFleet(cmd, ctx)).rejects.toThrow();
  });

  describe('concurrent resource reservation', () => {
    it('does not over-allocate fuel when two commands compete for a tight pool', async () => {
      // Pool has 1000 units; each fleet needs 600 — only one can succeed.
      const ctx = makeContext(1000);
      const cmd1 = makeFleet(ctx, 'f1', 600);
      const cmd2 = makeFleet(ctx, 'f2', 600);

      // allSettled so the one that fails (throws) does not abort the other.
      await Promise.allSettled([
        handlePrepareFleet(cmd1, ctx),
        handlePrepareFleet(cmd2, ctx),
      ]);

      const pool = ctx.resourcePools.getByType('FUEL')!;
      expect(pool.reserved).toBeLessThanOrEqual(pool.total);

      const states = [
        ctx.fleets.getOrThrow('f1').state,
        ctx.fleets.getOrThrow('f2').state,
      ];
      expect(states).toContain('Ready');
      expect(states).toContain('FailedPreparation');
    });

    it('allocates fuel to all fleets when pool is sufficient for all', async () => {
      const ctx = makeContext(1000);
      const cmd1 = makeFleet(ctx, 'f1', 200);
      const cmd2 = makeFleet(ctx, 'f2', 200);
      const cmd3 = makeFleet(ctx, 'f3', 200);

      await Promise.all([
        handlePrepareFleet(cmd1, ctx),
        handlePrepareFleet(cmd2, ctx),
        handlePrepareFleet(cmd3, ctx),
      ]);

      const pool = ctx.resourcePools.getByType('FUEL')!;
      expect(pool.reserved).toBe(600);
      expect(ctx.fleets.getOrThrow('f1').state).toBe('Ready');
      expect(ctx.fleets.getOrThrow('f2').state).toBe('Ready');
      expect(ctx.fleets.getOrThrow('f3').state).toBe('Ready');
    });
  });
});
