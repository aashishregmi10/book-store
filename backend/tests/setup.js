'use strict';

// Test-wide defaults. Individual suites that need a database import
// ./db.js and manage their own connect/clear/close lifecycle, so the
// fast tests (e.g. health) never pay the in-memory-Mongo startup cost.

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long-xx';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Pinned, NOT defaulted with `||`. src/seed.js calls dotenv, so whatever real
// admin credentials sit in a developer's .env would otherwise leak into the
// seed suite and fail it — which is exactly what happened once the seed stopped
// hardcoding a password. Tests must not depend on ambient config.
process.env.SEED_ADMIN_EMAIL = 'seed-admin@test.local';
process.env.SEED_ADMIN_PASSWORD = 'seed-admin-test-password';
