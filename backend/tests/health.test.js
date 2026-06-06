'use strict';

const request = require('supertest');
const app = require('../src/app');

describe('GET /api/health', () => {
  it('returns 200 with the success envelope and no DB dependency', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Healthy');
    expect(res.body.data).toMatchObject({ status: 'ok' });
    expect(typeof res.body.data.uptime).toBe('number');
  });

  it('returns the error envelope on an unknown route', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('message');
    expect(res.body.errors[0]).toMatchObject({ code: 'NOT_FOUND' });
  });
});
