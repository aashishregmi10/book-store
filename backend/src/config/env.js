'use strict';

const logger = require('./logger');

/**
 * Fail fast on a misconfigured deployment.
 *
 * Without this, a missing JWT_SECRET doesn't surface until the first person
 * tries to log in — the process boots, the health check reports "ok", and the
 * failure looks like a broken login page rather than a broken deploy. Config
 * errors should stop the process, not wait to be discovered by a customer.
 *
 * Only enforced in production: tests and local work rely on defaults, and
 * tests/setup.js supplies its own throwaway secret.
 */

// A JWT signed with a short secret is brute-forceable offline. 32 chars is the
// usual floor for HS256; anything less isn't worth the ceremony of signing.
const MIN_SECRET_LENGTH = 32;

const REQUIRED = [
  ['MONGODB_URI', 'the database connection string'],
  ['JWT_SECRET', 'the token signing secret'],
  ['FRONTEND_URL', 'the storefront origin — CORS and the refresh cookie depend on it'],
];

function validateEnv({ exitOnFailure = true } = {}) {
  if (process.env.NODE_ENV !== 'production') return [];

  const problems = [];

  for (const [name, why] of REQUIRED) {
    if (!process.env[name]) problems.push(`${name} is not set (${why}).`);
  }

  const secret = process.env.JWT_SECRET;
  if (secret && secret.length < MIN_SECRET_LENGTH) {
    problems.push(`JWT_SECRET is only ${secret.length} characters — use at least ${MIN_SECRET_LENGTH}.`);
  }
  // The committed template value shipping to production is a real mistake that
  // has happened to other people; name it explicitly rather than let the
  // length check wave a plausible-looking placeholder through.
  if (secret && /^(changeme|your-|secret|test)/i.test(secret)) {
    problems.push('JWT_SECRET still looks like the .env.example placeholder.');
  }

  if (process.env.FRONTEND_URL?.endsWith('/')) {
    problems.push('FRONTEND_URL has a trailing slash — it must match the browser origin exactly or CORS will reject it.');
  }

  if (problems.length) {
    logger.fatal
      ? logger.fatal({ problems }, 'Refusing to start: environment is not configured')
      : logger.error({ problems }, 'Refusing to start: environment is not configured');
    for (const p of problems) logger.error(`  · ${p}`);
    if (exitOnFailure) process.exit(1);
  }

  return problems;
}

module.exports = { validateEnv, REQUIRED, MIN_SECRET_LENGTH };
