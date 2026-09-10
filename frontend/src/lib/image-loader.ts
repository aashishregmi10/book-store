"use client";

/**
 * Picks which stored cover file `next/image` should request.
 *
 * There are two eras of history in this one function, and both are worth
 * knowing before changing it.
 *
 * It used to route resizing through Cloudinary, to keep covers off Vercel's
 * Image Optimization API — that API is metered and answers `402` once the
 * allowance is spent, which turns the catalogue into a wall of grey
 * placeholders. That reasoning still holds, and is why this file exists at all.
 *
 * What it got wrong was assuming Cloudinary's own meter was unlimited. It was
 * not. `next/image` asks for one URL per srcset width, and ten of this app's
 * call sites pass a pixel-only `sizes` (`"64px"`, `"44px"`) — which Next does
 * not narrow, so it emits all sixteen default widths. Every one of those became
 * a separately billed derived asset, and a 64px wishlist thumbnail was quietly
 * commissioning a 3840px render. The free tier went, the account was
 * deactivated, and every cover on the site 401'd at once.
 *
 * So covers now live in Cloudflare R2 as exactly two pre-built files, written
 * by backend/scripts/migrate-covers-to-r2.js:
 *
 *   covers/<slug>.webp       720px — detail pages
 *   covers/<slug>-300.webp   300px — cards, drawers, thumbnails (~8KB vs ~25KB)
 *
 * This maps a requested width onto one of them. There is no meter to run up:
 * whatever Next asks for resolves to one of two static objects, and R2 charges
 * nothing for egress. The srcset can be as silly as it likes.
 */

// Anything wider than this gets the full-size file. 300 is the stored thumbnail
// width, so asking for exactly 300 should not upscale a 300px file.
const THUMB_MAX = 300;

export default function coverLoader({ src, width }: { src: string; width: number }): string {
  // Only our own cover objects have a -300 sibling. Everything else — local
  // /public assets, Google avatars, Open Library seeds, and the covers still
  // stranded on the dead Cloudinary host — is served exactly as given.
  if (src.includes("/covers/") && src.endsWith(".webp") && !src.includes("-300.webp")) {
    if (width <= THUMB_MAX) return src.replace(/\.webp$/, "-300.webp");
  }
  return src;
}
