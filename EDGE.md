# Publishing Preview Deck to Microsoft Edge Add-ons

**Free.** No developer fee, unlike the Chrome Web Store. One Microsoft account
sign-in and the developer agreement — both yours to accept, same as any store.

Edge is Chromium, so **the exact package you already have works unchanged**:
`dist/preview-deck-1.0.0.zip`. Same manifest, same `chrome.*` APIs (Edge
aliases `browser.*` to them), same `debugger` and `sidePanel` support from
Edge 111+. Nothing to port.

---

## 1. Register (one time)

1. <https://partner.microsoft.com/dashboard/microsoftedge/public/login>
2. Sign in with a Microsoft account.
3. Accept the developer agreement. No fee.

## 2. Submit

1. **Partner Center → Edge Add-ons → Create new extension.**
2. Upload `dist/preview-deck-1.0.0.zip` — the identical file built for Chrome.
3. Edge runs an automated Manifest V3 validation on upload. It will flag
   anything incompatible; expect it to pass clean, since every API this
   extension uses already exists in Edge.
4. Paste the listing copy from **[STORE.md](STORE.md)** §2 — name, short
   description, detailed description are store-neutral and need no edits.
5. Permission justifications: Edge's dashboard asks for the same
   per-permission explanations as Chrome. Reuse **STORE.md** §3 verbatim.
6. Privacy policy URL: reuse **[PRIVACY.md](PRIVACY.md)**, published wherever
   you put it for the Chrome submission.
7. Screenshots: Edge accepts the same 1280×800 images — reuse the ones from
   §5 of STORE.md, no re-shoot needed.
8. **Submit for certification.**

## 3. Review

Edge's review is generally faster than Chrome's and has historically been
less aggressive about the `debugger` permission specifically, but expect the
same category of question if one comes: what it's for, and confirmation that
access is scoped to localhost only (it is — same `host_permissions` as the
Chrome build).

Edge certification is typically **a few days**. You'll get email at each
status change.

## 4. After approval

Edge Add-ons supports the same **Private/Unlisted** visibility as Chrome, if
you'd rather have a link than a public listing.

---

Every other Chrome-specific caveat in **STORE.md** — the single-purpose
statement, the "no remote code" answer, the data-collection disclosures —
applies here unchanged. This file only covers where Edge's process differs.
