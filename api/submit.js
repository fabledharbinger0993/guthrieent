// functions/api/submit.js
// Pages Function: handles form submissions
// Validates input, inserts into D1, sends email via Resend

export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  // --- Server-side validation ---
  const errors = {};

  if (!data.name || data.name.trim().length < 2) {
    errors.name = 'Name is required (min 2 characters)';
  }
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'A valid email is required';
  }
  if (data.purpose && data.purpose.length > 5000) {
    errors.purpose = 'Purpose must be under 5000 characters';
  }

  if (Object.keys(errors).length > 0) {
    return jsonResponse({ success: false, errors }, 422, corsHeaders);
  }

  // --- Insert into D1 ---
  const options = Array.isArray(data.options) ? JSON.stringify(data.options) : (data.options || null);
  const eventDates = data.eventDates ? JSON.stringify(data.eventDates) : null;

  try {
    const result = await env.DB.prepare(
      `INSERT INTO submissions (name, email, purpose, options, event_dates)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      data.name.trim(),
      data.email.trim().toLowerCase(),
      data.purpose?.trim() || null,
      options,
      eventDates
    ).run();

    const submissionId = result.meta.last_row_id;

    // --- Send email via Resend (non-blocking — don't fail the submit if email fails) ---
    try {
      await sendNotificationEmail(env, {
        id: submissionId,
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        purpose: data.purpose?.trim() || '(none)',
        options: data.options,
        eventDates: data.eventDates,
      });
    } catch (emailErr) {
      // Log but don't fail the submission — data is already in D1
      console.error('Email send failed:', emailErr.message);
    }

    return jsonResponse({
      success: true,
      id: submissionId,
      message: 'Submission received. We will be in touch shortly.',
    }, 200, corsHeaders);

  } catch (dbErr) {
    console.error('D1 insert failed:', dbErr.message);
    return jsonResponse({ success: false, error: 'Could not save submission. Please try again.' }, 500, corsHeaders);
  }
}

// --- Resend email helper ---
async function sendNotificationEmail(env, submission) {
  const mailFrom = env.MAIL_FROM || 'Guthrie Bookings <bookings@guthrieent.com>';
  const mailTo = env.MAIL_TO || 'admin@guthrieent.com';

  const emailBody = buildEmailBody(submission);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: mailFrom,
      to: [mailTo],
      subject: `New submission from ${submission.name}`,
      html: emailBody,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error ${res.status}: ${errText}`);
  }
}

function buildEmailBody(s) {
  const optionsStr = Array.isArray(s.options)
    ? s.options.map(o => `<li>${escapeHtml(String(o))}</li>`).join('')
    : escapeHtml(s.options || 'None');

  const eventsStr = s.eventDates
    ? (Array.isArray(s.eventDates)
        ? s.eventDates.map(e => `<li>${escapeHtml(JSON.stringify(e))}</li>`).join('')
        : escapeHtml(String(s.eventDates)))
    : 'None';

  return `
    <div style="font-family: Inter, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #0f1722;">New Form Submission</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px 0; font-weight: 600; width: 120px;">Name:</td><td>${escapeHtml(s.name)}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600;">Email:</td><td>${escapeHtml(s.email)}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600;">Purpose:</td><td>${escapeHtml(s.purpose)}</td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; vertical-align: top;">Options:</td><td><ul style="margin: 0; padding-left: 20px;">${optionsStr}</ul></td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600; vertical-align: top;">Event Dates:</td><td><ul style="margin: 0; padding-left: 20px;">${eventsStr}</ul></td></tr>
        <tr><td style="padding: 8px 0; font-weight: 600;">Submission ID:</td><td>#${s.id}</td></tr>
      </table>
      <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
        View all submissions in the <a href="https://guthrieent.com/dashboard.html">admin dashboard</a>.
      </p>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function jsonResponse(body, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}