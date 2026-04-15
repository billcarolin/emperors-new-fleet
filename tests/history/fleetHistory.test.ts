import request from 'supertest';

import { createApp } from '../../src/app';
import { createPersistenceContext } from '../../src/persistence/context';
import { createCommandQueue } from '../../src/queue/commandQueue';
import { recordTransition } from '../../src/commands/recordTransition';
import { createInMemoryFleetHistoryRepository } from '../../src/persistence/fleetHistoryRepository';
import type { Fleet } from '../../src/persistence/fleetRepository';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(fuelTotal = 10_000) {
  const ctx = createPersistenceContext();
  ctx.resourcePools.create({
    id: 'pool-fuel',
    version: 0,
    resourceType: 'FUEL',
    total: fuelTotal,
    reserved: 0,
  });
  const queue = createCommandQueue(ctx);
  queue.start();
  return { app: createApp(ctx, queue), ctx, queue };
}

async function waitForCommand(
  app: ReturnType<typeof createApp>,
  commandId: string,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(app).get(`/commands/${commandId}`);
    if (res.body.status === 'Succeeded' || res.body.status === 'Failed') return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Command ${commandId} did not complete within ${timeoutMs}ms`);
}

const baseFleet: Fleet = {
  id: 'f1',
  version: 0,
  name: 'Iron Nebula',
  shipCount: 8,
  fuelRequired: 200,
  state: 'Preparing',
};

// ---------------------------------------------------------------------------
// Unit: FleetHistoryRepository
// ---------------------------------------------------------------------------

describe('FleetHistoryRepository', () => {
  it('stores and retrieves appended records', () => {
    const repo = createInMemoryFleetHistoryRepository();
    repo.append({
      id: 'r1', timestamp: '2025-06-01T10:00:00.000Z',
      fleetId: 'f1', fleetName: 'Nebula', shipCount: 5, fuelRequired: 100,
      fromState: 'Docked', toState: 'Preparing', resources: [],
    });
    expect(repo.query()).toHaveLength(1);
  });

  it('query with no filter returns all records', () => {
    const repo = createInMemoryFleetHistoryRepository();
    for (let i = 0; i < 3; i++) {
      repo.append({
        id: `r${i}`, timestamp: `2025-06-0${i + 1}T00:00:00.000Z`,
        fleetId: 'f1', fleetName: 'X', shipCount: 1, fuelRequired: 10,
        fromState: 'Docked', toState: 'Preparing', resources: [],
      });
    }
    expect(repo.query()).toHaveLength(3);
  });

  it('filters by from (inclusive)', () => {
    const repo = createInMemoryFleetHistoryRepository();
    repo.append({ id: 'r1', timestamp: '2025-06-01T00:00:00.000Z', fleetId: 'f1', fleetName: 'X', shipCount: 1, fuelRequired: 10, fromState: 'Docked', toState: 'Preparing', resources: [] });
    repo.append({ id: 'r2', timestamp: '2025-06-05T00:00:00.000Z', fleetId: 'f1', fleetName: 'X', shipCount: 1, fuelRequired: 10, fromState: 'Preparing', toState: 'Ready', resources: [] });
    repo.append({ id: 'r3', timestamp: '2025-06-10T00:00:00.000Z', fleetId: 'f1', fleetName: 'X', shipCount: 1, fuelRequired: 10, fromState: 'Ready', toState: 'Deployed', resources: [] });

    const results = repo.query({ from: new Date('2025-06-05T00:00:00.000Z') });
    expect(results.map((r) => r.id)).toEqual(['r2', 'r3']);
  });

  it('filters by to (inclusive)', () => {
    const repo = createInMemoryFleetHistoryRepository();
    repo.append({ id: 'r1', timestamp: '2025-06-01T00:00:00.000Z', fleetId: 'f1', fleetName: 'X', shipCount: 1, fuelRequired: 10, fromState: 'Docked', toState: 'Preparing', resources: [] });
    repo.append({ id: 'r2', timestamp: '2025-06-05T00:00:00.000Z', fleetId: 'f1', fleetName: 'X', shipCount: 1, fuelRequired: 10, fromState: 'Preparing', toState: 'Ready', resources: [] });
    repo.append({ id: 'r3', timestamp: '2025-06-10T00:00:00.000Z', fleetId: 'f1', fleetName: 'X', shipCount: 1, fuelRequired: 10, fromState: 'Ready', toState: 'Deployed', resources: [] });

    const results = repo.query({ to: new Date('2025-06-05T00:00:00.000Z') });
    expect(results.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('filters by from and to together', () => {
    const repo = createInMemoryFleetHistoryRepository();
    repo.append({ id: 'r1', timestamp: '2025-06-01T00:00:00.000Z', fleetId: 'f1', fleetName: 'X', shipCount: 1, fuelRequired: 10, fromState: 'Docked', toState: 'Preparing', resources: [] });
    repo.append({ id: 'r2', timestamp: '2025-06-05T00:00:00.000Z', fleetId: 'f1', fleetName: 'X', shipCount: 1, fuelRequired: 10, fromState: 'Preparing', toState: 'Ready', resources: [] });
    repo.append({ id: 'r3', timestamp: '2025-06-10T00:00:00.000Z', fleetId: 'f1', fleetName: 'X', shipCount: 1, fuelRequired: 10, fromState: 'Ready', toState: 'Deployed', resources: [] });

    const results = repo.query({ from: new Date('2025-06-03T00:00:00.000Z'), to: new Date('2025-06-07T00:00:00.000Z') });
    expect(results.map((r) => r.id)).toEqual(['r2']);
  });

  it('returns empty array when no records match the window', () => {
    const repo = createInMemoryFleetHistoryRepository();
    repo.append({ id: 'r1', timestamp: '2025-06-01T00:00:00.000Z', fleetId: 'f1', fleetName: 'X', shipCount: 1, fuelRequired: 10, fromState: 'Docked', toState: 'Preparing', resources: [] });
    const results = repo.query({ from: new Date('2030-01-01T00:00:00.000Z') });
    expect(results).toHaveLength(0);
  });

  it('clear() removes all records', () => {
    const repo = createInMemoryFleetHistoryRepository();
    repo.append({ id: 'r1', timestamp: '2025-06-01T00:00:00.000Z', fleetId: 'f1', fleetName: 'X', shipCount: 1, fuelRequired: 10, fromState: 'Docked', toState: 'Preparing', resources: [] });
    repo.clear();
    expect(repo.query()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unit: recordTransition helper
// ---------------------------------------------------------------------------

describe('recordTransition', () => {
  function makeCtx(fuelTotal: number) {
    const ctx = createPersistenceContext();
    ctx.resourcePools.create({ id: 'pool-fuel', version: 0, resourceType: 'FUEL', total: fuelTotal, reserved: 0 });
    return ctx;
  }

  it('appends one record per call', () => {
    const ctx = makeCtx(1000);
    recordTransition(ctx, baseFleet, 'Docked', 'Preparing');
    expect(ctx.fleetHistory.query()).toHaveLength(1);
  });

  it('record contains fleet identity fields', () => {
    const ctx = makeCtx(1000);
    recordTransition(ctx, baseFleet, 'Docked', 'Preparing');
    const record = ctx.fleetHistory.query()[0];
    expect(record.fleetId).toBe(baseFleet.id);
    expect(record.fleetName).toBe(baseFleet.name);
    expect(record.shipCount).toBe(baseFleet.shipCount);
    expect(record.fuelRequired).toBe(baseFleet.fuelRequired);
  });

  it('record contains the correct transition states', () => {
    const ctx = makeCtx(1000);
    recordTransition(ctx, baseFleet, 'Preparing', 'Ready');
    const record = ctx.fleetHistory.query()[0];
    expect(record.fromState).toBe('Preparing');
    expect(record.toState).toBe('Ready');
  });

  it('record timestamp is a valid ISO-8601 string', () => {
    const ctx = makeCtx(1000);
    const before = new Date().toISOString();
    recordTransition(ctx, baseFleet, 'Docked', 'Preparing');
    const after = new Date().toISOString();
    const { timestamp } = ctx.fleetHistory.query()[0];
    expect(timestamp >= before && timestamp <= after).toBe(true);
  });

  it('resource snapshot captures FUEL pool availability', () => {
    const ctx = makeCtx(500);
    // Simulate 100 units reserved
    ctx.resourcePools.update('pool-fuel', 0, (p) => ({ ...p, reserved: 100 }));
    recordTransition(ctx, baseFleet, 'Docked', 'Preparing');
    const { resources } = ctx.fleetHistory.query()[0];
    const fuel = resources.find((r) => r.resourceType === 'FUEL')!;
    expect(fuel.total).toBe(500);
    expect(fuel.reserved).toBe(100);
    expect(fuel.available).toBe(400);
  });

  it('resource snapshot excludes pool types that have not been seeded', () => {
    const ctx = makeCtx(1000); // only FUEL seeded
    recordTransition(ctx, baseFleet, 'Docked', 'Preparing');
    const { resources } = ctx.fleetHistory.query()[0];
    expect(resources.every((r) => r.resourceType === 'FUEL')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: handlers write to fleetHistory
// ---------------------------------------------------------------------------

describe('PrepareFleet — writes history records', () => {
  it('writes two records (Docked→Preparing, Preparing→Ready) on success', async () => {
    const { ctx, queue } = buildApp(1000);
    ctx.fleets.create({ id: 'f1', version: 0, name: 'Nova', shipCount: 4, fuelRequired: 100, state: 'Docked' });
    const cmd = { id: 'cmd1', version: 0, type: 'PrepareFleet', status: 'Queued' as const, payload: { fleetId: 'f1' } };
    ctx.commands.create(cmd);

    const { handlePrepareFleet } = await import('../../src/commands/prepareFleetHandler');
    await handlePrepareFleet(cmd, ctx);

    const records = ctx.fleetHistory.query();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ fromState: 'Docked', toState: 'Preparing' });
    expect(records[1]).toMatchObject({ fromState: 'Preparing', toState: 'Ready' });
    queue.stop();
  });

  it('writes Preparing→FailedPreparation when fuel is insufficient', async () => {
    const { ctx, queue } = buildApp(10);
    ctx.fleets.create({ id: 'f1', version: 0, name: 'Nova', shipCount: 4, fuelRequired: 500, state: 'Docked' });
    const cmd = { id: 'cmd1', version: 0, type: 'PrepareFleet', status: 'Queued' as const, payload: { fleetId: 'f1' } };
    ctx.commands.create(cmd);

    const { handlePrepareFleet } = await import('../../src/commands/prepareFleetHandler');
    await handlePrepareFleet(cmd, ctx);

    const records = ctx.fleetHistory.query();
    expect(records[1]).toMatchObject({ fromState: 'Preparing', toState: 'FailedPreparation' });
    queue.stop();
  });

  it('resource snapshot in history reflects post-reservation pool state', async () => {
    const { ctx, queue } = buildApp(1000);
    ctx.fleets.create({ id: 'f1', version: 0, name: 'Nova', shipCount: 4, fuelRequired: 300, state: 'Docked' });
    const cmd = { id: 'cmd1', version: 0, type: 'PrepareFleet', status: 'Queued' as const, payload: { fleetId: 'f1' } };
    ctx.commands.create(cmd);

    const { handlePrepareFleet } = await import('../../src/commands/prepareFleetHandler');
    await handlePrepareFleet(cmd, ctx);

    // The Preparing→Ready record is written after fuel is reserved
    const readyRecord = ctx.fleetHistory.query().find((r) => r.toState === 'Ready')!;
    const fuel = readyRecord.resources.find((r) => r.resourceType === 'FUEL')!;
    expect(fuel.reserved).toBe(300);
    expect(fuel.available).toBe(700);
    queue.stop();
  });
});

// ---------------------------------------------------------------------------
// API: GET /history
// ---------------------------------------------------------------------------

describe('GET /history', () => {
  it('returns an empty array when no transitions have occurred', async () => {
    const { app, queue } = buildApp();
    const res = await request(app).get('/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    queue.stop();
  });

  it('returns all records after PrepareFleet completes', async () => {
    const { app, queue } = buildApp(10_000);

    const fleetRes = await request(app)
      .post('/fleets')
      .send({ name: 'Dark Matter', shipCount: 6, fuelRequired: 200 });

    const cmdRes = await request(app)
      .post('/commands')
      .send({ type: 'PrepareFleet', payload: { fleetId: fleetRes.body.id } });

    await waitForCommand(app, cmdRes.body.id);

    const res = await request(app).get('/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ fromState: 'Docked', toState: 'Preparing', fleetName: 'Dark Matter' });
    expect(res.body[1]).toMatchObject({ fromState: 'Preparing', toState: 'Ready' });
    queue.stop();
  });

  it('records from multiple fleets are all returned', async () => {
    const { app, queue } = buildApp(10_000);

    for (const name of ['Fleet Alpha', 'Fleet Beta']) {
      const fleetRes = await request(app)
        .post('/fleets')
        .send({ name, shipCount: 3, fuelRequired: 100 });
      const cmdRes = await request(app)
        .post('/commands')
        .send({ type: 'PrepareFleet', payload: { fleetId: fleetRes.body.id } });
      await waitForCommand(app, cmdRes.body.id);
    }

    const res = await request(app).get('/history');
    expect(res.body).toHaveLength(4); // 2 transitions × 2 fleets
    const names = new Set(res.body.map((r: { fleetName: string }) => r.fleetName));
    expect(names).toEqual(new Set(['Fleet Alpha', 'Fleet Beta']));
    queue.stop();
  });

  it('filters by from query param', async () => {
    const { app, queue } = buildApp(10_000);

    const fleetRes = await request(app)
      .post('/fleets')
      .send({ name: 'Solar Wing', shipCount: 4, fuelRequired: 150 });
    const cmdRes = await request(app)
      .post('/commands')
      .send({ type: 'PrepareFleet', payload: { fleetId: fleetRes.body.id } });
    await waitForCommand(app, cmdRes.body.id);

    // from = far future → expect empty
    const futureFrom = new Date(Date.now() + 60_000).toISOString();
    const res = await request(app).get(`/history?from=${encodeURIComponent(futureFrom)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);

    queue.stop();
  });

  it('filters by to query param', async () => {
    const { app, queue } = buildApp(10_000);

    const fleetRes = await request(app)
      .post('/fleets')
      .send({ name: 'Solar Wing', shipCount: 4, fuelRequired: 150 });
    const cmdRes = await request(app)
      .post('/commands')
      .send({ type: 'PrepareFleet', payload: { fleetId: fleetRes.body.id } });
    await waitForCommand(app, cmdRes.body.id);

    // to = far past → expect empty
    const pastTo = new Date(Date.now() - 60_000).toISOString();
    const res = await request(app).get(`/history?to=${encodeURIComponent(pastTo)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);

    queue.stop();
  });

  it('returns 400 for an invalid from date', async () => {
    const { app, queue } = buildApp();
    const res = await request(app).get('/history?from=not-a-date');
    expect(res.status).toBe(400);
    queue.stop();
  });

  it('returns 400 for an invalid to date', async () => {
    const { app, queue } = buildApp();
    const res = await request(app).get('/history?to=banana');
    expect(res.status).toBe(400);
    queue.stop();
  });

  it('returns 400 when from is after to', async () => {
    const { app, queue } = buildApp();
    const res = await request(app).get(
      '/history?from=2025-12-31T00:00:00.000Z&to=2025-01-01T00:00:00.000Z',
    );
    expect(res.status).toBe(400);
    queue.stop();
  });

  it('each record contains fleet info, transition states, resources, and timestamp', async () => {
    const { app, queue } = buildApp(5_000);

    const fleetRes = await request(app)
      .post('/fleets')
      .send({ name: 'Void Hammer', shipCount: 10, fuelRequired: 400 });
    const cmdRes = await request(app)
      .post('/commands')
      .send({ type: 'PrepareFleet', payload: { fleetId: fleetRes.body.id } });
    await waitForCommand(app, cmdRes.body.id);

    const res = await request(app).get('/history');
    const record = res.body[0];

    expect(record).toHaveProperty('id');
    expect(record).toHaveProperty('timestamp');
    expect(record).toHaveProperty('fleetId');
    expect(record).toHaveProperty('fleetName', 'Void Hammer');
    expect(record).toHaveProperty('shipCount', 10);
    expect(record).toHaveProperty('fuelRequired', 400);
    expect(record).toHaveProperty('fromState');
    expect(record).toHaveProperty('toState');
    expect(Array.isArray(record.resources)).toBe(true);
    expect(record.resources[0]).toMatchObject({
      resourceType: 'FUEL',
      total: 5_000,
    });
    expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);

    queue.stop();
  });
});
