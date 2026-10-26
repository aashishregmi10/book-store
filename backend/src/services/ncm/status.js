'use strict';

/**
 * Turning NCM's parcel updates into our order status.
 *
 * NCM speaks in its own labels ("Drop off Order Collected", "Dispatched",
 * "Sent for Delivery", "Delivered", "Send to Vendor"…) and, over webhooks, in
 * event names ("dropoff_collected", "delivery_completed"…). Those map onto
 * our five-step order status like this:
 *
 *   booked with NCM ................ processing
 *   collected / dispatched / arrived  shipped
 *   sent for delivery .............. shipped   (NCM's label shows the detail)
 *   delivered ...................... delivered
 *   marked for return / on its way back  shipped, flagged as returning
 *   back with us ................... returned
 *
 * Rules that keep this safe:
 *  - Only ever forward. A late "Dispatched" can't drag a delivered order back.
 *  - Cancelled and refunded orders are an admin's call; NCM never changes them.
 *  - NCM labels a parcel returned to us as "Delivered" (its documentation says
 *    so). Once we've seen it head back, "Delivered" means "returned".
 *  - The same step can arrive by webhook and again from a status check, with
 *    timestamps a few seconds apart; it's recorded once.
 */

const User = require('../../models/user.model');
const email = require('../../utils/emailService');

const RANK = { placed: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4, returned: 5 };
const LOCKED = new Set(['cancelled', 'refunded']);
const MAX_EVENTS = 60;
const SAME_STEP_MS = 5 * 60 * 1000;

const EVENT_PHASE = {
  pickup_completed: 'in_transit',
  dropoff_collected: 'in_transit',
  order_dispatched: 'in_transit',
  order_arrived: 'in_transit',
  sent_for_delivery: 'out_for_delivery',
  delivery_completed: 'delivered',
  order_marked_rtv: 'returning',
  send_to_vendor: 'returning',
  rtv_delivery: 'returned',
  refund_initiated: 'refund',
};

const PHASE_STATUS = {
  booked: 'processing',
  in_transit: 'shipped',
  out_for_delivery: 'shipped',
  returning: 'shipped',
  delivered: 'delivered',
  returned: 'returned',
};

/** Phase of an NCM status label (from a status check or the history). */
function phaseOfLabel(label) {
  const s = String(label || '').toLowerCase().trim();
  if (/rtv delivered/.test(s)) return 'returned';
  if (/refund/.test(s)) return 'refund';
  if (/return|rtv|vendor/.test(s)) return 'returning';
  if (s === 'delivered') return 'delivered';
  if (/sent for delivery|out for delivery/.test(s)) return 'out_for_delivery';
  if (/order created|sent for pickup/.test(s)) return 'booked';
  if (/pickup complete|collected|dispatched|arrived|transit|hold|follow|redirect/.test(s)) return 'in_transit';
  return 'unknown';
}

const validDate = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? new Date() : x;
};

/**
 * Apply one NCM update to an order document (not saved). Returns whether our
 * order status changed, so the caller can notify the customer.
 *
 * @param {import('mongoose').Document} order
 * @param {{ status?:string, event?:string, at?:Date|string, source:'webhook'|'sync'|'history'|'booking' }} update
 */
function applyNcmUpdate(order, { status, event, at, source }) {
  if (!order.ncm) order.ncm = {};
  const ncm = order.ncm;
  const when = validDate(at);
  const label = String(status || event || 'Updated').trim();

  const events = ncm.events || [];
  const seen = events.some((e) => String(e.status).toLowerCase() === label.toLowerCase() && Math.abs(new Date(e.at) - when) < SAME_STEP_MS);
  if (!seen) {
    events.push({ status: label, event: event || undefined, at: when, source });
    events.sort((a, b) => new Date(a.at) - new Date(b.at));
    while (events.length > MAX_EVENTS) events.shift();
    ncm.events = events;
  }
  if (!ncm.lastStatusAt || when >= new Date(ncm.lastStatusAt)) {
    ncm.lastStatus = label;
    ncm.lastStatusAt = when;
  }

  const phase = (event && EVENT_PHASE[event]) || phaseOfLabel(label);
  if (phase === 'returning' || phase === 'returned') ncm.returning = true;

  let target = PHASE_STATUS[phase];
  if (phase === 'delivered' && ncm.returning) target = 'returned';
  if (!target || LOCKED.has(order.status)) return { changed: false };
  if ((RANK[target] ?? -1) <= (RANK[order.status] ?? -1)) return { changed: false };

  const from = order.status;
  order.status = target;
  if (target === 'delivered') order.deliveredAt = when;
  order.statusHistory.push({ status: target, note: `NCM: ${label}`, timestamp: when });
  return { changed: true, from, to: target };
}

/** Tell the customer — same email and live update an admin status change sends. */
async function notifyCustomer(order, io) {
  if (!order.user) return;
  try {
    const user = await User.findById(order.user);
    if (user) email.sendOrderStatusUpdate(user, order).catch(() => {});
  } catch { /* a notification failure must never fail the update */ }
  if (io) io.to(`user:${order.user}`).emit('order:status', { orderNumber: order.orderNumber, status: order.status });
}

/** Rebuild the timeline from NCM's full status history for one order (not saved). */
function applyHistory(order, history) {
  let changed = false;
  // History arrives newest first; replay oldest first so the status walks forward.
  for (const h of [...history].reverse()) {
    // Each history entry carries NCM's own return flag — the surest sign that
    // a later "Delivered" is the parcel coming back to us.
    if (h.vendor_return === true) {
      if (!order.ncm) order.ncm = {};
      order.ncm.returning = true;
    }
    const r = applyNcmUpdate(order, { status: h.status, at: h.added_time, source: 'history' });
    changed = changed || r.changed;
  }
  return changed;
}

/**
 * Copy what NCM's order details say about tracking and money (not saved).
 * NCM is the source of truth for the amounts: a redirect or correction on
 * their side changes them after booking.
 */
function applyDetail(order, d) {
  if (!d || !order.ncm) return;
  const n = order.ncm;
  if (d.trackid) n.trackId = String(d.trackid);
  if (d.payment_status) n.paymentStatus = String(d.payment_status);
  if (d.destination_branch_phone) n.destinationPhone = String(d.destination_branch_phone);
  const cod = Number(d.cod_charge);
  if (d.cod_charge !== undefined && Number.isFinite(cod)) n.codCharge = cod;
  const delivery = Number(d.delivery_charge);
  if (d.delivery_charge !== undefined && Number.isFinite(delivery)) n.deliveryCharge = delivery;
  if (d.vendor_return === true) n.returning = true;
}

module.exports = { applyNcmUpdate, applyHistory, applyDetail, notifyCustomer, phaseOfLabel, EVENT_PHASE };
