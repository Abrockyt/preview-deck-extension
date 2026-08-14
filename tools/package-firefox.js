/* ══════════════════════════════════════════════════════════════
   Packager — Preview Deck (Firefox build)

   Same approach as tools/package.js: an allow-list of exactly what
   ships, a hand-written ZIP (no dependency), manifest.json asserted
   at the archive root before anything is written.

   Firefox's addons.mozilla.org upload accepts the same flat-zip shape
   as Chrome — no separate packaging tool required on Mozilla's end,
   just a build free of the debugger-only files that don't exist in
   this directory in the first place.

   Run:  node tools/package-firefox.js
   ══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, '..', 'firefox');
const ROOT = path.join(__dirname, '..');

const SHIP = [
  'manifest.json',
  'background.js',
  'content.js',
  'sidebar.html',
  'sidebar.css',
  'sidebar.js',
  'popup.html',
  'popup.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

/* ── Minimal ZIP writer (identical to tools/package.js) ────────
   Duplicated rather than imported: this project has no build step
   and no module system wiring these two scripts together, and the
   ~90 lines are cheap to keep in sync by inspection. */

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
function dosTime(d) {
  const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xffff;
  const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  return { time, date };
}
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { time, date } = dosTime(new Date());

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const deflated = zlib.deflateRawSync(e.data, { level: 9 });
    const useDeflate = deflated.length < e.data.length;
    const body = useDeflate ? deflated : e.data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(e.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, end]);
}

/* ── Build ──────────────────────────────────────────────────── */

const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));

const problems = [];
if (!manifest.browser_specific_settings || !manifest.browser_specific_settings.gecko || !manifest.browser_specific_settings.gecko.id) {
  problems.push('manifest.browser_specific_settings.gecko.id is required for AMO signing');
}
if (manifest.permissions && manifest.permissions.includes('debugger')) {
  problems.push('the Firefox manifest must not request "debugger" — the API does not exist there');
}
if (/<all_urls>/.test(JSON.stringify(manifest.host_permissions || []))) {
  problems.push('host_permissions must not include <all_urls>');
}

const entries = [];
for (const rel of SHIP) {
  const abs = path.join(SRC, rel);
  if (!fs.existsSync(abs)) { problems.push(`missing file: firefox/${rel}`); continue; }
  entries.push({ name: rel.split(path.sep).join('/'), data: fs.readFileSync(abs) });
}

if (problems.length) {
  console.error('Cannot package:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}

const distDir = path.join(ROOT, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const out = path.join(distDir, `preview-deck-firefox-${manifest.version}.zip`);
fs.writeFileSync(out, buildZip(entries));

console.log(`packed ${entries.length} files → dist/preview-deck-firefox-${manifest.version}.zip`);
console.log(`        ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
for (const e of entries) console.log(`  ${String(e.data.length).padStart(7)}  ${e.name}`);
