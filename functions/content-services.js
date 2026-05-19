/* functions/content-services.js
 * GET    /api/services       → { services: [...] } (no auth)
 * POST   /api/services       → create
 * GET    /api/services/:id   → one (no auth)
 * PUT    /api/services/:id   → update
 * DELETE /api/services/:id   → remove
 */

import { readServices, writeServices } from './utils/blobs.js';
import { requireAuth } from './utils/auth.js';

export default async function handler(req) {
  const url = new URL(req.url);
  const idParam = url.searchParams.get('id');
  const id = idParam ? parseInt(idParam, 10) : null;

  // Reads are public; mutations need auth.
  if (req.method !== 'GET') {
    const auth = requireAuth(req);
    if (!auth.ok) return auth.response;
  }

  const data = await readServices();

  if (req.method === 'GET') {
    if (id != null) {
      const svc = data.services.find(s => s.id === id);
      if (!svc) return json({ error: 'not_found' }, 404);
      return json(svc);
    }
    return json(data);
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (!body.title) return json({ error: 'validation', message: '`title` required' }, 422);
    const newId    = (data.services.reduce((m, s) => Math.max(m, s.id), 0) || 0) + 1;
    const newOrder = (data.services.reduce((m, s) => Math.max(m, s.order), 0) || 0) + 1;
    const svc = { id: newId, title: body.title, description: body.description || '', order: body.order ?? newOrder };
    data.services.push(svc);
    await writeServices(data);
    return json(svc, 201);
  }

  if (req.method === 'PUT') {
    if (id == null) return json({ error: 'missing_id' }, 400);
    const body = await req.json().catch(() => ({}));
    // Allow bulk reorder via { services: [...] }
    if (Array.isArray(body.services)) {
      const ordered = body.services.map((svc, i) => ({ ...svc, order: i + 1 }));
      data.services = ordered;
      await writeServices(data);
      return json(data);
    }
    const svc = data.services.find(s => s.id === id);
    if (!svc) return json({ error: 'not_found' }, 404);
    Object.assign(svc, body, { id: svc.id });
    await writeServices(data);
    return json(svc);
  }

  if (req.method === 'DELETE') {
    if (id == null) return json({ error: 'missing_id' }, 400);
    const before = data.services.length;
    data.services = data.services.filter(s => s.id !== id);
    if (before === data.services.length) return json({ error: 'not_found' }, 404);
    await writeServices(data);
    return new Response(null, { status: 204 });
  }

  return json({ error: 'method_not_allowed' }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
