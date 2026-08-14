/*
 * Cloudflare Pages Function — receives the FableGear survey POST and forwards it
 * to the Google Apps Script collector, which appends a row to the spreadsheet.
 *
 * WHY THE PAGE DOES NOT POST TO APPS SCRIPT DIRECTLY
 *   Two browser-side problems disappear by going through this Function:
 *     1. CSP. `_headers` sets `connect-src 'self' https://api.resend.com`, so a
 *        fetch() straight to script.google.com is refused before it leaves the
 *        page. /api/survey is same-origin, which 'self' already allows.
 *     2. CORS. Apps Script exposes doGet/doPost but has no doOptions, so a
 *        JSON content-type triggers a preflight it cannot answer and the POST
 *        never runs. Server-to-server has no preflight at all.
 *   It also keeps the collector URL out of the public HTML, so the endpoint
 *   can be rotated without a site deploy.
 *
 * Setup (one-time):
 *   1. Create the spreadsheet, add apps-script/Code.gs via Extensions > Apps
 *      Script, and deploy it as a Web app ("Execute as: Me",
 *      "Who has access: Anyone"). Copy the /exec URL.
 *   2. In the Cloudflare Pages dashboard for this site:
 *        Settings → Environment variables → Production
 *        Add:
 *          SURVEY_SHEET_URL = https://script.google.com/macros/s/AKfy.../exec
 *   3. Redeploy.
 *
 * Until SURVEY_SHEET_URL is set this returns 503 and the page keeps the
 * response in localStorage, so no answer is lost while the sheet is being set up.
 */

const MAX_FIELD_LENGTH = 5000;
const MAX_FIELDS = 200;

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  // Honeypot: bots fill hidden fields. Pretend success, store nothing.
  if (data.hp_website) {
    return json({ ok: true });
  }
  delete data.hp_website;

  const keys = Object.keys(data);
  if (keys.length > MAX_FIELDS) {
    return json({ ok: false, error: 'Too many fields.' }, 413);
  }
  for (const value of Object.values(data)) {
    if (typeof value === 'string' && value.length > MAX_FIELD_LENGTH) {
      return json({ ok: false, error: 'Payload too large.' }, 413);
    }
    if (Array.isArray(value) && value.length > MAX_FIELDS) {
      return json({ ok: false, error: 'Payload too large.' }, 413);
    }
  }

  // Stamped here rather than trusted from the client, which has an arbitrary clock.
  data.received_at = new Date().toISOString();
  if (!data.submitted_at) data.submitted_at = data.received_at;

  if (!env.SURVEY_SHEET_URL) {
    console.error('SURVEY_SHEET_URL is not set; survey response not stored.');
    return json({ ok: false, error: 'Collector not configured yet.' }, 503);
  }

  try {
    // text/plain is deliberate: it keeps this a CORS-simple request, which
    // matters if this ever runs from a context that enforces preflight. Apps
    // Script reads e.postData.contents either way, so JSON.parse is unaffected.
    const res = await fetch(env.SURVEY_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data),
      redirect: 'follow',
    });

    if (!res.ok) {
      console.error('Collector returned', res.status);
      return json({ ok: false, error: 'Collector rejected the response.' }, 502);
    }

    // Apps Script returns 200 with {status:'error'} for its own failures, so a
    // 200 alone is not proof the row landed.
    const body = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      // A login page or an HTML error means the deployment is not public.
      console.error('Collector returned non-JSON; check "Who has access: Anyone".');
      return json({ ok: false, error: 'Collector misconfigured.' }, 502);
    }

    if (parsed.status !== 'success') {
      console.error('Collector error:', parsed.message);
      return json({ ok: false, error: 'Collector could not store the response.' }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('Collector unreachable:', err);
    return json({ ok: false, error: 'Could not reach the collector.' }, 502);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
