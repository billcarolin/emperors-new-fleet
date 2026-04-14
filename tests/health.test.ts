import request from 'supertest';

import { createApp } from '../src/app';
import { createPersistenceContext } from '../src/persistence/context';
import type { CommandQueue } from '../src/queue/types';

const noopQueue: CommandQueue = { enqueue: () => {}, start: () => {}, stop: () => {} };

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = createApp(createPersistenceContext(), noopQueue);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
