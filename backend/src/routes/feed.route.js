"use strict";

const express = require("express");
const Book = require("../models/book.model");
const { withCache } = require("../utils/cache");
const { canonicalOrigin } = require("../config/origins");

const router = express.Router();

// FRONTEND_URL can list several allowed CORS origins now (config/origins.js);
// the first is canonical and is what every built link here uses.
const FRONTEND = canonicalOrigin;

const esc = (s = "") =>
  String(s).replace(
    /[<>&'"]/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[c],
  );

// Google product taxonomy id for "Media > Books".
const BOOKS_CATEGORY = "784";

function validXmlText(value) {
  return Array.from(String(value), (char) => char.codePointAt(0))
    .filter(
      (codePoint) =>
        codePoint === 0x09 ||
        codePoint === 0x0a ||
        codePoint === 0x0d ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff),
    )
    .map((codePoint) => String.fromCodePoint(codePoint))
    .join("");
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    copy: "©",
    hellip: "…",
    gt: ">",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    rdquo: "”",
    reg: "®",
    rsquo: "’",
    trade: "™",
  };

  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (entity, value) => {
    if (value[0] !== "#") {
      const key = value.toLowerCase();
      return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : entity;
    }

    const codePoint = value[1].toLowerCase() === "x"
      ? Number.parseInt(value.slice(2), 16)
      : Number.parseInt(value.slice(1), 10);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  });
}

function plainText(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, maxLength) {
  return Array.from(value).slice(0, maxLength).join("");
}

function httpsImageUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function validIsbn(book) {
  for (const candidate of [book.isbn, book.specifications?.isbn10]) {
    const isbn = String(candidate || "").replace(/[\s-]/g, "");
    if (/^(?:\d{10}|\d{13})$/.test(isbn)) return isbn;
  }
  return null;
}

function buildItem(b) {
  const image = httpsImageUrl(b.coverImage?.secureUrl);
  const price = Number(b.price);
  if (
    !b._id ||
    !b.slug ||
    !String(b.title || "").trim() ||
    !image ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !["in-stock", "low-stock"].includes(b.stockStatus)
  ) {
    return "";
  }

  const title = truncate(String(b.title).trim(), 150);
  const author = String(b.author || "").trim();
  const publisher = String(b.specifications?.publisher || "").trim();
  const description = truncate(
    plainText(b.description) || [title, author].filter(Boolean).join(" by "),
    5000,
  );
  const isbn = validIsbn(b);
  const onSale = Number.isFinite(Number(b.comparePrice)) && Number(b.comparePrice) > price;
  const listPrice = onSale ? Number(b.comparePrice) : price;
  const idTag = isbn
    ? `<g:gtin>${esc(validXmlText(isbn))}</g:gtin>`
    : "<g:identifier_exists>no</g:identifier_exists>";
  const salePrice = onSale
    ? `<g:sale_price>${price.toFixed(2)} NPR</g:sale_price>`
    : "";
  // No <g:shipping>: the courier bills the customer directly at its own rates
  // (see services/pricing.js), so there is no per-item shipping price the shop
  // can honestly declare. Merchant Center falls back to the account-level
  // shipping settings, which is where a real rate table belongs a made-up
  // per-item figure here would be an item-level price mismatch.
  return `
    <item>
      <g:id>${esc(validXmlText(b._id))}</g:id>
      <g:title>${esc(validXmlText(title))}</g:title>
      <g:description>${esc(validXmlText(description))}</g:description>
      <g:link>${esc(validXmlText(`${FRONTEND}/books/${b.slug}`))}</g:link>
      <g:image_link>${esc(validXmlText(image))}</g:image_link>
      <g:availability>in_stock</g:availability>
      <g:price>${listPrice.toFixed(2)} NPR</g:price>
      ${salePrice}
      <g:brand>${esc(validXmlText(publisher || author))}</g:brand>
      <g:condition>new</g:condition>
      ${idTag}
      <g:google_product_category>${BOOKS_CATEGORY}</g:google_product_category>
    </item>`;
}

// ── GET /api/feed/products.xml — Google Merchant / Shopping feed ──
router.get("/products.xml", async (_req, res, next) => {
  try {
    const xml = await withCache("product_feed:v2", 86400, async () => {
      const books = await Book.find({
        isActive: true,
        stock: { $gt: 0 },
        stockStatus: { $in: ["in-stock", "low-stock"] },
      })
        .select(
          "_id slug title author description price comparePrice stock stockStatus coverImage isbn specifications.publisher specifications.isbn10",
        )
        .lean();
      const items = books.map(buildItem).filter(Boolean).join("");
      return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Books Temple Nepal</title>
    <link>${esc(validXmlText(FRONTEND))}</link>
    <description>Books available at Books Temple Nepal, with NPR pricing and cash on delivery across Nepal.</description>${items}
  </channel>
</rss>`;
    });
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.set(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=86400",
    );
    return res.send(xml);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
module.exports.buildItem = buildItem;
