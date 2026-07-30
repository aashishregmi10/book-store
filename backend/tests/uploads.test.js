'use strict';

// Cloudinary is the one dependency these routes have on the outside world.
// Mocking it lets the whole image lifecycle — upload, replace, delete — be
// exercised for real (multer parsing, validation, and the cleanup bookkeeping
// that decides which public IDs get destroyed) without touching the account.
jest.mock('../src/config/cloudinary', () => {
  let n = 0;
  return {
    uploadBuffer: jest.fn(async () => {
      n += 1;
      return { public_id: `bookstemple/books/img${n}`, secure_url: `https://cdn.test/img${n}.webp`, width: 800, height: 1200 };
    }),
    deleteImage: jest.fn(async () => ({ result: 'ok' })),
    getCloudinary: jest.fn(),
  };
});

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const User = require('../src/models/user.model');
const Book = require('../src/models/book.model');
const Article = require('../src/models/article.model');
const { uploadBuffer, deleteImage } = require('../src/config/cloudinary');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
let adminToken;
let userToken;

// A one-pixel PNG — enough for multer to parse a real multipart body.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082', 'hex');

const img = (id, url) => ({ publicId: id, secureUrl: url, name: '' });
const BOOK = {
  title: 'Cover Test', author: 'A', genre: 'fiction', price: 500, stock: 3,
  description: 'Long enough description for validation.',
};

beforeAll(async () => {
  await db.connect();
  await Promise.all([User.init(), Book.init(), Article.init()]);
});
afterAll(async () => db.closeDatabase());

beforeEach(async () => {
  await User.create({ email: 'admin@test.com', password: 'supersecret', fullName: 'Admin', isAdmin: true });
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'supersecret' })).body.data.accessToken;
  const reg = await request(app).post('/api/auth/register').send({ email: 'user@test.com', password: 'supersecret', fullName: 'User' });
  userToken = reg.body.data.accessToken;
  jest.clearAllMocks();
});
afterEach(async () => db.clearDatabase());

