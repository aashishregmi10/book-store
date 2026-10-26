'use strict';

/**
 * Suggest which NCM branch should deliver an order, from the customer's
 * address. NCM routes by branch, and every branch publishes the areas it
 * covers — but our checkout stores free text (address lines, city, province),
 * so this can only ever be a suggestion. The admin confirms it before booking:
 * a parcel sent to the wrong branch costs a redirect charge and days.
 *
 * Scoring, strongest first: an address part that IS a covered area or the
 * branch's own name, then the city matching a district, then the province as
 * a tiebreaker. Returns the top candidates with the reason for each.
 */

const norm = (s) => String(s || '').toUpperCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();

// "Bagmati" vs NCM's "Bagmati Province" / "BAGMATI".
const provinceKey = (s) => norm(s).replace(/\bPROVINCE\b|\bPRADESH\b/g, '').trim();

/** The distinct place names a customer wrote, most specific first. */
function addressParts({ address1, address2, city }) {
  const parts = [];
  for (const line of [address2, address1, city]) {
    for (const piece of String(line || '').split(/[,/-]|\n/)) {
      const p = norm(piece.replace(/\b(ward|wada)\s*(no\.?)?\s*\d+\b/gi, '').replace(/\b\d+\b/g, ''));
      if (p.length >= 3 && !parts.includes(p)) parts.push(p);
    }
  }
  return parts;
}

/**
 * @param {Array<{name:string, district:string, province:string, areas:string[]}>} branches
 * @param {{ address1?:string, address2?:string, city?:string, province?:string }} address
 * @returns {Array<{ branch:string, district:string, score:number, reason:string }>}
 */
function suggestBranches(branches, address, limit = 5) {
  const parts = addressParts(address);
  const city = norm(address.city);
  const province = provinceKey(address.province);

  const scored = branches.map((b) => {
    const name = norm(b.name);
    const district = norm(b.district);
    const areas = b.areas.map(norm);
    let score = 0; let reason = '';
    const take = (s, r) => { if (s > score) { score = s; reason = r; } };

    for (const p of parts) {
      if (areas.includes(p)) take(p === city ? 90 : 100, `covers "${titleCase(p)}"`);
      if (p === name) take(95, `branch is in "${titleCase(p)}"`);
    }
    if (city && city === district) take(60, `city is in ${titleCase(district)} district`);
    if (!score && city) {
      // A covered area containing the city name ("NEW BANESHWOR" for "Baneshwor").
      const near = b.areas.find((a) => norm(a).split(' ').includes(city));
      if (near) take(40, `covers "${near.trim()}"`);
    }
    if (score && province && provinceKey(b.province) === province) score += 5;
    return { branch: b.name, district: b.district, score, reason };
  });

  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.branch.localeCompare(b.branch)).slice(0, limit);
}

function titleCase(s) {
  return String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = { suggestBranches, addressParts };
