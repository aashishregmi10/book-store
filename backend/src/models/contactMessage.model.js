'use strict';

const mongoose = require('mongoose');

/**
 * A note sent through the /contact form.
 *
 * Stored rather than only emailed, deliberately. Email delivery is
 * best-effort here (emailService no-ops when SMTP isn't configured, and
 * silently drops on provider failure), and a customer message is not something
 * we can afford to lose to a bounced send — the form promises a reply within a
 * day. The row is the record; the email is just the notification.
 */
const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    topic: { type: String, trim: true, maxlength: 60 },
    message: { type: String, required: true, trim: true, maxlength: 5000 },
    // Set when the sender happened to be signed in — lets us match a note to an
    // account without asking them to repeat themselves.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['new', 'read', 'replied'], default: 'new', index: true },
  },
  { timestamps: true }
);

// The inbox is always read newest-first.
contactMessageSchema.index({ createdAt: -1 });

module.exports =
  mongoose.models.ContactMessage || mongoose.model('ContactMessage', contactMessageSchema);
