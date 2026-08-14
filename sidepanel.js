/* ══════════════════════════════════════════════════════════════
   Preview Deck — side panel
   ══════════════════════════════════════════════════════════════ */
'use strict';

const DEVICES = [
  { label: 'Mobile',   width: 375,  height: 812  },
  { label: 'Mobile L', width: 430,  height: 932  },
  { label: 'Tablet',   width: 768,  height: 1024 },
  { label: 'Laptop',   width: 1024, height: 768  },
  { label: 'Desktop',  width: 1440, height: 900  },
  { label: 'Wide',     width: 1920, height: 1080 }
];

/* chrome.storage.local, not localStorage: the panel and the content
   script live in different contexts and need one shared store. */
const K = { tags: 'preview-deck:tags:v1', captures: 'preview-deck:captures:v1' };

const $ = (id) => document.getElementById(id);

let tags = [];
let captures = [];
let armed = false;
let activeUrl = '';

/* ── Storage ────────────────────────────────────────────────── */
async function loadAll() {
  const got = await chrome.storage.local.get([K.tags, K.captures]);
  tags = got[K.tags] || [];
  captures = got[K.captures] || [];
}
const saveTags = () => chrome.storage.local.set({ [K.tags]: tags });
const saveCaptures = () => chrome.storage.local.set({ [K.captures]: captures });

/* ── Chrome ─────────────────────────────────────────────────── */
let toastTimer;
function toast(html) {
  const t = $('toast');
  t.innerHTML = html;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
function showError(msg) {
  const e = $('error');
  if (!msg) { e.hidden = true; return; }
  e.textContent = msg;
  e.hidden = false;
}

async function readActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeUrl = (tab && tab.url) || '';
  let host = '—';
  try { host = new URL(activeUrl).host; } catch (e) {}
  $('host').textContent = host;

  const ok = /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(activeUrl);
  $('captureBtn').disabled = !ok;
  $('tagBtn').disabled = !ok;
  showError(ok ? '' :
    'Preview Deck runs on http://localhost or http://127.0.0.1 only. Switch to your dev server tab.');
  return ok;
}

/* ── Captures ───────────────────────────────────────────────── */
function renderShots(pending) {
  const wrap = $('shots');
  const list = pending || captures;
  $('shotCount').textContent = captures.length;
  $('shotsEmpty').hidden = list.length > 0;
  wrap.innerHTML = '';

  list.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'shot' + (c.status === 'capturing' ? ' pending' : '');

    if (c.screenshot) {
      const b = document.createElement('button');
      b.className = 'frame';
      b.title = 'View full size';
      const img = document.createElement('img');
      img.src = c.screenshot;
      img.alt = `${c.label} capture, ${c.width}×${c.height}`;
      b.appendChild(img);
      b.addEventListener('click', () => openLightbox(c));
      card.appendChild(b);
    } else {
      const d = document.createElement('div');
      d.className = 'frame';
      card.appendChild(d);
    }

    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.innerHTML = '<b></b><span></span>';
    cap.querySelector('b').textContent = c.label;
    cap.querySelector('span').textContent = `${c.width}×${c.height}`;
    card.appendChild(cap);
    wrap.appendChild(card);
  });
}

function openLightbox(c) {
  $('lbImg').src = c.screenshot;
  $('lbImg').alt = `${c.label} capture`;
  $('lbLabel').textContent = c.label;
  $('lbDims').textContent = `${c.width}×${c.height}`;
  $('lightbox').hidden = false;
}
$('lbClose').addEventListener('click', () => { $('lightbox').hidden = true; });
$('lightbox').addEventListener('click', (e) => {
  if (e.target === $('lightbox')) $('lightbox').hidden = true;
});

$('captureBtn').addEventListener('click', async () => {
  if (!(await readActiveTab())) return;

  const btn = $('captureBtn');
  btn.disabled = true;
  btn.textContent = 'Capturing…';
  showError('');

  /* Skeletons up front so the panel shows progress rather than freezing. */
  const pending = DEVICES.map((d) => ({ ...d, status: 'capturing', screenshot: null }));
  renderShots(pending);

  try {
    const res = await chrome.runtime.sendMessage({ type: 'PD_CAPTURE_ALL', devices: DEVICES });
    if (!res || !res.ok) throw new Error((res && res.error) || 'Capture failed.');
    captures = res.results;
    await saveCaptures();
    renderShots();
    renderTags();                       /* crops can resolve now */
    toast(`Captured <b>${captures.length}</b> device sizes.`);
  } catch (e) {
    showError(e.message);
    renderShots();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Capture all device sizes';
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;

  if (msg.type === 'PD_CAPTURE_PROGRESS') {
    const pending = DEVICES.map((d, i) => ({
      ...d,
      status: i === msg.index ? 'capturing' : (i < msg.index ? 'done' : 'queued'),
      screenshot: null,
    }));
    renderShots(pending);
  }

  if (msg.type === 'PD_TAG' && msg.tag) {
    tags.push({ ...msg.tag, note: '' });
    saveTags();
    renderTags();
    $('scroll').scrollTop = $('scroll').scrollHeight;
  }

  if (msg.type === 'PD_DISARMED') setArmed(false, true);
  if (msg.type === 'PD_TOGGLE_TAGGING') setArmed(!armed);
});

/* ── Tagging ────────────────────────────────────────────────── */
async function setArmed(next, fromPage) {
  armed = next;
  $('tagBtn').setAttribute('aria-pressed', String(armed));
  $('tagBtn').firstChild.textContent = armed ? 'Stop tagging ' : 'Tag element ';

  if (fromPage) return;                 /* page already disarmed itself */

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'PD_SET_TAGGING',
      armed,
      startAt: tags.reduce((m, t) => Math.max(m, t.n || 0), 0),
    });
    if (!res || !res.ok) throw new Error((res && res.error) || 'Could not reach the page.');
    if (armed) toast('Tag mode on — click any element. <b>Esc</b> to stop.');
  } catch (e) {
    armed = false;
    $('tagBtn').setAttribute('aria-pressed', 'false');
    $('tagBtn').firstChild.textContent = 'Tag element ';
    showError(e.message);
  }
}
$('tagBtn').addEventListener('click', () => setArmed(!armed));

