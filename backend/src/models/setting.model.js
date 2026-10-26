'use strict';

const mongoose = require('mongoose');

/**
 * Small site-wide settings that an admin changes from the dashboard and the
 * API reads back, keyed by name. One document per key: the homepage rails'
 * shuffle seed (services/homepageRails.js) and the NCM drop-off branch and
 * delivery type (routes/ncmAdmin.route.js).
 */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
