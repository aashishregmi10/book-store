'use strict';

// Test-wide defaults. Individual suites that need a database import
// ./db.js and manage their own connect/clear/close lifecycle, so the
// fast tests (e.g. health) never pay the in-memory-Mongo startup cost.

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long-xx';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
