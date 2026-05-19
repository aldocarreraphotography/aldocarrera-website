/* functions/utils/auth.js
 *
 * JWT issue + verify. HS256. 30-day default expiry.
 *
 * Used by:
 *   - functions/auth-login.js       (issues tokens)
 *   - functions/utils/withAuth.js   (verifies on every protected endpoint)
 *
 * No external deps needed; we hand-roll HS256 to keep cold-start small.
 * If you prefer `jose` or `jsonwebtoken`, swap in there — return shape
 * stays the same.
 */

import crypto from 'node:crypto';

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = parseInt(process.env.JWT_EXPIRES_IN || '2592000', 10); // 30d

if (!SECRET) {
  throw new Error('JWT_SECRET env var is required');
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const b64urlJson = (obj) => b64url(JSON.stringify(obj));

export function issueToken(payload = {}) {
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const body = b64urlJson({ ...payload, iat: now, exp: now + EXPIRES_IN });
  const sig = crypto
    .createHmac('sha256', SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return {
    token: `${header}.${body}.${sig}`,
    expiresIn: EXPIRES_IN,
  };
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [header, body, sig] = parts;
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  if (sig !== expected) return { valid: false, reason: 'bad_signature' };
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: 'expired' };
    }
    return { valid: true, payload };
  } catch (_) {
    return { valid: false, reason: 'malformed' };
  }
}

/* withAuth: wrap a handler so it rejects unauthenticated calls.
   Supports both modern Web-Fetch Requests (headers.get) and older Netlify
   event objects (headers as a plain object). */
export const withAuth = (handler) => async (req) => {
  let raw = '';
  if (typeof req.headers?.get === 'function') {
    raw = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  } else {
    raw = req.headers?.authorization || req.headers?.Authorization || '';
  }
  const token = raw.replace(/^Bearer\s+/i, '');
  const result = verifyToken(token);
  if (!result.valid) {
    return new Response(
      JSON.stringify({ error: 'unauthorized', message: `Token ${result.reason}` }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return handler(req, result.payload);
};

/* requireAuth: gatekeeper for modern Web-Fetch-style functions.
 *
 *   const auth = requireAuth(req);
 *   if (!auth.ok) return auth.response;
 *
 * On success, returns { ok: true, payload }. On failure, returns
 * { ok: false, response } where response is a ready-to-return 401.
 */
export function requireAuth(req) {
  const header = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '');
  const result = verifyToken(token);
  if (!result.valid) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'unauthorized', message: `Token ${result.reason}` }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    };
  }
  return { ok: true, payload: result.payload };
}
