# Publishing Preview Deck

Everything here is ready to paste into the Chrome Web Store developer
dashboard. Three steps are yours alone and cannot be automated — a Google
account sign-in, a **one-time $5 developer registration fee**, and accepting
the developer agreement.

---

## Read this before you pay the $5

**The `debugger` permission is the single most scrutinised permission on the
Web Store.** Preview Deck needs it — it is the only way to emulate device
metrics and screenshot a viewport that is not the window you are looking at.
Expect one or more of:

- an extended review (days to weeks, not hours),
- a request for a demo video or written explanation,
- rejection, with "does not have a narrow enough single purpose" or "requests
  more permission than necessary" as the stated reason.

That is not a reason to skip it, but it is a reason to know what you are
buying with the $5.

**There is a faster route that fits this tool better.** Preview Deck only runs
on `localhost` — its entire audience is developers who already have Chrome in
developer mode. Push the folder to a public GitHub repo and the install is
three clicks with no review, no fee, and no waiting:

> `chrome://extensions` → Developer mode → Load unpacked

If you want a shareable link *and* the store's auto-update, publish as
**Unlisted** rather than Public. Unlisted goes through the same review but
never appears in search, which usually draws less scrutiny.

---

## 1. Build the upload

```bash
node tools/make-icons.js     # only when the icon changes
node tools/package.js
```

Produces `dist/preview-deck-1.0.0.zip` — 12 files, ~27 KB, `manifest.json` at
the archive root. Upload that file exactly as produced; re-zipping the folder
by hand nests it one level deep and Chrome rejects it.

Bump `"version"` in `manifest.json` for every upload. The store refuses a
version it has already seen.

---

## 2. Listing copy

**Name**

```
Preview Deck
```

**Short description** (132 char limit — this is 128)

```
Capture your localhost dev page at 6 device sizes, tag elements with their React source file:line, export Markdown for AI agents.
```

**Category:** Developer Tools
**Language:** English

**Detailed description**

```
Preview Deck is a review tool for local web development. It answers one
question fast: what does my page look like at every device size, and which
file do I edit to change this specific thing?

CAPTURE
One click screenshots your page at six device sizes — Mobile 375, Mobile L
430, Tablet 768, Laptop 1024, Desktop 1440 and Wide 1920. Each one is a real
emulated viewport, so your own media queries fire exactly as they would on
the device. Click any capture to view it full size.

TAG
Arm tagging and click anything on the page. Preview Deck records the element's
component name, its ancestor component chain, a short CSS selector, the text,
the key computed styles, the viewport you tagged it at — and, on a React
development build, the source file and line number. A numbered pin drops onto
the page so you can see what you have covered.

EXPORT
"Copy feedback" assembles everything into Markdown grouped by page URL, with
the screenshots embedded. Paste it straight into Claude, Cursor, Copilot or a
GitHub issue. Instead of "the hero looks cramped on mobile", your agent gets
the file, the line, the component, the selector, the measured styles and a
picture.

SCOPE
Preview Deck works only on http://localhost and http://127.0.0.1. It cannot
read, capture or touch any other website — that restriction is enforced by the
extension's permissions, not by a setting you could change.

Nothing leaves your machine. No account, no telemetry, no network requests of
any kind. Notes and captures are stored locally and cleared with one button.

REQUIREMENTS
- Chrome 116 or newer.
- Source file:line requires a React development build. Without React, or on a
  production build, every other detail is still captured.
```

---

## 3. Permission justifications

The dashboard asks for one per permission. These are the answers.

| Permission | Justification to paste |
|---|---|
| `debugger` | Required to emulate device viewport sizes via `Emulation.setDeviceMetricsOverride` and screenshot each one via `Page.captureScreenshot`. This is the only Chrome API that can render and capture a viewport different from the visible window, which is the extension's core function. The session is attached only for the duration of a capture, always detached in a `finally` block, and additionally released on tab close, navigation and reload. |
| `activeTab` | Limits the extension to the tab the user has explicitly invoked it on, rather than requesting access to all tabs. |
| `scripting` | Injects the element-tagging script into the active tab on demand, only while the user has armed tagging, and removes its listeners and page elements on disarm. The extension declares no persistent content scripts. |
| `storage` | Stores the user's notes, tags and captured screenshots locally via `chrome.storage.local`, so they survive closing the side panel. Nothing is transmitted. |
| `tabs` | Reads the active tab's URL to confirm it is a localhost address before doing anything, and to group exported feedback by page. |
| `sidePanel` | The review interface is a side panel so it stays open while the user interacts with the page. A popup would close on every click. |
| Host permission `http://localhost/*`, `http://127.0.0.1/*` | The extension is a local development tool. These are the only origins it can access; it deliberately does not request `<all_urls>` or any public site. |

**Single purpose** (a required field, and the one most often failed):

```
Preview Deck captures a locally-served web page at multiple device viewport
sizes and lets the developer annotate specific elements with their source
location, exporting the result as Markdown. Every feature serves that one
review-and-report workflow.
```

**Are you using remote code?** — **No.** All code is in the package; the
extension loads no scripts, fonts, styles or data from any external origin.

---

## 4. Data disclosures

On the Privacy tab, certify all of the following:

- **Does not collect or use** any of the listed data categories.
- Data is **not** sold to third parties.
- Data is **not** used or transferred for purposes unrelated to the single purpose.
- Data is **not** used or transferred to determine creditworthiness or for lending.

Privacy policy URL — required even when you collect nothing. Publish
`PRIVACY.md` from this folder somewhere public (a GitHub repo file, or GitHub
Pages) and paste that URL.

---

## 5. Store assets you still need

The build does not produce these; they need a screen recorder and a moment.

| Asset | Spec | Required |
|---|---|---|
| Screenshots | 1280×800 or 640×400 PNG/JPEG, 1–5 of them | **Yes, at least one** |
| Small promo tile | 440×280 PNG/JPEG | No |
| Marquee promo tile | 1400×560 PNG/JPEG | No |
| Store icon | 128×128 — already in the package | Done |

Good screenshots for this one: the side panel with six captures filled in; the
panel with two or three tags showing `file:line`; the lightbox open on a
Desktop capture.

---

## 6. Submit

1. <https://chrome.google.com/webstore/devconsole> — sign in.
2. Pay the one-time **$5** registration fee if you have not before.
3. **New item** → upload `dist/preview-deck-1.0.0.zip`.
4. Fill the listing from §2, permissions from §3, privacy from §4, assets from §5.
5. Set visibility — **Unlisted** is the recommendation above.
6. **Submit for review.**

Steps 1, 2 and 5–6 require your Google account and your acceptance of Google's
developer terms. Nobody can do those for you, including an assistant.
