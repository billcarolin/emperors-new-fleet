import { createApp } from './app';
import { createPersistenceContext } from './persistence/context';
import { createCommandQueue } from './queue/commandQueue';
import { logger } from './logger';

const log = logger.child({ module: 'startup' });

const ctx = createPersistenceContext();

// Seed the shared fuel pool (10 000 units available at startup)
const FUEL_POOL_TOTAL = 10_000;
ctx.resourcePools.create({
  id: 'pool-fuel',
  version: 0,
  resourceType: 'FUEL',
  total: FUEL_POOL_TOTAL,
  reserved: 0,
});
log.info({ resourceType: 'FUEL', total: FUEL_POOL_TOTAL }, 'resource pool seeded');

const queue = createCommandQueue(ctx);
queue.start();

const app = createApp(ctx, queue);

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  log.info({ port }, 'Galactic Fleet Command API listening');
});
