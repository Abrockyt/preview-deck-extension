# Publishing Preview Deck to Firefox (addons.mozilla.org)

**Free.** No developer fee. One Mozilla account and acceptance of the
Firefox Add-on Distribution Agreement — both yours to do.

## This is a different build, not a relabeled zip

Firefox's WebExtensions API has no equivalent to Chrome's `chrome.debugger` /
DevTools Protocol — no way to emulate a device viewport, no way to screenshot
one. **"Capture all device sizes" does not exist in this build.** Everything
else does: element tagging, React `_debugSource` file:line, the component
tree, the selector, computed styles, notes, and Markdown export.

Two other things don't map to Chrome directly, so they were ported rather
than copied:

| Chrome/Edge | Firefox | Why |
|---|---|---|
| `chrome.sidePanel` + `side_panel` manifest key | `sidebar_action` manifest key + `browser.sidebarAction.open()` | Firefox has no side-panel API; `sidebar_action` is its long-standing equivalent |
| `background.service_worker` | `background.scripts` | Firefox's MV3 service-worker support is new and inconsistent across versions; the classic background-script form works everywhere `strict_min_version` targets |
| `chrome.*` namespace | `browser.*` namespace | Firefox's native, promise-based API — used directly rather than through the `chrome.*` compatibility shim |

Source lives in `firefox/` as its own self-contained tree — its own manifest,
background script, content script, sidebar, and popup. Nothing there imports
from or depends on the Chrome build.

---

## 1. Build the upload

```bash
node tools/package-firefox.js
```

Produces `dist/preview-deck-firefox-1.0.0.zip` — 12 files, ~22 KB,
`manifest.json` at the archive root. The script refuses to build if the
manifest requests `debugger` (which would mean the two trees had drifted back
together) or is missing the `gecko.id` AMO requires.

Bump `"version"` in `firefox/manifest.json` for every upload — kept
independent of the Chrome build's version, since the two ship different
feature sets and may release on different schedules.

---

## 2. Submit

1. <https://addons.mozilla.org/developers/> — sign in with a Mozilla account.
2. **Submit a New Add-on → On this site** (self-distributed/"Unlisted" is also
   available and skips public listing, same tradeoff as the Chrome/Edge
   guides describe).
3. Upload `dist/preview-deck-firefox-1.0.0.zip`.
4. Mozilla's automated validator runs immediately and is stricter than
   Chrome's about a few things specific to this build:
   - It will confirm `manifest_version: 3` is supported at your declared
     `strict_min_version` (115 — Firefox's MV3 baseline).
   - It will **not** ask about `debugger`, because the manifest never
     requests it.
5. Listing copy: reuse the **single-purpose statement** from `STORE.md` §3,
   adjusted for the missing feature:
   > Preview Deck lets a developer annotate elements on a locally-served web
   > page with their source location, exporting the result as Markdown.
6. Permission justifications — AMO asks per-permission, same spirit as
   Chrome:

   | Permission | Justification |
   |---|---|
   | `activeTab` | Limits access to the tab the user explicitly invoked the extension on. |
   | `scripting` | Injects the tagging script into the active tab only while tagging is armed; removed on disarm. No persistent content script is declared. |
   | `storage` | Stores tags and notes locally via `browser.storage.local` so they survive closing the sidebar. Nothing is transmitted anywhere. |
   | `tabs` | Reads the active tab's URL to confirm it is localhost, and to group exported feedback by page. |
   | Host permission `http://localhost/*`, `http://127.0.0.1/*` | The extension is a local development tool and cannot access any other origin. |

7. Privacy policy: reuse `PRIVACY.md`, noting it applies to this build too —
   the same "collects nothing, stores locally, no network requests"
   statement is true here, arguably more so, since there's no `debugger`
   permission to explain at all.
8. **Submit for review.**

## 3. Review

AMO reviews are typically faster than Chrome's, often within a day or two for
a "Listed" submission and closer to instant for "Unlisted." Because this
build never requests `debugger`, it does not draw the scrutiny that
permission attracts on Chrome.

## 4. Signing

Every add-on submitted to AMO — even self-distributed, unlisted ones — is
**signed by Mozilla** as part of approval. An unsigned `.xpi` will not load in
release Firefox at all, so this step is not optional the way icons or
screenshots are; without it, nobody can install the build regardless of where
you host the file.

---

Everything else — the "no remote code" answer, the data-collection
disclosures certifying nothing is collected — carries over from `STORE.md`
unchanged.
