/* functions/admin-sync.js
 * PUT /api/admin/sync
 *
 * Bulk-push the admin's entire content state to Netlify Blobs in one call.
 * The admin SPA holds the canonical state in browser storage and flushes
 * the whole bundle here (debounced) whenever anything changes. Each top-
 * level key is optional — only present sections are written.
 *
 * Body shape:
 *   {
 *     projects: [ ...project records, each with images[] ],   // optional
 *     about:    { ...about object },                          // optional
 *     clients:  [ ...client records ],                        // optional
 *     services: [ ...service records ],                       // optional
 *     settings: { ...settings },                              // optional
 *   }
 *
 * Response: { ok: true, wrote: ['projects','about',...] }
 */

import {
  writeProjects, writeAbout, writeClients, writeServices, writeSettings,
} from './utils/blobs.js';
import { withAuth } from './utils/auth.js';

const handler = async (req) => {
  if (req.method !== 'PUT' && req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const body = await req.json().catch(() => ({}));
  const wrote = [];
  const work  = [];

  if (Array.isArray(body.projects)) {
    work.push(writeProjects({ projects: body.projects }).then(() => wrote.push('projects')));
  }
  if (body.about && typeof body.about === 'object') {
    work.push(writeAbout(body.about).then(() => wrote.push('about')));
  }
  if (Array.isArray(body.clients)) {
    work.push(writeClients({ clients: body.clients }).then(() => wrote.push('clients')));
  }
  if (Array.isArray(body.services)) {
    work.push(writeServices({ services: body.services }).then(() => wrote.push('services')));
  }
  if (body.settings && typeof body.settings === 'object') {
    work.push(writeSettings(body.settings).then(() => wrote.push('settings')));
  }

  try {
    await Promise.all(work);
  } catch (err) {
    return json({ error: 'write_failed', message: err.message }, 500);
  }

  return json({ ok: true, wrote });
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export default withAuth(handler);
