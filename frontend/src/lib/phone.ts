/**
 * Nepali phone validation, mirroring backend/src/utils/zod.js.
 *
 * The server is the authority — this exists so a shopper sees the problem
 * inline under the field instead of losing a filled-in checkout form to a 400.
 * Keep the two in step: this is a COD shop, the courier rings this number, and
 * an unreachable one is an undeliverable parcel.
 */

const NEPAL_MOBILE = /^9[678]\d{8}$/;

/** Digits only, with the country code and any trunk zero stripped. */
function localDigits(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^977/, "").replace(/^0+/, "");
}

export function isNepaliPhone(raw: string): boolean {
  const local = localDigits(raw);
  // 10 digits is a mobile, and only 96/97/98 prefixes are allocated.
  if (local.length === 10) return NEPAL_MOBILE.test(local);
  // 7–9 digits is a landline (area code + subscriber). A leading 9 there is a
  // mobile that lost digits, not a landline.
  if (local.length >= 7 && local.length <= 9) return !local.startsWith("9");
  return false;
}
