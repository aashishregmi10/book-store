'use strict';

/**
 * Admin side of the Nepal Can Move (NCM) integration — /api/admin/ncm.
 *
 * The flow: books arrive from the supplier → an admin opens the order, checks
 * the suggested NCM branch and the quoted charge, and books it. We then drop
 * the parcel at our NCM branch (Branch2Door). NCM collects the books' price
 * plus its own delivery charge at the door, keeps the delivery part and pays
 * us the rest — the shop never prices delivery (see services/pricing.js).
 *
 * Booking is the one irreversible step, so it is guarded:
 *  - an atomic lock on the order means two clicks or two admins can't book the
 *    same parcel twice (NCM has no idempotency key; it asks vendors to avoid
 *    duplicates);
 *  - the charge is fetched from NCM at booking time, never taken from the
 *    browser;
 *  - if NCM times out, the parcel may or may not exist, so the lock is kept
 *    until an admin has checked the NCM portal for our order number.
 */

const express = require('express');

const { authenticate, requireAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { z } = require('../utils/zod');
const { ok, fail } = require('../utils/apiResponse');
const Order = require('../models/order.model');
const Setting = require('../models/setting.model');
const ncm = require('../services/ncm/client');
const { suggestBranches } = require('../services/ncm/branchMatch');
const { applyNcmUpdate, applyHistory, applyDetail, notifyCustomer } = require('../services/ncm/status');
const { syncOpenParcels } = require('../services/ncm/sync');

const router = express.Router();
router.use(authenticate, requireAdmin);

const SETTINGS_KEY = 'ncm';
const DELIVERY_TYPES = ['Branch2Door', 'Door2Door'];
const STALE_LOCK_MS = 2 * 60 * 1000;
const NOT_BOOKABLE = new Set(['cancelled', 'refunded', 'delivered', 'returned']);

const idParams = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i) });

async function getSettings() {
  const doc = await Setting.findOne({ key: SETTINGS_KEY }).lean();
  return { fromBranch: doc?.value?.fromBranch || '', deliveryType: doc?.value?.deliveryType || 'Branch2Door' };
}

/** "+977-984 1234567" → "9841234567"; null unless it is a 10-digit Nepali mobile. */
function ncmPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('977') && d.length > 10) d = d.slice(3);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^9\d{9}$/.test(d) ? d : null;
}

const itemCount = (order) => order.items.reduce((n, it) => n + (it.quantity || 0), 0);
const packageName = (order) => `Books (${itemCount(order)} ${itemCount(order) === 1 ? 'item' : 'items'})`;
const fullAddress = (a) => [a.address1, a.address2, a.city].map((s) => String(s || '').trim()).filter(Boolean).join(', ');
// NCM collects at the door: the books (unless already paid) plus its delivery charge.
const goodsDue = (order) => (order.paymentStatus === 'paid' ? 0 : order.total);

function ncmFail(res, err) {
  if (err instanceof ncm.NcmError) return fail(res, err.message, err.status, [{ code: err.code, fields: err.fields }]);
  throw err;
}

// ── Settings ─────────────────────────────────────────────
router.get('/settings', async (_req, res, next) => {
  try {
    return ok(res, {
      ...(await getSettings()),
      connected: ncm.isConfigured(),
      server: ncm.isDemo() ? 'demo' : 'live',
      webhookReady: Boolean(process.env.NCM_WEBHOOK_SECRET),
    }, 'NCM settings');
  } catch (err) { return next(err); }
});

router.put('/settings', validate({ body: z.object({ fromBranch: z.string().trim().min(2), deliveryType: z.enum(DELIVERY_TYPES).optional() }) }), async (req, res, next) => {
  try {
    const branches = await ncm.getBranches();
    if (!branches.some((b) => b.name === req.body.fromBranch)) return fail(res, `NCM has no branch called "${req.body.fromBranch}".`, 400, [{ code: 'UNKNOWN_BRANCH' }]);
    const value = { fromBranch: req.body.fromBranch, deliveryType: req.body.deliveryType || 'Branch2Door' };
    await Setting.findOneAndUpdate({ key: SETTINGS_KEY }, { $set: { value, updatedBy: req.userId } }, { upsert: true });
    return ok(res, value, 'NCM settings saved');
  } catch (err) {
    if (err instanceof ncm.NcmError) return ncmFail(res, err);
    return next(err);
  }
});