/* ── Element crop from the nearest capture ──────────────────── */

/**
 * Crop the tagged element out of whichever capture is closest in width
 * to the viewport the tag was taken at, scaling the element's rect by
 * the ratio between them. The capture and the tag come from different
 * moments, so this is an approximation — but a picture of roughly the
 * right region beats no picture at all.
 */
function cropFor(tag) {
  if (!captures.length || !tag.rect || !tag.viewport) return Promise.resolve(null);

  const best = captures.reduce((a, b) =>
    Math.abs(b.width - tag.viewport.width) < Math.abs(a.width - tag.viewport.width) ? b : a);
  if (!best.screenshot) return Promise.resolve(null);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = img.naturalWidth / tag.viewport.width;
        const pad = 8 * k;
        const x = Math.max(0, tag.rect.left * k - pad);
        /* rect.top is a document coordinate; the capture only holds what
           was on screen, so subtract the scroll offset. */
        const y = Math.max(0, (tag.rect.top - (tag.scroll ? tag.scroll.y : 0)) * k - pad);
        const w = Math.min(img.naturalWidth - x, tag.rect.width * k + pad * 2);
        const h = Math.min(img.naturalHeight - y, tag.rect.height * k + pad * 2);
        if (w < 2 || h < 2) return resolve(null);

        const c = document.createElement('canvas');
        c.width = Math.round(w); c.height = Math.round(h);
        c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = best.screenshot;
  });
}

/** Halve a data URI that is too large to paste comfortably. */
function downscale(dataUri, factor) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * factor));
        c.height = Math.max(1, Math.round(img.naturalHeight * factor));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      } catch (e) { resolve(dataUri); }
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
}

/* ── Tag list ───────────────────────────────────────────────── */
function shortFile(f) {
  if (!f) return null;
  const m = String(f).replace(/\\/g, '/');
  const i = m.lastIndexOf('/src/');
  return i > -1 ? m.slice(i + 1) : m.split('/').slice(-2).join('/');
}
function deviceLabelFor(tag) {
  if (!tag.viewport) return '—';
  const d = DEVICES.reduce((a, b) =>
    Math.abs(b.width - tag.viewport.width) < Math.abs(a.width - tag.viewport.width) ? b : a);
  return `${d.label} · ${tag.viewport.width}px`;
}

function renderTags() {
  const wrap = $('tags');
  $('tagCount').textContent = tags.length;
  $('tagsEmpty').hidden = tags.length > 0;
  wrap.innerHTML = '';

  tags.forEach((t, idx) => {
    const card = document.createElement('div');
    card.className = 'tag';

    const h = document.createElement('div');
    h.className = 'tag-h';
    h.innerHTML = '<span class="num"></span><b></b><span class="dev"></span>';
    h.querySelector('.num').textContent = t.n;
    h.querySelector('b').textContent = `<${t.tagName}>` + (t.component ? ` in ${t.component}` : '');
    h.querySelector('.dev').textContent = deviceLabelFor(t);
    card.appendChild(h);

    const crop = document.createElement('img');
    crop.className = 'crop';
    crop.alt = '';
    crop.hidden = true;
    card.appendChild(crop);
    cropFor(t).then((src) => { if (src) { crop.src = src; crop.hidden = false; } });

    const meta = document.createElement('div');
    meta.className = 'meta';
    const rows = [];
    if (t.file) rows.push(['src', shortFile(t.file) + (t.line ? ':' + t.line : ''), 'src']);
    if (t.tree && t.tree.length) rows.push(['tree', t.tree.join(' < ')]);
    rows.push(['sel', t.selector]);
    rows.forEach(([k, v, cls]) => {
      const d = document.createElement('div');
      if (cls) d.className = cls;
      d.title = v;
      d.innerHTML = `<span class="k">${k} </span>`;
      d.appendChild(document.createTextNode(v));
      meta.appendChild(d);
    });
    card.appendChild(meta);

    const ta = document.createElement('textarea');
    ta.placeholder = 'What should change here?';
    ta.value = t.note || '';
    ta.addEventListener('input', () => { t.note = ta.value; saveTags(); });
    card.appendChild(ta);

    const rm = document.createElement('button');
    rm.className = 'rm';
    rm.textContent = 'Remove';
    rm.addEventListener('click', () => {
      tags.splice(idx, 1); saveTags(); renderTags();
    });
    card.appendChild(rm);

    wrap.appendChild(card);
  });
}

