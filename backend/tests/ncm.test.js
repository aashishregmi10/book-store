'use strict';

const request = require('supertest');
const db = require('./db');
const app = require('../src/app');
const User = require('../src/models/user.model');
const Book = require('../src/models/book.model');
const Order = require('../src/models/order.model');
const Setting = require('../src/models/setting.model');
const ncmClient = require('../src/services/ncm/client');
const { suggestBranches } = require('../src/services/ncm/branchMatch');
const { applyNcmUpdate } = require('../src/services/ncm/status');
const { syncOpenParcels } = require('../src/services/ncm/sync');
const { _ncmPhone: ncmPhone } = require('../src/routes/ncmAdmin.route');

const BRANCHES = [
  { pk: 1, name: 'TINKUNE', district_name: 'KATHMANDU', province_name: 'Bagmati', areas_covered: 'BANESHWOR, NEW BANESHWOR, KOTESHWOR', surcharge: '0.00' },
  { pk: 2, name: 'POKHARA', district_name: 'KASKI', province_name: 'Gandaki', areas_covered: 'LAKESIDE, MAHENDRAPOOL, BINDABASINI', surcharge: '0.00' },
  { pk: 6, name: 'SANKHU', district_name: 'KATHMANDU', province_name: 'Bagmati', areas_covered: 'SANKHU, GAGALPHEDI', surcharge: '0.00' },
];

let fetchCalls;
let createResponse;
/** Fake NCM: routes by path; `createResponse` controls the booking outcome. */
function fakeNcm() {
  fetchCalls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    const u = new URL(String(url));
    fetchCalls.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), method: opts.method, body: opts.body ? JSON.parse(opts.body) : undefined, auth: opts.headers && opts.headers.Authorization });
    const json = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
    if (u.pathname === '/api/v2/branches') return json(200, BRANCHES);
    if (u.pathname === '/api/v1/shipping-rate') return json(200, { charge: u.searchParams.get('destination') === 'POKHARA' ? '120.00' : '70.00' });
    if (u.pathname === '/api/v1/order/create') return createResponse();
    if (u.pathname === '/api/v1/order/status') return json(200, statusHistory);
    if (u.pathname === '/api/v1/order') return json(200, { orderid: Number(u.searchParams.get('id')), cod_charge: '1920.00', delivery_charge: '120.00', last_delivery_status: 'Drop off Order Created', payment_status: 'Pending', vendor_return: false, trackid: 'NCM-TRK-1', destination_branch_phone: '9800000002' });
    if (u.pathname === '/api/v1/orders/statuses') return json(200, { result: bulkResult, errors: [] });
    return json(404, { detail: 'Not found.' });
  });
}
let statusHistory = [];
let bulkResult = {};

let adminToken;
let order;
const auth = () => ({ Authorization: `Bearer ${adminToken}` });

beforeAll(async () => {
  await db.connect();
  await Promise.all([User.init(), Book.init(), Order.init(), Setting.init()]);
});
afterAll(async () => db.closeDatabase());

beforeEach(async () => {
  process.env.NCM_API_TOKEN = 'test-token';
  process.env.NCM_BASE_URL = 'https://ncm.test';
  process.env.NCM_WEBHOOK_SECRET = 'hook-secret';
  ncmClient._resetCache();
  createResponse = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ Message: 'Order Successfully Created', orderid: 747 }) });
  statusHistory = [];
  bulkResult = {};
  fakeNcm();

  await User.create({ email: 'admin@test.com', password: 'supersecret', fullName: 'Admin', isAdmin: true });
  adminToken = (await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'supersecret' })).body.data.accessToken;
  const book = await Book.create({ slug: 'b', title: 'B', author: 'A', genre: 'fiction', price: 900, stock: 5, coverImage: { publicId: 'c', secureUrl: 'c.jpg', name: '' }, description: 'A sufficiently long description.' });
  order = await Order.create({
    items: [{ book: book._id, title: 'B', author: 'A', price: 900, quantity: 2 }],
    subtotal: 1800, total: 1800,
    deliveryAddress: { fullName: 'Sita Sharma', phone: '+977-9841234567', address1: 'Lakeside, Ward 6', city: 'Pokhara', province: 'Gandaki' },
    status: 'confirmed',
  });
  await Setting.create({ key: 'ncm', value: { fromBranch: 'TINKUNE', deliveryType: 'Branch2Door' } });
});
afterEach(async () => db.clearDatabase());