// ── Branches ─────────────────────────────────────────────
router.get('/branches', async (_req, res, next) => {
  try {
    const branches = await ncm.getBranches();
    return ok(res, branches.map(({ name, district, province, phone, areas }) => ({ name, district, province, phone, areaCount: areas.length })), 'NCM branches');
  } catch (err) {
    if (err instanceof ncm.NcmError) return ncmFail(res, err);
    return next(err);
  }
});

// ── Quote: suggested branch, charge and amount to collect ──
router.get('/orders/:id/quote', validate({ params: idParams, query: z.object({ branch: z.string().trim().optional() }).passthrough() }), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return fail(res, 'Order not found', 404, [{ code: 'NOT_FOUND' }]);
    const settings = await getSettings();
    const branches = await ncm.getBranches();
    const suggestions = suggestBranches(branches, order.deliveryAddress || {});
    const branch = req.query.branch || order.ncm?.branch || suggestions[0]?.branch || '';
    if (branch && !branches.some((b) => b.name === branch)) return fail(res, `NCM has no branch called "${branch}".`, 400, [{ code: 'UNKNOWN_BRANCH' }]);

    let deliveryCharge = null;
    if (branch && settings.fromBranch) deliveryCharge = await ncm.getDeliveryCharge({ from: settings.fromBranch, to: branch, deliveryType: settings.deliveryType });
    const goodsAmount = goodsDue(order);
    const phone = ncmPhone(order.deliveryAddress?.phone);

    return ok(res, {
      settings,
      connected: ncm.isConfigured(),
      server: ncm.isDemo() ? 'demo' : 'live',
      suggestions,
      branch,
      deliveryCharge,
      goodsAmount,
      codCharge: deliveryCharge === null ? null : goodsAmount + deliveryCharge,
      name: order.deliveryAddress?.fullName || '',
      phone: phone || order.deliveryAddress?.phone || '',
      phoneOk: Boolean(phone),
      address: fullAddress(order.deliveryAddress || {}),
      packageName: packageName(order),
      instruction: order.customerNote || '',
      booked: order.ncm?.orderId ? order.ncm : null,
      bookingInProgress: Boolean(order.ncm?.booking),
    }, 'NCM quote');
  } catch (err) {
    if (err instanceof ncm.NcmError) return ncmFail(res, err);
    return next(err);
  }
});

// ── Book the parcel with NCM ─────────────────────────────
const bookBody = z.object({
  branch: z.string().trim().min(2),
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().min(3).max(300).optional(),
  weightKg: z.coerce.number().positive().max(50).optional(),
  instruction: z.string().trim().max(300).optional(),
  // Set only after checking the NCM portal following a timed-out attempt.
  confirmNoDuplicate: z.boolean().optional(),
});

