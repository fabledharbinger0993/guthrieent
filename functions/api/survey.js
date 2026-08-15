/*
 * Cloudflare Pages Function — receives the FableGear survey POST and writes it
 * straight into D1 (binding name: DB). Previously this relayed to a Google
 * Apps Script / Sheets collector; that path is gone. See apps-script/ removal
 * in the commit that introduced this file for why.
 *
 * WHY THE PAGE POSTS HERE INSTEAD OF DIRECTLY TO A DATABASE
 *   The browser has no business holding D1 credentials. Same-origin also
 *   sidesteps CSP (`connect-src 'self'`) with no extra config.
 *
 * Setup (one-time, Cloudflare dashboard):
 *   Pages project → Settings → Functions → D1 database bindings →
 *   variable name `DB`, database `guthrieent-fablegear-survey`.
 *
 * Until DB is bound this returns 503 and the page keeps the response in
 * localStorage, so no answer is lost while that's being set up.
 *
 * SCHEMA
 *   responses        — one row per submission; known scalar fields as real
 *                       columns, plus raw_json as the full payload (source of
 *                       truth if a column and the JSON ever disagree).
 *   response_tools    — one row per checked box (category, tool_id), e.g.
 *                       ('library', 'lib-rekordbox'). Powers "how many people
 *                       use X" counts without unpacking JSON per query.
 *   response_likert    — one row per 1–5 answer (question_key, value).
 *                       question_key is either a fixed name (fg-trust-primary)
 *                       or `${toolId}__${statementKey}` for per-tool blocks —
 *                       whatever the page sent, taken as-is, no hardcoded list
 *                       here so new tools/statements need no migration.
 */

const MAX_FIELD_LENGTH = 5000;
const MAX_FIELDS = 200;

const TOOL_ARRAY_FIELDS = {
  tools_library: 'library',
  tools_metadata: 'metadata',
  tools_backup: 'backup',
  tools_acquisition: 'acquisition',
  hardware: 'hardware',
};

const SCALAR_COLUMNS = [
  'email', 'fg_tried', 'hw_used', 'pain_point', 'blind_spot', 'suggestions',
  'hw_open', 'fg_open_different', 'fg_open_missing', 'multi_tool_friction',
];

// Everything collectAnswers() can put on the payload that is NOT a 1–5 Likert
// answer. Object.keys(data) minus this set, filtered to /^[1-5]$/ values, is
// the full set of Likert rows — see the loop in onRequestPost.
const NON_LIKERT_KEYS = new Set([
  ...Object.keys(TOOL_ARRAY_FIELDS),
  ...SCALAR_COLUMNS,
  'submitted_at', 'received_at', 'hp_website',
  'lib-other-text', 'meta-other-text', 'backup-other-text', 'acq-other-text',
  'hardware_other',
]);

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

  const receivedAt = new Date().toISOString();
  data.received_at = receivedAt;
  if (!data.submitted_at) data.submitted_at = receivedAt;

  if (!env.DB) {
    console.error('D1 binding "DB" missing; survey response not stored.');
    return json({ ok: false, error: 'Collector not configured yet.' }, 503);
  }

  try {
    const insertResponse = env.DB.prepare(
      `INSERT INTO responses
         (submitted_at, received_at, email, fg_tried, hw_used, pain_point,
          blind_spot, suggestions, hw_open, fg_open_different,
          fg_open_missing, multi_tool_friction, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      data.submitted_at,
      data.received_at,
      nullableString(data.email),
      nullableString(data.fg_tried),
      nullableString(data.hw_used),
      nullableString(data.pain_point),
      nullableString(data.blind_spot),
      nullableString(data.suggestions),
      nullableString(data.hw_open),
      nullableString(data.fg_open_different),
      nullableString(data.fg_open_missing),
      nullableString(data.multi_tool_friction),
      JSON.stringify(data)
    );

    const inserted = await insertResponse.run();
    const responseId = inserted.meta.last_row_id;

    const batch = [];

    for (const [field, category] of Object.entries(TOOL_ARRAY_FIELDS)) {
      const ids = Array.isArray(data[field]) ? data[field] : [];
      for (const toolId of ids) {
        if (typeof toolId !== 'string' || !toolId) continue;
        batch.push(
          env.DB.prepare(
            'INSERT INTO response_tools (response_id, category, tool_id) VALUES (?, ?, ?)'
          ).bind(responseId, category, toolId)
        );
      }
    }

    for (const [key, value] of Object.entries(data)) {
      if (NON_LIKERT_KEYS.has(key)) continue;
      if (typeof value !== 'string' || !/^[1-5]$/.test(value)) continue;
      batch.push(
        env.DB.prepare(
          'INSERT INTO response_likert (response_id, question_key, value) VALUES (?, ?, ?)'
        ).bind(responseId, key, Number(value))
      );
    }

    if (batch.length) await env.DB.batch(batch);

    return json({ ok: true });
  } catch (err) {
    console.error('D1 write failed:', err);
    return json({ ok: false, error: 'Could not store the response.' }, 502);
  }
}

function nullableString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
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
