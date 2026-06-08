'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const Article = require('../src/models/article.model');

beforeAll(async () => db.connect());
afterAll(async () => db.closeDatabase());
afterEach(async () => db.clearDatabase());

describe('GET /api/articles', () => {
  beforeEach(async () => {
    await Article.create([
      { slug: 'best-nepali-novels-2026', title: 'Best Nepali novels 2026', body: 'A long enough body for the article.', excerpt: 'Top picks.', status: 'published', publishedAt: new Date(), readingTime: 3 },
      { slug: 'secret-draft', title: 'Secret draft', body: 'Still being written and not ready yet.', status: 'draft' },
    ]);
  });

  it('lists only published articles', async () => {
    const res = await request(app).get('/api/articles');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].slug).toBe('best-nepali-novels-2026');
  });

  it('returns a published article by slug', async () => {
    const res = await request(app).get('/api/articles/best-nepali-novels-2026');
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Best Nepali novels 2026');
    expect(res.body.data.body).toContain('long enough');
  });

  it('404s for a draft (unpublished) article', async () => {
    const res = await request(app).get('/api/articles/secret-draft');
    expect(res.status).toBe(404);
  });
});
