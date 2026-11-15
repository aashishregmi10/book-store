'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const Book = require('../src/models/book.model');
const { buildItem } = require('../src/routes/feed.route');

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
      book({ slug: 'sold-out', title: 'Sold Out', genre: 'fiction', price: 500, stock: 0 }),
    ]);

    const res = await request(app).get('/api/feed/products.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(res.text).toContain('<title>Books Temple Nepal</title>');
    // Active book present with price + gtin; inactive book excluded.
    expect(res.text).toContain('Atomic Habits');
    expect(res.text).toContain('899.00 NPR');
    expect(res.text).toContain('<g:availability>in_stock</g:availability>');
    expect(res.text).toContain('<g:condition>new</g:condition>');
    expect(res.text).toContain('<g:gtin>9781847941831</g:gtin>');
    expect(res.text).toContain('http://localhost:3000/books/atomic-habits');
    expect(res.text).not.toContain('Hidden Draft');
    expect(res.text).not.toContain('Sold Out');
  });
});

describe('Merchant feed item formatting', () => {
  const feedBook = (overrides = {}) => ({
    _id: 'book-123',
    slug: 'nepali-book',
    title: 'नेपाली & English',
    author: 'A & B',
    description: '<p>नेपाली &amp; पुस्तक</p><script>private</script>',
    price: 389,
    comparePrice: 432,
    stockStatus: 'low-stock',
    coverImage: { secureUrl: 'http://cdn.example.com/cover.jpg' },
    isbn: '978-1-4028-9462-6',
    specifications: { publisher: 'Publisher & Co.' },
    ...overrides,
  });

  it('escapes Unicode text, strips HTML, uses sale pricing, and requires an HTTPS cover', () => {
    const item = buildItem(feedBook());

    expect(item).toContain('<g:title>नेपाली &amp; English</g:title>');
    expect(item).toContain('<g:description>नेपाली &amp; पुस्तक</g:description>');
    expect(item).not.toContain('private');
    expect(item).toContain('<g:image_link>https://cdn.example.com/cover.jpg</g:image_link>');
    expect(item).toContain('<g:price>432.00 NPR</g:price>');
    expect(item).toContain('<g:sale_price>389.00 NPR</g:sale_price>');
    expect(item).toContain('<g:brand>Publisher &amp; Co.</g:brand>');
    expect(item).toContain('<g:gtin>9781402894626</g:gtin>');
  });

  it('uses the author as brand, omits sale price, and rejects invalid ISBN values', () => {
    const item = buildItem(
      feedBook({
        comparePrice: undefined,
        isbn: 'not-an-isbn',
        specifications: { publisher: '' },
      }),
    );

    expect(item).toContain('<g:price>389.00 NPR</g:price>');
    expect(item).not.toContain('<g:sale_price>');
    expect(item).toContain('<g:brand>A &amp; B</g:brand>');
    expect(item).toContain('<g:identifier_exists>no</g:identifier_exists>');
    expect(item).not.toContain('<g:gtin>');
  });

  it.each([
    { title: ' ' },
    { price: 0 },
    { coverImage: { secureUrl: 'data:image/png;base64,abc' } },
    { stockStatus: 'out-of-stock' },
  ])('omits a non-qualifying book', (overrides) => {
    expect(buildItem(feedBook(overrides))).toBe('');
  });

  it('limits title and description without splitting Unicode characters', () => {
    const item = buildItem(
      feedBook({
        title: `${'क'.repeat(150)}📚`,
        description: 'क'.repeat(5001),
        comparePrice: undefined,
      }),
    );

    expect(item).toContain(`<g:title>${'क'.repeat(150)}</g:title>`);
    expect(item).not.toContain('📚');
    expect(item).toContain(`<g:description>${'क'.repeat(5000)}</g:description>`);
  });
});
