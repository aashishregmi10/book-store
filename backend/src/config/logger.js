'use strict';

const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Structured logger. Pretty-prints in dev, JSON in prod.
 * Never log PII (emails, tokens, addresses) — log ids instead.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token', '*.refreshToken'],
    remove: true,
  },
});

module.exports = logger;
