'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const User = require('../src/models/user.model');
const emailService = require('../src/utils/emailService');

beforeAll(async () => db.connect());
afterEach(async () => {
  await db.clearDatabase();
  jest.restoreAllMocks();
});
afterAll(async () => db.closeDatabase());

const REG = { email: 'reader@test.com', password: 'supersecret', fullName: 'Anita Reader' };

describe('POST /api/auth/register', () => {
  it('creates an account with 65 signup points and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send(REG);
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user).toMatchObject({ email: 'reader@test.com', points: 65, tier: 'Bronze' });
    expect(res.headers['set-cookie'][0]).toMatch(/refreshToken=/);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
  });

  it('awards referral bonuses to both parties', async () => {
    const ref = await User.create({ email: 'ref@test.com', password: 'supersecret', fullName: 'Ref Errer' });
    const res = await request(app).post('/api/auth/register').send({ ...REG, referralCode: ref.referralCode });
    expect(res.body.data.user.points).toBe(115); // 65 + 50
    const updatedRef = await User.findById(ref._id);
    expect(updatedRef.points).toBe(165); // 65 + 100
    expect(updatedRef.referralCount).toBe(1);
  });

  it('rejects a duplicate email (409) and a short password (400)', async () => {
    await request(app).post('/api/auth/register').send(REG);
    const dup = await request(app).post('/api/auth/register').send(REG);
    expect(dup.status).toBe(409);
    const short = await request(app).post('/api/auth/register').send({ ...REG, email: 'x@test.com', password: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.errors[0].field).toBe('password');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => { await request(app).post('/api/auth/register').send(REG); });

  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: REG.email, password: REG.password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('rejects wrong password (401)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: REG.email, password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  it('blocks a banned account (403 BANNED)', async () => {
    await User.updateOne({ email: REG.email }, { isBanned: true, banReason: 'spam' });
    const res = await request(app).post('/api/auth/login').send({ email: REG.email, password: REG.password });
    expect(res.status).toBe(403);
    expect(res.body.errors[0].code).toBe('BANNED');
  });
});

describe('GET /api/auth/me', () => {
  it('requires a token (401) and returns the user with one', async () => {
    const reg = await request(app).post('/api/auth/register').send(REG);
    const token = reg.body.data.accessToken;

    const noTok = await request(app).get('/api/auth/me');
    expect(noTok.status).toBe(401);

    const withTok = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(withTok.status).toBe(200);
    expect(withTok.body.data.email).toBe(REG.email);
    expect(withTok.body.data.password).toBeUndefined();
  });

  it('rejects a malformed token with 403 INVALID_TOKEN', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(403);
    expect(res.body.errors[0].code).toBe('INVALID_TOKEN');
  });
});

describe('Refresh token rotation + reuse detection', () => {
  // Pull the `refreshToken=...` pair out of a Set-Cookie header for replay.
  const refreshCookie = (res) => res.headers['set-cookie'][0].split(';')[0];

  it('rotates the refresh token and issues a new access token', async () => {
    const reg = await request(app).post('/api/auth/register').send(REG);
    const cookieA = refreshCookie(reg);

    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookieA);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toBeTruthy();

    const cookieB = refreshCookie(refreshed);
    expect(cookieB).not.toBe(cookieA); // the token actually rotated
  });

  it('revokes the whole family when an already-rotated token is replayed', async () => {
    const reg = await request(app).post('/api/auth/register').send(REG);
    const cookieA = refreshCookie(reg);

    // First refresh consumes A and hands back B.
    const first = await request(app).post('/api/auth/refresh').set('Cookie', cookieA);
    expect(first.status).toBe(200);
    const cookieB = refreshCookie(first);

    // Replaying the superseded A is treated as theft → 401 TOKEN_REUSE.
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', cookieA);
    expect(replay.status).toBe(401);
    expect(replay.body.errors[0].code).toBe('TOKEN_REUSE');

    // …and the family is gone, so the "good" token B no longer works either.
    const afterRevoke = await request(app).post('/api/auth/refresh').set('Cookie', cookieB);
    expect(afterRevoke.status).toBe(401);
  });

  it('logout revokes the session server-side so the refresh token is dead', async () => {
    const reg = await request(app).post('/api/auth/register').send(REG);
    const cookieA = refreshCookie(reg);

    const out = await request(app).post('/api/auth/logout').set('Cookie', cookieA);
    expect(out.status).toBe(200);

    const afterLogout = await request(app).post('/api/auth/refresh').set('Cookie', cookieA);
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.errors[0].code).toBe('SESSION_EXPIRED');
  });

  it('rejects a request with no refresh cookie (401 NO_TOKEN)', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.errors[0].code).toBe('NO_TOKEN');
  });
});

describe('Password reset flow', () => {
  it('forgot → reset → login with new password', async () => {
    await request(app).post('/api/auth/register').send(REG);

    // Capture the raw token the service would have emailed.
    let rawToken;
    jest.spyOn(emailService, 'sendPasswordReset').mockImplementation((_user, raw) => {
      rawToken = raw;
      return Promise.resolve(true);
    });

    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: REG.email });
    expect(forgot.status).toBe(200); // no enumeration
    expect(rawToken).toBeTruthy();

    const verify = await request(app).get('/api/auth/verify-reset-token').query({ token: rawToken });
    expect(verify.status).toBe(200);

    const reset = await request(app).post('/api/auth/reset-password').send({ token: rawToken, password: 'brandnewpass' });
    expect(reset.status).toBe(200);

    const relogin = await request(app).post('/api/auth/login').send({ email: REG.email, password: 'brandnewpass' });
    expect(relogin.status).toBe(200);
  });

  it('returns 200 for an unknown email (no enumeration) without emailing', async () => {
    const spy = jest.spyOn(emailService, 'sendPasswordReset');
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@test.com' });
    expect(res.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
  });
});
