'use strict';

/*
 * Submit the whole site to IndexNow once.
 *
 * pingIndexNow() covers the steady state — one admin edit, one ping. It cannot
 * cover a backlog: ~930 books were published by script over the past week and
 * the scripts don't ping, so Bing and Yandex have never been told they exist.
 * This is the catch-up pass, and it should be needed rarely.
 *
 * The URL list is read from the live sitemap rather than rebuilt from Mongo, so
 * it submits exactly what the site publicly claims is indexable — same shards,
 * same filtering, no risk of announcing a URL the sitemap excludes.
 *
 * IndexNow accepts 10,000 URLs per request; this batches well under that and
 * pauses between batches. Google does not consume IndexNow — this is Bing,
 * Yandex, Seznam and Naver.
 *
 * Dry run by default.
 *   node scripts/indexnow-submit-all.js
 *   node scripts/indexnow-submit-all.js --apply
 */

require('dotenv').config({ quiet: true });

const logger = require('../src/config/logger');

const ENDPOINT = 'https://api.indexnow.org/indexnow';
const SITE = process.env.FRONTEND_URL || 'https://www.bookstemple.com';
const BATCH = 2000;
const PAUSE_MS = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

(async function main() {
  const apply = process.argv.includes('--apply');
  const key = process.env.INDEXNOW_KEY;

  // The key file is the proof of ownership; if it doesn't match, every
  // submission is rejected with 403 and it is worth failing before sending.
  const hosted = (await fetchText(`${SITE}/indexnow-key.txt`)).trim();
  if (!hosted) throw new Error(`${SITE}/indexnow-key.txt is empty — set NEXT_PUBLIC_INDEXNOW_KEY and redeploy`);
  if (!key) throw new Error('INDEXNOW_KEY is not set in this environment');
  if (key !== hosted) throw new Error(`key mismatch: env=${key.slice(0, 8)}… hosted=${hosted.slice(0, 8)}…`);
  console.log(`key verified (${hosted.slice(0, 8)}…) against ${SITE}/indexnow-key.txt`);

  const index = await fetchText(`${SITE}/sitemap.xml`);
  const children = locs(index);
  console.log(`sitemap index lists ${children.length} child sitemaps`);

  const urls = [];
  for (const child of children) {
    const found = locs(await fetchText(child));
    console.log(`  ${child.replace(SITE, '')}: ${found.length}`);
    urls.push(...found);
  }
  const unique = [...new Set(urls)];
  console.log(`\n${unique.length} unique URLs (${urls.length - unique.length} duplicates dropped)`);

  const batches = [];
  for (let i = 0; i < unique.length; i += BATCH) batches.push(unique.slice(i, i + BATCH));
  console.log(`${batches.length} batches of up to ${BATCH}`);

  if (!apply) {
    console.log('\nDRY RUN — nothing submitted. Re-run with --apply.');
    console.log('first 3 URLs:', unique.slice(0, 3).join('  '));
    return;
  }

  const host = SITE.replace(/^https?:\/\//, '');
  let sent = 0;
  for (const [i, batch] of batches.entries()) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `${SITE}/indexnow-key.txt`, urlList: batch }),
    });
    // 200 accepted, 202 accepted pending key validation. Anything else matters.
    console.log(`  batch ${i + 1}/${batches.length}: ${batch.length} URLs -> HTTP ${res.status}`);
    if (res.status !== 200 && res.status !== 202) {
      console.log('    body:', (await res.text()).slice(0, 300));
      throw new Error(`batch ${i + 1} rejected with ${res.status}`);
    }
    sent += batch.length;
    if (i < batches.length - 1) await sleep(PAUSE_MS);
  }

  logger.info({ submitted: sent, batches: batches.length }, 'IndexNow full submission complete');
  console.log(`\nsubmitted ${sent} URLs.`);
  console.log('Bing Webmaster Tools shows these under Configure My Site > IndexNow within a day or so.');
})().catch((err) => {
  logger.error({ err: err.message }, 'indexnow-submit-all failed');
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
