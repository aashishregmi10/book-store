'use strict';

// Turn Daraz's raw product "description" (boilerplate disclaimer + spec lines +
// a "Specifications" trailer, sometimes with a real blurb in the middle) into a
// clean book description — or, when nothing usable remains, a tidy generated one.

// Strip Daraz bidi/zero-width separators that wrap spec values ("ISBN-13 ‏ : ‎ …").
const stripInvisible = (s) => s.replace(/[​-‏‪-‮﻿]/g, '');

// Lines that are pure metadata/boilerplate, not prose — dropped from the blurb.
const JUNK_LINE = /^\s*(language|paperback|hardback|hardcover|binding|isbn[-\s]?1[03]|isbn\/issn|isbn|item\s*weight|weight|dimensions|genre|age\s*group|publisher|brand|sku|what['’]s in the box|country of origin|model)\b/i;

const DISCLAIMER = /the image provided here is only for reference purpose\.[\s\S]*?consuming a product\./i;

/**
 * Clean a raw Daraz description down to real prose. Returns '' when only
 * boilerplate/specs remain.
 */
function cleanDaraz(raw) {
  if (!raw) return '';
  let text = stripInvisible(String(raw));
  text = text.replace(DISCLAIMER, ' ');
  // Drop everything from a "Specifications" heading onward (brand/sku/etc. dump).
  text = text.replace(/\bSpecifications\b[\s\S]*$/i, ' ');
  // Keep only prose lines (drop spec lines), and drop exact duplicate lines
  // (Daraz often repeats the product title several times).
  const seen = new Set();
  const prose = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !JUNK_LINE.test(l))
    .filter((l) => { const k = l.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .join('\n');
  return prose.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n\n').trim();
}

/**
 * True when `text` is a usable description: it has ≥ ~40 chars of real content
 * *beyond* the title (Daraz often leaves only the product name echoed back).
 */
function isMeaningful(text, title = '') {
  if (!text) return false;
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let body = norm(text);
  const nt = norm(title);
  if (nt) body = body.split(nt).join(' ').replace(/\s+/g, ' ').trim(); // remove title occurrences
  return body.length >= 40;
}

/**
 * Last-resort description composed from the book's own fields, in the Books Temple
 * bookseller voice (BLUF-style opening sentence). Always returns ≥ 40 chars.
 */
function templateDescription({ title, author, pages, format, language }) {
  const by = author && author !== 'Unknown' ? ` by ${author}` : '';
  const bits = [];
  if (format) bits.push(format.toLowerCase());
  if (language) bits.push(`${language}-language`);
  const edition = bits.length ? ` This ${bits.join(', ')} edition` : ' This edition';
  const pagePart = pages ? ` runs ${pages} pages and` : '';
  return (
    `${title}${by} is available now at Books Temple Nepal.${edition}${pagePart} ships across Nepal with cash on delivery. ` +
    `A fuller description is on the way — in the meantime, tap through for price, format, and availability.`
  ).trim();
}

/** Pull a "Genre : X" hint from the raw Daraz text, if present. */
function genreHint(raw) {
  if (!raw) return '';
  const m = stripInvisible(String(raw)).match(/\bGenre\s*[:：]\s*([A-Za-z &,/-]+)/i);
  if (!m) return '';
  return m[1].split(/[,/]/)[0].trim(); // first genre token, e.g. "Hinduism, Religion" → "Hinduism"
}

module.exports = { cleanDaraz, isMeaningful, templateDescription, genreHint };
