/* ══════════════════════════════════════════════════════════════
   Packager — Preview Deck

   Produces dist/preview-deck-<version>.zip containing exactly the
   files Chrome needs, and nothing else. Development files (tools/,
   docs, the dist folder itself) are excluded — the Web Store rejects
   uploads containing unused code, and every extra file widens the
   review surface for no benefit.

   Chrome requires a flat zip whose ROOT is manifest.json — not a
   folder containing it. That is the single most common upload
   rejection, so the layout is asserted below before writing.

   Run:  node tools/package.js
   ══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');

/* Exactly what ships. An allow-list, not an ignore-list: a new dev
   file can never leak into a build by being forgotten. */
const SHIP = [
  'manifest.json',
  'background.js',
  'content.js',
  'sidepanel.html',
  'sidepanel.css',
  'sidepanel.js',
  'popup.html',
  'popup.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

/* ── Minimal ZIP writer (deflate via built-in zlib) ─────────── */

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
  const now = new Date();
  const { time, date } = dosTime(now);

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const deflated = zlib.deflateRawSync(e.data, { level: 9 });
    /* Store rather than deflate when compression would grow the file. */
    const useDeflate = deflated.length < e.data.length;
    const body = useDeflate ? deflated : e.data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(e.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0, 6);             // flags
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
    central.writeUInt16LE(20, 4);          // version made by
    central.writeUInt16LE(20, 6);          // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);          // extra
    central.writeUInt16LE(0, 32);          // comment
    central.writeUInt16LE(0, 34);          // disk
    central.writeUInt16LE(0, 36);          // internal attrs
    central.writeUInt32LE(0, 38);          // external attrs
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

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

/* Fail loudly rather than shipping something broken. */
const problems = [];
if (!manifest.icons || !manifest.icons['128']) problems.push('manifest.icons["128"] is required by the Web Store');
if (/<all_urls>/.test(JSON.stringify(manifest.host_permissions || []))) problems.push('host_permissions must not include <all_urls>');
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) problems.push('version must be 1-4 dot-separated integers');

const entries = [];
for (const rel of SHIP) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { problems.push(`missing file: ${rel}`); continue; }
  /* Forward slashes: ZIP spec, and Chrome rejects backslash paths. */
  entries.push({ name: rel.split(path.sep).join('/'), data: fs.readFileSync(abs) });
}

if (problems.length) {
  console.error('Cannot package:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}

const distDir = path.join(ROOT, 'dist');
fs.mkdirSync(distDir, { recursive: true });
const out = path.join(distDir, `preview-deck-${manifest.version}.zip`);
fs.writeFileSync(out, buildZip(entries));

console.log(`packed ${entries.length} files → dist/preview-deck-${manifest.version}.zip`);
console.log(`        ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
for (const e of entries) console.log(`  ${String(e.data.length).padStart(7)}  ${e.name}`);
