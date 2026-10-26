'use strict';

/**
 * POST /api/webhooks/ncm — NCM tells us a parcel moved.
 *
 * Set in the NCM vendor portal (API section → "Order Delivery Webhook URL") as
 *   https://<api-domain>/api/webhooks/ncm?token=<NCM_WEBHOOK_SECRET>
 *
 * NCM does not sign its webhooks, so the secret in the URL is the only proof a
 * request came from NCM; anything without it is refused. Per NCM's webhook
 * documentation (v1.1):
 *  - one order:  { order_id, status, timestamp, event }       (delivery_completed)
 *  - many:       { order_ids: [...], status, timestamp, event }
 *  - refund:     { order_id, status, customer_order, refund_order, timestamp, event }
 *  - portal test { event: "order.status.changed", order_id: "TEST-…", test: true }
 *  - `event` drives the logic; `status` is a display label.
 *  - unknown events must still get a 2xx; failures are never retried (the
 *    periodic status check in services/ncm/sync.js covers those).
 */

const crypto = require('crypto');
const express = require('express');

const Order = require('../models/order.model');
const { applyNcmUpdate, notifyCustomer } = require('../services/ncm/status');

const router = express.Router();

function hasSecret(req) {
  const expected = String(process.env.NCM_WEBHOOK_SECRET || '');
  if (!expected) return false; // not set up → accept nothing
  const given = String(req.query.token || req.get('x-ncm-token') || '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const toIds = (body) =>
  [body.order_id, ...(Array.isArray(body.order_ids) ? body.order_ids : [])]
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

router.post('/', async (req, res) => {
  if (!hasSecret(req)) {
    req.log.warn({ ip: req.ip }, 'NCM webhook refused: missing or wrong token');
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const body = req.body || {};
  if (body.test) {
    req.log.info({ event: body.event }, 'NCM test webhook received');
    return res.status(200).json({ status: 'success' });
  }

  const { event, status, timestamp } = body;
  try {
    const ids = toIds(body);
    if (!ids.length) return res.status(200).json({ status: 'ignored' });
    const orders = await Order.find({ 'ncm.orderId': { $in: ids } });
    const io = req.app.get('io');

    for (const order of orders) {
      if (event === 'refund_initiated') {
        order.ncm.refund = {
          initiatedAt: timestamp ? new Date(timestamp) : new Date(),
          customerOrderId: Number(body.customer_order && body.customer_order.order_id) || undefined,
          refundOrderId: Number(body.refund_order && body.refund_order.order_id) || undefined,
          amount: Math.abs(Number(body.customer_order && body.customer_order.cod_charge)) || undefined,
        };
      }
      const r = applyNcmUpdate(order, { status, event, at: timestamp, source: 'webhook' });
      await order.save();
      if (r.changed) await notifyCustomer(order, io);
    }
    req.log.info({ event, ncmOrderIds: ids, matched: orders.length }, 'NCM webhook processed');
    return res.status(200).json({ status: 'received', matched: orders.length });
  } catch (err) {
    req.log.error({ err: err.message, event }, 'NCM webhook failed');
    return res.status(500).json({ message: 'processing failed' });
  }
});

module.exports = router;
