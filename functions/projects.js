/* functions/projects.js
 * GET  /api/projects        → { projects: [...] }
 * POST /api/projects        → create
 *
 * Body for POST: at least { id, name }. Other fields optional.
 */

import { readProjects, writeProjects } from './utils/blobs.js';
import { withAuth } from './utils/auth.js';

const handler = async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const data = await readProjects();
    return json(data);
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (!body.name) return json({ error: 'validation', message: '`name` required' }, 422);

    const data = await readProjects();
    const project = {
      id:          body.id?.toUpperCase()?.replace(/[^A-Z0-9_]+/g, '_') || nextId(),
      name:        body.name,
      client:      body.client || '',
      type:        body.type || 'Editorial',
      year:        body.year || new Date().getFullYear(),
      month:       body.month || '',
      description: body.description || '',
      location:    body.location || '',
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
      folderPath:  `archive/${body.year || new Date().getFullYear()}/${body.id}`,
      images:      [],
    };

    if (data.projects.find(p => p.id === project.id)) {
      return json({ error: 'validation', message: 'id already exists' }, 422);
    }

    data.projects.unshift(project);
    await writeProjects(data);
    return json(project, 201);
  }

  return json({ error: 'method_not_allowed' }, 405);
};

function nextId() {
  return 'PRJ_' + Math.random().toString(36).slice(2, 9).toUpperCase();
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

export default withAuth(handler);
