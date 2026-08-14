/* ══════════════════════════════════════════════════════════════
   Preview Deck (Firefox build) — sidebar

   Same tagging, source-location capture and Markdown export as the
   Chrome/Edge side panel. What's missing is the device-screenshot
   feature and everything downstream of it (the shots grid, the
   lightbox, cropping a tag's element out of a capture) — Firefox's
   WebExtensions API has no equivalent to chrome.debugger, so there is
   no way to emulate a viewport or screenshot one. See background.js.
   ══════════════════════════════════════════════════════════════ */
'use strict';

/* browser.storage.local, not localStorage: the sidebar and the content
   script live in different contexts and need one shared store. */
const K = { tags: 'preview-deck:tags:v1' };

const $ = (id) => document.getElementById(id);

let tags = [];
let armed = false;
let activeUrl = '';

/* ── Storage ────────────────────────────────────────────────── */
async function loadAll() {
  const got = await browser.storage.local.get([K.tags]);
  tags = got[K.tags] || [];
}
const saveTags = () => browser.storage.local.set({ [K.tags]: tags });

/* ── Chrome/browser ─────────────────────────────────────────── */
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
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  activeUrl = (tab && tab.url) || '';
  let host = '—';
  try { host = new URL(activeUrl).host; } catch (e) {}
  $('host').textContent = host;

  const ok = /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(activeUrl);
  $('tagBtn').disabled = !ok;
  showError(ok ? '' :
    'Preview Deck runs on http://localhost or http://127.0.0.1 only. Switch to your dev server tab.');
  return ok;
}

/* ── Tagging ────────────────────────────────────────────────── */
async function setArmed(next, fromPage) {
  armed = next;
  $('tagBtn').setAttribute('aria-pressed', String(armed));
  $('tagBtn').firstChild.textContent = armed ? 'Stop tagging ' : 'Tag element ';

  if (fromPage) return;                 /* page already disarmed itself */

  try {
    const res = await browser.runtime.sendMessage({
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

browser.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === 'PD_TAG' && msg.tag) {
    tags.push({ ...msg.tag, note: '' });
    saveTags();
    renderTags();
    $('scroll').scrollTop = $('scroll').scrollHeight;
  }
  if (msg.type === 'PD_DISARMED') setArmed(false, true);
  if (msg.type === 'PD_TOGGLE_TAGGING') setArmed(!armed);
});

/* ── Tag list ───────────────────────────────────────────────── */
function shortFile(f) {
  if (!f) return null;
  const m = String(f).replace(/\\/g, '/');
  const i = m.lastIndexOf('/src/');
  return i > -1 ? m.slice(i + 1) : m.split('/').slice(-2).join('/');
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
    h.querySelector('.dev').textContent = t.viewport ? `${t.viewport.width}×${t.viewport.height}` : '—';
    card.appendChild(h);

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
    rm.addEventListener('click', () => { tags.splice(idx, 1); saveTags(); renderTags(); });
    card.appendChild(rm);

    wrap.appendChild(card);
  });
}

/* ── Export ─────────────────────────────────────────────────── */
function buildMarkdown() {
  const withNotes = tags.filter((t) => (t.note || '').trim());
  if (!withNotes.length) return null;

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
      if (t.viewport) out.push('- Tagged at: `' + t.viewport.width + '×' + t.viewport.height + '`');
      if (t.text) out.push('- Text: "' + t.text + '"');
      const sk = Object.keys(t.styles || {});
      if (sk.length) out.push('- Styles: ' + sk.map((k) => `\`${k}: ${t.styles[k]}\``).join(', '));
      out.push('');
      out.push('- **Note:** ' + t.note.trim());
      out.push('');
    }
  }
  return out.join('\n');
}

$('copyBtn').addEventListener('click', async () => {
  const btn = $('copyBtn');
  btn.disabled = true; btn.textContent = 'Building…';
  try {
    const md = buildMarkdown();
    if (!md) { toast('Nothing to copy yet — tag something and add a note.'); return; }
    await navigator.clipboard.writeText(md);
    toast(`Copied <b>${Math.round(md.length / 1024) || 1} KB</b>.`);
  } catch (e) {
    showError('Copy failed: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Copy feedback';
  }
});

$('clearBtn').addEventListener('click', async () => {
  tags = [];
  await browser.storage.local.remove([K.tags]);
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) await browser.tabs.sendMessage(tab.id, { type: 'PD_CLEAR_PINS' });
  } catch (e) { /* tagger not injected — nothing to clear */ }
  renderTags();
  toast('Cleared.');
});

$('reloadBtn').addEventListener('click', () => readActiveTab());
browser.tabs.onActivated.addListener(() => readActiveTab());
browser.tabs.onUpdated.addListener((id, info) => { if (info.status === 'complete') readActiveTab(); });

document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === 'a' || e.key === 'A') { e.preventDefault(); setArmed(!armed); }
  if (e.key === 'Escape' && armed) setArmed(false);
});

/* ── Boot ───────────────────────────────────────────────────── */
(async () => {
  await loadAll();
  await readActiveTab();
  renderTags();
})();