describe('branch suggestion', () => {
  const branches = BRANCHES.map((b) => ({ name: b.name, district: b.district_name, province: b.province_name, areas: b.areas_covered.split(',').map((s) => s.trim()) }));
  it('prefers a covered area named in the address', () => {
    const s = suggestBranches(branches, { address1: 'New Baneshwor, Ward 10', city: 'Kathmandu', province: 'Bagmati' });
    expect(s[0].branch).toBe('TINKUNE');
    expect(s[0].reason).toMatch(/New Baneshwor/i);
  });
  it('falls back to the branch name / district from the city', () => {
    expect(suggestBranches(branches, { address1: 'Somewhere', city: 'Pokhara' })[0].branch).toBe('POKHARA');
    expect(suggestBranches(branches, { address1: 'Nowhere road', city: 'Kaski' })[0].branch).toBe('POKHARA');
  });
});

describe('phone for NCM', () => {
  it('accepts Nepali mobiles in any common format and rejects the rest', () => {
    expect(ncmPhone('+977-984 1234567')).toBe('9841234567');
    expect(ncmPhone('09841234567')).toBe('9841234567');
    expect(ncmPhone('01-4412345')).toBeNull();
    expect(ncmPhone('12345')).toBeNull();
  });
});

describe('booking a parcel', () => {
  it('quotes the suggested branch, NCM charge and the amount to collect', async () => {
    const res = await request(app).get(`/api/admin/ncm/orders/${order._id}/quote`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ branch: 'POKHARA', deliveryCharge: 120, goodsAmount: 1800, codCharge: 1920, phone: '9841234567', phoneOk: true });
    const rate = fetchCalls.find((c) => c.path === '/api/v1/shipping-rate');
    expect(rate.query).toEqual({ creation: 'TINKUNE', destination: 'POKHARA', type: 'Send' });
  });

  it('books once: books + delivery collected, our order number as the reference', async () => {
    const res = await request(app).post(`/api/admin/ncm/orders/${order._id}/book`).set(auth()).send({ branch: 'POKHARA' });
    expect(res.status).toBe(200);
    const create = fetchCalls.find((c) => c.path === '/api/v1/order/create');
    expect(create.auth).toBe('Token test-token');
    expect(create.body).toMatchObject({ name: 'Sita Sharma', phone: '9841234567', cod_charge: '1920', fbranch: 'TINKUNE', branch: 'POKHARA', vref_id: order.orderNumber, delivery_type: 'Branch2Door', weight: '1' });

    const saved = await Order.findById(order._id).lean();
    expect(saved.ncm).toMatchObject({ orderId: 747, codCharge: 1920, deliveryCharge: 120, goodsAmount: 1800, branch: 'POKHARA' });
    expect(saved.ncm.booking).toBeUndefined();
    expect(saved.ncm).toMatchObject({ trackId: 'NCM-TRK-1', paymentStatus: 'Pending', destinationPhone: '9800000002' });
    expect(saved.status).toBe('processing');

    const again = await request(app).post(`/api/admin/ncm/orders/${order._id}/book`).set(auth()).send({ branch: 'POKHARA' });
    expect(again.status).toBe(409);
    expect(fetchCalls.filter((c) => c.path === '/api/v1/order/create')).toHaveLength(1);
  });

  it('two simultaneous clicks create one parcel', async () => {
    let release;
    createResponse = () => new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, text: async () => JSON.stringify({ orderid: 748 }) }); });
    const first = request(app).post(`/api/admin/ncm/orders/${order._id}/book`).set(auth()).send({ branch: 'POKHARA' }).then((r) => r);
    await new Promise((r) => setTimeout(r, 300));
    const second = await request(app).post(`/api/admin/ncm/orders/${order._id}/book`).set(auth()).send({ branch: 'POKHARA' });
    expect(second.status).toBe(409);
    expect(second.body.errors[0].code).toBe('BOOKING_IN_PROGRESS');
    release();
    expect((await first).status).toBe(200);
    expect(fetchCalls.filter((c) => c.path === '/api/v1/order/create')).toHaveLength(1);
  });

  it("surfaces NCM's field errors and frees the order to try again", async () => {
    createResponse = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ Error: { phone: 'Invalid Phone Number' } }) });
    const res = await request(app).post(`/api/admin/ncm/orders/${order._id}/book`).set(auth()).send({ branch: 'POKHARA' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid Phone Number/);
    expect((await Order.findById(order._id).lean()).ncm.booking).toBeUndefined();
  });

  it('keeps the order locked when NCM times out, until an admin confirms there is no duplicate', async () => {
    createResponse = async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); };
    const res = await request(app).post(`/api/admin/ncm/orders/${order._id}/book`).set(auth()).send({ branch: 'POKHARA' });
    expect(res.status).toBe(504);
    expect(res.body.errors[0].code).toBe('NCM_UNCERTAIN');
    expect((await Order.findById(order._id).lean()).ncm.booking).toBe(true);

    // Even an hour later, a plain retry is refused…
    await Order.updateOne({ _id: order._id }, { $set: { 'ncm.bookingStartedAt': new Date(Date.now() - 3600e3) } });
    createResponse = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ orderid: 749 }) });
    const blind = await request(app).post(`/api/admin/ncm/orders/${order._id}/book`).set(auth()).send({ branch: 'POKHARA' });
    expect(blind.status).toBe(409);
    expect(blind.body.errors[0].code).toBe('STALE_BOOKING');
    // …until the admin says they checked the portal.
    const ok = await request(app).post(`/api/admin/ncm/orders/${order._id}/book`).set(auth()).send({ branch: 'POKHARA', confirmNoDuplicate: true });
    expect(ok.status).toBe(200);
    expect((await Order.findById(order._id).lean()).ncm.orderId).toBe(749);
  });

  it('refuses without a drop-off branch, with a bad phone, or for a cancelled order', async () => {
    await Setting.deleteMany({});
    expect((await request(app).post(`/api/admin/ncm/orders/${order._id}/book`).set(auth()).send({ branch: 'POKHARA' })).body.errors[0].code).toBe('NO_FROM_BRANCH');
    await Setting.create({ key: 'ncm', value: { fromBranch: 'TINKUNE' } });
    expect((await request(app).post(`/api/admin/ncm/orders/${order._id}/book`).set(auth()).send({ branch: 'POKHARA', phone: '01-4412345' })).body.errors[0].code).toBe('BAD_PHONE');
    await Order.updateOne({ _id: order._id }, { $set: { status: 'cancelled' } });
    expect((await request(app).post(`/api/admin/ncm/orders/${order._id}/book`).set(auth()).send({ branch: 'POKHARA' })).status).toBe(409);
    expect(fetchCalls.filter((c) => c.path === '/api/v1/order/create')).toHaveLength(0);
  });
});

