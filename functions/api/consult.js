/*
 * Cloudflare Pages Function — receives the consult form POST and emails it to us via Resend.
 *
 * Setup (one-time):
 *   1. Sign up at https://resend.com and verify the guthrieent.com domain
 *      (add the DNS records Resend gives you — TXT + a couple of CNAMEs).
 *   2. Create an API key at https://resend.com/api-keys
 *   3. In the Cloudflare Pages dashboard for this site:
 *        Settings → Environment variables → Production
 *        Add:
 *          RESEND_API_KEY = re_xxxxxxxxxxxxxxxxxxxx
 *          MAIL_TO        = admin@guthrieent.com
 *          MAIL_FROM      = Guthrie Bookings <bookings@guthrieent.com>
 *      (MAIL_FROM must use a domain you verified in Resend.)
 *   4. Redeploy. That's it — the form will POST to /api/consult automatically.
 */

const SKIP_KEYS = new Set(['_gotcha', '_subject', '_replyto']);

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  // Honeypot: bots fill hidden fields. Pretend success, send nothing.
  if (data._gotcha) {
    return json({ ok: true });
  }

  const name = String(data.Name || '').trim();
  const email = String(data.Email || '').trim();
  if (!name) {
    return json({ ok: false, error: 'Name is required.' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'A valid email is required.' }, 400);
  }

  // Length cap — prevents abuse / runaway payloads
  for (const v of Object.values(data)) {
    if (typeof v === 'string' && v.length > 5000) {
      return json({ ok: false, error: 'Payload too large.' }, 413);
    }
  }

  if (!env.RESEND_API_KEY || !env.MAIL_TO || !env.MAIL_FROM) {
    console.error('Missing required environment variables.');
    return json({ ok: false, error: 'Server not configured.' }, 500);
  }

  const subject = String(data._subject || `New Consult Request — ${name}`).slice(0, 200);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [env.MAIL_TO],
        reply_to: email,
        subject,
        text: formatText(data),
        html: formatHtml(data),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', res.status, err);
      return json({ ok: false, error: 'Mail delivery failed.' }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('Fetch error:', err);
    return json({ ok: false, error: 'Network error reaching mail provider.' }, 502);
  }
}

// Block any non-POST request to this endpoint
export function onRequest({ request }) {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}

function formatText(data) {
  return Object.entries(data)
    .filter(([k]) => !SKIP_KEYS.has(k))
    .map(([k, v]) => `${k}:\n${v}\n`)
    .join('\n');
}

function formatHtml(data) {
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  const rows = Object.entries(data)
    .filter(([k]) => !SKIP_KEYS.has(k))
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;font:12px/1.4 ui-monospace,monospace;color:#888;letter-spacing:0.04em;text-transform:uppercase;vertical-align:top;white-space:nowrap">${esc(k)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;font:14px/1.5 system-ui,sans-serif;color:#111;white-space:pre-wrap">${esc(v)}</td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
<html><body style="background:#f6f5f1;margin:0;padding:24px;font-family:system-ui,sans-serif">
  <table style="max-width:640px;margin:0 auto;background:#fff;border-collapse:collapse;border:1px solid #e5e2d8;border-radius:6px;overflow:hidden">
    <tr><td style="padding:18px 20px;background:#0a0a09;color:#c9a84c;font:14px/1 ui-monospace,monospace;letter-spacing:0.18em;text-transform:uppercase">New Consult Request</td></tr>
    ${rows}
  </table>
</body></html>`;
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
