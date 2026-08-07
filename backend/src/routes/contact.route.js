"use strict";

const express = require("express");

const ContactMessage = require("../models/contactMessage.model");
const { validate } = require("../middleware/validate");
const { optionalAuth } = require("../middleware/auth");
const { z, trimmedString, email: emailSchema } = require("../utils/zod");
const { created } = require("../utils/apiResponse");
const email = require("../utils/emailService");
const logger = require("../config/logger");
const rateLimit = require("express-rate-limit");

const router = express.Router();

// Where contact-form notifications land. Falls back to the shop address the
// storefront already publishes, so this works without extra config
const INBOX =
  process.env.CONTACT_EMAIL ||
  process.env.ADMIN_EMAIL ||
  "bookstemple01@gmail.com";

// A public, unauthenticated write endpoint is a spam magnet — cap it per IP.
// Generous enough that a person retrying a failed send isn't punished.
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== "production",
  message: {
    message: "Too many messages, please try again later.",
    errors: [{ code: "RATE_LIMITED" }],
  },
});

const contactBody = z.object({
  name: trimmedString().max(120),
  email: emailSchema(),
  topic: z.string().trim().max(60).optional(),
  message: trimmedString().min(1).max(5000),
  // Honeypot: a field no human sees, so anything filled in is a bot. Accepted
  // and dropped rather than rejected, since a 400 tells the bot what tripped it.
  website: z.string().max(0).optional().or(z.string().optional()),
});

// ── POST /api/contact — send the shop a note ──
router.post(
  "/",
  contactLimiter,
  optionalAuth,
  validate({ body: contactBody }),
  async (req, res, next) => {
    try {
      const { name, email: from, topic, message, website } = req.body;

      if (website) {
        // Silently absorb the bot. Same response as success so it learns nothing.
        logger.info("Contact form honeypot triggered — dropped.");
        return created(res, null, "Thanks, we'll be in touch.");
      }

      // Persist first. If the notification email fails (or SMTP isn't set up at
      // all) the message still exists in the admin inbox — the form promises a
      // reply, so losing one to a bounced send is not acceptable.
      const note = await ContactMessage.create({
        name,
        email: from,
        topic,
        message,
        user: req.userId || null,
      });

      email.sendContactMessage(INBOX, note).catch(() => {}); // best-effort

      // Never log the message body or address — house rule is ids only.
      logger.info({ contactId: String(note._id) }, "Contact message received");
      return created(res, null, "Thanks, we'll be in touch.");
    } catch (err) {
      return next(err);
    }
  },
);

module.exports = router;
