/*
 * Cloudflare Pages Function backing dashboard.html — the single unified
 * admin view. Aggregate-only reads from D1, gated by a shared key. Never
 * returns emails or the raw payload: this is a "how's it going" view, not
 * a data export.
 *
 * Setup (one-time, Cloudflare dashboard):
 *   Pages project → Settings → Environment variables → DASHBOARD_KEY.
 *   Same D1 binding as functions/api/survey.js (variable name `DB`).
 *
 * Auth is a single shared key compared against the X-Dashboard-Key header,
 * intentionally simple for a single-operator internal page. Rotate
 * DASHBOARD_KEY in the dashboard if it ever leaks.
 *
 * Reminder: like the D1 binding above, DASHBOARD_KEY is deployment-scoped —
 * saving it alone doesn't rebuild an already-live deployment.
 *
 * AI SUMMARY
 *   If a Workers AI binding named `AI` is present, this also returns a short
 *   "what people are saying" paragraph generated from recent open-text
 *   answers — cached in dashboard_summaries and only regenerated when both
 *   stale (SUMMARY_MAX_AGE_MS) and new responses exist since the last one,
 *   so a dashboard view doesn't pay for a fresh AI call every time. No AI
 *   binding just means no summary field in the response — the rest of the
 *   dashboard is unaffected.
 *
 * SITE-WIDE TOTALS (visits / consult requests / survey starts)
 *   Read from the `events` table (functions/api/track.js writes visits and
 *   survey starts; functions/api/consult.js writes consult requests
 *   directly). Survey *completes* is just COUNT(*) on `responses` — no
 *   separate event for that. If `events` doesn't exist yet on a given D1
 *   (schema.sql not yet run), those three counts come back null rather
 *   than failing the whole dashboard.
 *
 * APP DOWNLOADS
 *   Pulled live from the GitHub releases API (asset download_count on the
 *   FableGear.zip asset) — GitHub already counts this authoritatively, so
 *   there's no click-tracking to build or maintain. This is a *different*
 *   GitHub path than functions/fablegear/release.js: that one deliberately
 *   avoids api.github.com because it's called on every visitor's page load.
 *   This one only runs when the dashboard itself is opened, so the stricter
 *   unauthenticated api.github.com rate limit (60/hr) isn't a concern —
 *   still cached briefly (DOWNLOADS_CACHE_SECONDS) to be a good citizen.
 */

