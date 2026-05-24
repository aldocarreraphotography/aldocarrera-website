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
 * Returns array of { path, filename, thumbnail: base64string }.
 */
export async function getThumbnailBatch(token, paths) {
  const results = [];
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

    for (const entry of (data.entries || [])) {
      if (entry['.tag'] === 'success' && entry.thumbnail) {
        const filePath = entry.metadata?.path_display || '';
        const filename = filePath.split('/').pop() || '';
        results.push({
          path: filePath,
          filename,
          thumbnail: entry.thumbnail, // already base64 string from Dropbox
        });
      }
      // silently skip failures (e.g. unsupported format) — they just won't appear in results
    }
  }

  return results;
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
