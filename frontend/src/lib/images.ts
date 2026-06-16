// Cloudinary delivery transforms for crawlable cover images.
//
// f_auto lets Cloudinary serve the best format per client (AVIF/WebP to crawlers
// that accept them), and q_auto trims bytes with no visible quality loss — both
// improve Google Image indexing and Core Web Vitals. Non-Cloudinary URLs (e.g.
// seed covers from openlibrary.org) have no /upload/ segment and pass through
// untouched.
export function cloudinaryAuto(url?: string): string | undefined {
  if (!url || !url.includes("/upload/")) return url;
  if (/\/upload\/[^/]*\b(f_auto|q_auto)\b/.test(url)) return url; // already optimized
  return url.replace("/upload/", "/upload/f_auto,q_auto/");
}
