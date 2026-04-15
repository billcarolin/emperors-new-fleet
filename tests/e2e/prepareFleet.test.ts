import request from 'supertest';

import { createApp } from '../../src/app';
import { createPersistenceContext } from '../../src/persistence/context';
import { createCommandQueue } from '../../src/queue/commandQueue';

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
  const app = createApp(ctx, queue);
  return { app, ctx, queue };
}

/** Poll GET /commands/:id until status is Completed or Failed (or timeout). */
async function waitForCommand(
  app: Express.Application,
  commandId: string,
  timeoutMs = 2000,
): Promise<{ status: string; failureReason?: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(app).get(`/commands/${commandId}`);
    if (res.body.status === 'Completed' || res.body.status === 'Failed') {
      return res.body;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Command ${commandId} did not complete within ${timeoutMs}ms`);
}

// Express type for waitForCommand parameter
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Express = { Application: any };

describe('E2E: PrepareFleet flow', () => {
  it('creates a fleet, submits PrepareFleet, fleet becomes Ready', async () => {
    const { app, queue } = buildApp();

    // 1. Create fleet
    const fleetRes = await request(app)
      .post('/fleets')
      .send({ name: 'Iron Nebula', shipCount: 10, fuelRequired: 200 });

    expect(fleetRes.status).toBe(201);
    const fleetId = fleetRes.body.id;
    expect(fleetRes.body.state).toBe('Docked');

    // 2. Submit PrepareFleet command
    const cmdRes = await request(app)
      .post('/commands')
      .send({ type: 'PrepareFleet', payload: { fleetId } });

    expect(cmdRes.status).toBe(201);
    expect(cmdRes.body.status).toBe('Queued');
    const commandId = cmdRes.body.id;

    // 3. Wait for command to complete
    const done = await waitForCommand(app, commandId);
    expect(done.status).toBe('Completed');

    // 4. Fleet should now be Ready
    const fleetAfter = await request(app).get(`/fleets/${fleetId}`);
    expect(fleetAfter.body.state).toBe('Ready');

    queue.stop();
  });

  it('fleet becomes FailedPreparation when pool has insufficient fuel', async () => {
    const { app, queue } = buildApp(50); // Only 50 units

    const fleetRes = await request(app)
      .post('/fleets')
      .send({ name: 'Void Runner', shipCount: 5, fuelRequired: 200 });

    const fleetId = fleetRes.body.id;

    const cmdRes = await request(app)
      .post('/commands')
      .send({ type: 'PrepareFleet', payload: { fleetId } });

    const done = await waitForCommand(app, cmdRes.body.id);
    expect(done.status).toBe('Failed');
    expect(done.failureReason).toMatch(/Insufficient FUEL/);

    const fleetAfter = await request(app).get(`/fleets/${fleetId}`);
    expect(fleetAfter.body.state).toBe('FailedPreparation');

    queue.stop();
  });

  it('returns 404 for unknown fleet', async () => {
    const { app, queue } = buildApp();
    const res = await request(app).get('/fleets/nonexistent');
    expect(res.status).toBe(404);
    queue.stop();
  });

  it('returns 404 for unknown command', async () => {
    const { app, queue } = buildApp();
    const res = await request(app).get('/commands/nonexistent');
    expect(res.status).toBe(404);
    queue.stop();
  });

  it('PATCH /fleets/:id updates fleet name', async () => {
    const { app, queue } = buildApp();

    const fleetRes = await request(app)
      .post('/fleets')
      .send({ name: 'Old Name', shipCount: 3, fuelRequired: 50 });

    const fleetId = fleetRes.body.id;

    const patchRes = await request(app)
      .patch(`/fleets/${fleetId}`)
      .send({ name: 'New Name' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.name).toBe('New Name');
    expect(patchRes.body.shipCount).toBe(3);

    queue.stop();
  });
});