router.post('/orders/:id/book', validate({ params: idParams, body: bookBody }), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'Order not found', 404, [{ code: 'NOT_FOUND' }]);
    if (order.ncm?.orderId) return fail(res, `Already booked with NCM (#${order.ncm.orderId}).`, 409, [{ code: 'ALREADY_BOOKED' }]);
    if (NOT_BOOKABLE.has(order.status)) return fail(res, `A ${order.status} order can't be sent to NCM.`, 409, [{ code: 'NOT_BOOKABLE' }]);

    const settings = await getSettings();
    if (!settings.fromBranch) return fail(res, 'Choose the NCM branch where you drop parcels first.', 400, [{ code: 'NO_FROM_BRANCH' }]);
    const branches = await ncm.getBranches();
    if (!branches.some((b) => b.name === req.body.branch)) return fail(res, `NCM has no branch called "${req.body.branch}".`, 400, [{ code: 'UNKNOWN_BRANCH' }]);
    const phone = ncmPhone(req.body.phone || order.deliveryAddress.phone);
    if (!phone) return fail(res, 'NCM needs a 10-digit mobile number (98…/97…). Correct the phone and try again.', 400, [{ code: 'BAD_PHONE' }]);

    // The charge comes from NCM now, not from what the browser showed.
    const deliveryCharge = await ncm.getDeliveryCharge({ from: settings.fromBranch, to: req.body.branch, deliveryType: settings.deliveryType });
    const goodsAmount = goodsDue(order);
    const codCharge = goodsAmount + deliveryCharge;
    const weightKg = req.body.weightKg || 1;

    // Lock: only one booking attempt per order, ever in flight.
    const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
    const lock = await Order.findOneAndUpdate(
      {
        _id: order._id,
        'ncm.orderId': { $not: { $type: 'number' } },
        $or: [
          { 'ncm.booking': { $ne: true } },
          ...(req.body.confirmNoDuplicate ? [{ 'ncm.bookingStartedAt': { $lt: staleBefore } }] : []),
        ],
      },
      { $set: { 'ncm.booking': true, 'ncm.bookingStartedAt': new Date() } },
      { new: true }
    );
    if (!lock) {
      const fresh = await Order.findById(order._id).select('ncm').lean();
      if (fresh?.ncm?.orderId) return fail(res, `Already booked with NCM (#${fresh.ncm.orderId}).`, 409, [{ code: 'ALREADY_BOOKED' }]);
      const started = fresh?.ncm?.bookingStartedAt ? new Date(fresh.ncm.bookingStartedAt) : null;
      if (started && started < staleBefore) {
        return fail(res, `An earlier booking attempt didn't finish. Check the NCM portal for an order with reference ${order.orderNumber} before trying again.`, 409, [{ code: 'STALE_BOOKING' }]);
      }
      return fail(res, 'This order is being booked right now. Wait a moment and refresh.', 409, [{ code: 'BOOKING_IN_PROGRESS' }]);
    }

    const payload = {
      name: req.body.name || order.deliveryAddress.fullName,
      phone,
      phone2: '',
      cod_charge: String(codCharge),
      address: req.body.address || fullAddress(order.deliveryAddress),
      fbranch: settings.fromBranch,
      branch: req.body.branch,
      package: packageName(order),
      vref_id: order.orderNumber,
      instruction: req.body.instruction ?? order.customerNote ?? '',
      delivery_type: settings.deliveryType,
      weight: String(weightKg),
    };

    let ncmOrderId;
    try {
      ncmOrderId = await ncm.createOrder(payload);
    } catch (err) {
      if (err instanceof ncm.NcmError && (err.code === 'NCM_UNREACHABLE' || err.code === 'NCM_NO_ID')) {
        // Unknown outcome: keep the lock so nobody books a duplicate blind.
        req.log.error({ orderNumber: order.orderNumber, err: err.message }, 'NCM booking outcome unknown');
        return fail(res, `NCM didn't confirm the booking (${err.message}) It may still have been created. Check the NCM portal for reference ${order.orderNumber}; if it isn't there, try again and confirm.`, 504, [{ code: 'NCM_UNCERTAIN' }]);
      }
      await Order.updateOne({ _id: order._id }, { $unset: { 'ncm.booking': '', 'ncm.bookingStartedAt': '' } });
      return ncmFail(res, err);
    }

    // Booked. Record it — if this write failed we'd have a parcel we don't know
    // about, so the NCM id goes in the log before anything else can go wrong.
    req.log.info({ orderNumber: order.orderNumber, ncmOrderId, codCharge, deliveryCharge }, 'Booked with NCM');
    const booked = await Order.findById(order._id);
    booked.ncm.orderId = ncmOrderId;
    booked.ncm.fromBranch = settings.fromBranch;
    booked.ncm.branch = req.body.branch;
    booked.ncm.deliveryType = settings.deliveryType;
    booked.ncm.goodsAmount = goodsAmount;
    booked.ncm.deliveryCharge = deliveryCharge;
    booked.ncm.codCharge = codCharge;
    booked.ncm.weightKg = weightKg;
    booked.ncm.packageName = payload.package;
    booked.ncm.bookedAt = new Date();
    booked.ncm.bookedBy = req.userId;
    booked.ncm.booking = undefined;
    booked.ncm.bookingStartedAt = undefined;
    booked.trackingNumber = String(ncmOrderId);
    const label = settings.deliveryType === 'Branch2Door' ? 'Drop off Order Created' : 'Pickup Order Created';
    const r = applyNcmUpdate(booked, { status: label, at: new Date(), source: 'booking' });
    booked.statusHistory.push({ status: booked.status, note: `Booked with NCM #${ncmOrderId} → ${req.body.branch}. NCM collects Rs ${codCharge} (books Rs ${goodsAmount} + delivery Rs ${deliveryCharge}).`, timestamp: new Date(), updatedBy: req.userId });
    // NCM's tracking id and its own record of the amounts. Optional: the
    // booking already stands, so a failure here is only logged.
    try { applyDetail(booked, await ncm.getOrder(ncmOrderId)); } catch (e) { req.log.warn({ ncmOrderId, err: e.message }, 'NCM order details unavailable after booking'); }
    await booked.save();
    if (r.changed) await notifyCustomer(booked, req.app.get('io'));
    return ok(res, booked.ncm, `Booked with NCM #${ncmOrderId}`);
  } catch (err) {
    if (err instanceof ncm.NcmError) return ncmFail(res, err);
    return next(err);
  }
});

