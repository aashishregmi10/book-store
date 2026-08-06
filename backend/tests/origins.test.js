'use strict';

// Stubbed because these tests call jest.resetModules() repeatedly, and the real
// logger builds a pino-pretty transport — which spawns a worker thread per
// re-require and leaves them open after the suite finishes.
jest.mock('../src/config/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// FRONTEND_URL must be read fresh per test, since config/origins.js parses it
// at require time. Isolate the module registry rather than mutate the shared
// cache other suites might pick up.
//
// The logger is returned alongside because resetModules re-runs the jest.mock
// factory — a reference captured at file scope would be a different object
// from the one the freshly-loaded origins module actually calls.
function loadOrigins(frontendUrl) {
  jest.resetModules();
  // Assigning `undefined` to process.env coerces to the string "undefined" —
  // deleting is the only way to actually unset it.
  if (frontendUrl === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = frontendUrl;
  return { ...require('../src/config/origins'), logger: require('../src/config/logger') };
}

const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;
beforeEach(() => jest.clearAllMocks());
afterEach(() => {
  process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
});

describe('config/origins', () => {
  // Regression: a platform like Vercel keeps a project's default *.vercel.app
  // URL live alongside a freshly attached custom domain. A single-origin CORS
  // config then rejects sign-in from whichever one isn't configured — this is
  // exactly what broke Google Sign-In right after buying bookstemple.com.
  it('accepts every origin in a comma-separated FRONTEND_URL', () => {
    const { allowedOrigins, canonicalOrigin, corsOriginCheck } = loadOrigins(
      'https://www.bookstemple.com,https://book-store-tawny-two.vercel.app'
    );

    expect(allowedOrigins).toEqual([
      'https://www.bookstemple.com',
      'https://book-store-tawny-two.vercel.app',
    ]);
    expect(canonicalOrigin).toBe('https://www.bookstemple.com'); // first entry wins for link-building

    for (const origin of allowedOrigins) {
      const cb = jest.fn();
      corsOriginCheck(origin, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    }
  });

  it('rejects an origin not in the list', () => {
    const { corsOriginCheck } = loadOrigins('https://www.bookstemple.com');
    const cb = jest.fn();
    corsOriginCheck('https://evil.example.com', cb);
    expect(cb).toHaveBeenCalledWith(null, false);
  });

  // The browser only reports that the header is "not present", which says
  // nothing about what the server would accept. The logs have to carry that.
  it('logs the rejected origin AND the live allow-list, once per origin', () => {
    const { corsOriginCheck, logger } = loadOrigins('https://book-store-tawny-two.vercel.app');

    corsOriginCheck('https://www.bookstemple.com', jest.fn());
    corsOriginCheck('https://www.bookstemple.com', jest.fn()); // repeat

    expect(logger.warn).toHaveBeenCalledTimes(1); // deduped
    const [details, message] = logger.warn.mock.calls[0];
    expect(details.origin).toBe('https://www.bookstemple.com');
    expect(details.allowedOrigins).toEqual(['https://book-store-tawny-two.vercel.app']);
    expect(message).toMatch(/FRONTEND_URL/);
  });

  it('allows requests with no Origin header (curl, server-to-server, same-origin)', () => {
    const { corsOriginCheck } = loadOrigins('https://www.bookstemple.com');
    const cb = jest.fn();
    corsOriginCheck(undefined, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('trims whitespace and trailing slashes around each entry', () => {
    const { allowedOrigins } = loadOrigins(' https://www.bookstemple.com/ , https://foo.vercel.app ');
    expect(allowedOrigins).toEqual(['https://www.bookstemple.com', 'https://foo.vercel.app']);
  });

  it('falls back to localhost:3000 when unset', () => {
    const { allowedOrigins, canonicalOrigin } = loadOrigins(undefined);
    expect(allowedOrigins).toEqual(['http://localhost:3000']);
    expect(canonicalOrigin).toBe('http://localhost:3000');
  });
});
