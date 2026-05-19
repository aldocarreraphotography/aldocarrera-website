/* functions/debug.js
 * GET /api/debug
 *
 * No auth. Tests Blobs read/write and reports env var presence.
 * Used to diagnose production Blobs connectivity.
 * Safe to leave deployed — returns no sensitive data.
 */

import { getJson, setJson } from './utils/blobs.js';

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('', { status: 405 });

  const results = {};

  const t0 = Date.now();
  try {
    await setJson('__debug_probe', { ts: t0 });
    results.write = { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    results.write = { ok: false, error: e.message };
  }

  const t1 = Date.now();
  try {
    const val = await getJson('__debug_probe');
    results.read = { ok: !!val, ms: Date.now() - t1 };
  } catch (e) {
    results.read = { ok: false, error: e.message };
  }

  return new Response(JSON.stringify({
    blobs: results,
    env: {
      hasJwtSecret:       !!process.env.JWT_SECRET,
      hasAdminPassword:   !!process.env.ADMIN_PASSWORD,
      hasBlobsContext:    !!process.env.NETLIFY_BLOBS_CONTEXT,
    },
  }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
