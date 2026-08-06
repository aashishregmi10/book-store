'use strict';

const logger = require('../config/logger');
const { canonicalOrigin } = require('../config/origins');

// IndexNow lets us notify Bing/Yandex/Seznam (and, increasingly, others) the
// moment a URL changes — far faster than waiting for a recrawl. The frontend
// serves the key file at /indexnow-key.txt (see frontend app/indexnow-key.txt).
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/**
 * Fire-and-forget IndexNow ping. `paths` are site-relative (e.g. '/books/slug')
 * or absolute URLs. No-ops if INDEXNOW_KEY isn't configured.
 */
function pingIndexNow(paths = []) {
  const key = process.env.INDEXNOW_KEY;
  const frontend = canonicalOrigin;
  if (!key || !frontend || !paths.length || typeof fetch !== 'function') return;

  const host = frontend.replace(/^https?:\/\//, '');
  const urlList = paths.map((p) => (p.startsWith('http') ? p : `${frontend}${p}`));

  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation: `${frontend}/indexnow-key.txt`, urlList }),
  })
    .then((res) => {
      if (!res.ok) logger.warn({ status: res.status }, 'IndexNow ping non-2xx');
    })
    .catch((err) => logger.warn({ err: err.message }, 'IndexNow ping failed'));
}

module.exports = { pingIndexNow };
