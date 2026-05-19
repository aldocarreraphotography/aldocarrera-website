/* functions/auth-logout.js
 * POST /api/auth/logout
 *
 * JWTs are stateless, so logout is a client-side token discard. We still
 * expose the endpoint so the admin can ping it (for analytics / audit) and
 * so future revocation lists have a hook.
 */

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
