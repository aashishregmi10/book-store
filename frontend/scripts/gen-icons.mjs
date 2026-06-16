// Generates every favicon/app-icon asset from one source-of-truth SVG so the
// brand mark never drifts between sizes. Re-run after editing the glyph below:
//   node scripts/gen-icons.mjs
//
// Mark: a minimal bookmark (the chosen concept) — off-white ribbon on a forest
// green tile (palette locked in /CLAUDE.md: accent #2D5A3D, bg #FAF7F2). The tile
// is opaque so the icon stays legible on both light and dark browser chrome; a
// transparent single-colour mark would vanish on dark backgrounds.
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const GREEN = "#2D5A3D";
const CREAM = "#FAF7F2";

// Bookmark ribbon with softly rounded top corners + a short "title" band.
// Authored in a 512×512 canvas; the notch tip sits at the horizontal centre.
const glyph = `
  <path d="M176 132 Q176 120 188 120 L324 120 Q336 120 336 132 L336 372 L256 300 L176 372 Z" fill="${CREAM}"/>
  <line x1="214" y1="180" x2="298" y2="180" stroke="${GREEN}" stroke-width="13" stroke-linecap="round"/>`;

// rx 112 → rounded tile for the in-tab favicon; rx 0 → full-bleed square for
// Apple touch (Apple masks corners) and Android maskable (safe zone is centred).
const svg = (rx) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${GREEN}"/>${glyph}</svg>`;

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
