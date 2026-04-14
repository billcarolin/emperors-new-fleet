import { createApp } from './app';
import { createPersistenceContext } from './persistence/context';
import { createCommandQueue } from './queue/commandQueue';

const ctx = createPersistenceContext();

// Seed the shared fuel pool (10 000 units available at startup)
ctx.resourcePools.create({
  id: 'pool-fuel',
  version: 0,
  resourceType: 'FUEL',
  total: 10_000,
  reserved: 0,
});

const queue = createCommandQueue(ctx);
queue.start();

const app = createApp(ctx, queue);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Galactic Fleet Command API listening on port ${port}`);
});
