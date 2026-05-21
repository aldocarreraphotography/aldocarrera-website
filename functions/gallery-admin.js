/* functions/gallery-admin.js
 * Admin CRUD for client gallery portals (auth required).
 *
 * GET    /api/gallery-admin           — list all galleries
 * POST   /api/gallery-admin           — create a gallery
 * DELETE /api/gallery-admin/:token    — delete a gallery
 */

import { getJson, setJson, del, list } from './utils/blobs.js';
import { withAuth } from './utils/auth.js';

const handler = async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname
    .replace(/^\/api\/gallery-admin\/?/, '')
    .split('/')
    .filter(Boolean);

  if (req.method === 'GET') {
    const keys = await list('gallery:');
    const galleries = await Promise.all(keys.map(k => getJson(k)));
    return json(
      galleries
        .filter(Boolean)
        .map(g => ({ ...g, pin: '****' }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    );
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (!body.projectId || !body.pin) {
      return json({ error: 'projectId and pin required' }, 422);
    }
    const token = Math.random().toString(36).slice(2, 8).toUpperCase();
    const gallery = {
      token,
      projectId: body.projectId,
      title:     body.title || body.projectId,
      pin:       String(body.pin),
      createdAt: new Date().toISOString(),
      selects:   {},
    };
    await setJson(`gallery:${token}`, gallery);
    return json(gallery, 201);
  }

  if (req.method === 'DELETE' && pathParts[0]) {
    await del(`gallery:${pathParts[0]}`);
    return json({ ok: true });
  }

  return json({ error: 'method_not_allowed' }, 405);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default withAuth(handler);
