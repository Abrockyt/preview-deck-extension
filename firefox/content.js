/* ══════════════════════════════════════════════════════════════
   Preview Deck (Firefox build) — element tagger

   Identical behaviour to the Chrome/Edge build's content.js — this
   file does not touch the debugger API, so nothing here needed to
   change except the extension namespace (browser.* instead of
   chrome.*, Firefox's native API rather than its Chrome-compat shim).

   Injected on demand by background.js when tagging is armed, and
   fully torn down when it is disarmed. Nothing here runs on any page
   until the user asks for it.

   Re-injection is expected: browser.scripting.executeScript runs this
   file again every time tagging is armed, so the whole thing is
   guarded and idempotent.
   ══════════════════════════════════════════════════════════════ */

(() => {
'use strict';

/* Second injection: the controller already exists, so just re-expose it. */
if (window.__previewDeck) return;

const NS = '__pd';
const state = {
  armed: false,
  seq: 0,
  pins: [],
  hi: null,
  tip: null,
  styleEl: null,
};

/* ── Overlay chrome ─────────────────────────────────────────── */

const CSS = `
.${NS}-hi{position:absolute;pointer-events:none;z-index:2147483000;
  outline:2px solid #2563eb;outline-offset:1px;background:rgba(37,99,235,.10);border-radius:3px}
.${NS}-tip{position:absolute;pointer-events:none;z-index:2147483001;
  background:#12151a;color:#fff;font:600 11px/1.5 ui-monospace,Menlo,monospace;
  padding:3px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.28)}
.${NS}-pin{position:absolute;z-index:2147483002;width:24px;height:24px;border-radius:50%;
  background:#059669;color:#fff;font:700 11px/24px ui-monospace,Menlo,monospace;
  text-align:center;box-shadow:0 3px 10px rgba(0,0,0,.3);border:2px solid #fff;
  transform:translate(-50%,-50%);pointer-events:none}
html.${NS}-armed,html.${NS}-armed *{cursor:crosshair !important}
`;

function mount() {
  if (state.styleEl) return;
  const s = document.createElement('style');
  s.id = NS + '-style';
  s.textContent = CSS;
  document.documentElement.appendChild(s);
  state.styleEl = s;

  state.hi = document.createElement('div');
  state.hi.className = `${NS}-hi`;
  state.hi.style.display = 'none';

  state.tip = document.createElement('div');
  state.tip.className = `${NS}-tip`;
  state.tip.style.display = 'none';

  document.body.appendChild(state.hi);
  document.body.appendChild(state.tip);
}

function unmount() {
  [state.hi, state.tip, state.styleEl].forEach((n) => n && n.remove());
  state.hi = state.tip = state.styleEl = null;
  state.pins.forEach((p) => p.remove());
  state.pins = [];
  document.documentElement.classList.remove(`${NS}-armed`);
}

/* ── React fiber → component name and source location ───────── */

function fiberOf(node) {
  for (const k in node) if (k.indexOf('__reactFiber$') === 0) return node[k];
  return null;
}
function nameOfType(t) {
  if (!t) return null;
  if (typeof t === 'string') return null;                  // host element
  if (typeof t === 'function') return t.displayName || t.name || null;
  return t.displayName || t.name || null;                  // memo / forwardRef
}

/**
 * `_debugSource` exists only under React's development JSX transform,
 * which dev servers enable and production builds strip. React 19 removed
 * it outright. When it is missing we return no location and carry on —
 * this must never throw and never block a tag.
 */
function reactInfo(node) {
  const out = { component: null, tree: [], file: null, line: null };
  try {
    const fiber = fiberOf(node);
    if (!fiber) return out;

    /* The element's own _debugSource points at the JSX that produced it,
       which is more precise than its owner's. */
    if (fiber._debugSource) {
      out.file = fiber._debugSource.fileName;
      out.line = fiber._debugSource.lineNumber;
    }

    let owner = fiber._debugOwner, guard = 0;
    while (owner && guard++ < 60) {
      const n = nameOfType(owner.type);
      if (n) {
        out.tree.push(n);
        if (!out.file && owner._debugSource) {
          out.file = owner._debugSource.fileName;
          out.line = owner._debugSource.lineNumber;
        }
      }
      owner = owner._debugOwner;
    }
    out.component = out.tree[0] || null;
  } catch (e) { /* instrumentation must never break a click */ }
  return out;
}

/* ── Descriptors ────────────────────────────────────────────── */

function selectorFor(el) {
  const parts = [];
  let node = el, depth = 0;
  while (node && node.nodeType === 1 && depth < 4) {
    if (node.id) { parts.unshift('#' + node.id); break; }
    let s = node.tagName.toLowerCase();
    const cls = (node.getAttribute('class') || '').split(/\s+/)
      .filter((c) => c && !/^(is-|has-)/.test(c) && c.length < 34)
      .slice(0, 2);
    if (cls.length) s += '.' + cls.join('.');
    parts.unshift(s);
    node = node.parentElement; depth++;
  }
  return parts.join(' > ');
}

function stylesFor(el) {
  const cs = getComputedStyle(el);
  const keys = ['font-size', 'font-weight', 'line-height', 'letter-spacing', 'color',
                'background-color', 'display', 'padding', 'margin', 'border-radius'];
  const out = {};
  keys.forEach((k) => {
    const v = cs.getPropertyValue(k);
    if (v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)') {
      out[k] = v.trim();
    }
  });
  const r = el.getBoundingClientRect();
  out.width = Math.round(r.width) + 'px';
  out.height = Math.round(r.height) + 'px';
  return out;
}

/* Document-space rect, so pins stay on their element across scrolling
   (`position: fixed` would peg them to the glass and drift away). */
function docRect(el) {
  const r = el.getBoundingClientRect();
  return {
    top: r.top + window.scrollY,
    left: r.left + window.scrollX,
    width: r.width,
    height: r.height,
  };
}

/* ── Interaction ────────────────────────────────────────────── */

function isOurs(el) {
  return el && el.classList && (
    el.classList.contains(`${NS}-hi`) ||
    el.classList.contains(`${NS}-tip`) ||
    el.classList.contains(`${NS}-pin`)
  );
}

function onMove(e) {
  if (!state.armed) return;
  const el = e.target;
  if (!el || el.nodeType !== 1 || isOurs(el)) return;

  const r = docRect(el);
  state.hi.style.display = 'block';
  state.hi.style.top = r.top + 'px';
  state.hi.style.left = r.left + 'px';
  state.hi.style.width = r.width + 'px';
  state.hi.style.height = r.height + 'px';

  const info = reactInfo(el);
  state.tip.style.display = 'block';
  state.tip.textContent = el.tagName.toLowerCase() + (info.component ? ' · ' + info.component : '');
  state.tip.style.top = Math.max(0, r.top - 24) + 'px';
  state.tip.style.left = r.left + 'px';
}

function onClick(e) {
  if (!state.armed) return;
  const el = e.target;
  if (isOurs(el)) return;

  /* Nothing on the page reacts: no navigation, no button handlers. */
  e.preventDefault();
  e.stopPropagation();

  const info = reactInfo(el);
  const r = docRect(el);
  const n = ++state.seq;

  const pin = document.createElement('div');
  pin.className = `${NS}-pin`;
  pin.textContent = n;
  pin.style.top = (r.top + 10) + 'px';
  pin.style.left = (r.left + 10) + 'px';
  document.body.appendChild(pin);
  state.pins.push(pin);

  browser.runtime.sendMessage({
    type: 'PD_TAG',
    tag: {
      n,
      url: location.href,
      path: location.pathname,
      tagName: el.tagName.toLowerCase(),
      component: info.component,
      tree: info.tree,
      file: info.file,
      line: info.line,
      selector: selectorFor(el),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      styles: stylesFor(el),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rect: {
        top: Math.round(r.top), left: Math.round(r.left),
        width: Math.round(r.width), height: Math.round(r.height),
      },
      at: Date.now(),
    },
  }).catch(() => {});
}

function onKey(e) {
  if (e.key === 'Escape' && state.armed) {
    disarm();
    browser.runtime.sendMessage({ type: 'PD_DISARMED' }).catch(() => {});
  }
}

/* Capture phase throughout, so the page's own handlers never see these. */
function arm(startAt) {
  if (state.armed) return;
  state.armed = true;
  state.seq = Math.max(state.seq, startAt || 0);
  mount();
  document.documentElement.classList.add(`${NS}-armed`);
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
}

function disarm() {
  if (!state.armed) { unmount(); return; }
  state.armed = false;
  document.removeEventListener('mousemove', onMove, true);
  document.removeEventListener('click', onClick, true);
  document.removeEventListener('keydown', onKey, true);
  unmount();
}

browser.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === 'PD_ARM') { arm(msg.startAt); return Promise.resolve({ ok: true }); }
  if (msg.type === 'PD_DISARM') { disarm(); return Promise.resolve({ ok: true }); }
  if (msg.type === 'PD_CLEAR_PINS') {
    state.pins.forEach((p) => p.remove());
    state.pins = []; state.seq = 0;
    return Promise.resolve({ ok: true });
  }
});

/* Marker so a re-injection short-circuits at the top of this file. */
window.__previewDeck = { arm, disarm };
})();
