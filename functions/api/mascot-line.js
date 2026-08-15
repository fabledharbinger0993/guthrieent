/*
 * Cloudflare Pages Function — generates one short in-character line for the
 * survey mascot via Workers AI.
 *
 * SAFETY BY CONSTRUCTION, NOT BY SANITIZING
 *   This is a public, unauthenticated endpoint fed by a form anyone on the
 *   internet can submit. The request body is NEVER interpolated into the
 *   prompt as free text — `section` must match a fixed key in SECTION_COPY
 *   below and `tools` entries must match a fixed key in TOOL_LABELS. Anything
 *   else is rejected before the prompt is built. There is no path from
 *   "what a stranger typed" to "what the model is asked to say."
 *
 * FAILS OPEN
 *   No AI binding, an unknown section, a slow/failed AI call, or an empty
 *   result all return a non-200 quickly. The page's own canned line is the
 *   real fallback and is shown instantly regardless of this endpoint —
 *   see the mascot script in fablegear.html, which races this call against
 *   a short timeout and only swaps text in if it wins.
 *
 * Setup: same Workers AI binding as functions/api/survey.js (variable `AI`).
 */

const SECTION_COPY = {
  'inventory': "the visitor just reached the tool inventory step, where they pick what they use",
  'satisfaction-section': "the visitor just revealed satisfaction questions for a tool they picked",
  'hw-section': "the visitor just reached the hardware question, about CDJs and controllers",
  'fg-tried-section': "the visitor just reached the question asking whether they've tried FableGear",
  'open-section': "the visitor just reached the open-ended question about their biggest library pain point",
  'email-section': "the visitor just reached the optional email signup at the end",
};

const TOOL_LABELS = {
  'lib-rekordbox': 'Rekordbox', 'lib-serato': 'Serato DJ', 'lib-traktor': 'Traktor Pro',
  'lib-virtualdj': 'VirtualDJ', 'lib-djay': 'djay', 'lib-enginedj': 'Engine DJ',
  'lib-mixxx': 'Mixxx', 'lib-denondj': 'Denon DJ software', 'lib-applemusic': 'Apple Music / iTunes',
  'lib-none': 'just files in folders', 'lib-other': 'another tool',
  'meta-mik': 'Mixed In Key', 'meta-tunebat': 'Tunebat',
};

const MAX_LINE_LENGTH = 160;

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json({ ok: false, error: 'Not configured.' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  const section = typeof body.section === 'string' ? body.section : '';
  const situation = SECTION_COPY[section];
  if (!situation) {
    return json({ ok: false, error: 'Unknown section.' }, 400);
  }

  const tools = Array.isArray(body.tools)
    ? body.tools.filter(function (t) { return typeof t === 'string' && TOOL_LABELS[t]; }).slice(0, 6)
    : [];
  const toolLabels = tools.map(function (t) { return TOOL_LABELS[t]; });

  const context = situation + (toolLabels.length ? `, having picked: ${toolLabels.join(', ')}` : '');
  const prompt =
    'You are a tiny friendly mascot character (a headphones-and-turntable icon) ' +
    'guiding someone through a DJ music library survey on a website. Right now, ' +
    context + '. Say ONE short, upbeat, in-character line reacting to this — ' +
    'max 16 words, no emoji, no markdown, no surrounding quotes, just the line.';

  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
    });
    let line = ((result && (result.response || result)) + '').trim();
    line = line.replace(/^["']+|["']+$/g, '').slice(0, MAX_LINE_LENGTH);
    if (!line) return json({ ok: false, error: 'Empty response.' }, 502);
    return json({ ok: true, line });
  } catch (err) {
    console.error('Mascot line generation failed:', err);
    return json({ ok: false, error: 'AI call failed.' }, 502);
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
