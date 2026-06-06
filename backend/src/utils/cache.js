'use strict';

const { cacheGet, cacheSet } = require('../config/redis');

/**
 * Cache-aside helper. Returns cached value if present, otherwise runs
 * `producer`, caches the result, and returns it. Fully degrades: if
 * Redis is down, both get and set no-op and `producer` always runs.
 *
 * Cache key namespaces (Master Guide §7.6):
 *   books_list:*  book:<slug>  suggestions:*  filters_metadata  featured_books  genres_list  genre:<slug>
 */
async function withCache(key, ttlSeconds, producer) {
  const hit = await cacheGet(key);
  if (hit !== null && hit !== undefined) return hit;
  const value = await producer();
  if (value !== null && value !== undefined) await cacheSet(key, value, ttlSeconds);
  return value;
}

module.exports = { withCache };
