'use strict';

const dns = require('dns');
const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * `mongodb+srv://` URIs require a DNS SRV lookup, which Node performs through
 * its bundled c-ares resolver — NOT the OS resolver. On some machines c-ares
 * inherits a loopback-only server list (e.g. 127.0.0.1 left behind by a VPN,
 * Docker, or a local DNS proxy that isn't running), so every SRV lookup fails
 * with ECONNREFUSED even though `nslookup` works fine. That surfaces downstream
 * as "Operation `users.findOne()` buffering timed out" because the connection
 * never opens.
 *
 * If DNS_SERVERS is set, honor it. Otherwise, only when the resolver is
 * unusable (loopback-only) do we fall back to public DNS so SRV can resolve.
 */
function ensureUsableDnsServers() {
  const override = (process.env.DNS_SERVERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (override.length) {
    dns.setServers(override);
    logger.info({ servers: override }, 'DNS resolvers set from DNS_SERVERS.');
    return;
  }

  const current = dns.getServers();
  const loopbackOnly =
    current.length === 0 ||
    current.every((s) => s === '127.0.0.1' || s === '::1' || s.startsWith('127.'));

  if (loopbackOnly) {
    const fallback = ['8.8.8.8', '1.1.1.1'];
    dns.setServers(fallback);
    logger.warn(
      { was: current, now: fallback },
      'Node DNS resolver was loopback-only and cannot resolve SRV records; falling back to public DNS. Set DNS_SERVERS to override.'
    );
  }
}

// Vercel sets this on every deployment. On serverless each cold invocation is
// its own process with its own pool, so the long-lived-server tuning below is
// actively harmful there — see the pool options in connectMongo.
const IS_SERVERLESS = Boolean(process.env.VERCEL);

// Reused across invocations. On a warm lambda the module scope survives, so a
// second call returns the in-flight (or settled) promise instead of dialing
// Atlas again. Also collapses concurrent callers onto one connect.
let connectionPromise = null;

/**
 * Connect to MongoDB. Resolves on success; rejects on failure so the
 * caller (server.js) can decide whether to exit. We do NOT auto-exit
 * here — tests use an in-memory server with their own connection.
 *
 * Idempotent: safe to call on every request path as a guard.
 */
async function connectMongo(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error('MONGODB_URI is not set');

  // 1 = connected, 2 = connecting. Either way there's nothing to do.
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  if (uri.startsWith('mongodb+srv://')) ensureUsableDnsServers();

  mongoose.set('strictQuery', true);
  // Don't auto-build indexes on boot in production — that can block a large
  // collection. Indexes are defined in the schemas but built explicitly via
  // `npm run sync-indexes`. Dev keeps autoIndex on for convenience.
  mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');

  mongoose.connection.on('connected', () => logger.info('MongoDB connected.'));
  mongoose.connection.on('error', (err) => logger.error({ err: err.message }, 'MongoDB error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected.'));

  connectionPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 10000,
      // On a long-lived server a warm pool makes the first request after idle
      // fast. On serverless it does the opposite: every cold start pays for
      // opening minPoolSize sockets (TLS handshake each) before it can answer,
      // and N concurrent lambdas × that pool will exhaust the Atlas connection
      // limit. One connection, opened lazily, is what a lambda actually needs.
      maxPoolSize: IS_SERVERLESS ? 5 : 20,
      minPoolSize: IS_SERVERLESS ? 0 : 5,
    })
    .then(() => mongoose.connection)
    .catch((err) => {
      connectionPromise = null; // let the next request retry rather than cache the failure
      throw err;
    });

  return connectionPromise;
}

async function disconnectMongo() {
  connectionPromise = null;
  await mongoose.connection.close();
}

module.exports = { connectMongo, disconnectMongo };
