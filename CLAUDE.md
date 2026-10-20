# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal travel-itinerary web app. There is **no build system or required package manager**. Run regression tests with `node --test tests/gas.test.cjs tests/frontend.test.cjs tests/sw.test.cjs`; use a local static server for browser checks. The repo is just:

- `index.html` — the **single** self-contained front-end (HTML + inline `<style>` + Tailwind via CDN + vanilla JS in one `<script>`). It serves **all** trips: a `TRIPS` registry near the top of the `<script>` holds each trip's theme + header text, a dropdown switches between them, and the theme is applied via CSS variables. Adding a trip = adding one entry to `TRIPS` (no new file).
- `Hokkaido2026.html` — a tiny redirect to `index.html?trip=hokkaido202606`, kept only so old bookmarks/links still work.
- `Code.gs` — the Google Apps Script (GAS) backend. **This file is not run from the repo.** Sync it (plus `ImportNovember.gs` and `data/november2026.js`) with clasp or the GAS editor, then update the existing Web App deployment version. See README.md for backup and sync steps.
- `manifest.json`, `sw.js`, `icon.svg` — PWA assets (installable + offline app shell). `index.html` links the manifest, registers `sw.js`, and updates the `theme-color` meta per trip. The service worker caches the app shell + CDN assets but **never** caches the GAS endpoint (data freshness stays with the front-end's `localStorage` + `version`). `icon.svg` is used for both the manifest icon and `apple-touch-icon`; iOS may prefer a PNG — add one later if needed.
- `data/november2026.js` — shared November seed for browser preview and idempotent GAS import; unknown times stay blank, estimates are not expenses.
- `ImportNovember.gs` — validates existing headers and inserts only missing seed IDs.
- `tests/` — Node built-in tests with mocked GAS services; never writes production data.
- `.claspignore` — explicit GAS upload allowlist; actual `.clasp.json`, credentials, remote manifest and backups are ignored.
- `pic/` — reference screenshots (gitignored).

To preview the front-end, open `index.html` directly in a browser (or via GitHub Pages). It will hit the live GAS endpoint immediately.

## Architecture

Three tiers, but only two live in this repo:

```
index.html (this repo)  →  GAS Web App / Code.gs  →  Google Sheets (7 tabs)
   fetch GET/POST            doGet / doPost            data store
```

- **Frontend**: `doGet` returns public trip data as JSON plus a `version` field; expenses, participants, linked amounts, flight booking references and flight notes are excluded. Authenticated POST `verify`/`readPrivate` returns full data in `data`; the page caches public data only in `localStorage` (`cache_<TRIP_ID>`) and the version in `ver_<TRIP_ID>`, renders the cache instantly on load, then refetches. If the returned `version` matches the cached one, the second re-render is skipped (no flicker). All writes go through `apiPost` → `doPost`, distinguished by an `action` field. POSTs use `Content-Type: text/plain` to dodge a CORS preflight against the GAS endpoint.
- **Trip selection**: A valid URL `?trip=` takes priority; a bare homepage resolves `Config.defaultTrip` on the server (or the latest trip by its first itinerary date when unset). Old `tripChoice` / `selectedTrip` values no longer override the homepage. `defaultTripHint` only supplies a provisional/offline view. After unlocking, “將目前旅行設為首頁預設” sends authenticated POST `setDefaultTrip`; the key must authorize the target trip and the trip must exist in Itinerary. The dropdown updates the URL, exits edit mode, and reloads. The initial fallback is `osaka-shiga-kumamoto202611`.
- **Caching / speed**: `doGet` uses global + per-trip generations and a five-minute time bucket. A matching `?version=` returns `notModified` without opening Sheets. Explicit-trip cache hits also avoid opening Sheets. Mutations lock, validate the target record's actual trip, bump only that trip, and return affected tables in `changes`. The front-end merges these instead of doing another GET (older responses fall back to a forced GET). A manual-edit trigger can invalidate immediately; time buckets cover edits without the trigger. Day cards render lazily, and stale requests are ignored.
- **Auth**: Private reads, edit mode and the expense report require a key that is verified row-by-row against the `Auth` sheet (`authenticateUser` in `Code.gs`); the key is sent with every mutating request. A blank `TripID` in the `Auth` row grants access to all trips. **Device session (persisted login)**: on a successful verify the key is saved to `localStorage.authKey`; on load (and after a trip switch) `tryRestoreAuth()` silently re-verifies it against the current trip and re-enters edit mode if valid, so a reload doesn't log you out. A failed silent verify does **not** clear the key (it may simply not apply to that trip). Clicking the unlock 🔓 button is an explicit logout — it clears `authKey`. The key is plaintext in `localStorage`, which is acceptable for this personal app (see the equivalent risk discussion: only same-device/XSS access).
- **Backing sheet**: The core data schema (Itinerary, FlightInfo, Checklist, Auth, Participants, Expense) and every column is documented in detail in `.github/copilot-instructions.md` — read that before touching column logic. A 7th `Config` tab (two columns: `Key`, `Value`) holds app settings; `defaultTrip` selects which trip shows when no `?trip=` is given. The column-index constants at the top of `Code.gs` (`IT_COL`, `FL_COL`, `CK_COL`, `PT_COL`, `EX_COL`) are 1-based and **must match the physical column order in the Sheet**.

## Cross-cutting behaviors to preserve

- **Itinerary is the hub.** Two side tables are auto-synced from it in `handleCreate` / `handleUpdate` / `handleDeleteItinerary`:
  - When an itinerary item's `Type` is `plane`, a `FlightInfo` row is created/updated/deleted in lockstep, linked by `FlightID`. FlightInfo is authoritative: itinerary `Time`↔flight `DepartTime`, `ActualEndTime`↔`ArriveTime`, and `Date`↔`DepartDate` synchronize through the flight update handler. Direct deletion of linked flights is rejected; the UI directs users to the linked itinerary.
  - When "record to expense" is first checked, an `Expense` row is created and linked by `ExpenseID`. Existing linked expenses are edited only through the expense form; saving an itinerary must never overwrite them. Cards, itinerary forms and copying resolve linked amounts/currency from `Expense`, never the legacy itinerary values. Unchecking deletes the linked expense and clears the itinerary amount; deleting an itinerary cleans up the linked expense. Unlinked itinerary amounts remain display-only estimates. Non-itinerary spending is added directly to the `Expense` sheet.
- **Adding or moving a Sheet column requires a coordinated edit across files**: update the `*_COL` constant in `Code.gs`, then the relevant `handleCreate`/`handleUpdate` append/setValue logic, then the modal form and render functions in `index.html`. Missing one silently corrupts data because rows are written positionally.
- The front-end is now a single file — a behavior fix lands in `index.html` once and applies to all trips. Anything trip-specific (colors, header text, thumbnail icons) lives in the `TRIPS` registry, not scattered through the markup.

## Making changes effective

- Editing GAS files in the repo does nothing until they are synced to the GAS project and a **new Web App version** is deployed (Deploy → Manage deployments → Edit → new version). Note this in any PR that touches `Code.gs`.
- `PLACES_API_KEY` in `Code.gs` is intentionally blank; when empty, place search degrades to generating a Google Maps search URL instead of calling the Places API.