// ── Refresh one parcel from NCM's full history ───────────
router.post('/orders/:id/refresh', validate({ params: idParams }), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order?.ncm?.orderId) return fail(res, 'This order is not booked with NCM.', 404, [{ code: 'NOT_BOOKED' }]);
    const [history, detail] = await Promise.all([ncm.getStatusHistory(order.ncm.orderId), ncm.getOrder(order.ncm.orderId)]);
    applyDetail(order, detail);
    const changed = applyHistory(order, history);
    order.ncm.lastSyncedAt = new Date();
    await order.save();
    if (changed) await notifyCustomer(order, req.app.get('io'));
    return ok(res, order.ncm, 'Refreshed from NCM');
  } catch (err) {
    if (err instanceof ncm.NcmError) return ncmFail(res, err);
    return next(err);
  }
});

// ── Comments (NCM staff ↔ us) ────────────────────────────
router.get('/orders/:id/comments', validate({ params: idParams }), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).select('ncm.orderId').lean();
    if (!order?.ncm?.orderId) return fail(res, 'This order is not booked with NCM.', 404, [{ code: 'NOT_BOOKED' }]);
    const comments = await ncm.getComments(order.ncm.orderId);
    return ok(res, comments.map((c) => ({ text: c.comments, by: c.addedBy, at: c.added_time })), 'NCM comments');
  } catch (err) {
    if (err instanceof ncm.NcmError) return ncmFail(res, err);
    return next(err);
  }
});

router.post('/orders/:id/comments', validate({ params: idParams, body: z.object({ text: z.string().trim().min(2).max(500) }) }), async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).select('ncm.orderId').lean();
    if (!order?.ncm?.orderId) return fail(res, 'This order is not booked with NCM.', 404, [{ code: 'NOT_BOOKED' }]);
    await ncm.addComment(order.ncm.orderId, req.body.text);
    return ok(res, { sent: true }, 'Comment sent to NCM');
  } catch (err) {
    if (err instanceof ncm.NcmError) return ncmFail(res, err);
    return next(err);
  }
});

// ── Check every open parcel now (the periodic check, on demand) ──
router.post('/sync', async (req, res, next) => {
  try {
    return ok(res, await syncOpenParcels({ io: req.app.get('io') }), 'NCM status check done');
  } catch (err) {
    if (err instanceof ncm.NcmError) return ncmFail(res, err);
    return next(err);
  }
});

module.exports = router;
module.exports._ncmPhone = ncmPhone;