describe('POST /api/upload', () => {
  it('accepts an image and returns the persistable shape', async () => {
    const res = await request(app).post('/api/upload').set(auth(adminToken)).attach('image', PNG, 'cover.png');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      publicId: expect.stringContaining('bookstemple/books/'),
      secureUrl: expect.stringMatching(/^https:\/\//),
      name: 'cover.png',
      width: 800,
      height: 1200,
    });
    expect(res.body.data.url).toBe(res.body.data.secureUrl); // compatibility alias
    expect(uploadBuffer).toHaveBeenCalledTimes(1);
  });

  it('routes avatars to their own folder and defaults everything else to books', async () => {
    await request(app).post('/api/upload?folder=avatars').set(auth(adminToken)).attach('image', PNG, 'me.png');
    expect(uploadBuffer).toHaveBeenLastCalledWith(expect.any(Buffer), { folder: 'bookstemple/avatars' });

    await request(app).post('/api/upload?folder=nonsense').set(auth(adminToken)).attach('image', PNG, 'x.png');
    expect(uploadBuffer).toHaveBeenLastCalledWith(expect.any(Buffer), { folder: 'bookstemple/books' });
  });

  it('rejects a non-image, a missing file, and non-admins', async () => {
    const wrongType = await request(app).post('/api/upload').set(auth(adminToken)).attach('image', Buffer.from('#!/bin/sh'), { filename: 'x.sh', contentType: 'application/x-sh' });
    expect(wrongType.status).toBe(400);
    expect(wrongType.body.errors[0].code).toBe('UPLOAD_REJECTED');

    const none = await request(app).post('/api/upload').set(auth(adminToken));
    expect(none.status).toBe(400);
    expect(none.body.errors[0].code).toBe('REQUIRED');

    expect((await request(app).post('/api/upload').set(auth(userToken)).attach('image', PNG, 'c.png')).status).toBe(403);
    expect((await request(app).post('/api/upload').attach('image', PNG, 'c.png')).status).toBe(401);
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  it('rejects a file over the 5MB cap', async () => {
    const tooBig = Buffer.alloc(5 * 1024 * 1024 + 1024);
    const res = await request(app).post('/api/upload').set(auth(adminToken)).attach('image', tooBig, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too large/i);
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  it('hides the Cloudinary error detail when the upload fails', async () => {
    uploadBuffer.mockRejectedValueOnce(new Error('api_key=SECRET123 rejected'));
    const res = await request(app).post('/api/upload').set(auth(adminToken)).attach('image', PNG, 'c.png');

    expect(res.status).toBe(502);
    expect(res.body.errors[0].code).toBe('UPLOAD_FAILED');
    expect(JSON.stringify(res.body)).not.toContain('SECRET123');
  });
});

describe('Book image lifecycle', () => {
  it('destroys the old cover when it is replaced, and keeps one that is not', async () => {
    const create = await request(app).post('/api/admin/books').set(auth(adminToken)).send({ ...BOOK, coverImage: img('old/cover', 'old.webp') });
    expect(create.status).toBe(201);
    const { slug } = create.body.data;

    // Same cover, unrelated edit — nothing should be destroyed.
    await request(app).put(`/api/admin/books/${slug}`).set(auth(adminToken)).send({ ...BOOK, coverImage: img('old/cover', 'old.webp'), price: 600 });
    expect(deleteImage).not.toHaveBeenCalled();

    await request(app).put(`/api/admin/books/${slug}`).set(auth(adminToken)).send({ ...BOOK, coverImage: img('new/cover', 'new.webp') });
    expect(deleteImage).toHaveBeenCalledWith('old/cover');
  });

  it('destroys only the gallery images that were removed', async () => {
    const gallery = [img('g/1', '1.webp'), img('g/2', '2.webp'), img('g/3', '3.webp')];
    const create = await request(app).post('/api/admin/books').set(auth(adminToken)).send({ ...BOOK, coverImage: img('c/1', 'c.webp'), images: gallery });
    const { slug } = create.body.data;

    await request(app).put(`/api/admin/books/${slug}`).set(auth(adminToken)).send({ ...BOOK, coverImage: img('c/1', 'c.webp'), images: [gallery[0], gallery[2]] });

    const destroyed = deleteImage.mock.calls.map(([id]) => id);
    expect(destroyed).toContain('g/2');
    expect(destroyed).not.toContain('g/1');
    expect(destroyed).not.toContain('g/3');
    expect(destroyed).not.toContain('c/1');
  });

  it('destroys the cover and the whole gallery when the book is deleted', async () => {
    const create = await request(app).post('/api/admin/books').set(auth(adminToken)).send({
      ...BOOK, coverImage: img('c/1', 'c.webp'), images: [img('g/1', '1.webp'), img('g/2', '2.webp')],
    });
    const id = create.body.data._id;

    const del = await request(app).delete(`/api/admin/books/${id}`).set(auth(adminToken));
    expect(del.status).toBe(200);

    const destroyed = deleteImage.mock.calls.map(([i]) => i);
    expect(destroyed).toEqual(expect.arrayContaining(['c/1', 'g/1', 'g/2']));
    expect(await Book.countDocuments()).toBe(0);
  });

  it('still saves the book when Cloudinary cleanup fails', async () => {
    const create = await request(app).post('/api/admin/books').set(auth(adminToken)).send({ ...BOOK, coverImage: img('old/cover', 'old.webp') });
    const { slug } = create.body.data;

    deleteImage.mockRejectedValueOnce(new Error('cloudinary unreachable'));
    const res = await request(app).put(`/api/admin/books/${slug}`).set(auth(adminToken)).send({ ...BOOK, coverImage: img('new/cover', 'new.webp') });

    expect(res.status).toBe(200);
    expect((await Book.findOne({ slug })).coverImage.publicId).toBe('new/cover');
  });
});

describe('Article image lifecycle', () => {
  it('destroys the previous cover on replace and on delete', async () => {
    const create = await request(app).post('/api/admin/articles').set(auth(adminToken)).send({
      title: 'Cover Article', body: 'Body long enough to pass validation.', coverImage: img('a/old', 'old.webp'),
    });
    expect(create.status).toBe(201);
    const { slug, _id } = create.body.data;

    await request(app).put(`/api/admin/articles/${slug}`).set(auth(adminToken)).send({ coverImage: img('a/new', 'new.webp') });
    expect(deleteImage).toHaveBeenCalledWith('a/old');

    jest.clearAllMocks();
    await request(app).delete(`/api/admin/articles/${_id}`).set(auth(adminToken));
    expect(deleteImage).toHaveBeenCalledWith('a/new');
  });
});
