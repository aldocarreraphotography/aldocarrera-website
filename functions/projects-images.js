/* functions/projects-images.js
 * GET    /api/projects/:id/images/:filename   — serve the bytes (public)
 * PUT    /api/projects/:id/images/:filename   — patch flags / notes (auth)
 * DELETE /api/projects/:id/images/:filename   — remove from store + Blobs (auth)
 *
 * The GET path is intentionally unauthenticated — image URLs returned by the
 * upload function are linked directly into <img src=> tags on the public
 * site. The bytes are immutable per filename (collisions are de-duped on
 * upload), so it's safe to cache aggressively at the edge.
 */

import { readProjects, writeProjects, getBytes, del } from './utils/blobs.js';
import { requireAuth } from './utils/auth.js';

export default async function handler(req) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get('id');
  const filename  = url.searchParams.get('filename');
  if (!projectId || !filename) return json({ error: 'missing_params' }, 400);

  const blobKey = `images/${projectId}/${filename}`;

  if (req.method === 'GET') {
    const bytes = await getBytes(blobKey);
    if (!bytes) return new Response('Not found', { status: 404 });
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type':  contentTypeFor(filename),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  // Mutations require auth.
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  if (req.method === 'PUT') {
    const body = await req.json().catch(() => ({}));
    const data = await readProjects();
    const project = data.projects.find(p => p.id === projectId);
    if (!project) return json({ error: 'project_not_found' }, 404);
    const img = project.images.find(i => i.filename === filename);
    if (!img) return json({ error: 'image_not_found' }, 404);
    // Allow flag + notes edits. blobPath / filename / exif / order stay put.
    if ('selected' in body) img.selected = !!body.selected;
    if ('favorite' in body) img.favorite = !!body.favorite;
    if ('rejected' in body) img.rejected = !!body.rejected;
    if ('notes'    in body) img.notes    = String(body.notes || '');
    project.updatedAt = new Date().toISOString();
    await writeProjects(data);
    return json(img);
  }

  if (req.method === 'DELETE') {
    const data = await readProjects();
    const project = data.projects.find(p => p.id === projectId);
    if (!project) return json({ error: 'project_not_found' }, 404);
    const before = project.images.length;
    project.images = project.images.filter(i => i.filename !== filename);
    if (project.images.length === before) return json({ error: 'image_not_found' }, 404);
    // Renumber so order stays contiguous (1..N).
    project.images
      .slice()
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .forEach((img, i) => { img.order = i + 1; });
    project.updatedAt = new Date().toISOString();
    await writeProjects(data);
    // Best-effort blob delete.
    try { await del(blobKey); } catch (_) {}
    return new Response(null, { status: 204 });
  }

  return json({ error: 'method_not_allowed' }, 405);
}

function contentTypeFor(name) {
  const ext = name.toLowerCase().split('.').pop();
  return ({
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', avif: 'image/avif',
  })[ext] || 'application/octet-stream';
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
