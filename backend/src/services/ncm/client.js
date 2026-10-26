'use strict';

/**
 * HTTP client for Nepal Can Move (NCM), our courier. Every call to NCM goes
 * through here: base URL, token, timeout and error shape live in one place.
 *
 * Configuration (backend/.env):
 *   NCM_API_TOKEN   issued by NCM's IT admin; sent as "Authorization: Token …".
 *                   Without it the read-only endpoints still work on the demo
 *                   server, but nothing can be booked.
 *   NCM_BASE_URL    defaults to NCM's demo server. Set NCM's live address to go
 *                   live — the paths are the same.
 *
 * NCM's limits, per rolling 24 hours (shown in the vendor portal; the older
 * API PDF says 200/5,000): 5,000 order creations, 100,000 views and 10,000
 * comments. Status checks are batched regardless.
 */

const DEMO_BASE = 'https://demo.nepalcanmove.com';
const TIMEOUT_MS = 15000;
const BRANCH_CACHE_MS = 6 * 60 * 60 * 1000; // branches change rarely

// NCM spells the delivery type one way when booking and another when quoting.
const DELIVERY_TYPES = {
  Branch2Door: 'Send', // we drop at a branch, NCM delivers to the door
  Door2Door: 'Pickup/Collect', // NCM picks up from us and delivers
  Door2Branch: 'D2B',
  Branch2Branch: 'B2B',
};

class NcmError extends Error {
  /**
   * @param {string} message human-readable
   * @param {{ status?: number, code?: string, fields?: Record<string,string> }} [info]
   */
  constructor(message, { status = 502, code = 'NCM_ERROR', fields } = {}) {
    super(message);
    this.name = 'NcmError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const baseUrl = () => String(process.env.NCM_BASE_URL || DEMO_BASE).replace(/\/+$/, '');
const token = () => String(process.env.NCM_API_TOKEN || '').trim();
const isConfigured = () => Boolean(token());
const isDemo = () => baseUrl() === DEMO_BASE;

async function call(method, path, { query, body, needsToken = true } = {}) {
  if (needsToken && !isConfigured()) {
    throw new NcmError('NCM is not connected yet: add NCM_API_TOKEN to backend/.env.', { status: 503, code: 'NCM_NOT_CONFIGURED' });
  }
  const url = new URL(baseUrl() + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));

  const headers = { Accept: 'application/json' };
  // Only where NCM requires it: the branch list and rates are public, and a
  // rejected token on a public call would break quoting for no reason.
  if (needsToken) headers.Authorization = `Token ${token()}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const why = err && err.name === 'TimeoutError' ? 'it did not answer within 15 seconds' : (err && err.message) || 'network error';
    throw new NcmError(`Couldn't reach NCM: ${why}.`, { status: 502, code: 'NCM_UNREACHABLE' });
  }

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }

  if (!res.ok) {
    // NCM answers errors as {"detail": …}, {"message": …} or, for bookings,
    // {"Error": {"phone": "Invalid Phone Number", …}}.
    const fields = json && typeof json.Error === 'object' ? json.Error : undefined;
    const detail = (json && (json.detail || json.message || json.Message)) || (fields && Object.values(fields).join('; '));
    const status = res.status === 401 || res.status === 403 ? 502 : res.status >= 500 ? 502 : res.status;
    const code = res.status === 401 || res.status === 403 ? 'NCM_AUTH' : 'NCM_ERROR';
    const message = code === 'NCM_AUTH' ? 'NCM rejected our API token. Check NCM_API_TOKEN in backend/.env.' : `NCM: ${detail || `request failed (${res.status})`}`;
    throw new NcmError(message, { status, code, fields });
  }
  return json;
}

// ── Branches ─────────────────────────────────────────────
let branchCache = { at: 0, list: null };

const splitAreas = (s) => String(s || '').split(',').map((a) => a.trim()).filter(Boolean);

/** All NCM branches, normalised. Cached for six hours. */
async function getBranches({ fresh = false } = {}) {
  if (!fresh && branchCache.list && Date.now() - branchCache.at < BRANCH_CACHE_MS) return branchCache.list;
  const raw = await call('GET', '/api/v2/branches', { needsToken: false });
  const list = (Array.isArray(raw) ? raw : [])
    .filter((b) => b && b.name)
    .map((b) => ({
      id: b.pk,
      code: b.code || '',
      name: String(b.name).trim(),
      district: b.district_name || '',
      province: b.province_name || '',
      address: b.address || '',
      phone: b.phone || '',
      surcharge: Number(b.surcharge) || 0,
      type: b.branch_type || '',
      areas: splitAreas(b.areas_covered),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  branchCache = { at: Date.now(), list };
  return list;
}

/** NCM's delivery charge between two branches for a delivery type, in NPR. */
async function getDeliveryCharge({ from, to, deliveryType = 'Branch2Door' }) {
  const json = await call('GET', '/api/v1/shipping-rate', {
    query: { creation: from, destination: to, type: DELIVERY_TYPES[deliveryType] || DELIVERY_TYPES.Branch2Door },
    needsToken: false,
  });
  const charge = Number(json && json.charge);
  if (!Number.isFinite(charge) || charge < 0) throw new NcmError('NCM returned no delivery charge for that route.', { status: 502 });
  return charge;
}

// ── Orders ───────────────────────────────────────────────
/** Book a parcel. Returns NCM's order id (number). */
async function createOrder(payload) {
  const json = await call('POST', '/api/v1/order/create', { body: payload });
  const id = Number(json && (json.orderid ?? json.order_id ?? json.id));
  if (!Number.isFinite(id) || id <= 0) throw new NcmError('NCM accepted the booking but returned no order id. Check the NCM portal before trying again.', { status: 502, code: 'NCM_NO_ID' });
  return id;
}

const getOrder = (id) => call('GET', '/api/v1/order', { query: { id } });
/** Full status history, newest first. */
const getStatusHistory = async (id) => {
  const json = await call('GET', '/api/v1/order/status', { query: { id } });
  return Array.isArray(json) ? json : [];
};
const getComments = async (id) => {
  const json = await call('GET', '/api/v1/order/comment', { query: { id } });
  return Array.isArray(json) ? json : [];
};
const addComment = (id, comments) => call('POST', '/api/v1/comment', { body: { orderid: String(id), comments } });

/** Current status label for many orders at once: { result: {id: label}, errors: [id] }. */
async function getStatuses(ids) {
  const result = {}; const errors = [];
  for (let i = 0; i < ids.length; i += 100) {
    const json = await call('POST', '/api/v1/orders/statuses', { body: { orders: ids.slice(i, i + 100) } });
    Object.assign(result, (json && json.result) || {});
    errors.push(...((json && json.errors) || []));
  }
  return { result, errors };
}

module.exports = {
  NcmError,
  DELIVERY_TYPES,
  isConfigured,
  isDemo,
  baseUrl,
  getBranches,
  getDeliveryCharge,
  createOrder,
  getOrder,
  getStatusHistory,
  getComments,
  addComment,
  getStatuses,
  _resetCache: () => { branchCache = { at: 0, list: null }; },
};