const SUMMARY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const DOWNLOADS_CACHE_SECONDS = 600;
const RELEASE_REPO = 'fabledharbinger0993/FableGear';
const RELEASE_ASSET = 'FableGear.zip';

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
      sentimentCounts,
      topicCounts,
      toolCoOccurrence,
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
                hw_open, fg_open_different, fg_open_missing, sentiment
         FROM responses
         WHERE pain_point != '' OR blind_spot != '' OR suggestions != ''
            OR hw_open != '' OR fg_open_different != '' OR fg_open_missing != ''
         ORDER BY submitted_at DESC
         LIMIT 100`
      ).all(),
      env.DB.prepare(
        `SELECT sentiment, COUNT(*) AS n FROM responses
         WHERE sentiment IS NOT NULL GROUP BY sentiment`
      ).all(),
      env.DB.prepare(
        `SELECT topic, COUNT(*) AS n FROM response_topics
         GROUP BY topic ORDER BY n DESC LIMIT 20`
      ).all(),
      // Co-occurrence: how often two tools are picked in the *same*
      // response. Self-join on response_id with tool_id < tool_id to count
      // each unordered pair once. This is the "neuron map" the dashboard
      // renders as a node-link graph — nodes from tool_counts above
      // (weighted by n), edges from this (weighted by n).
      env.DB.prepare(
        `SELECT a.tool_id AS tool_a, b.tool_id AS tool_b, COUNT(*) AS n
         FROM response_tools a
         JOIN response_tools b
           ON a.response_id = b.response_id AND a.tool_id < b.tool_id
         GROUP BY a.tool_id, b.tool_id
         HAVING n >= 2
         ORDER BY n DESC
         LIMIT 150`
      ).all(),
    ]);

    const [summary, siteTotals, appDownloads] = await Promise.all([
      env.AI ? getOrRefreshSummary(env, totals.total) : null,
      getSiteTotals(env),
      getAppDownloads(env),
    ]);

    return json({
      ok: true,
      totals: Object.assign({}, totals, siteTotals, {
        survey_completes: totals.total,
        app_downloads: appDownloads,
      }),
      tool_counts: toolCounts.results,
      tool_co_occurrence: toolCoOccurrence.results,
      likert_stats: likertStats.results,
      recent_text: recentText.results,
      sentiment_counts: sentimentCounts.results,
      topic_counts: topicCounts.results,
      summary,
    });
  } catch (err) {
    console.error('Dashboard query failed:', err);
    return json({ ok: false, error: 'Query failed.' }, 500);
  }
}

// Visits / consult requests / survey starts from the `events` table. Returns
// nulls instead of throwing if that table doesn't exist yet on this D1 (i.e.
// schema.sql hasn't been run against it) — the rest of the dashboard still
// loads, those three cards just show "—" until it has been.
async function getSiteTotals(env) {
  try {
    const rows = await env.DB.prepare(
      `SELECT type, COUNT(*) AS n FROM events
       WHERE type IN ('visit', 'consult_request', 'survey_start')
       GROUP BY type`
    ).all();
    const byType = {};
    for (const row of rows.results) byType[row.type] = row.n;
    return {
      visits: byType.visit || 0,
      consult_requests: byType.consult_request || 0,
      survey_starts: byType.survey_start || 0,
    };
  } catch (err) {
    console.error('Site totals query failed (events table missing?):', err);
    return { visits: null, consult_requests: null, survey_starts: null };
  }
}

// Live download count for FableGear.zip from GitHub's releases API, cached
// briefly. Null on any failure — the rest of the dashboard is unaffected.
async function getAppDownloads(env) {
  const cache = caches.default;
  const cacheKey = new Request('https://guthrieent.com/__cache/dashboard-downloads');

  const hit = await cache.match(cacheKey);
  if (hit) return (await hit.json()).count;

  try {
    const res = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, {
      headers: {
        'User-Agent': 'guthrieent.com-dashboard',
        Accept: 'application/vnd.github+json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const asset = Array.isArray(data.assets)
      ? data.assets.find(function (a) { return a.name === RELEASE_ASSET; })
      : null;
    const count = asset ? asset.download_count : null;

    const cacheResponse = new Response(JSON.stringify({ count }), {
      headers: { 'Cache-Control': `public, max-age=${DOWNLOADS_CACHE_SECONDS}` },
    });
    await cache.put(cacheKey, cacheResponse.clone());
    return count;
  } catch (err) {
    console.error('Download count lookup failed:', err);
    return null;
  }
}

// Returns the cached summary unless it's both stale and there are new
// responses to summarize, in which case it regenerates first. A failed AI
// call here just falls back to whatever's cached (possibly null) — the rest
// of the dashboard renders regardless.
async function getOrRefreshSummary(env, currentTotal) {
  const cached = await env.DB.prepare(
    'SELECT generated_at, response_count, summary FROM dashboard_summaries ORDER BY id DESC LIMIT 1'
  ).first();

  const stale = !cached || (Date.now() - new Date(cached.generated_at).getTime()) > SUMMARY_MAX_AGE_MS;
  const hasNewData = !cached || currentTotal > cached.response_count;

  if (!stale || !hasNewData || currentTotal === 0) {
    return cached ? { text: cached.summary, generated_at: cached.generated_at } : null;
  }

  try {
    const rows = await env.DB.prepare(
      `SELECT pain_point, blind_spot, suggestions, hw_open,
              fg_open_different, fg_open_missing
       FROM responses
       WHERE pain_point != '' OR blind_spot != '' OR suggestions != ''
          OR hw_open != '' OR fg_open_different != '' OR fg_open_missing != ''
       ORDER BY submitted_at DESC LIMIT 40`
    ).all();

    const corpus = rows.results
      .map(function (r) {
        return Object.values(r).filter(Boolean).join(' — ');
      })
      .join('\n')
      .slice(0, 6000);

    if (!corpus) return cached ? { text: cached.summary, generated_at: cached.generated_at } : null;

    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{
        role: 'user',
        content:
          'Read these free-text survey answers from DJs about their music library ' +
          'tools and write a plain, factual 2-3 sentence summary of the recurring ' +
          'themes for an internal dashboard. No preamble, no bullet points, no ' +
          'markdown, just the summary sentences.\n\n' + corpus,
      }],
    });
    const text = ((result && (result.response || result)) + '').trim().slice(0, 1200);
    if (!text) return cached ? { text: cached.summary, generated_at: cached.generated_at } : null;

    const generatedAt = new Date().toISOString();
    await env.DB.prepare(
      'INSERT INTO dashboard_summaries (generated_at, response_count, summary) VALUES (?, ?, ?)'
    ).bind(generatedAt, currentTotal, text).run();

    return { text, generated_at: generatedAt };
  } catch (err) {
    console.error('Summary generation failed, using cached:', err);
    return cached ? { text: cached.summary, generated_at: cached.generated_at } : null;
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
