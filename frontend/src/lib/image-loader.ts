"use client";

/**
 * Image loader that keeps covers off Vercel's Image Optimization API.
 *
 * Why: that API is metered, and when the allowance runs out it answers every
 * request with `402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` — not an image.
 * `next/image` fires `onError`, `BookCover` swaps in its titled placeholder, and
 * the catalogue renders as a wall of grey boxes. Only widths already cached at
 * the edge survive, which is why *some* covers kept working.
 *
 * Every cover already lives on Cloudinary, which resizes and format-converts on
 * its own (and is already paid for), so re-optimising through Vercel bought us
 * nothing but a bill and a single point of failure. This hands the resize to
 * Cloudinary and passes everything else through untouched.
 *
 * `c_limit` only ever scales down, so a small cover is never upscaled into a
 * blurry one; `f_auto` still yields AVIF/WebP to browsers that accept them.
 */
export default function cloudinaryLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const UPLOAD = "/image/upload/";

  if (src.includes("res.cloudinary.com") && src.includes(UPLOAD)) {
    const [base, rest] = src.split(UPLOAD);
    // Bail out if a transformation is already baked into the URL rather than
    // stacking a second one on top of it.
    if (/^[a-z]_[^/]+\//.test(rest)) return src;
    return `${base}${UPLOAD}f_auto,q_${quality ?? "auto"},w_${width},c_limit/${rest}`;
  }

  // Local assets (/logo-full.png) and other hosts: serve as-is. Unoptimised,
  // but served — which beats a 402 for something as load-bearing as the logo.
  return src;
}
