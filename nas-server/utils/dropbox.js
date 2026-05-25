/* dropbox.js — Dropbox API helpers for the AI curation wizard.
 *
 * All functions take a Dropbox access token and return structured data.
 * No SDK dependency — raw fetch only, matching server.js patterns.
 */

const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'tiff', 'tif', 'heic', 'cr3', 'nef', 'arw', 'dng', 'raf', 'rw2',
]);

function isImageFile(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * List files/folders in a Dropbox path. Auto-paginates.
 * Returns array of Dropbox metadata entries.
 */
export async function listFolder(token, path = '') {
  const entries = [];

  // Dropbox requires '' for root, not '/'.
  const normalizedPath = path === '/' ? '' : (path || '');

  const firstRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: normalizedPath,
      recursive: false,
      include_media_info: true,
    }),
  });

  if (!firstRes.ok) {
    const txt = await firstRes.text();
    throw new Error(`Dropbox list_folder failed (${firstRes.status}): ${txt.slice(0, 400)}`);
  }

  let page = await firstRes.json();
  entries.push(...(page.entries || []));

  // Paginate if needed
  while (page.has_more && page.cursor) {
    const contRes = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cursor: page.cursor }),
    });

    if (!contRes.ok) {
      const txt = await contRes.text();
      throw new Error(`Dropbox list_folder/continue failed (${contRes.status}): ${txt.slice(0, 400)}`);
    }

    page = await contRes.json();
    entries.push(...(page.entries || []));
  }

  return entries;
}

/**
 * Batch fetch JPEG thumbnails for an array of Dropbox file paths.
 * Automatically chunks into batches of 25 (Dropbox max).
 * Returns { results: [{path,filename,thumbnail}], failures: [{path,reason}] }.
 * Dropbox only thumbnails jpg/jpeg/png/tiff/bmp/gif/webp — RAW formats and HEIC fail.
 */
export async function getThumbnailBatch(token, paths) {
  const results = [];
  const failures = [];
  const CHUNK_SIZE = 25;

  for (let i = 0; i < paths.length; i += CHUNK_SIZE) {
    const chunk = paths.slice(i, i + CHUNK_SIZE);

    const entries = chunk.map(p => ({
      path: p,
      format: { '.tag': 'jpeg' },
      size: { '.tag': 'w640h480' },
    }));

    const res = await fetch('https://content.dropboxapi.com/2/files/get_thumbnail_batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entries }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Dropbox get_thumbnail_batch failed (${res.status}): ${txt.slice(0, 400)}`);
    }

    const data = await res.json();

    for (let j = 0; j < (data.entries || []).length; j++) {
      const entry = data.entries[j];
      const reqPath = chunk[j] || '';
      if (entry['.tag'] === 'success' && entry.thumbnail) {
        const filePath = entry.metadata?.path_display || reqPath;
        const filename = filePath.split('/').pop() || '';
        results.push({
          path: filePath,
          filename,
          thumbnail: entry.thumbnail, // already base64 string from Dropbox
        });
      } else {
        // Capture failure reason — usually "unsupported_image" for RAW/HEIC
        const innerTag = entry.failure?.['.tag'] || entry['.tag'] || 'unknown';
        const innerDetail = entry.failure?.path?.['.tag']
          || entry.failure?.unsupported_image?.['.tag']
          || '';
        failures.push({
          path: reqPath,
          filename: reqPath.split('/').pop() || '',
          reason: innerDetail ? `${innerTag}:${innerDetail}` : innerTag,
        });
      }
    }
  }

  return { results, failures };
}

/**
 * Download a file from Dropbox.
 * Returns a Buffer with the raw file bytes.
 */
export async function downloadFile(token, path) {
  const res = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path }),
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Dropbox download failed (${res.status}) for ${path}: ${txt.slice(0, 400)}`);
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export { isImageFile };
