'use strict';

const Redis = require('ioredis');
const logger = require('./logger');

/**
 * Redis is an OPTIONAL accelerator. Every helper degrades gracefully:
 * if Redis is down or unconfigured, reads return null (caller falls
 * through to Mongo) and writes are silently skipped. The app never
 * crashes because of Redis.
 */

let client = null;
let available = false;

function initRedis() {
  if (!process.env.REDIS_URL) {
    logger.warn('REDIS_URL not set — caching disabled, falling through to Mongo.');
    return null;
  }

  client = new Redis(process.env.REDIS_URL, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 200, 3000),
    reconnectOnError: () => true,
  });

  let warnedDown = false;
  client.on('ready', () => {
    available = true;
    warnedDown = false;
    logger.info('Redis connected.');
  });
  client.on('error', (err) => {
    available = false;
    // Warn once per outage so dev consoles aren't spammed by retries.
    if (!warnedDown) {
      warnedDown = true;
      logger.warn({ err: err.code || err.message }, 'Redis unavailable — caching off, falling through to Mongo.');
    }
  });
  client.on('end', () => {
    available = false;
  });

  return client;
}

async function cacheGet(key) {
  if (!available || !client) return null;
  try {
    const raw = await client.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn({ err: err.message, key }, 'cacheGet failed');
    return null;
  }
}

async function cacheSet(key, value, ttlSeconds) {
  if (!available || !client) return;
  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds) await client.set(key, payload, 'EX', ttlSeconds);
    else await client.set(key, payload);
  } catch (err) {
    logger.warn({ err: err.message, key }, 'cacheSet failed');
  }
}

async function cacheDel(pattern) {
  if (!available || !client) return;
  try {
    if (pattern.includes('*')) {
      const keys = await client.keys(pattern);
      if (keys.length) await client.del(keys);
    } else {
      await client.del(pattern);
    }
  } catch (err) {
    logger.warn({ err: err.message, pattern }, 'cacheDel failed');
  }
}

async function closeRedis() {
  if (client) {
    try { await client.quit(); } catch { /* ignore */ }
  }
}

module.exports = { initRedis, cacheGet, cacheSet, cacheDel, closeRedis, isAvailable: () => available };
