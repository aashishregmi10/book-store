'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const Book = require('../src/models/book.model');

const book = (over) => ({
  author: 'Some Author',
  stock: 10,
  coverImage: { publicId: 'seed/c.jpg', secureUrl: 'https://res.cloudinary.com/x/c.jpg', name: '' },
  description: 'A sufficiently long description for validation purposes.',
  ...over,
});

beforeAll(async () => db.connect());
afterAll(async () => db.closeDatabase());
afterEach(async () => db.clearDatabase());

describe('GET /api/feed/products.xml (Google Merchant feed)', () => {
  it('returns an RSS product feed with g: fields for active books only', async () => {
    await Book.create([
      book({ slug: 'atomic-habits', title: 'Atomic Habits', genre: 'self-help', price: 899, isbn: '9781847941831' }),
      book({ slug: 'hidden-draft', title: 'Hidden Draft', genre: 'fiction', price: 500, isActive: false }),
    ]);

    const res = await request(app).get('/api/feed/products.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    // Active book present with price + gtin; inactive book excluded.
    expect(res.text).toContain('Atomic Habits');
    expect(res.text).toContain('899.00 NPR');
    expect(res.text).toContain('<g:gtin>9781847941831</g:gtin>');
    expect(res.text).toContain('http://localhost:3000/books/atomic-habits');
    expect(res.text).not.toContain('Hidden Draft');
  });
});
