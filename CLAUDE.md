# guthrieent

Static marketing site (Osos Discos / FableGear / Guthrie Entertainment)
deployed via Cloudflare Pages. No build step, no `package.json` — plain
HTML/CSS/JS at the repo root plus Cloudflare Pages Functions under
`functions/`.

## CI (`.github/workflows/ci.yml`)

One job today, `verify-site`, running `.github/scripts/verify-site.mjs`:
syntax-checks every `.js` file and every inline `<script>` block, and
confirms every local `src=`/`href=` in the HTML resolves to a real file.
It exists because of two real incidents in one session: an asset overwritten
via a direct GitHub upload, and a rename that needed a manual grep to confirm
every reference had been updated.

If more checks get added here later, keep the same discipline:

- **One job per concern.** A check that's chronically red (a lint backlog, a
  known-broken suite) can't tell anyone when something *new* breaks if it's
  bundled in with checks that are actually clean — split it into its own job
  until it's clean, then let it gate.
- **No silent skips.** A check that quietly no-ops when a dependency is
  missing (wrong runner, absent binary, empty config) looks identical to a
  pass from the outside. Pin what a check needs and fail loud rather than
  assume the environment has it.
- **Comment the why, not the what — ideally tied to the actual incident or
  stakes**, not a restatement of the code below it. `verify-site.mjs`'s
  comments do this on purpose; keep doing it as this file grows.
- **Note deliberate trade-offs explicitly** (e.g. "slower, but adds no new
  supply-chain dependency") so nobody "fixes" a choice that was intentional.
