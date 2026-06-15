'use strict';

require('dotenv').config({ quiet: true });

// New Relic APM — must load before the app modules it instruments. Only in
// production with a license key, so dev/tests never connect. (Config: newrelic.js)
if (process.env.NODE_ENV === 'production' && process.env.NEW_RELIC_LICENSE_KEY) {
  require('newrelic');
}

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const logger = require('./config/logger');
const { connectMongo, disconnectMongo } = require('./config/database');
const { initRedis, closeRedis } = require('./config/redis');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// ── Socket.IO (real-time order/inventory events — Phase 2) ──
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true },
});
io.on('connection', (socket) => {
  socket.on('join:user', (userId) => userId && socket.join(`user:${userId}`));
  socket.on('join:admin', () => socket.join('admin'));
});
// Expose io to routes via app for emitting events later.
app.set('io', io);

async function start() {
  initRedis(); // non-blocking; degrades gracefully

  try {
    await connectMongo();
  } catch (err) {
    // Don't hard-exit in dev so the health endpoint stays up while you fix the URI.
    logger.error({ err: err.message }, 'Initial MongoDB connection failed — API up, DB-backed routes will error until fixed.');
  }

  server.listen(PORT, () => logger.info(`PageTurn API listening on :${PORT}`));
}

// ── Graceful shutdown ────────────────────────────────────
async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down…');
  server.close(async () => {
    await Promise.allSettled([disconnectMongo(), closeRedis()]);
    logger.info('Closed cleanly.');
    process.exit(0);
  });
  // Force-exit if close hangs.
  setTimeout(() => process.exit(1), 10000).unref();
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use — kill the existing process and restart.`);
  } else {
    logger.error({ err: err.message }, 'Server error');
  }
  process.exit(1);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled promise rejection'));

start();

module.exports = { server, io };
