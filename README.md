# Guthrie Submission Form — Integration Files

Drop-in files for the **guthrieent** repo (deploys to Cloudflare Pages as `guthrieent-git` → guthrieent.com).

## What's in here

| File | Purpose |
|---|---|
| `functions/api/submit.js` | Pages Function — receives form POST, validates, inserts into D1, sends email via Resend |
| `functions/api/submissions.js` | Pages Function — returns submissions JSON for the dashboard (protected by `DASHBOARD_KEY`) |
| `dashboard.html` | Admin dashboard page — view and delete submissions (key-gated) |
| `public/form-widget.js` | Popup form widget — drop-in script that adds the form to any page |
| `schema.sql` | D1 table creation script for the `submissions` table |

## Bindings already configured on your Pages project

These are already set on `guthrieent-git` (production + preview):
- **D1** → `DB` (database `49364f3d-a798-49f0-b397-dd82329497e2`)
- **Secret** → `RESEND_API_KEY`
- **Env** → `MAIL_FROM` (`Guthrie Bookings <bookings@guthrieent.com>`)
- **Env** → `MAIL_TO` (`admin@guthrieent.com`)
- **Secret** → `DASHBOARD_KEY`

## Setup steps

### 1. Create the D1 table

```sh
npx wrangler d1 execute DB --remote --file=schema.sql
```

### 2. Copy these files into your guthrieent repo

```
guthrieent/
├── functions/
│   └── api/
│       ├── submit.js
│       └── submissions.js
├── public/
│   └── form-widget.js
├── dashboard.html
└── (your existing site files)
```

### 3. Add the widget to your site pages

Add this line before `</body>` on any page where you want the popup form:

```html
<script src="/form-widget.js" defer></script>
```

### 4. Commit and push

```sh
git add .
git commit -m "Add submission form, API endpoints, and admin dashboard"
git push origin main
```

Cloudflare auto-deploys on push to `main`.

### 5. Verify

- Visit **guthrieent.com** → the "Submit / Book" button appears bottom-right
- Fill out and submit → success message appears
- Check `admin@guthrieent.com` for the notification email
- Visit **guthrieent.com/dashboard.html** → enter your `DASHBOARD_KEY` → see submissions

## Notes

- The form widget has **no builder panel** for visitors — it's a clean submission form only.
- All secrets stay server-side in the Pages Functions. Nothing sensitive is in the browser.
- The `d1submissions` Worker is no longer needed once this is deployed — the Pages Functions handle everything.