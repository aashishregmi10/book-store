/**
 * The admin sign-in route.
 *
 * Deliberately not under /admin: that path is trivially guessable and draws
 * credential-stuffing bots. Keep this the single source of truth — ChromeGate
 * uses the prefix to suppress storefront chrome, and the dashboard layout
 * redirects here when a session is missing or isn't an admin. Changing the
 * path in one place must change it everywhere.
 */
export const ADMIN_LOGIN_PREFIX = "/oneechan";
export const ADMIN_LOGIN_PATH = `${ADMIN_LOGIN_PREFIX}/login`;
