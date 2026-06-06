'use strict';

const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * Connect to MongoDB. Resolves on success; rejects on failure so the
 * caller (server.js) can decide whether to exit. We do NOT auto-exit
 * here — tests use an in-memory server with their own connection.
 */
async function connectMongo(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error('MONGODB_URI is not set');

  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => logger.info('MongoDB connected.'));
  mongoose.connection.on('error', (err) => logger.error({ err: err.message }, 'MongoDB error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected.'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
  });

  return mongoose.connection;
}

async function disconnectMongo() {
  await mongoose.connection.close();
}

module.exports = { connectMongo, disconnectMongo };
