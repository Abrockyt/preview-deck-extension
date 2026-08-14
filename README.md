# Preview Deck

Captures a localhost dev page at six device sizes, lets you tag elements with
their React source `file:line`, and exports agent-ready Markdown.

No dependencies, no build step. Plain HTML/CSS/JS, Manifest V3.

Two builds live in this repo:

| | Root (this folder) | `firefox/` |
|---|---|---|
| Browsers | Chrome, Edge | Firefox |
| Device screenshots | Yes | **No** — see below |
| Tagging + `file:line` + Markdown export | Yes | Yes |

**Chrome and Firefox extensions cannot be the same code.** Firefox's
WebExtensions API has no equivalent to `chrome.debugger` / the DevTools
Protocol, so there is no way to emulate a device viewport or screenshot one —
that's not a manifest setting, it's a capability the platform doesn't expose.
The `firefox/` build is a genuine port with that feature removed, not a
relabeled copy; its `sidebar_action` and `background.scripts` also differ from
Chrome's `side_panel` and service worker, since Firefox's equivalents work
differently. See **[FIREFOX.md](FIREFOX.md)** for the full list of what
changed and why.

## Install (Chrome / Edge)

1. Open `chrome://extensions` (or `edge://extensions`)
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this folder (the repo root, not `firefox/`)
4. Start your dev server and open `http://localhost:…`
5. Click the Preview Deck toolbar icon → **Open Preview Deck**

Pin it from the extensions menu to keep it in the toolbar.

## Install (Firefox)

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** → select `firefox/manifest.json`
3. Start your dev server, open `http://localhost:…`
4. Click the Preview Deck toolbar icon → **Open Preview Deck**

Temporary add-ons unload when Firefox closes; see `FIREFOX.md` for a signed,
persistent install.

## Sharing it

```bash
node tools/package.js            # → dist/preview-deck-<version>.zip           (Chrome/Edge)
node tools/package-firefox.js    # → dist/preview-deck-firefox-<version>.zip   (Firefox)
```

For a developer audience, a public repo plus "Load unpacked" is the fastest
route — no review, no fee, works for both builds. For a shareable store link
with auto-update:

- **[STORE.md](STORE.md)** — Chrome Web Store: listing copy, permission
  justifications, the $5 fee and developer agreement only the account owner
  can complete.
- **[EDGE.md](EDGE.md)** — Microsoft Edge Add-ons: same zip as Chrome, free,
  no fee.
- **[FIREFOX.md](FIREFOX.md)** — addons.mozilla.org: the `firefox/` build,
  free, no fee, requires Mozilla's mandatory signing step.

Icons are generated, not committed as opaque blobs, and shared by both builds:

```bash
node tools/make-icons.js     # → icons/icon{16,32,48,128}.png, copied into firefox/icons/
```

## Use

**Capture all device sizes** — attaches the debugger, steps through Mobile /
Mobile L / Tablet / Laptop / Desktop / Wide, screenshots each, then clears the
override and detaches. The "this tab is being debugged" banner disappears when
it finishes.

**Tag element** (or `Alt+Shift+A`) — injects the tagger into the page. Hover to
outline, click to drop a numbered pin and send the tag to the panel. `Esc`
disarms and removes every pin. The content script is injected on demand and torn
down on disarm, so pages carry nothing when the tool is idle.

**Copy feedback** — Markdown grouped by page URL: `file:line`, component tree,
selector, tagged viewport, styles, an element crop, and your note; then the full
device captures. Anything over ~500 KB is halved before embedding.

## Scope

`host_permissions` is limited to `http://localhost/*` and `http://127.0.0.1/*`.
The extension cannot read, capture or inject into any other site, and the panel
disables its buttons on non-local tabs.

## Requires a React development build

`file:line` comes from React's `_debugSource`, which only exists under the
development JSX transform — dev servers have it, production builds strip it, and
React 19 removed it. Without it the tag still records the component tree,
selector, styles and note; only the line is omitted.

Line numbers count from the top of the **transformed** module. Bundlers that
inject a preamble (Vite's React plugin adds a React Refresh header) shift every
line down by that amount, so treat the number as a strong hint and the component
name plus selector as the exact locators.

## Files

**Chrome / Edge build (repo root):**

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest, permissions, side panel + popup wiring |
| `background.js` | Service worker: debugger session, capture loop, message relay |
| `content.js` | On-demand element tagger; fiber reading, pins, teardown |
| `sidepanel.html/.css/.js` | The panel UI: captures, tags, export |
| `popup.html/.js` | Toolbar button that opens the panel |

**Firefox build (`firefox/`), self-contained — no shared code with the root:**

| File | Role |
|---|---|
| `firefox/manifest.json` | MV3 manifest for Firefox: `sidebar_action`, `background.scripts`, no `debugger` permission |
| `firefox/background.js` | Message relay only — no debugger session, since none exists |
| `firefox/content.js` | Same tagger logic as the root build, on `browser.*` instead of `chrome.*` |
| `firefox/sidebar.html/.css/.js` | The sidebar UI: tags and export — no captures section, no lightbox |
| `firefox/popup.html/.js` | Toolbar button, opens the sidebar via `browser.sidebarAction.open()` |

**Shared:**

| File | Role |
|---|---|
| `icons/`, `firefox/icons/` | Generated 16/32/48/128 PNGs, identical in both |
| `tools/make-icons.js` | Draws the icons — no dependencies, PNG written by hand |
| `tools/package.js` | Builds the Chrome/Edge upload zip — ZIP written by hand |
| `tools/package-firefox.js` | Builds the Firefox upload zip — same approach, refuses to build if `debugger` sneaks into the Firefox manifest |
| `STORE.md` | Chrome Web Store listing copy, permission justifications, submission steps |
| `EDGE.md` | Edge Add-ons submission steps (same zip as Chrome) |
| `FIREFOX.md` | AMO submission steps, and the full list of what differs from Chrome and why |
| `PRIVACY.md` | Privacy policy (every store requires a public URL for one) |

Both packagers use an allow-list, not an ignore-list, so a new dev file can
never leak into a build by being forgotten.
