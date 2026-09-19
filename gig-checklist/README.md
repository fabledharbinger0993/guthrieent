# Gig Checklist

Internal gear + cable prep tool for gigs. **Completely separate from the
public guthrieent.com site** — no shared code, no shared data, nothing here
is linked from the main site and nothing on the main site is linked from
here. It happens to live in this repo, on its own branch, for now; it's
self-contained enough (three plain files, zero dependencies, zero build
step) to split into its own repo later with a straight copy — nothing to
untangle.

## Installing on your phone

This is a PWA (Progressive Web App) — it installs like a real app straight
from the browser, no App Store, no Mac, no Xcode:

**iPhone (Safari):** open the page → Share button → **Add to Home Screen**.
It launches full-screen with its own icon, no browser chrome, and works
with zero signal (a parking lot, a basement venue, airplane mode) once
you've opened it online at least once.

**Android (Chrome):** open the page → ⋮ menu → **Install app** (or
**Add to Home screen**, depending on Chrome version).

It has to be served over HTTPS for the "works offline" part to actually
work (or `localhost` while testing locally) — a `file://` link opened
straight from disk will run, but skips the install prompt and the offline
cache. If you're testing before this is deployed anywhere, run a quick
local server from this folder (`python3 -m http.server`) and open
`http://localhost:8000`.

**If you change `gear-data.js`, `app.js`, `styles.css`, or `index.html`
later:** bump `CACHE_VERSION` in `sw.js`, or your phone will keep showing
the old cached version until that changes. This is called out again at
the top of `sw.js` for the same reason.

## What it does

1. **Pick your gear.** Check off what you're bringing (speakers, DJ
   equipment, lighting, shelter), with quantities where it matters (how
   many K10.2s, how many CDJs).
2. **See the cables that implies.** Bringing the Alpha Theta Euphonia with
   two K10.2 mains and a CDJ pair automatically lists: XLR runs to each
   main, a digital cable per CDJ, and a Pro DJ Link Ethernet run between
   them. Some runs are genuinely either/or (a monitor's input jack decides
   whether you need 1/4"–1/4" or 1/4"–XLR) — those show up as an explicit
   choice to make, not a guess.
3. **Check things off as you pack**, both gear and individual cable runs.
4. **Print it** (or save as PDF) for the truck.

Everything persists to `localStorage` in the browser — there's no backend,
no login, no data leaving your machine. "New gig" clears it and starts
over.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell |
| `gear-data.js` | **Edit this one.** The gear inventory and the cable rules. Plain data — add a gear item, add or change a cable rule, no app logic to touch. |
| `app.js` | Rendering + state. Reads `gear-data.js`; shouldn't need editing unless you're changing how the app *works* rather than what it knows. |
| `styles.css` | Styling, including print styles. |
| `manifest.json` | PWA metadata (name, icons, standalone display) — what makes "Add to Home Screen" behave like a real app. |
| `sw.js` | Service worker — caches the app shell for offline use. Bump `CACHE_VERSION` here after editing any of the above. |
| `icons/` | Home-screen icon at the three sizes iOS/Android actually ask for (180/192/512). |

## Adding a new gear item

Add an entry to the right group in `window.GIG_GEAR` in `gear-data.js`:

```js
{ id: 'new-thing', name: 'New Thing', sub: 'What it is', max: 2 }
```

`id` must be unique across the whole file — it's what cable rules key off
of.

## Adding a cable rule

Cable rules key off a **source** — a mixer or all-in-one unit — and list
the runs that follow from what else is checked in. Add a new source block
to `window.GIG_CABLE_RULES`, or a new line to an existing one:

```js
{
  need: 'Short label for this run',
  fixed: 'Cable type',              // OR use `options: [...]` for an either/or
  when: (qty) => qty('some-gear-id') > 0,   // should this line show at all?
  count: (qty) => qty('some-gear-id'),      // how many of this cable?
}
```

`qty(id)` looks up how many of that gear id are currently checked in (0 if
none). See the existing Euphonia/OMNIS-DUO rules for real examples,
including the sub-to-sub daisy-chain count and the either/or monitor runs.

## Known gaps (intentionally left for you to fill in)

- No cable rule yet for the Reloop RB7000-MK2 turntables (phono/ground) —
  flagged as a note in the app when they're selected with nothing defined.
- Cable *lengths* aren't tracked, only types and counts — add a `length`
  field to a rule and render it if that becomes worth tracking.
- No multi-gig history — it's one gig's checklist at a time, cleared by
  "New gig." If you want to keep past checklists, that's a real feature to
  add (probably still `localStorage`, keyed by gig, before reaching for
  anything server-side).
