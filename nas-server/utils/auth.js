/* utils/auth.js — hand-rolled HS256 JWT. No external deps needed. */

import crypto from 'node:crypto';

const SECRET     = process.env.JWT_SECRET;
const EXPIRES_IN = parseInt(process.env.JWT_EXPIRES_IN || '2592000', 10); // 30d

if (!SECRET) throw new Error('JWT_SECRET env var is required');

const b64url     = (buf) => Buffer.from(buf).toString('base64url');
const b64urlJson = (obj) => b64url(JSON.stringify(obj));

export function issueToken(payload = {}) {
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const now    = Math.floor(Date.now() / 1000);
  const body   = b64urlJson({ ...payload, iat: now, exp: now + EXPIRES_IN });
  const sig    = crypto.createHmac('sha256', SECRET)
    .update(`${header}.${body}`).digest('base64url');
  return { token: `${header}.${body}.${sig}`, expiresIn: EXPIRES_IN };
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', SECRET)
    .update(`${header}.${body}`).digest('base64url');
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

/* Express middleware: sets req.auth = { valid, payload } */
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.replace(/^Bearer\s+/i, '');
  req.auth     = verifyToken(token);
  next();
}

/* requireAuth: call inside a route to gate on a valid token */
export function requireAuth(req, res) {
  if (!req.auth?.valid) {
    res.status(401).json({ error: 'unauthorized', message: `Token ${req.auth?.reason || 'missing'}` });
    return false;
  }
  return true;
}
