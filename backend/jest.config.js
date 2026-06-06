'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  clearMocks: true,
  // Surface open handles so we catch un-closed Mongo/Redis connections in CI.
  detectOpenHandles: true,
  forceExit: true,
};