/* ── Export ─────────────────────────────────────────────────── */
async function buildMarkdown() {
  const withNotes = tags.filter((t) => (t.note || '').trim());
  if (!withNotes.length && !captures.length) return null;

  const out = ['# Preview Deck feedback', ''];
  out.push('- Source: `' + (activeUrl || 'unknown') + '`');
  out.push('- Generated: ' + new Date().toISOString());

  if (withNotes.some((t) => t.line)) {
    out.push('');
    out.push('> **Reading the line numbers.** They come from React `_debugSource`, ' +
             'which counts from the top of the *transformed* module. Bundlers that ' +
             'inject a preamble (Vite\'s React plugin adds a React Refresh header) ' +
             'shift every line down by that many. Use the component name and CSS ' +
             'selector as the exact locators and the line as a strong hint.');
  }
  out.push('');

  /* Group by page URL. */
  const byUrl = {};
  withNotes.forEach((t) => { (byUrl[t.url] = byUrl[t.url] || []).push(t); });

  for (const url of Object.keys(byUrl).sort()) {
    out.push('## `' + url + '`', '');
    for (const t of byUrl[url]) {
      out.push(`**#${t.n} · \`<${t.tagName}>\`` + (t.component ? ` in \`${t.component}\`` : '') + '**');
      out.push('');
      if (t.file) out.push('- Source: `' + shortFile(t.file) + (t.line ? ':' + t.line : '') + '`');
      if (t.tree && t.tree.length) out.push('- Component tree: `' + t.tree.join(' < ') + '`');
      out.push('- Selector: `' + t.selector + '`');
      out.push('- Tagged at: `' + t.viewport.width + '×' + t.viewport.height + '`');
      if (t.text) out.push('- Text: "' + t.text + '"');
      const sk = Object.keys(t.styles || {});
      if (sk.length) {
        out.push('- Styles: ' + sk.map((k) => `\`${k}: ${t.styles[k]}\``).join(', '));
      }
      const crop = await cropFor(t);
      if (crop) { out.push(''); out.push(`![pin ${t.n}](${crop})`); }
      out.push('');
      out.push('- **Note:** ' + t.note.trim());
      out.push('');
    }
  }

  if (captures.length) {
    out.push('## Device captures', '');
    for (const c of captures) {
      if (!c.screenshot) continue;
      /* A full 1920×1080 PNG runs to megabytes; anything over ~500 KB is
         halved before embedding so the Markdown stays pasteable. */
      let src = c.screenshot;
      if (src.length > 500 * 1024) src = await downscale(src, 0.5);
      out.push(`**${c.label}** — ${c.width}×${c.height}`, '');
      out.push(`![${c.label}](${src})`, '');
    }
  }

  return out.join('\n');
}

$('copyBtn').addEventListener('click', async () => {
  const btn = $('copyBtn');
  btn.disabled = true; btn.textContent = 'Building…';
  try {
    const md = await buildMarkdown();
    if (!md) { toast('Nothing to copy yet — capture or tag something first.'); return; }
    await navigator.clipboard.writeText(md);
    const shots = (md.match(/!\[[^\]]*\]\(data:image\/png/g) || []).length;
    toast(`Copied <b>${Math.round(md.length / 1024)} KB</b> · ${shots} image${shots === 1 ? '' : 's'}.`);
  } catch (e) {
    showError('Copy failed: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Copy feedback';
  }
});

$('clearBtn').addEventListener('click', async () => {
  tags = []; captures = [];
  await chrome.storage.local.remove([K.tags, K.captures]);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await chrome.tabs.sendMessage(tab.id, { type: 'PD_CLEAR_PINS' });
  } catch (e) { /* tagger not injected — nothing to clear */ }
  renderShots(); renderTags();
  toast('Cleared.');
});

$('reloadBtn').addEventListener('click', () => readActiveTab());
chrome.tabs.onActivated.addListener(() => readActiveTab());
chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === 'complete') readActiveTab(); });

document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === 'a' || e.key === 'A') { e.preventDefault(); setArmed(!armed); }
  if (e.key === 'Escape') {
    if (!$('lightbox').hidden) { $('lightbox').hidden = true; return; }
    if (armed) setArmed(false);
  }
});

/* ── Boot ───────────────────────────────────────────────────── */
(async () => {
  await loadAll();
  await readActiveTab();
  renderShots();
  renderTags();
})();
