/* functions/projects-images-upload.js
 * POST /api/projects/:id/images/upload
 *
 * Accepts a multipart/form-data upload. Writes the bytes to Netlify Blobs
 * under `images/<projectId>/<filename>`, appends an image record to the
 * project's images[], and returns the new record.
 *
 * Form fields:
 *   file         — required, the image bytes
 *   filename     — optional, defaults to file.name
 *   dateTaken    — optional, ISO string (from client-side EXIF)
 *   dimensions   — optional, e.g. "5616×7488"
 *
 * Returns 201 with the new image record:
 *   {
 *     filename, blobPath, order, selected, favorite, rejected, notes,
 *     exif: { dateTaken, dimensions, fileSize }
 *   }
 *
 * blobPath in the response is the URL the admin AND public site use to
 * load the bytes back — '/api/projects/<id>/images/<filename>'.
 */

import { readProjects, writeProjects, setBytes } from './utils/blobs.js';
import { withAuth } from './utils/auth.js';

const handler = async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = new URL(req.url);
  const projectId = url.searchParams.get('id');
  if (!projectId) return json({ error: 'missing_id' }, 400);

  // Parse multipart. Netlify Functions on Node 18+ support req.formData().
  let form;
  try {
    form = await req.formData();
  } catch (err) {
    return json({ error: 'bad_multipart', message: err.message }, 400);
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return json({ error: 'missing_file', message: '`file` field required' }, 400);
  }

  const filename   = (form.get('filename') || file.name || `upload_${Date.now()}.jpg`).toString();
  const safeName   = filename.replace(/[^A-Za-z0-9._-]+/g, '_');
  const dateTaken  = form.get('dateTaken')  ? String(form.get('dateTaken'))  : null;
  const dimensions = form.get('dimensions') ? String(form.get('dimensions')) : '';
  const contentType = file.type || guessContentType(safeName);

  // Load project up front so we can fail fast if it doesn't exist.
  const data = await readProjects();
  const project = data.projects.find(p => p.id === projectId);
  if (!project) return json({ error: 'project_not_found' }, 404);

  // De-dupe by filename within the project — if it's already there, suffix
  // with a counter rather than silently overwrite the previous upload.
  let finalName = safeName;
  if (project.images.find(i => i.filename === finalName)) {
    const dot  = safeName.lastIndexOf('.');
    const stem = dot === -1 ? safeName       : safeName.slice(0, dot);
    const ext  = dot === -1 ? ''             : safeName.slice(dot);
    let n = 2;
    while (project.images.find(i => i.filename === `${stem}_${n}${ext}`)) n++;
    finalName = `${stem}_${n}${ext}`;
  }

  // Write bytes to Blobs.
  const blobKey = `images/${projectId}/${finalName}`;
  const bytes   = await file.arrayBuffer();
  await setBytes(blobKey, new Uint8Array(bytes), contentType);

  // Append the record. order = max+1 so new uploads land at the bottom of
  // the curated grid; the admin can drag to reorder afterwards.
  const order = (project.images.reduce((m, i) => Math.max(m, i.order || 0), 0) || 0) + 1;
  const record = {
    filename: finalName,
    blobPath: `/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(finalName)}`,
    order,
    selected: false,
    favorite: false,
    rejected: false,
    notes: '',
    exif: {
      dateTaken:  dateTaken || null,
      dimensions: dimensions || '',
      fileSize:   bytes.byteLength,
    },
  };
  project.images.push(record);
  project.updatedAt = new Date().toISOString();
  await writeProjects(data);

  return json(record, 201);
};

function guessContentType(name) {
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

export default withAuth(handler);
