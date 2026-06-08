'use strict';

const express = require('express');
const Book = require('../models/book.model');
const { withCache } = require('../utils/cache');

const router = express.Router();

const FRONTEND = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

const esc = (s = '') =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

// Google product taxonomy id for "Media > Books".
const BOOKS_CATEGORY = '784';

function buildItem(b) {
  const link = `${FRONTEND}/books/${b.slug}`;
  const soldOut = b.stockStatus === 'out-of-stock' || b.stockStatus === 'discontinued';
  const onSale = b.comparePrice && b.comparePrice > b.price;
  const listPrice = onSale ? b.comparePrice : b.price;
  const desc = (b.description || `${b.title} by ${b.author}`).slice(0, 4900);
  const idTag = b.isbn ? `<g:gtin>${esc(b.isbn)}</g:gtin>` : '<g:identifier_exists>no</g:identifier_exists>';
  const salePrice = onSale ? `<g:sale_price>${b.price}.00 NPR</g:sale_price>` : '';
  return `
    <item>
      <g:id>${esc(b._id)}</g:id>
      <g:title>${esc(b.title)} by ${esc(b.author)}</g:title>
      <g:description>${esc(desc)}</g:description>
      <g:link>${esc(link)}</g:link>
      <g:image_link>${esc(b.coverImage?.secureUrl || '')}</g:image_link>
      <g:availability>${soldOut ? 'out_of_stock' : 'in_stock'}</g:availability>
      <g:price>${listPrice}.00 NPR</g:price>
      ${salePrice}
      <g:brand>${esc(b.specifications?.publisher || 'PageTurn Nepal')}</g:brand>
      <g:condition>${b.condition === 'used' ? 'used' : 'new'}</g:condition>
      ${idTag}
      <g:google_product_category>${BOOKS_CATEGORY}</g:google_product_category>
      <g:product_type>${esc(b.genre)}</g:product_type>
      <g:shipping><g:country>NP</g:country><g:price>${b.price >= 1500 ? '0.00' : '120.00'} NPR</g:price></g:shipping>
    </item>`;
}

// ── GET /api/feed/products.xml — Google Merchant / Shopping feed ──
router.get('/products.xml', async (_req, res, next) => {
  try {
    const xml = await withCache('product_feed', 3600, async () => {
      const books = await Book.find({ isActive: true })
        .select('slug title author description price comparePrice stockStatus coverImage isbn condition specifications genre')
        .limit(50000)
        .lean();
      const items = books.map(buildItem).join('');
      return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>PageTurn Nepal — Books</title>
    <link>${FRONTEND}</link>
    <description>Books available at PageTurn Nepal, with NPR pricing and cash on delivery across Nepal.</description>${items}
  </channel>
</rss>`;
    });
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.send(xml);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
