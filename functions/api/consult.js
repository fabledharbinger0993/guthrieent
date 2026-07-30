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

const SKIP_KEYS = new Set(['_gotcha', '_subject', '_replyto', '_turnstile']);

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

  // Turnstile. Only enforced once TURNSTILE_SECRET_KEY exists, so adding this
  // code cannot break the live form before the widget is created. Once the
  // secret IS set it fails closed: a missing or bad token is rejected.
  //
  // Set the site key in consult.html FIRST, deploy, then add the secret here.
  // Doing it the other way round rejects real submissions in between.
  if (env.TURNSTILE_SECRET_KEY) {
    const token = String(data._turnstile || '');
    if (!token) {
      return json({ ok: false, error: 'Please complete the human check and try again.' }, 400);
    }
    const ok = await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, request);
    if (!ok) {
      return json({ ok: false, error: 'Human check failed. Please try again.' }, 403);
    }
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

  const send = (payload) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

  try {
    // 1. The copy that matters. If this fails the request failed, because a
    //    request nobody received is a lost booking.
    const res = await send({
      from: env.MAIL_FROM,
      to: [env.MAIL_TO],
      reply_to: email,
      subject,
      text: formatText(data),
      html: formatHtml(data),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error (admin copy):', res.status, err);
      return json({ ok: false, error: 'Mail delivery failed.' }, 502);
    }

    // 2. The customer's own copy, so they have a record of exactly what they
    //    sent and a thread to reply into. Deliberately NOT awaited into the
    //    success path: if this one bounces (typo'd address, full mailbox,
    //    provider hiccup) the enquiry has still reached us, and failing the
    //    whole submission would make the customer send it again.
    try {
      const ack = await send({
        from: env.MAIL_FROM,
        to: [email],
        reply_to: env.MAIL_TO,
        subject: `We got your request — ${name}`,
        text: formatCustomerText(data, name),
        html: formatCustomerHtml(data, name),
      });
      if (!ack.ok) {
        console.error('Resend error (customer copy):', ack.status, await ack.text());
      }
    } catch (ackErr) {
      console.error('Customer copy failed:', ackErr);
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

// ── The customer's copy ─────────────────────────────────────────────────────
// Same details, addressed to them. Written as a receipt rather than marketing:
// what they sent, what happens next, and how to correct something.

function formatCustomerText(data, name) {
  const details = Object.entries(data)
    .filter(([k]) => !SKIP_KEYS.has(k))
    .map(([k, v]) => `${k}:\n${v}\n`)
    .join('\n');

  return `Hi ${name},

Thanks for reaching out to Osos Discos. We have your request and we'll get
back to you personally — usually within a couple of days.

Here's exactly what you sent us, so you have a record of it:

${details}
If anything above is wrong, just reply to this email and tell us. Replies come
straight to us.

— Cameron & Marshall
Osos Discos · Guthrie Entertainment LLC, Philadelphia
`;
}

function formatCustomerHtml(data, name) {
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
    <tr><td colspan="2" style="padding:18px 20px;background:#0a0a09;color:#c9a84c;font:14px/1 ui-monospace,monospace;letter-spacing:0.18em;text-transform:uppercase">We got your request</td></tr>
    <tr><td colspan="2" style="padding:20px;font:15px/1.6 system-ui,sans-serif;color:#111">
      Hi ${esc(name)},<br><br>
      Thanks for reaching out to Osos Discos. We have your request and we'll get back to you
      personally — usually within a couple of days.<br><br>
      Here's exactly what you sent us, so you have a record of it:
    </td></tr>
    ${rows}
    <tr><td colspan="2" style="padding:18px 20px;font:13px/1.6 system-ui,sans-serif;color:#555;background:#faf9f6">
      If anything above is wrong, just reply to this email and tell us — replies come straight to us.<br><br>
      — Cameron &amp; Marshall<br>
      <span style="color:#888">Osos Discos · Guthrie Entertainment LLC, Philadelphia</span>
    </td></tr>
  </table>
</body></html>`;
}

// ── Turnstile verification ──────────────────────────────────────────────────
// Cloudflare's siteverify call. The visitor's IP is passed when available,
// which Cloudflare uses to strengthen the check. Any network failure returns
// false: with a secret configured we would rather reject and let the person
// retry than wave through unverified traffic.

async function verifyTurnstile(token, secret, request) {
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) body.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    });
    if (!res.ok) {
      console.error('Turnstile siteverify HTTP', res.status);
      return false;
    }
    const out = await res.json();
    if (!out.success) {
      console.error('Turnstile rejected:', out['error-codes']);
    }
    return out.success === true;
  } catch (err) {
    console.error('Turnstile verify error:', err);
    return false;
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
