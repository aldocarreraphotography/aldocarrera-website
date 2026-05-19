/* functions/projects-id.js
 * GET    /api/projects/:id   → single project
 * PUT    /api/projects/:id   → patch a project (including images array,
 *                              which the admin uses to persist reordering)
 * DELETE /api/projects/:id   → remove project + its image blobs
 */

import { readProjects, writeProjects, del, list } from './utils/blobs.js';
import { withAuth } from './utils/auth.js';

const handler = async (req) => {
  const url = new URL(req.url);
  const id  = url.searchParams.get('id');
  if (!id) return json({ error: 'missing_id' }, 400);

  const data = await readProjects();
  const idx  = data.projects.findIndex(p => p.id === id);

  if (req.method === 'GET') {
    if (idx === -1) return json({ error: 'not_found' }, 404);
    return json(data.projects[idx]);
  }

  if (req.method === 'PUT') {
    if (idx === -1) return json({ error: 'not_found' }, 404);
    const body  = await req.json().catch(() => ({}));
    // Allow updating any field including images (used for reorder + tags).
    // We protect createdAt + id; everything else is overwriteable.
    const merged = {
      ...data.projects[idx],
      ...body,
      id: data.projects[idx].id,
      createdAt: data.projects[idx].createdAt,
      updatedAt: new Date().toISOString(),
    };
    data.projects[idx] = merged;
    await writeProjects(data);
    return json(merged);
  }

  if (req.method === 'DELETE') {
    if (idx === -1) return json({ error: 'not_found' }, 404);
    // Best-effort: also remove any image blobs filed under this project.
    try {
      const keys = await list(`${id}/`);
      await Promise.all(keys.map(k => del(k)));
    } catch (_) {}
    data.projects.splice(idx, 1);
    await writeProjects(data);
    return new Response(null, { status: 204 });
  }

  return json({ error: 'method_not_allowed' }, 405);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export default withAuth(handler);
