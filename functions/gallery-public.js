/* functions/gallery-public.js
 * Client-facing gallery interaction — PIN-gated, no JWT.
 *
 * POST   /api/gallery/:token/unlock          body {pin}
 * GET    /api/gallery/:token/images?key=KEY
 * PATCH  /api/gallery/:token/select/:filename?key=KEY  body {hearted?, note?}
 */

import { getJson, setJson } from './utils/blobs.js';
import { readProjects } from './utils/blobs.js';

function makeKey(token, pin) {
  return Buffer.from(`${token}:${pin}`).toString('base64').slice(0, 16);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export default async function handler(req) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Gallery-Key',
      },
    });
  }

  const url = new URL(req.url);
  // path: /api/gallery/:token[/action[/:filename]]
  const parts = url.pathname.replace(/^\/api\/gallery\//, '').split('/');
  const token    = parts[0];
  const action   = parts[1];
  const filename = parts.slice(2).join('/');

  if (!token) return json({ error: 'missing token' }, 400);

  const gallery = await getJson(`gallery:${token}`);
  if (!gallery) return json({ error: 'not_found' }, 404);

  // POST /api/gallery/:token/unlock
  if (action === 'unlock' && req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const { pin } = body;
    if (!pin) return json({ error: 'pin required' }, 400);
    if (String(pin) !== String(gallery.pin)) return json({ error: 'wrong_pin' }, 403);
    const key = makeKey(token, pin);
    const data = await readProjects();
    const project = (data.projects || []).find(p => p.id === gallery.projectId);
    const imageCount = project
      ? (project.images || []).filter(i => !i.rejected).length
      : 0;
    return json({ ok: true, key, title: gallery.title, imageCount });
  }

  // Verify session key for all protected routes
  const key = url.searchParams.get('key') || req.headers.get('x-gallery-key') || '';
  if (key !== makeKey(token, gallery.pin)) return json({ error: 'forbidden' }, 403);

  // GET /api/gallery/:token/images
  if (action === 'images' && req.method === 'GET') {
    const data = await readProjects();
    const project = (data.projects || []).find(p => p.id === gallery.projectId);
    if (!project) return json({ error: 'project_not_found' }, 404);
    const images = (project.images || [])
      .filter(i => !i.rejected)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    return json({
      title:     gallery.title,
      projectId: gallery.projectId,
      images: images.map(img => ({
        filename: img.filename,
        src:      img.blobPath,
        dims:     img.exif?.dimensions || '',
        size:     img.exif?.fileSize ? _fmtBytes(img.exif.fileSize) : '',
        select:   gallery.selects?.[img.filename] || {},
      })),
    });
  }

  // PATCH /api/gallery/:token/select/:filename
  if (action === 'select' && req.method === 'PATCH') {
    const body = await req.json().catch(() => ({}));
    if (!filename) return json({ error: 'filename required' }, 400);
    if (!gallery.selects) gallery.selects = {};
    gallery.selects[filename] = { ...gallery.selects[filename], ...body };
    await setJson(`gallery:${token}`, gallery);
    return json({ ok: true, select: gallery.selects[filename] });
  }

  return json({ error: 'not_found' }, 404);
}

function _fmtBytes(n) {
  if (!n) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' MB';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + ' KB';
  return n + ' B';
}
