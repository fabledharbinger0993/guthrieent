/*
 * Cloudflare Pages Function — anonymous counters for the unified dashboard.
 * Accepts a page-visit beacon (fired once per browser session by track.js)
 * and a survey-start beacon (fired once by fablegear.html on the first real
 * interaction with the research form). Both are fire-and-forget from the
 * client (sendBeacon / keepalive fetch) — this endpoint never blocks a page
 * or a form on its own success.
 *
 * Deliberately anonymous: no cookies, no IP storage, no fingerprinting.
 * `type` is restricted to a fixed allow-list so this can't become an
 * arbitrary write into D1 from a public, unauthenticated endpoint.
 *
 * Same D1 binding as functions/api/survey.js (variable name `DB`) — no
 * separate setup needed if that's already bound.
 */

const ALLOWED_TYPES = new Set(['visit', 'survey_start']);
const MAX_LEN = 200;

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false }, 400);
  }

  const type = typeof data.type === 'string' ? data.type : '';
  if (!ALLOWED_TYPES.has(type)) {
    return json({ ok: false, error: 'Unknown type.' }, 400);
  }

  const path = typeof data.path === 'string' ? data.path.slice(0, MAX_LEN) : null;

  // Not on the request's critical path client-side (sendBeacon doesn't wait
  // on a response), so a missing binding just means the count doesn't
  // increment — never surface this as an error state anywhere.
  if (!env.DB) {
    return json({ ok: true });
  }

  try {
    await env.DB.prepare(
      'INSERT INTO events (type, path, created_at) VALUES (?, ?, datetime(\'now\'))'
    ).bind(type, path).run();
  } catch (err) {
    console.error('track insert failed:', err);
  }

  return json({ ok: true });
}

// Block any non-POST request to this endpoint.
export function onRequest({ request }) {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
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
