# Preview Deck — Privacy Policy

_Last updated: 13 August 2026_

Preview Deck is a local development tool. It collects nothing, transmits
nothing, and has no server.

## What is collected

**Nothing is collected.** No personal information, no usage analytics, no
telemetry, no crash reports, no identifiers of any kind. There is no account
to create and no sign-in.

## What is stored, and where

The extension writes three kinds of data to `chrome.storage.local`, which is
storage on your own computer inside your own Chrome profile:

| Data | Why |
|---|---|
| Screenshots you capture | So they survive closing the side panel |
| Element tags — component name, source file and line, CSS selector, text, computed styles, viewport size | So the exported report can reference them |
| Notes you type | So they survive closing the side panel |

This data never leaves your machine. It is not synced across devices. The
**Clear** button deletes all of it, and uninstalling the extension removes it
along with the extension.

## Network activity

Preview Deck makes **no network requests**. It contains no analytics, no
remote code, no CDN links, no fonts, and no external images. Every file it
runs is inside the package you installed.

## What it can access

The extension declares host permissions for `http://localhost/*` and
`http://127.0.0.1/*` only. Chrome enforces this: Preview Deck is technically
incapable of reading, capturing or modifying any other website, including any
page you visit while it is installed. It is not a setting and cannot be
widened without publishing a new version that you would have to approve.

The `debugger` permission is used solely to resize the viewport and take
screenshots of a tab you have explicitly asked it to capture. It attaches only
during a capture and detaches when the capture ends, including if the capture
fails or the tab is closed mid-run.

The element tagger is injected into a page only while you have armed tagging,
and removes itself when you disarm it or press Escape. When it is idle, the
extension runs no code on any page.

## Third parties

There are none. No data is sold, shared, or transferred to anyone, for any
purpose.

## Changes

Any change to this policy will accompany a new published version, and the date
above will change with it.

## Contact

Raise an issue on the project's repository.
