/* functions/contact.js
 * POST /api/contact
 *
 * Public contact form handler — sends inquiries via Resend.
 *
 * Required env vars (set in Netlify → Site settings → Environment variables):
 *   RESEND_API_KEY   — your Resend API key (starts with re_)
 *
 * Optional env vars:
 *   CONTACT_FROM     — sender address. Defaults to onboarding@resend.dev.
 *                      Replace with contact@aldocarrera.com once domain is verified.
 *   CONTACT_TO       — destination inbox. Defaults to aldo@aldocarrera.com.
 *
 * Spam protection:
 *   - Honeypot field "bot-field" must be empty
 *   - Minimum message length (10 chars)
 *   - Basic email validity check
 */

const FROM_FALLBACK = 'Aldo Carrera <onboarding@resend.dev>';
const TO_FALLBACK   = 'aldo@aldocarrera.com';

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const name    = (payload.name    || '').trim();
  const email   = (payload.email   || '').trim();
  const subject = (payload.subject || 'general').trim();
  const message = (payload.message || '').trim();
  const honey   = (payload['bot-field'] || '').trim();

  // Honeypot: bots fill hidden fields, humans don't
  if (honey) return json({ ok: true }); // pretend success, drop on the floor

  // Validation
  if (!name)    return json({ error: 'missing_name' }, 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'invalid_email' }, 400);
  }
  if (!message || message.length < 10) return json({ error: 'message_too_short' }, 400);

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('[contact] RESEND_API_KEY not set');
    return json({ error: 'server_misconfigured', message: 'Email service not configured. Please email aldo@aldocarrera.com directly.' }, 500);
  }

  const from = process.env.CONTACT_FROM || FROM_FALLBACK;
  const to   = process.env.CONTACT_TO   || TO_FALLBACK;

  const subjectLabels = {
    editorial:  'Editorial booking',
    commercial: 'Commercial / campaign',
    portrait:   'Portrait / talent day',
    print:      'Prints & archive',
    press:      'Press / interview',
    other:      'Other',
  };
  const subjectLabel = subjectLabels[subject] || subject;

  const emailSubject = `${subjectLabel} — ${name}`;
  const htmlBody = `
<div style="font-family: Inter, system-ui, sans-serif; max-width: 580px; margin: 0 auto; color: #1a1a1a;">
  <div style="border-bottom: 2px solid #1a1a1a; padding-bottom: 14px; margin-bottom: 22px;">
    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.1em; color: #888; text-transform: uppercase; margin-bottom: 4px;">New inquiry · aldocarrera.com</div>
    <div style="font-size: 22px; font-weight: 500;">${escapeHtml(subjectLabel)}</div>
  </div>
  <table style="width: 100%; font-size: 14px; line-height: 1.6;">
    <tr><td style="color: #888; padding: 4px 12px 4px 0; vertical-align: top; width: 90px;">From</td><td><strong>${escapeHtml(name)}</strong></td></tr>
    <tr><td style="color: #888; padding: 4px 12px 4px 0; vertical-align: top;">Email</td><td><a href="mailto:${escapeHtml(email)}" style="color: #1a1a1a;">${escapeHtml(email)}</a></td></tr>
    <tr><td style="color: #888; padding: 4px 12px 4px 0; vertical-align: top;">Subject</td><td>${escapeHtml(subjectLabel)}</td></tr>
    <tr><td style="color: #888; padding: 4px 12px 4px 0; vertical-align: top;">Received</td><td>${new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</td></tr>
  </table>
  <div style="border-top: 1px solid #ddd; margin-top: 22px; padding-top: 22px;">
    <div style="font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.1em; color: #888; text-transform: uppercase; margin-bottom: 10px;">Message</div>
    <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${escapeHtml(message)}</div>
  </div>
  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: #888;">
    Reply to this email to respond directly to ${escapeHtml(name)}.
  </div>
</div>`;

  const textBody = `New inquiry — aldocarrera.com

Subject:  ${subjectLabel}
From:     ${name}
Email:    ${email}
Received: ${new Date().toISOString()}

Message:
${message}

---
Reply to this email to respond directly to ${name}.`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: emailSubject,
        html: htmlBody,
        text: textBody,
        reply_to: email,
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('[contact] Resend error', r.status, detail);
      return json({ error: 'send_failed', message: 'Could not send. Please email aldo@aldocarrera.com directly.' }, 502);
    }

    const result = await r.json();
    console.log('[contact] sent', result.id, 'to', to, 'from', from, 'subject:', emailSubject);
    return json({ ok: true, id: result.id });
  } catch (err) {
    console.error('[contact] FATAL', err?.message, err?.stack);
    return json({ error: 'send_failed', message: err?.message || 'Unknown error' }, 500);
  }
}
