'use strict';

/**
 * New Relic agent config. Secrets come from env (NEW_RELIC_LICENSE_KEY); the
 * agent is only actually started from server.js in production with a key set,
 * so dev and tests never connect to New Relic.
 */
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'Books Temple Nepal API'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  distributed_tracing: { enabled: true },
  logging: { level: process.env.NEW_RELIC_LOG_LEVEL || 'info' },
  application_logging: { forwarding: { enabled: true } },
  allow_all_headers: true,
  attributes: {
    // Never send these to New Relic.
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x*',
      'response.headers.cookie',
      'response.headers.authorization',
    ],
  },
};