describe('NCM webhooks', () => {
  beforeEach(async () => {
    await Order.updateOne({ _id: order._id }, { $set: { 'ncm.orderId': 747, status: 'processing' } });
  });
  const hook = (body, token = 'hook-secret') => request(app).post(`/api/webhooks/ncm${token ? `?token=${token}` : ''}`).send(body);

  it('refuses requests without the secret', async () => {
    expect((await hook({ order_ids: ['747'], event: 'order_dispatched', status: 'Dispatched' }, null)).status).toBe(401);
    expect((await hook({ order_ids: ['747'], event: 'order_dispatched', status: 'Dispatched' }, 'wrong')).status).toBe(401);
    expect((await Order.findById(order._id).lean()).status).toBe('processing');
  });

  it("answers the portal's test without touching orders", async () => {
    const res = await hook({ event: 'order.status.changed', order_id: 'TEST-123456', status: 'In Transit', test: true });
    expect(res.status).toBe(200);
    expect((await Order.findById(order._id).lean()).ncm.events || []).toHaveLength(0);
  });

  it('moves the order along the delivery journey, once per step', async () => {
    await hook({ order_ids: ['747', '999'], event: 'dropoff_collected', status: 'Drop off Order Collected', timestamp: '2026-10-23T05:00:00Z' });
    let o = await Order.findById(order._id).lean();
    expect(o.status).toBe('shipped');
    await hook({ order_ids: ['747'], event: 'dropoff_collected', status: 'Drop off Order Collected', timestamp: '2026-10-23T05:00:01Z' }); // duplicate
    await hook({ order_id: '747', event: 'delivery_completed', status: 'Delivered', timestamp: '2026-10-24T09:00:00Z' });
    o = await Order.findById(order._id).lean();
    expect(o.status).toBe('delivered');
    expect(o.ncm.events.map((e) => e.status)).toEqual(['Drop off Order Collected', 'Delivered']);
    // A late, out-of-order event never drags it back.
    await hook({ order_ids: ['747'], event: 'order_arrived', status: 'Arrived', timestamp: '2026-10-23T12:00:00Z' });
    expect((await Order.findById(order._id).lean()).status).toBe('delivered');
  });

  it('a return ends as returned, never delivered', async () => {
    await hook({ order_ids: ['747'], event: 'order_marked_rtv', status: 'Order Marked Return', timestamp: '2026-10-25T05:00:00Z' });
    await hook({ order_ids: ['747'], event: 'rtv_delivery', status: 'RTV Delivered', timestamp: '2026-10-26T05:00:00Z' });
    expect((await Order.findById(order._id).lean()).status).toBe('returned');
  });

  it('records refunds and accepts events it does not know', async () => {
    const r = await hook({ order_id: '747', event: 'refund_initiated', status: 'Refund Initiated', customer_order: { order_id: '800', cod_charge: '-1800.00', delivery_charge: '150.00' }, refund_order: { order_id: '801', cod_charge: '1800.00', delivery_charge: '0.00' }, timestamp: '2026-10-27T05:00:00Z' });
    expect(r.status).toBe(200);
    expect((await Order.findById(order._id).lean()).ncm.refund).toMatchObject({ customerOrderId: 800, refundOrderId: 801, amount: 1800 });
    expect((await hook({ order_ids: ['747'], event: 'something_new', status: 'Brand New Thing' })).status).toBe(200);
  });
});

