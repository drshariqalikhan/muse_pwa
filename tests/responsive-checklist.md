# Responsive UI testing checklist — muse_pwa

Formal version of the checklist used in the Responsively retests (2 Nov 2026).
It is a living checklist, not a one-off report: run it after any change to
`index.html`, `styles.css`, `app.js` or `sw.js`, and before any release.

## How to run it

Two routes, in this order:

1. **Automated (functional + geometry):** `node tests/responsive-check.js`
   (needs Playwright installed, e.g. `npm i -D playwright`, and the app served
   locally, e.g. `python -m http.server 8000` from the repo root).
   Set `APP_URL` to the served URL if it is not `http://127.0.0.1:8000/`.
   The script detects whether Bulma actually loaded. If Bulma failed to load
   (e.g. the cloud sandbox, where the Bulma CDN is unreachable), layout
   checks are reported as SKIPPED, not FAILED — layout results from a
   Bulma-less run are invalid, because the app is unstyled there.
2. **Visual (real layout, on the PC):** Responsively 2.0 beta via the
   pc_agent MCP bridge, at `http://127.0.0.1:8000/`. This is the route that
   proves layout, because Bulma loads on the PC. **One device at a time:**
   use Responsively's **Canvas** option (bottom toolbar) — devices are
   frames on a canvas, click a device's label to select it, pan/zoom to
   that one device, test it fully, then select the next. Do NOT achieve
   this by setting only one active device, and do not rely on Focus
   (Focus was the earlier method, Canvas supersedes it). Per-device MCP
   screenshots give the full view of the selected device. Do not assume
   Responsively mirroring covers all previews — click/send on each device
   individually.

## Viewport matrix

Test the breakpoint itself, not just named devices. The app's mobile
breakpoint is `max-width: 768px`, so 767 and 769 matter as much as 768.

| Width | What it proves |
|---|---|
| 375×667 | Small phone, single column |
| 393×852 | iPhone 17 (prevalent 2026 phone) |
| 412×915 | Pixel 10 / Galaxy S24 Ultra (prevalent 2026 Android) |
| 767×800 | Just below the breakpoint: drawer mode |
| 768×1024 | Exactly at the breakpoint: drawer mode (iPad Mini portrait) |
| 1024×1366 | Tablet landscape / small laptop: sidebar visible |
| 1440×900 | Desktop: sidebar visible |
| 852×393, 915×412 | Landscape phones: width > 768, so sidebar visible |

Named devices are a convenience, not the test. If a device is not in
Responsively's list (e.g. Galaxy S25 in Nov 2026), test the closest
prevalent device and say so — do not claim the missing device was tested.

## Checklist (every viewport, unless noted)

- [ ] **No horizontal scroll:** `scrollWidth <= clientWidth` (no content clipped off-screen).
- [ ] **Layout reflows:** single column on phone, sidebar on desktop; no overlap of header, messages, composer.
- [ ] **Composer pinned:** after sending, the textarea + Send button sit at the bottom edge of the viewport (gap <= 2px). This was the Nov 2026 bug: a `max-height` cap on the message list left white space below the composer.
- [ ] **Key flow works:** example prompt fills the composer without sending; Send gives a user message + AI placeholder reply; New chat returns to Welcome with the previous conversation preserved.
- [ ] **Navigation reachable:** sidebar on desktop; drawer toggle (☰) on mobile, with New chat / Connection tests / conversation list inside the drawer.
- [ ] **Touch targets:** Send and example buttons at least 44×44 CSS px on mobile.
- [ ] **Text readable:** body text at least 16px, no text clipped at any width; long messages wrap.
- [ ] **Keyboard:** Tab moves focus in a sensible order; focus indicator visible; Enter sends, Shift+Enter makes a newline.
- [ ] **Orientation:** portrait and landscape both work on phones; landscape width > 768 shows the desktop sidebar layout.
- [ ] **No hover-only interactions:** every action reachable by tap/keyboard, not only by hover.
- [ ] **Service worker note:** after a CSS/JS change, the first load may still serve the old cached file. Reload once after the new service-worker version activates, then re-check the composer position. A gap that disappears on reload is a stale-cache artefact, not a layout bug. **Per-preview warning (found 2 Nov 2026):** in Responsively, each preview updates its service-worker cache on its own schedule — one navigate does not reliably update all previews, and the same device gave gap 0px in one screenshot and ~200px in another on the same code. Do not trust a single screenshot per device for the composer check: reload that device's preview several times, and only trust a result that is stable across reloads.
- [ ] **Real-device spot check (before release):** at least one real iOS and one real Android device, not just emulation.

## Known open issues (do not re-report as new)

- **Drawer cannot be closed on mobile** (confirmed 2 Nov 2026, three times): once opened, the fixed 80% sidebar covers the toggle, and there is no outside-click close or auto-close on selection. Reload is the workaround. This was deliberately not fixed in the Nov 2026 composer fix.
- **Step 1 in-memory limitation:** switching conversations restores the title but not the messages. Real persistence is BUILD Step 5, not a responsive bug.
