'use strict';

/**
 * The safety net under NCM's webhooks. NCM sends a webhook when a parcel moves,
 * but per its documentation a failed or timed-out webhook is never resent —
 * one missed "Delivered" would leave an order shown as shipped forever. This
 * asks NCM, every NCM_SYNC_MINUTES (default 30), for the current status of
 * every parcel still on its way: one batched request per 100 parcels, well
 * inside NCM's 5,000 views a day.
 *
 * A status check only returns the latest label, and NCM labels a parcel that
 * came back to us as "Delivered". So before trusting "Delivered" from here, the
 * parcel's full history is fetched and replayed — it shows any return.
 */

const Order = require('../../models/order.model');
const logger = require('../../config/logger');
const ncm = require('./client');
const { applyNcmUpdate, applyHistory, notifyCustomer, phaseOfLabel } = require('./status');

const OPEN = ['placed', 'confirmed', 'processing', 'shipped'];

async function syncOpenParcels({ io } = {}) {
  if (!ncm.isConfigured()) return { skipped: 'NCM_API_TOKEN not set' };
  const orders = await Order.find({ 'ncm.orderId': { $type: 'number' }, status: { $in: OPEN } });
  if (!orders.length) return { checked: 0, updated: 0 };

  const { result, errors } = await ncm.getStatuses(orders.map((o) => o.ncm.orderId));
  let updated = 0;
  for (const order of orders) {
    const label = result[String(order.ncm.orderId)];
    order.ncm.lastSyncedAt = new Date();
    let changed = false;
    if (label && label !== order.ncm.lastStatus) {
      if (phaseOfLabel(label) === 'delivered') {
        const history = await ncm.getStatusHistory(order.ncm.orderId).catch(() => null);
        changed = history ? applyHistory(order, history) : applyNcmUpdate(order, { status: label, source: 'sync' }).changed;
      } else {
        changed = applyNcmUpdate(order, { status: label, source: 'sync' }).changed;
      }
    }
    await order.save();
    if (changed) { updated += 1; await notifyCustomer(order, io); }
  }
  if (errors.length) logger.warn({ ncmOrderIds: errors }, 'NCM status check: unknown order ids');
  logger.info({ checked: orders.length, updated }, 'NCM status check done');
  return { checked: orders.length, updated };
}

/** Start the periodic check. Returns the timer (unref'd), or null when off. */
function startNcmSync({ io } = {}) {
  const minutes = Number(process.env.NCM_SYNC_MINUTES ?? 30);
  if (!ncm.isConfigured() || !(minutes > 0) || process.env.NODE_ENV === 'test') return null;
  const run = () => syncOpenParcels({ io }).catch((err) => logger.warn({ err: err.message }, 'NCM status check failed'));
  const timer = setInterval(run, minutes * 60 * 1000);
  timer.unref();
  setTimeout(run, 60 * 1000).unref(); // once shortly after boot
  logger.info({ everyMinutes: minutes }, 'NCM status check scheduled');
  return timer;
}

module.exports = { syncOpenParcels, startNcmSync };
