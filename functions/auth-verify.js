/* functions/auth-verify.js
 * POST /api/auth/verify
 * Headers: Authorization: Bearer <token>
 * Resp: { valid: true } | { valid: false, reason }
 */

import { verifyToken } from './utils/auth.js';

export default async function handler(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const result = verifyToken(token);
  return new Response(JSON.stringify(result), {
    status: result.valid ? 200 : 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
