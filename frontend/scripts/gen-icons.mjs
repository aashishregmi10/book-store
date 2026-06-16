// Generates every favicon/app-icon asset from one source-of-truth SVG so the
// brand mark never drifts between sizes. Re-run after editing the glyph below:
//   node scripts/gen-icons.mjs
//
// Mark: a "PT" monogram (Page Turn) where P and T share one vertical stem — the
// T's crossbar runs across the top, the P's bowl hangs off the stem's upper
// right. Forest-green letters (#2D5A3D, brand accent from /CLAUDE.md) on a pale
// blue tile (#E8F1FB, chosen by the owner for this mark). The tile is opaque so
// the mark renders consistently across browser chrome.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const GREEN = "#2D5A3D"; // letterforms
const BLUE = "#E8F1FB"; // tile background

// Shared-stem PT, authored in a 512×512 canvas: T crossbar across the top, one
// shared vertical stem, and the P's bowl as a solid D (with a punched counter)
// dropped just below the crossbar so the two letters stay legible at 16px.
const glyph = `
  <rect x="118" y="132" width="220" height="52" rx="14" fill="${GREEN}"/>
  <rect x="200" y="132" width="52" height="248" rx="14" fill="${GREEN}"/>
  <path d="M252 205 A64 64 0 0 1 252 333 Z" fill="${GREEN}"/>
  <path d="M252 227 A42 42 0 0 1 252 311 Z" fill="${BLUE}"/>`;

// rx 112 → rounded tile for the in-tab favicon; rx 0 → full-bleed square for
// Apple touch (Apple masks corners) and Android maskable (safe zone is centred).
const svg = (rx) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${BLUE}"/>${glyph}</svg>`;

const rounded = svg(112);
const fleed = svg(0);

const png = (src, size) => sharp(Buffer.from(src)).resize(size, size).png().toBuffer();

// Minimal ICO container wrapping PNG frames (modern browsers accept PNG-in-ICO).
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = 6 + frames.length * 16;
  const dir = [];
  const data = [];
  for (const { size, buf } of frames) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    dir.push(e);
    data.push(buf);
  }
  return Buffer.concat([header, ...dir, ...data]);
}

const run = async () => {
  // SVG source (Next serves this at /icon.svg — the primary, resolution-free asset).
  writeFileSync("src/app/icon.svg", rounded + "\n");

  // Static PNG deliverables in /public.
  writeFileSync("public/icon-512.png", await png(rounded, 512));
  writeFileSync("public/icon-192.png", await png(rounded, 192));
  writeFileSync("public/icon-32.png", await png(rounded, 32));
  writeFileSync("public/icon-16.png", await png(rounded, 16));
  writeFileSync("public/icon-180.png", await png(fleed, 180)); // apple touch size
  writeFileSync("public/icon-512-maskable.png", await png(fleed, 512)); // Android maskable

  // Next metadata files: apple-icon.png + favicon.ico (16 + 32 frames).
  writeFileSync("src/app/apple-icon.png", await png(fleed, 180));
  writeFileSync(
    "src/app/favicon.ico",
    buildIco([
      { size: 16, buf: await png(rounded, 16) },
      { size: 32, buf: await png(rounded, 32) },
    ])
  );

  console.log("icons generated: icon.svg, apple-icon.png, favicon.ico, public/icon-{16,32,180,192,512,512-maskable}.png");
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
