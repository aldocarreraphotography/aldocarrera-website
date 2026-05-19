/* functions/content-settings.js
 * GET /api/settings    → settings object (no auth)
 * PUT /api/settings    → merge + write
 */

import { readSettings, writeSettings } from './utils/blobs.js';
import { requireAuth } from './utils/auth.js';

export default async function handler(req) {
  if (req.method === 'GET') {
    return json(await readSettings());
  }
  if (req.method === 'PUT') {
    const auth = requireAuth(req);
    if (!auth.ok) return auth.response;
    const current = await readSettings();
    const body    = await req.json().catch(() => ({}));
    const merged  = { ...current, ...body };
    await writeSettings(merged);
    return json(merged);
  }
  return json({ error: 'method_not_allowed' }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
