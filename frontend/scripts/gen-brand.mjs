// Generates every brand asset from the one source logo, so the mark never
// drifts between the header, the footer, the favicon and social cards.
//   node scripts/gen-brand.mjs
//
// Source: brand/logo-source.jpeg — the supplied lockup (script "Books Temple"
// wordmark in navy, teal feather quill, "ONLINE BOOKSTORE" subtitle) on a
// white background.
//
// Two things the source needs before it can be used on the site:
//
//  1. Transparency. It is a JPEG, so it has an opaque white background that
//     would show as a white box on the warm off-white header and on the
//     tinted footer. Alpha is derived per pixel from distance-from-white.
//  2. Separate crops. The subtitle is ~55px tall in a 497px lockup, so at a
//     36px header height it renders as ~4px of illegible mush. The header
//     therefore gets a subtitle-free crop; the footer, which has room, gets
//     the full lockup.
//
// The favicon uses the feather alone. The wordmark is script type — completely
// unreadable at 16px — whereas the quill is a distinct silhouette that still
// reads as the brand in a browser tab.

import sharp from "sharp";
import { writeFileSync } from "node:fs";

const SRC = "brand/logo-source.jpeg";

// Brand palette, sampled from the source rather than guessed.
const TEAL = "#17828E";
const TILE = "#E8F1FB"; // pale blue favicon tile, carried over from the previous mark

// Measured ink boxes in the 1536x1024 source.
const LOCKUP = { left: 89, top: 204, width: 1396, height: 497 }; // wordmark + feather + subtitle
const SUBTITLE = { left: 104, top: 644, width: 942, height: 55 }; // "ONLINE BOOKSTORE"
const FEATHER = { left: 1150, top: 205, width: 334, height: 399 };

/**
 * Replace the white JPEG background with real transparency.
 *
 * Alpha comes from distance-from-white (max channel deficit) rather than
 * luminance: luminance would make the mid-tone teal ~55% transparent, because
 * teal is genuinely brighter than the navy. The 1.6x gain then pushes the teal
 * fully opaque while leaving anti-aliased glyph edges partly transparent, so
 * the script letterforms keep their smooth curves instead of going jagged.
 */
async function withAlpha(pipeline) {
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const deficit = Math.max(255 - data[i], 255 - data[i + 1], 255 - data[i + 2]);
    data[i + 3] = deficit < 12 ? 0 : Math.min(255, Math.round(deficit * 1.6));
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png();
}

/**
 * Tile + centred art, used for every square app icon.
 *
 * The rounded tile is drawn as its own SVG base rather than masked onto a
 * square with a dest-in blend — the blend approach needs the mask to match the
 * canvas exactly and sharp rejects the composite outright.
 *
 * `radius` 112 gives the rounded tile browsers show in a tab; 0 gives the
 * full-bleed square Apple touch and Android maskable need, since both apply
 * their own mask and would clip a pre-rounded corner twice.
 */
const tile = async (artBuffer, size, radius) => {
  const base = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
      `<rect width="512" height="512" rx="${radius}" fill="${TILE}"/></svg>`
  );
  // Compose at full 512 and resize in a SECOND pass. sharp applies resize
  // before composite within one pipeline, so chaining .composite().resize(16)
  // would shrink the base to 16px first and then reject the 360px feather as
  // "must have same dimensions or smaller".
  const composed = await sharp(base)
    .composite([{ input: artBuffer, gravity: "center" }])
    .png()
    .toBuffer();
  return sharp(composed).resize(size, size).png().toBuffer();
};

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
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    dir.push(e);
    data.push(buf);
  }
  return Buffer.concat([header, ...dir, ...data]);
}

const run = async () => {
  // ── Wordmarks ──────────────────────────────────────────
  // Full lockup, transparent — footer and social cards.
  const full = await withAlpha(sharp(SRC).extract(LOCKUP));
  writeFileSync("public/logo-full.png", await full.clone().resize({ width: 1200 }).toBuffer());

  // Header lockup: paint the subtitle out in white *before* alpha is derived,
  // so it disappears entirely rather than becoming a faint ghost.
  const noSubtitle = await sharp(SRC)
    .composite([
      {
        input: {
          create: { width: SUBTITLE.width + 24, height: SUBTITLE.height + 16, channels: 3, background: "#ffffff" },
        },
        left: SUBTITLE.left - 12,
        top: SUBTITLE.top - 8,
      },
    ])
    .toBuffer();

  const header = await withAlpha(sharp(noSubtitle).extract(LOCKUP));
  // trim() crops to the remaining ink, so the PNG has no dead margin and the
  // header can size it purely by height.
  writeFileSync("public/logo-wordmark.png", await header.trim().resize({ width: 900 }).toBuffer());

  // ── Feather, for every square icon ─────────────────────
  // 460 of 512 (~90% fill). The quill is a thin diagonal with white space
  // between its barbs, so at 70% fill it thinned out to a faint smudge in a
  // 16px tab. Filling most of the tile is what keeps it readable there.
  const feather = await (await withAlpha(sharp(SRC).extract(FEATHER)))
    .trim()
    .resize(460, 460, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  writeFileSync("public/icon-512.png", await tile(feather, 512, 112));
  writeFileSync("public/icon-192.png", await tile(feather, 192, 112));
  writeFileSync("public/icon-32.png", await tile(feather, 32, 112));
  writeFileSync("public/icon-16.png", await tile(feather, 16, 112));
  writeFileSync("public/icon-180.png", await tile(feather, 180, 0));
  writeFileSync("public/icon-512-maskable.png", await tile(feather, 512, 0));
  writeFileSync("src/app/apple-icon.png", await tile(feather, 180, 0));
  writeFileSync(
    "src/app/favicon.ico",
    buildIco([
      { size: 16, buf: await tile(feather, 16, 112) },
      { size: 32, buf: await tile(feather, 32, 112) },
      { size: 48, buf: await tile(feather, 48, 112) },
    ])
  );

  // schema.org Organization.logo wants a square, reliably-fetchable raster.
  writeFileSync("public/logo.png", await tile(feather, 512, 112));

  console.log(
    `brand assets generated (teal ${TEAL}):\n` +
      "  public/logo-wordmark.png  header (no subtitle, transparent)\n" +
      "  public/logo-full.png      footer / social (full lockup, transparent)\n" +
      "  public/logo.png           schema.org square\n" +
      "  favicon.ico, apple-icon.png, public/icon-{16,32,180,192,512,512-maskable}.png"
  );
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
