/* functions/auth-login.js
 * POST /api/auth/login
 * Body: { password }
 * Resp: { token, expiresIn }
 */

import { issueToken } from './utils/auth.js';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD env var is required');
}

// naive in-memory rate limit (per cold-start). For real prod, use a Blob.
const attempts = new Map();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = parseInt(process.env.LOGIN_RATE_LIMIT || '10', 10);

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  // crude IP rate limit
  const ip = req.headers.get('x-nf-client-connection-ip') || 'unknown';
  const now = Date.now();
  const bucket = (attempts.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (bucket.length >= RATE_MAX) {
    return json({ error: 'rate_limited', message: 'Too many login attempts. Try again later.' }, 429);
  }

  const body = await req.json().catch(() => ({}));
  const password = (body.password || '').trim();

  if (!password || password !== ADMIN_PASSWORD) {
    bucket.push(now);
    attempts.set(ip, bucket);
    return json({ error: 'invalid_password', message: 'Wrong password.' }, 401);
  }

  attempts.delete(ip);
  const { token, expiresIn } = issueToken({ sub: 'aldo' });
  return json({ token, expiresIn }, 200);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
