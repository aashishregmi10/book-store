'use strict';

const nodemailer = require('nodemailer');
const logger = require('../config/logger');

const FROM = process.env.EMAIL_FROM || 'PageTurn Nepal <noreply@pageturn.com.np>';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3000';

// Configured only when a real SMTP password is present (not the template placeholder).
const isConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_PASS !== 'your-gmail-app-password'
);

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// Editorial-palette HTML shell. Inline styles (email clients ignore <style>/classes).
function shell(heading, bodyHtml, accent = '#2D5A3D') {
  return `<!doctype html><html><body style="margin:0;background:#FAF7F2;font-family:Georgia,'Times New Roman',serif;color:#1C1C1C;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:22px;font-weight:bold;color:${accent};letter-spacing:0.5px;">PageTurn Nepal</div>
    <div style="height:1px;background:#E7E0D4;margin:16px 0 24px;"></div>
    <h1 style="font-size:24px;margin:0 0 16px;">${heading}</h1>
    ${bodyHtml}
    <div style="height:1px;background:#E7E0D4;margin:28px 0 16px;"></div>
    <div style="font-size:12px;color:#8C7B6B;">Books worth reading, delivered across Nepal · Kathmandu</div>
  </div></body></html>`;
}

function button(label, href, accent = '#2D5A3D') {
  return `<a href="${href}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:12px 22px;font-family:Arial,sans-serif;font-size:14px;">${label}</a>`;
}

/** Never throws — logs and returns false on failure so callers can fire-and-forget. */
async function send({ to, subject, html }) {
  if (!isConfigured) {
    logger.info({ to: '[redacted]', subject }, 'Email (SMTP not configured) — skipped send, would have delivered.');
    return false;
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    logger.info({ subject }, 'Email sent.');
    return true;
  } catch (err) {
    logger.warn({ err: err.message, subject }, 'Email send failed.');
    return false;
  }
}

const nf = (n) => `NPR ${Number(n).toLocaleString('en-IN')}`;

// ── Templates (Master Guide §7.2) ────────────────────────
function sendWelcomeEmail(user) {
  const html = shell(
    `Welcome, ${user.fullName.split(' ')[0]} 📚`,
    `<p>You've got <strong>${user.points} points</strong> in your account already — a little something to start your shelf.</p>
     <p>${button('Browse the shop', FRONTEND)}</p>`
  );
  return send({ to: user.email, subject: 'Welcome to PageTurn Nepal', html });
}

function sendOrderConfirmation(user, order) {
  const rows = order.items
    .map((i) => `<tr><td style="padding:6px 0;">${i.title} ×${i.quantity}</td><td style="text-align:right;font-family:monospace;">${nf(i.price * i.quantity)}</td></tr>`)
    .join('');
  const html = shell(
    `Order confirmed`,
    `<p>Thank you, ${order.deliveryAddress.fullName}. Your order <strong>${order.orderNumber}</strong> is in.</p>
     <table style="width:100%;border-collapse:collapse;margin:12px 0;">${rows}
       <tr><td style="padding-top:10px;border-top:1px solid #E7E0D4;">Total (${order.paymentMethod.toUpperCase()})</td>
       <td style="padding-top:10px;border-top:1px solid #E7E0D4;text-align:right;font-family:monospace;font-weight:bold;">${nf(order.total)}</td></tr>
     </table>
     <p>${button('Track your order', `${FRONTEND}/account/orders`)}</p>`
  );
  return send({ to: user.email, subject: `Order ${order.orderNumber} confirmed`, html });
}

function sendOrderStatusUpdate(user, order) {
  const html = shell(
    `Order ${order.status}`,
    `<p>Your order <strong>${order.orderNumber}</strong> is now <strong>${order.status}</strong>.</p>
     <p>${button('View order', `${FRONTEND}/account/orders`)}</p>`
  );
  return send({ to: user.email, subject: `Update on order ${order.orderNumber}`, html });
}

function sendPasswordReset(user, rawToken) {
  const link = `${FRONTEND}/auth/reset-password?token=${rawToken}`;
  const html = shell(
    `Reset your password`,
    `<p>We received a request to reset your password. This link expires in <strong>1 hour</strong>.</p>
     <p>${button('Choose a new password', link)}</p>
     <p style="font-size:12px;color:#8C7B6B;">If you didn't request this, you can safely ignore this email.</p>`
  );
  return send({ to: user.email, subject: 'Reset your PageTurn password', html });
}

function sendLowStockAlert(adminEmail, books) {
  const list = books.map((b) => `<li>${b.title} — <strong>${b.stock}</strong> left</li>`).join('');
  const html = shell(`Low stock alert`, `<ul>${list}</ul><p>${button('Open inventory', `${FRONTEND}/admin/inventory`, '#9B2C2C')}</p>`, '#9B2C2C');
  return send({ to: adminEmail, subject: `Low stock: ${books.length} book(s) need attention`, html });
}

function sendPriceDrop(user, book, oldPrice, newPrice) {
  const link = `${FRONTEND}/books/${book.slug}`;
  const saved = Math.max(0, oldPrice - newPrice);
  const cover = book.coverImage?.secureUrl
    ? `<img src="${book.coverImage.secureUrl}" alt="" width="96" style="display:block;border:1px solid #E7E0D4;border-radius:4px;" />`
    : '';
  const html = shell(
    `Price drop on your wishlist`,
    `<p>Good news, ${user.fullName.split(' ')[0]} — a book you saved just got cheaper.</p>
     <table style="margin:16px 0;"><tr>
       <td style="padding-right:14px;vertical-align:top;">${cover}</td>
       <td style="vertical-align:top;">
         <div style="font-size:18px;font-weight:bold;">${book.title}</div>
         <div style="color:#8C7B6B;margin:2px 0 10px;">${book.author || ''}</div>
         <div>
           <span style="text-decoration:line-through;color:#8C7B6B;font-family:monospace;">${nf(oldPrice)}</span>
           &nbsp;<strong style="color:#2D5A3D;font-size:20px;font-family:monospace;">${nf(newPrice)}</strong>
         </div>
         <div style="color:#9B2C2C;font-size:13px;margin-top:4px;">You save ${nf(saved)}</div>
       </td>
     </tr></table>
     <p>${button('Grab it now', link)}</p>
     <p style="font-size:12px;color:#8C7B6B;">You're getting this because it's on your wishlist. Turn off price alerts anytime in your account settings.</p>`
  );
  return send({ to: user.email, subject: `Price drop: ${book.title}`, html });
}

function sendPointsEarned(user, points) {
  const html = shell(
    `You earned ${points} points 🎉`,
    `<p style="font-size:32px;font-weight:bold;color:#2D5A3D;">+${points}</p>
     <p>Your balance is now <strong>${user.points}</strong> points.</p>
     <p>${button('See your rewards', `${FRONTEND}/account/points`)}</p>`
  );
  return send({ to: user.email, subject: `You earned ${points} points`, html });
}

module.exports = {
  isConfigured,
  sendWelcomeEmail,
  sendOrderConfirmation,
  sendOrderStatusUpdate,
  sendPasswordReset,
  sendLowStockAlert,
  sendPointsEarned,
  sendPriceDrop,
};
