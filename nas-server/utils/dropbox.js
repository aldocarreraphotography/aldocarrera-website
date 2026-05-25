/* dropbox.js — Dropbox API helpers for the AI curation wizard.
 *
 * Uses OAuth refresh-token auth: env vars DROPBOX_APP_KEY,
 * DROPBOX_APP_SECRET, and DROPBOX_REFRESH_TOKEN combine to mint a short-
 * lived access token on demand. The minted token is cached in memory for
 * ~3.5 hours (Dropbox issues 4-hour tokens) so we don't hit /oauth2/token
 * on every API call.
 *
 * Backwards-compat: if DROPBOX_ACCESS_TOKEN is set and the refresh vars
 * are not, we use the raw access token directly (legacy mode). This will
 * break when Dropbox expires the token — switch to refresh-token mode for
 * permanent stability.
 *
 * No SDK dependency — raw fetch only, matching server.js patterns.
 */

const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'tiff', 'tif', 'heic', 'cr3', 'nef', 'arw', 'dng', 'raf', 'rw2',
]);

function isImageFile(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

// ----------------------------------------------------------------------
// Token cache + refresh
// ----------------------------------------------------------------------

let _cachedToken = null;      // { token: string, expiresAt: number(ms epoch) }
let _refreshInFlight = null;  // dedupe concurrent refreshes

/**
 * Returns a valid Dropbox access token, refreshing if needed.
 *
 * @param {string} [legacyToken] - Optional. If passed AND refresh-token
 *   env vars are NOT configured, returns it as-is (back-compat with the
 *   old `(token) => fetch(...)` signature). Otherwise ignored.
 */
async function getAccessToken(legacyToken) {
  const appKey       = process.env.DROPBOX_APP_KEY;
  const appSecret    = process.env.DROPBOX_APP_SECRET;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;

  // Legacy mode — raw long-lived/short-lived access token.
  if (!appKey || !appSecret || !refreshToken) {
    const fallback = legacyToken || process.env.DROPBOX_ACCESS_TOKEN;
    if (!fallback) {
      throw new Error('Dropbox not configured: set DROPBOX_APP_KEY + DROPBOX_APP_SECRET + DROPBOX_REFRESH_TOKEN (recommended) or DROPBOX_ACCESS_TOKEN (legacy)');
    }
    return fallback;
  }

  // Cache hit — return immediately. We refresh 30 minutes before expiry
  // so a long-running request doesn't 401 mid-flight.
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAt > now + 30 * 60 * 1000) {
    return _cachedToken.token;
  }

  // Dedupe — if another request is already refreshing, await that promise
  // instead of firing a parallel /oauth2/token call.
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
      const basicAuth = Buffer.from(`${appKey}:${appSecret}`).toString('base64');

      const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Dropbox token refresh failed (${res.status}): ${txt.slice(0, 400)}`);
      }

      const data = await res.json();
      const expiresInSec = data.expires_in || 14400; // default 4h
      _cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + expiresInSec * 1000,
      };
      console.log(`[dropbox] minted new access token, valid ${Math.round(expiresInSec / 60)}m`);
      return _cachedToken.token;
    } finally {
      _refreshInFlight = null;
    }
  })();

  return _refreshInFlight;
}

/**
 * List files/folders in a Dropbox path. Auto-paginates.
 * Returns array of Dropbox metadata entries.
 *
 * `legacyToken` is optional — only used if refresh-token env vars are
 * not set. New code should pass null/undefined and rely on env config.
 */
export async function listFolder(legacyToken, path = '') {
  const entries = [];
  const token = await getAccessToken(legacyToken);

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
export async function getThumbnailBatch(legacyToken, paths) {
  const results = [];
  const failures = [];
  const CHUNK_SIZE = 25;
  const token = await getAccessToken(legacyToken);

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
export async function downloadFile(legacyToken, path) {
  const token = await getAccessToken(legacyToken);
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

/**
 * True if Dropbox is configured at all (either refresh-token or legacy access-token).
 * Use in route handlers to bail with 503 before doing real work.
 */
export function isConfigured() {
  return !!(
    (process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET && process.env.DROPBOX_REFRESH_TOKEN)
    || process.env.DROPBOX_ACCESS_TOKEN
  );
}

export { isImageFile, getAccessToken };