describe('status check (missed-webhook safety net)', () => {
  it('reads "Delivered" through the history: a returned parcel ends returned', async () => {
    await Order.updateOne({ _id: order._id }, { $set: { 'ncm.orderId': 747, status: 'shipped' } });
    bulkResult = { 747: 'Delivered' };
    statusHistory = [
      { orderid: 747, status: 'Delivered', added_time: '2026-10-26T13:00:00+05:45' },
      { orderid: 747, status: 'Sent to Vendor', added_time: '2026-10-25T13:00:00+05:45' },
      { orderid: 747, status: 'Drop off Order Collected', added_time: '2026-10-23T13:00:00+05:45' },
    ];
    const r = await syncOpenParcels();
    expect(r).toMatchObject({ checked: 1, updated: 1 });
    expect((await Order.findById(order._id).lean()).status).toBe('returned');
  });

  it('uses live-format labels and NCM\x27s own return flag', async () => {
    await Order.updateOne({ _id: order._id }, { $set: { 'ncm.orderId': 747, status: 'processing' } });
    bulkResult = { 747: 'Delivered' };
    statusHistory = [
      { orderid: 747, status: 'Delivered', added_time: '2026-10-27T13:00:00+05:45', vendor_return: true },
      { orderid: 747, status: 'Arrived at BIRGUNJ', added_time: '2026-10-25T13:00:00+05:45', vendor_return: false },
      { orderid: 747, status: 'Dispatched to BIRGUNJ', added_time: '2026-10-24T13:00:00+05:45', vendor_return: false },
      { orderid: 747, status: 'Drop off Order Collected', added_time: '2026-10-23T13:00:00+05:45', vendor_return: false },
    ];
    await syncOpenParcels();
    const o = await Order.findById(order._id).lean();
    expect(o.status).toBe('returned');
    expect(o.ncm.events.map((e) => e.status)).toEqual(['Drop off Order Collected', 'Dispatched to BIRGUNJ', 'Arrived at BIRGUNJ', 'Delivered']);
  });

  it('a clean delivery ends delivered', async () => {
    await Order.updateOne({ _id: order._id }, { $set: { 'ncm.orderId': 747, status: 'shipped' } });
    bulkResult = { 747: 'Delivered' };
    statusHistory = [{ orderid: 747, status: 'Delivered', added_time: '2026-10-26T13:00:00+05:45' }, { orderid: 747, status: 'Sent for Delivery', added_time: '2026-10-26T09:00:00+05:45' }];
    await syncOpenParcels();
    const o = await Order.findById(order._id).lean();
    expect(o.status).toBe('delivered');
    expect(o.deliveredAt).toBeTruthy();
  });
});

describe('applyNcmUpdate', () => {
  it('never changes a cancelled or refunded order', () => {
    const o = new Order({ status: 'cancelled', statusHistory: [] });
    expect(applyNcmUpdate(o, { status: 'Delivered', source: 'sync' }).changed).toBe(false);
    expect(o.status).toBe('cancelled');
  });
});
