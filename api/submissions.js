// functions/api/submissions.js
// Pages Function: returns all submissions for the admin dashboard
// Protected by DASHBOARD_KEY — pass it as a header or query param

export async function onRequestGet({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-Dashboard-Key',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth: check DASHBOARD_KEY via header or query param ---
  const url = new URL(request.url);
  const providedKey =
    request.headers.get('X-Dashboard-Key') ||
    url.searchParams.get('key') ||
    '';

  if (!env.DASHBOARD_KEY || providedKey !== env.DASHBOARD_KEY) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401, corsHeaders);
  }

  // --- Pagination ---
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('per_page') || '50', 10)));
  const offset = (page - 1) * perPage;

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, name, email, purpose, options, event_dates, created_at
       FROM submissions
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(perPage, offset).all();

    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM submissions`
    ).first();

    return jsonResponse({
      success: true,
      submissions: results.map(formatRow),
      pagination: {
        page,
        per_page: perPage,
        total: countResult.total,
        total_pages: Math.ceil(countResult.total / perPage),
      },
    }, 200, corsHeaders);

  } catch (dbErr) {
    console.error('D1 query failed:', dbErr.message);
    return jsonResponse({ success: false, error: 'Could not fetch submissions' }, 500, corsHeaders);
  }
}

// DELETE: remove a submission by ID (also gated by DASHBOARD_KEY)
export async function onRequestDelete({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-Dashboard-Key, Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const providedKey = request.headers.get('X-Dashboard-Key') || '';
  if (!env.DASHBOARD_KEY || providedKey !== env.DASHBOARD_KEY) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401, corsHeaders);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  if (!data.id) {
    return jsonResponse({ success: false, error: 'Submission ID required' }, 400, corsHeaders);
  }

  try {
    await env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(data.id).run();
    return jsonResponse({ success: true, message: 'Submission deleted' }, 200, corsHeaders);
  } catch (dbErr) {
    console.error('D1 delete failed:', dbErr.message);
    return jsonResponse({ success: false, error: 'Could not delete submission' }, 500, corsHeaders);
  }
}

function formatRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    purpose: row.purpose,
    options: row.options ? safeParse(row.options) : null,
    event_dates: row.event_dates ? safeParse(row.event_dates) : null,
    created_at: row.created_at,
  };
}

function safeParse(str) {
  try { return JSON.parse(str); } catch { return str; }
}

function jsonResponse(body, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}