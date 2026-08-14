/* ══════════════════════════════════════════════════════════════
   Icon generator — Preview Deck

   The Chrome Web Store requires a 128px icon, and Chrome wants 16 /
   32 / 48 / 128 for the toolbar, extensions page and store listing.
   These are the only binaries in an otherwise plain-text extension,
   so rather than commit opaque blobs they are generated here from a
   few dozen lines of arithmetic.

   No dependencies: PNG is written by hand (zlib is built into Node)
   and edges are anti-aliased by rendering at 4x and box-downsampling.

   Run:  node tools/make-icons.js
   ══════════════════════════════════════════════════════════════ */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ── PNG encoding ───────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgba: Buffer of width*height*4, 8-bit, non-premultiplied. */
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;      // bit depth
  ihdr[9] = 6;      // colour type: truecolour + alpha
  ihdr[10] = 0;     // deflate
  ihdr[11] = 0;     // adaptive filtering
  ihdr[12] = 0;     // no interlace

  /* Each scanline is prefixed with its filter byte; 0 = None. */
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const o = y * (width * 4 + 1);
    raw[o] = 0;
    rgba.copy(raw, o + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── Drawing ────────────────────────────────────────────────── */

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Signed-distance test for a rounded rectangle. */
function insideRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  if (x >= x0 + r && x <= x1 - r) return y >= y0 && y <= y1;
  if (y >= y0 + r && y <= y1 - r) return x >= x0 && x <= x1;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * The mark: a rounded blue tile carrying two white device outlines —
 * one portrait, one landscape — which is the tool in one glyph.
 * Drawn in a 0..1 unit square so every size shares one definition.
 */
function shade(u, v) {
  // Tile
  if (!insideRoundRect(u, v, 0.02, 0.02, 0.98, 0.98, 0.235)) return null;

  // Diagonal gradient, matching the panel's brand chip.
  const t = clamp01((u * 0.55 + v * 0.75));
  const r = Math.round(lerp(0x60, 0x25, t));
  const g = Math.round(lerp(0xa5, 0x63, t));
  const b = Math.round(lerp(0xfa, 0xeb, t));

  const white = [255, 255, 255];

  // Landscape frame, behind
  const inLandOuter = insideRoundRect(u, v, 0.30, 0.30, 0.82, 0.66, 0.055);
  const inLandInner = insideRoundRect(u, v, 0.345, 0.345, 0.775, 0.615, 0.03);
  if (inLandOuter && !inLandInner) return [...white, 200];

  // Portrait frame, in front — knocked out of the landscape one so the
  // two read as separate objects rather than one merged blob.
  const inPortOuter = insideRoundRect(u, v, 0.17, 0.22, 0.45, 0.78, 0.055);
  const inPortInner = insideRoundRect(u, v, 0.215, 0.265, 0.405, 0.735, 0.03);
  const inPortGap   = insideRoundRect(u, v, 0.145, 0.195, 0.475, 0.805, 0.07);
  if (inPortGap && !inPortOuter) return [r, g, b, 255];   // separation gutter
  if (inPortOuter && !inPortInner) return [...white, 255];

  return [r, g, b, 255];
}

function render(size) {
  const SS = 4;                       // supersample factor → anti-aliasing
  const n = size * SS;
  const out = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x * SS + sx + 0.5) / n;
          const v = (y * SS + sy + 0.5) / n;
          const px = shade(u, v);
          if (!px) continue;          // outside the tile → transparent
          const a = px[3] / 255;
          R += px[0] * a; G += px[1] * a; B += px[2] * a; A += a;
        }
      }
      const total = SS * SS;
      const o = (y * size + x) * 4;
      if (A > 0) {
        out[o]     = Math.round(R / A);
        out[o + 1] = Math.round(G / A);
        out[o + 2] = Math.round(B / A);
        out[o + 3] = Math.round((A / total) * 255);
      }
    }
  }
  return encodePNG(size, size, out);
}

/* ── Write ──────────────────────────────────────────────────── */

const dir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(dir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const file = path.join(dir, `icon${size}.png`);
  fs.writeFileSync(file, render(size));
  console.log(`  icons/icon${size}.png  ${fs.statSync(file).size} bytes`);
}
console.log('done');
