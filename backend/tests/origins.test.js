'use strict';

// FRONTEND_URL must be read fresh per test, since config/origins.js parses it
// at require time. Isolate the module registry rather than mutate the shared
// cache other suites might pick up.
function loadOrigins(frontendUrl) {
  jest.resetModules();
  // Assigning `undefined` to process.env coerces to the string "undefined" —
  // deleting is the only way to actually unset it.
  if (frontendUrl === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = frontendUrl;
  return require('../src/config/origins');
}

const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;
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
