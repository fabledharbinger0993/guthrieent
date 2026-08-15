/*
 * Cloudflare Pages Function backing dashboard.html — aggregate-only reads
 * from D1, gated by a shared key. Never returns emails or the raw payload:
 * the dashboard is a "how's the research going" view, not a data export.
 *
 * Setup (one-time, Cloudflare dashboard):
 *   Pages project → Settings → Environment variables → DASHBOARD_KEY.
 *   Same D1 binding as functions/api/survey.js (variable name `DB`).
 *
 * Auth is a single shared key compared against the X-Dashboard-Key header,
 * intentionally simple for a single-operator internal page. Rotate
 * DASHBOARD_KEY in the dashboard if it ever leaks.
 */

export async function onRequestGet({ request, env }) {
  if (!env.DASHBOARD_KEY) {
    return json({ ok: false, error: 'Dashboard not configured yet.' }, 503);
  }

  const key = request.headers.get('X-Dashboard-Key') || '';
  if (!timingSafeEqual(key, env.DASHBOARD_KEY)) {
    return json({ ok: false, error: 'Bad key.' }, 401);
  }

  if (!env.DB) {
    return json({ ok: false, error: 'Collector not configured yet.' }, 503);
  }

  try {
    const [
      totals,
      toolCounts,
      likertStats,
      recentText,
    ] = await Promise.all([
      env.DB.prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN fg_tried = 'yes' THEN 1 ELSE 0 END) AS fg_tried_yes,
           SUM(CASE WHEN fg_tried = 'no' THEN 1 ELSE 0 END) AS fg_tried_no,
           SUM(CASE WHEN hw_used = 'yes' THEN 1 ELSE 0 END) AS hw_used_yes,
           SUM(CASE WHEN hw_used = 'no' THEN 1 ELSE 0 END) AS hw_used_no,
           SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) AS with_email
         FROM responses`
      ).first(),
      env.DB.prepare(
        `SELECT category, tool_id, COUNT(*) AS n
         FROM response_tools
         GROUP BY category, tool_id
         ORDER BY category, n DESC`
      ).all(),
      env.DB.prepare(
        `SELECT question_key, COUNT(*) AS n, AVG(value) AS avg_value
         FROM response_likert
         GROUP BY question_key
         ORDER BY question_key`
      ).all(),
      env.DB.prepare(
        `SELECT submitted_at, pain_point, blind_spot, suggestions,
                hw_open, fg_open_different, fg_open_missing
         FROM responses
         WHERE pain_point != '' OR blind_spot != '' OR suggestions != ''
            OR hw_open != '' OR fg_open_different != '' OR fg_open_missing != ''
         ORDER BY submitted_at DESC
         LIMIT 100`
      ).all(),
    ]);

    return json({
      ok: true,
      totals,
      tool_counts: toolCounts.results,
      likert_stats: likertStats.results,
      recent_text: recentText.results,
    });
  } catch (err) {
    console.error('Dashboard query failed:', err);
    return json({ ok: false, error: 'Query failed.' }, 500);
  }
}

// Not truly constant-time in a JS engine, but avoids the most obvious
// short-circuit-on-first-mismatch timing signal from a plain `===`.
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
