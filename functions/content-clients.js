/* functions/content-clients.js
 * GET    /api/clients          → { clients: [...] } (no auth)
 * POST   /api/clients          → create
 * GET    /api/clients/:slug    → one (no auth)
 * PUT    /api/clients/:slug    → update
 * DELETE /api/clients/:slug    → remove
 */

import { readClients, writeClients } from './utils/blobs.js';
import { requireAuth } from './utils/auth.js';

const slugify = (s) => (s || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');

export default async function handler(req) {
  const url  = new URL(req.url);
  const slug = url.searchParams.get('slug');

  if (req.method !== 'GET') {
    const auth = requireAuth(req);
    if (!auth.ok) return auth.response;
  }

  const data = await readClients();

  if (req.method === 'GET') {
    if (slug) {
      const c = data.clients.find(x => x.slug === slug);
      if (!c) return json({ error: 'not_found' }, 404);
      return json(c);
    }
    return json(data);
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (!body.name) return json({ error: 'validation', message: '`name` required' }, 422);
    const newSlug = body.slug || slugify(body.name);
    if (data.clients.find(c => c.slug === newSlug)) {
      return json({ error: 'validation', message: 'slug already exists' }, 422);
    }
    const client = { name: body.name, slug: newSlug, yearsActive: body.yearsActive || [], work: body.work || '' };
    data.clients.push(client);
    await writeClients(data);
    return json(client, 201);
  }

  if (req.method === 'PUT') {
    if (!slug) return json({ error: 'missing_slug' }, 400);
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body.clients)) {
      data.clients = body.clients;
      await writeClients(data);
      return json(data);
    }
    const c = data.clients.find(x => x.slug === slug);
    if (!c) return json({ error: 'not_found' }, 404);
    Object.assign(c, body, { slug: c.slug });
    await writeClients(data);
    return json(c);
  }

  if (req.method === 'DELETE') {
    if (!slug) return json({ error: 'missing_slug' }, 400);
    const before = data.clients.length;
    data.clients = data.clients.filter(c => c.slug !== slug);
    if (before === data.clients.length) return json({ error: 'not_found' }, 404);
    await writeClients(data);
    return new Response(null, { status: 204 });
  }

  return json({ error: 'method_not_allowed' }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
