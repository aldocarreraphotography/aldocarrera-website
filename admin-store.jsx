/* admin-store.jsx — localStorage + IndexedDB-backed store that mirrors the
   exact JSON shape the real Netlify backend will honor. Every function here
   maps 1:1 to an API endpoint documented in admin-handoff/API_CONTRACT.md.

   When the real backend is wired in, swap each implementation body for a
   `fetch()` call. The function signatures and return shapes don't change. */

const STORE_KEY = 'aldo_admin_v1';
const AUTH_KEY  = 'aldo_admin_token';
const IDB_NAME  = 'aldo_admin_images';
const IDB_STORE = 'blobs';

// When deployed with a NAS backend, Admin.html sets window.API_BASE to the
// NAS server URL (e.g. https://nas.aldocarrera.synology.me). Falls back to
// '' so all relative /api/ paths keep working in local netlify dev.
const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || '';

/* -------- seed data ---------------------------------------------------- */

const SEED = {
  projects: [
    {
      id: 'BAPE_FW24',
      name: 'BAPE — FW24 Editorial',
      client: 'BAPE',
      type: 'Editorial',
      year: 2024,
      month: 'November',
      description: 'Hong Kong residency. Two days, one apartment, two cameras.',
      location: 'Hong Kong — Sheung Wan',
      createdAt: '2024-11-20T14:30:00Z',
      updatedAt: '2024-11-20T14:30:00Z',
      folderPath: 'archive/2024/BAPE_FW24',
      images: [
        { filename: 'BAPE_FW24_R01_F08.jpg', blobPath: 'photos/aldo502-090.jpg', order: 1, selected: true,  favorite: true,  rejected: false, notes: '', exif: { dateTaken: '2024-11-04T14:45:00Z', dimensions: '5616×7488', fileSize: 8400000 } },
        { filename: 'BAPE_FW24_R01_F09.jpg', blobPath: 'photos/aldo502-090.jpg', order: 2, selected: true,  favorite: false, rejected: false, notes: '', exif: { dateTaken: '2024-11-04T15:12:00Z', dimensions: '5616×7488', fileSize: 8600000 } },
        { filename: 'BAPE_FW24_R02_F12.jpg', blobPath: 'photos/aldo502-090.jpg', order: 3, selected: false, favorite: false, rejected: false, notes: '', exif: { dateTaken: '2024-11-05T10:02:00Z', dimensions: '5616×7488', fileSize: 9100000 } },
        { filename: 'BAPE_FW24_R02_F14.jpg', blobPath: 'photos/aldo502-090.jpg', order: 4, selected: false, favorite: false, rejected: true,  notes: 'soft focus', exif: { dateTaken: '2024-11-05T10:14:00Z', dimensions: '5616×7488', fileSize: 9000000 } },
      ],
    },
    {
      id: 'FLAL_RS24',
      name: 'For Love and Lemons — Resort \u201924',
      client: 'FOR LOVE AND LEMONS',
      type: 'Commercial',
      year: 2024,
      month: 'March',
      description: 'Resort campaign shot on a 14th-floor walk-up. Sun cooperated for eleven seconds.',
      location: 'Downtown LA — rooftop',
      createdAt: '2024-03-10T09:00:00Z',
      updatedAt: '2024-03-10T09:00:00Z',
      folderPath: 'archive/2024/FLAL_RS24',
      images: [
        { filename: 'FLAL_RS24_LOOK02_A.jpg', blobPath: 'photos/000085460013.jpg', order: 1, selected: true,  favorite: true,  rejected: false, notes: 'campaign hero', exif: { dateTaken: '2024-03-08T12:30:00Z', dimensions: '5104×7616', fileSize: 6800000 } },
        { filename: 'FLAL_RS24_LOOK02_B.jpg', blobPath: 'photos/000085460013.jpg', order: 2, selected: true,  favorite: false, rejected: false, notes: '', exif: { dateTaken: '2024-03-08T12:34:00Z', dimensions: '5104×7616', fileSize: 6700000 } },
        { filename: 'FLAL_RS24_LOOK05_C.jpg', blobPath: 'photos/000085460013.jpg', order: 3, selected: true,  favorite: false, rejected: false, notes: '', exif: { dateTaken: '2024-03-09T11:18:00Z', dimensions: '5104×7616', fileSize: 7100000 } },
      ],
    },
    {
      id: 'MATTEL_BARBIE',
      name: 'Mattel — Barbie Press',
      client: 'MATTEL',
      type: 'Commercial',
      year: 2024,
      month: 'June',
      description: 'Press portraits in a sunlit room. We didn\'t bring lights.',
      location: 'Los Angeles',
      createdAt: '2024-06-20T10:00:00Z',
      updatedAt: '2024-06-20T10:00:00Z',
      folderPath: 'archive/2024/MATTEL_BARBIE',
      images: [
        { filename: 'MATTEL_BARBIE_R01_F03.jpg', blobPath: 'photos/barbie-rooftop.jpg', order: 1, selected: true, favorite: true, rejected: false, notes: '', exif: { dateTaken: '2024-06-19T13:45:00Z', dimensions: '4992×6240', fileSize: 7200000 } },
        { filename: 'MATTEL_BARBIE_R01_F04.jpg', blobPath: 'photos/barbie-rooftop.jpg', order: 2, selected: false, favorite: false, rejected: false, notes: '', exif: { dateTaken: '2024-06-19T13:48:00Z', dimensions: '4992×6240', fileSize: 7300000 } },
      ],
    },
    {
      id: 'HALSTON_SS23',
      name: 'Halston — SS23 Lookbook',
      client: 'HALSTON',
      type: 'Commercial',
      year: 2023,
      month: 'October',
      description: 'Soft daylight only. Two roll backdrops, one shared coffee.',
      location: 'New York — SoHo',
      createdAt: '2023-10-04T15:00:00Z',
      updatedAt: '2023-10-04T15:00:00Z',
      folderPath: 'archive/2023/HALSTON_SS23',
      images: [
        { filename: 'HALSTON_SS23_L01.jpg', blobPath: 'photos/000085460013.jpg', order: 1, selected: true, favorite: false, rejected: false, notes: '', exif: { dateTaken: '2023-10-02T11:10:00Z', dimensions: '5616×7488', fileSize: 7800000 } },
        { filename: 'HALSTON_SS23_L02.jpg', blobPath: 'photos/000085460013.jpg', order: 2, selected: false, favorite: false, rejected: false, notes: '', exif: { dateTaken: '2023-10-02T11:14:00Z', dimensions: '5616×7488', fileSize: 7600000 } },
      ],
    },
  ],
  about: {
    bio: 'Photography has always been more than a profession — it\'s a way to tell stories, evoke emotion, and create work that resonates. From early experiments in the darkroom to collaborations with some of the most iconic brands in fashion, I\'ve always sought to push the boundaries of visual storytelling.',
    location: 'Los Angeles',
    education: {
      school: 'Academy of Art University',
      degree: 'BFA, Fine Art Photography',
      year: 2019,
    },
    practice: [
      'High-end fashion',
      'Campaign',
      'Lookbook',
      'Editorial',
      'Casting',
      'Art Direction',
      'Creative Direction',
      'Post Production',
    ],
  },
  clients: [
    { name: 'BAPE',                slug: 'bape',                yearsActive: [2023, 2024] },
    { name: 'Christian Cowan',     slug: 'christian-cowan',     yearsActive: [2023] },
    { name: 'For Love and Lemons', slug: 'for-love-and-lemons', yearsActive: [2024] },
    { name: 'Halston',             slug: 'halston',             yearsActive: [2023] },
    { name: 'Mattel',              slug: 'mattel',              yearsActive: [2024] },
    { name: 'Marvel',              slug: 'marvel',              yearsActive: [2024] },
    { name: 'Sanrio',              slug: 'sanrio',              yearsActive: [2024] },
    { name: 'Victoria\'s Secret',  slug: 'victorias-secret',    yearsActive: [2023] },
  ],
  services: [
    { id: 1, title: 'Photography',        description: 'Campaign · Lookbook · Editorial · High-end fashion', order: 1 },
    { id: 2, title: 'Casting',            description: 'Talent + look development with stylist + director.',  order: 2 },
    { id: 3, title: 'Art Direction',      description: 'Set, prop, palette. End-to-end for small productions.', order: 3 },
    { id: 4, title: 'Creative Direction', description: 'Full campaign pipeline from concept through delivery.', order: 4 },
    { id: 5, title: 'Post Production',    description: 'Color, retouch, sequencing. Up to 80 frames per project.', order: 5 },
  ],
  settings: {
    contactEmail: 'aldo@aldocarrera.com',
    contactPhone: '+1 (619) 971-7182',
    instagram:    '@aldocarrera',
    accentColor:  '#d63e5a',
  },
  uploadHistory: [
    { id: 'u1', when: new Date(Date.now() - 1000*60*60*4).toISOString(),     projectId: 'BAPE_FW24',     count: 4, totalBytes: 35100000 },
    { id: 'u2', when: new Date(Date.now() - 1000*60*60*24*2).toISOString(),  projectId: 'FLAL_RS24',     count: 3, totalBytes: 20600000 },
    { id: 'u3', when: new Date(Date.now() - 1000*60*60*24*5).toISOString(),  projectId: 'MATTEL_BARBIE', count: 2, totalBytes: 14500000 },
  ],
};

/* -------- low-level helpers ------------------------------------------- */

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) {
      const seed = JSON.parse(JSON.stringify(SEED));
      localStorage.setItem(STORE_KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw);
  } catch (_) {
    return JSON.parse(JSON.stringify(SEED));
  }
}
function writeStore(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
  window.dispatchEvent(new CustomEvent('admin-store-changed'));
}
function patchStore(fn) {
  const s = readStore();
  fn(s);
  writeStore(s);
  return s;
}
function nowISO() { return new Date().toISOString(); }
function nextId(prefix) { return `${prefix}_${Math.random().toString(36).slice(2, 9).toUpperCase()}`; }

/* Sort by curated `order` (1-based). Images without an order (legacy data)
   sort to the bottom by upload index, then get renumbered on next reorder. */
function sortImagesByOrder(images) {
  return images.slice().sort((a, b) => {
    const ao = a.order ?? Infinity;
    const bo = b.order ?? Infinity;
    return ao - bo;
  });
}

/* -------- Client-side image compression before upload ----------------- */
/*
 * Netlify Functions have a 6 MB body limit. Photographer JPEGs are often
 * 10–25 MB. Compress to max 2400 px at 82 % JPEG quality before uploading —
 * visually identical to the original at any web display size. EXIF data is
 * already extracted by parseExif() before this runs, so nothing is lost.
 *
 * Returns the original file unchanged if:
 *   - it's already ≤ 5 MB, or
 *   - it's a format Canvas can't encode (HEIC, AVIF) — those will hit the
 *     size warning in the UI and the user should pre-convert them.
 */
async function compressForUpload(file) {
  const LIMIT   = 5 * 1024 * 1024; // 5 MB — stay safely under the 6 MB gate
  const MAX_DIM = 2400;             // px — fine for any retina display
  const QUALITY = 0.82;

  if (file.size <= LIMIT) return file;
  if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/) &&
      !file.name.match(/\.(jpe?g|png|webp)$/i)) {
    return file; // can't compress via Canvas — UI already warned about size
  }

  return new Promise((resolve) => {
    const img = new Image();
    const blobURL = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(blobURL);
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width >= height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
        else                 { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        const name = file.name.replace(/\.[^.]+$/, '.jpg');
        const compressed = new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
        compressed.__exif = file.__exif; // carry EXIF metadata forward
        resolve(compressed);
      }, 'image/jpeg', QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(blobURL); resolve(file); };
    img.src = blobURL;
  });
}

/* -------- IndexedDB for user-dropped image blobs ---------------------- */
/* The prototype lets the user drag actual photos in; we store them as
   Blobs in IndexedDB so they survive reload and don't blow up localStorage. */

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key, blob) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* In-memory cache of resolved blob → objectURL so we can show the same
   image many times without re-issuing object URLs each render. */
const blobURLCache = new Map();
async function resolveImageURL(blobPath) {
  if (!blobPath) return null;
  // Production paths — server-served URLs or absolute http(s).
  if (blobPath.startsWith('/api/'))    return blobPath;
  if (blobPath.startsWith('http://'))  return blobPath;
  if (blobPath.startsWith('https://')) return blobPath;
  if (blobPath.startsWith('data:'))    return blobPath;
  // Static seed images shipped with the public site.
  if (blobPath.startsWith('photos/'))  return blobPath;
  // Local offline stash (IndexedDB).
  if (blobURLCache.has(blobPath)) return blobURLCache.get(blobPath);
  const blob = await idbGet(blobPath);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  blobURLCache.set(blobPath, url);
  return url;
}

/* -------- API sync ---------------------------------------------------- */
/* When a real backend is reachable (Netlify Functions deployed, real JWT
   in localStorage), every write is mirrored to Netlify Blobs so the public
   site — and any other device — sees the same state.

   Strategy:
     - Local writes always succeed against localStorage first (instant UX,
       offline-safe).
     - A debounced background flush PUTs the whole content state to
       /api/admin/sync. Image binary blobs stay in IndexedDB until a future
       upload endpoint moves them; only the metadata syncs today.
     - Login pulls any newer Blobs state on top of local — useful when a
       fresh device starts with empty localStorage.

   Failure modes are silent. If sync fails (no network, real backend not
   yet deployed, prototype token rejected), the admin still works locally. */

const SYNC_DEBOUNCE_MS = 1200;
let _syncTimer = null;
let _lastSync  = { at: 0, ok: false };

function _isRealJWT(token) {
  // Prototype tokens are tagged 'proto.xxx.demo' — we don't even bother
  // trying to sync those because the server will 401.
  return typeof token === 'string' && !token.startsWith('proto.');
}
function _getAuthToken() { return localStorage.getItem(AUTH_KEY); }

async function pushToAPI() {
  const token = _getAuthToken();
  if (!_isRealJWT(token)) return false;
  const s = readStore();
  // Strip images whose bytes haven't been uploaded to the server yet
  // (offline IDB stash). The local copy keeps them so the user can retry,
  // but we mustn't write IDB-style paths to projects.json — the public
  // site would 404 trying to render them.
  const isServedPath = (p) => !!p && (
    p.startsWith('/api/') || p.startsWith('http://') ||
    p.startsWith('https://') || p.startsWith('photos/') ||
    p.startsWith('data:')
  );
  const cleanProjects = (s.projects || []).map(p => ({
    ...p,
    images: (p.images || []).filter(img => isServedPath(img.blobPath)),
  }));
  try {
    const r = await fetch(API_BASE + '/api/admin/sync', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        projects: cleanProjects,
        about:    s.about,
        clients:  s.clients,
        services: s.services,
        settings: s.settings,
      }),
    });
    _lastSync = { at: Date.now(), ok: r.ok };
    return r.ok;
  } catch (_) {
    _lastSync = { at: Date.now(), ok: false };
    return false;
  }
}

async function pullFromAPI() {
  const token = _getAuthToken();
  if (!_isRealJWT(token)) return false;
  try {
    const [pjs, ab, cl, sv, st] = await Promise.all([
      fetch(API_BASE + '/api/projects',  { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
      fetch(API_BASE + '/api/about',     { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
      fetch(API_BASE + '/api/clients',   { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
      fetch(API_BASE + '/api/services',  { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
      fetch(API_BASE + '/api/settings',  { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
    ]);
    patchStore(s => {
      if (pjs?.projects?.length) s.projects = pjs.projects;
      if (ab && Object.keys(ab).length) s.about = ab;
      if (cl?.clients?.length) s.clients = cl.clients;
      if (sv?.services?.length) s.services = sv.services;
      if (st && Object.keys(st).length) s.settings = st;
    });
    return true;
  } catch (_) {
    return false;
  }
}

function scheduleSync() {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => { pushToAPI(); _syncTimer = null; }, SYNC_DEBOUNCE_MS);
}

// Every local write fires `admin-store-changed`; piggyback to schedule a flush.
window.addEventListener('admin-store-changed', scheduleSync);

// On page unload, try to fire one last sync synchronously via sendBeacon.
window.addEventListener('beforeunload', () => {
  const token = _getAuthToken();
  if (!_isRealJWT(token) || !navigator.sendBeacon) return;
  const s = readStore();
  const blob = new Blob([JSON.stringify({
    projects: s.projects, about: s.about, clients: s.clients,
    services: s.services, settings: s.settings,
  })], { type: 'application/json' });
  // sendBeacon doesn't support custom headers — auth via cookie only.
  // The bulk-sync endpoint accepts Authorization, so this is best-effort
  // pageload-protection rather than the primary sync path.
  try { navigator.sendBeacon('/api/admin/sync', blob); } catch (_) {}
});

/* -------- public Store API ------------------------------------------- */

const AdminStore = {
  // Auth ----------------------------------------------------------------
  async login(password) {
    // First try the real backend. When functions are deployed (production
    // and `netlify dev`), this issues a JWT signed with JWT_SECRET that
    // every admin-only endpoint will accept.
    try {
      const r = await fetch(API_BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (r.ok) {
        const data = await r.json();
        localStorage.setItem(AUTH_KEY, data.token);
        // Pull any newer state from Blobs and reconcile.
        pullFromAPI().catch(() => {});
        return data;
      }
      if (r.status === 401) throw new Error('Wrong password');
      if (r.status === 429) throw new Error('Too many attempts. Wait a few minutes.');
      // Other 4xx/5xx → fall through to prototype mode
    } catch (err) {
      // Network failure (offline, dev with no functions) → prototype fallback.
      // We re-throw if the server explicitly rejected the password.
      if (err.message === 'Wrong password' || err.message?.startsWith('Too many')) {
        throw err;
      }
    }

    // PROTOTYPE fallback: any non-empty password works. Tokens issued here
    // will NOT be accepted by /api/* — the admin then runs in fully local
    // mode (everything stays in localStorage; nothing syncs to Blobs).
    await new Promise(r => setTimeout(r, 200));
    if (!password || !password.trim()) throw new Error('Password required');
    const token = `proto.${btoa(JSON.stringify({ exp: Date.now() + 1000*60*60*24*30 }))}.demo`;
    localStorage.setItem(AUTH_KEY, token);
    return { token, expiresIn: 60*60*24*30 };
  },
  logout() {
    // Best-effort; the server treats logout as a no-op anyway (JWTs are stateless).
    fetch(API_BASE + '/api/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem(AUTH_KEY);
    window.dispatchEvent(new CustomEvent('admin-store-changed'));
  },
  isAuthenticated() {
    const token = localStorage.getItem(AUTH_KEY);
    if (!token) return false;
    try {
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      return payload.exp > Date.now();
    } catch (_) { return false; }
  },

  // Projects ------------------------------------------------------------
  getProjects() {
    return readStore().projects.slice()
      .map(p => ({ ...p, images: sortImagesByOrder(p.images) }))
      .sort((a, b) => b.year - a.year || b.updatedAt.localeCompare(a.updatedAt));
  },
  getProject(id) {
    const p = readStore().projects.find(x => x.id === id);
    if (!p) return null;
    return { ...p, images: sortImagesByOrder(p.images) };
  },
  async createProject(input) {
    const project = {
      id: input.id || nextId('PRJ'),
      name: input.name || 'Untitled project',
      client: input.client || '',
      type: input.type || 'Editorial',
      year: input.year || new Date().getFullYear(),
      month: input.month || '',
      description: input.description || '',
      location: input.location || '',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      folderPath: `archive/${input.year || new Date().getFullYear()}/${input.id || 'NEW'}`,
      images: [],
    };
    patchStore(s => { s.projects.unshift(project); });

    // Write to Blobs immediately so the project exists when images are
    // uploaded. Without this, the upload endpoint returns 404 (project not
    // found) because the debounced sync hasn't fired yet, causing images to
    // silently fall through to IndexedDB and never reach the public site.
    const token = _getAuthToken();
    if (_isRealJWT(token)) {
      try {
        const r = await fetch(API_BASE + '/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(project),
        });
        // 201 = created, 422 = already exists (e.g. a sync raced us) — both fine.
        if (!r.ok && r.status !== 422) {
          console.warn('[admin-store] createProject API returned', r.status);
        }
      } catch (_) {
        // Network failure — local write succeeded; debounced sync will push later.
      }
    }

    return project;
  },
  updateProject(id, patch) {
    patchStore(s => {
      const p = s.projects.find(x => x.id === id);
      if (!p) return;
      Object.assign(p, patch, { updatedAt: nowISO() });
    });
    return this.getProject(id);
  },
  deleteProject(id) {
    patchStore(s => { s.projects = s.projects.filter(p => p.id !== id); });
  },

  // Images --------------------------------------------------------------
  async uploadImages(projectId, files, onProgress) {
    const token  = _getAuthToken();
    const useAPI = _isRealJWT(token);
    const added  = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Compress before upload if the file is over 5 MB (Netlify's 6 MB limit).
      // compressForUpload preserves __exif and returns the original if it can't compress.
      const uploadFile = await compressForUpload(file);
      const filename = uploadFile.name;
      const exif = uploadFile.__exif || file.__exif || {};

      let record = null;

      if (useAPI) {
        // Real backend: POST multipart to the upload function. The server
        // writes bytes to Netlify Blobs and returns an image record whose
        // blobPath is a public /api/projects/.../images/... URL — that URL
        // is what the public site renders.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        try {
          const fd = new FormData();
          fd.append('file', uploadFile, filename);
          fd.append('filename', filename);
          if (exif.dateTaken)  fd.append('dateTaken',  exif.dateTaken);
          if (exif.dimensions) fd.append('dimensions', exif.dimensions);

          const r = await fetch(
            `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/images/upload`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: fd,
              signal: controller.signal,
            }
          );
          clearTimeout(timer);
          if (r.ok) {
            record = await r.json();
          } else if (r.status === 404) {
            // Project not in Blobs yet (sync hasn't fired). Create it now
            // then retry the upload once.
            const proj = readStore().projects.find(x => x.id === projectId);
            if (proj) {
              try {
                const cr = await fetch(API_BASE + '/api/projects', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ ...proj, images: [] }),
                });
                if (cr.ok || cr.status === 422) {
                  const fd2 = new FormData();
                  fd2.append('file', uploadFile, filename);
                  fd2.append('filename', filename);
                  if (exif.dateTaken)  fd2.append('dateTaken',  exif.dateTaken);
                  if (exif.dimensions) fd2.append('dimensions', exif.dimensions);
                  const retry = await fetch(
                    `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/images/upload`,
                    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd2 }
                  );
                  if (retry.ok) record = await retry.json();
                }
              } catch (retryErr) {
                console.error('[upload] 404-retry failed:', retryErr);
              }
            }
          } else {
            let body = '';
            try { body = await r.text(); } catch (_) {}
            console.error(`[upload] server error ${r.status} for ${filename}:`, body);
            // Server returned a real error — throw so the user sees the toast.
            // Don't silently fall through to IndexedDB; that masks the failure.
            throw new Error(`Server error ${r.status} uploading ${filename}${body ? ': ' + body.slice(0, 200) : ''}`);
          }
        } catch (err) {
          clearTimeout(timer);
          console.error('[upload] fetch failed for', filename, ':', err?.message, err);
          // Server errors we threw ourselves: re-throw so the error toast fires.
          if (err.message?.startsWith('Server error')) throw err;
          // Genuine network failure (offline, abort): fall through to local stash.
        }
      }

      if (!record) {
        // OFFLINE / PROTOTYPE PATH: stash bytes in IndexedDB and reference
        // them by a synthetic blobPath. The image is visible in the admin
        // on this device only — it won't reach the public site until the
        // user is online and uploads complete via the real API.
        try {
          const blobPath = `${projectId}/${Date.now()}_${filename}`;
          await idbPut(blobPath, uploadFile);
          record = {
            filename,
            blobPath,
            order: 0,
            selected: false,
            favorite: false,
            rejected: false,
            notes: '',
            exif: {
              dateTaken: exif.dateTaken || null,
              dimensions: exif.dimensions || '',
              fileSize: uploadFile.size,
            },
          };
        } catch (idbErr) {
          console.error('[upload] idbPut failed for', filename, ':', idbErr);
          // Skip this file — no record means no progress update; continues to next file.
          continue;
        }
      }

      patchStore(s => {
        const p = s.projects.find(x => x.id === projectId);
        if (p) {
          // Auto-assign order at the end of the curated list.
          record.order = record.order
            || ((p.images.reduce((m, i) => Math.max(m, i.order || 0), 0) || 0) + 1);
          // Idempotent: if the server already appended this record (e.g. the
          // bulk-sync raced our local push), don't duplicate.
          if (!p.images.find(i => i.filename === record.filename)) {
            p.images.push(record);
          }
          p.updatedAt = nowISO();
        }
      });
      added.push(record);
      if (onProgress) onProgress({ index: i + 1, total: files.length, filename });
    }
    // Upload history entry
    patchStore(s => {
      s.uploadHistory.unshift({
        id: nextId('UPL'),
        when: nowISO(),
        projectId,
        count: added.length,
        totalBytes: added.reduce((sum, img) => sum + (img.exif.fileSize || 0), 0),
      });
      s.uploadHistory = s.uploadHistory.slice(0, 50);
    });

    // Auto-populate project date from majority EXIF dates
    const dates = added.map(i => i.exif.dateTaken).filter(Boolean);
    if (dates.length) {
      const monthCounts = {};
      dates.forEach(d => {
        const dt = new Date(d);
        const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
        monthCounts[key] = (monthCounts[key] || 0) + 1;
      });
      const top = Object.entries(monthCounts).sort((a,b) => b[1]-a[1])[0];
      if (top) {
        const [yr, mo] = top[0].split('-');
        const monthName = new Date(yr, parseInt(mo)-1, 1).toLocaleDateString('en-US', { month: 'long' });
        patchStore(s => {
          const p = s.projects.find(x => x.id === projectId);
          if (p && (!p.year || p.year === new Date().getFullYear() && !p.month)) {
            p.year = parseInt(yr);
            p.month = monthName;
            p.updatedAt = nowISO();
          }
        });
      }
    }
    return added;
  },
  updateImage(projectId, filename, patch) {
    patchStore(s => {
      const p = s.projects.find(x => x.id === projectId);
      if (!p) return;
      const img = p.images.find(i => i.filename === filename);
      if (!img) return;
      Object.assign(img, patch);
      p.updatedAt = nowISO();
    });
  },
  async deleteImage(projectId, filename) {
    const token  = _getAuthToken();
    const useAPI = _isRealJWT(token);

    // Snapshot the blobPath so we know whether IDB cleanup is needed.
    let blobPath = null;
    const proj = readStore().projects.find(p => p.id === projectId);
    if (proj) {
      const img = proj.images.find(i => i.filename === filename);
      if (img) blobPath = img.blobPath;
    }

    // Delete on the server first (fire-and-forget — if the network is down
    // the local removal still proceeds and the next bulk-sync will reconcile).
    if (useAPI) {
      try {
        await fetch(
          `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(filename)}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (_) {}
    }

    patchStore(s => {
      const p = s.projects.find(x => x.id === projectId);
      if (!p) return;
      p.images = p.images.filter(i => i.filename !== filename);
      // Renumber so order stays contiguous (1..N) after deletion.
      sortImagesByOrder(p.images).forEach((img, i) => { img.order = i + 1; });
      p.updatedAt = nowISO();
    });

    // Clean up local IDB stash only — server-side blobs were already deleted above.
    if (blobPath
        && !blobPath.startsWith('photos/')
        && !blobPath.startsWith('/api/')
        && !blobPath.startsWith('http')) {
      try { await idbDel(blobPath); } catch (_) {}
    }
  },
  /* reorderImages — accepts an array of filenames in their new curated
     order. Writes order = 1..N. Used by drag-and-drop in the admin's
     image grid; the public site reads this order verbatim. */
  reorderImages(projectId, orderedFilenames) {
    patchStore(s => {
      const p = s.projects.find(x => x.id === projectId);
      if (!p) return;
      const byName = new Map(p.images.map(i => [i.filename, i]));
      orderedFilenames.forEach((fn, idx) => {
        const img = byName.get(fn);
        if (img) img.order = idx + 1;
      });
      // Any image not in the ordered list (defensive) goes to the end.
      const seen = new Set(orderedFilenames);
      let tail = orderedFilenames.length;
      p.images.forEach(img => {
        if (!seen.has(img.filename)) img.order = ++tail;
      });
      p.updatedAt = nowISO();
    });
  },

  // Content -------------------------------------------------------------
  getAbout()     { return readStore().about; },
  setAbout(patch){ patchStore(s => { s.about = { ...s.about, ...patch }; }); return this.getAbout(); },

  getServices()           { return readStore().services.slice().sort((a,b) => a.order - b.order); },
  addService(input) {
    const id = (readStore().services.reduce((m, s) => Math.max(m, s.id), 0) || 0) + 1;
    const order = (readStore().services.reduce((m, s) => Math.max(m, s.order), 0) || 0) + 1;
    const svc = { id, title: input.title || 'New service', description: input.description || '', order };
    patchStore(s => { s.services.push(svc); });
    return svc;
  },
  updateService(id, patch) {
    patchStore(s => {
      const svc = s.services.find(x => x.id === id);
      if (svc) Object.assign(svc, patch);
    });
  },
  deleteService(id)        { patchStore(s => { s.services = s.services.filter(x => x.id !== id); }); },
  reorderServices(idsInOrder) {
    patchStore(s => {
      idsInOrder.forEach((id, i) => {
        const svc = s.services.find(x => x.id === id);
        if (svc) svc.order = i + 1;
      });
    });
  },

  getClients()              { return readStore().clients.slice(); },
  addClient(input) {
    const slug = (input.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const c = { name: input.name, slug, yearsActive: input.yearsActive || [] };
    patchStore(s => { s.clients.push(c); });
    return c;
  },
  updateClient(slug, patch) {
    patchStore(s => {
      const c = s.clients.find(x => x.slug === slug);
      if (c) Object.assign(c, patch);
    });
  },
  deleteClient(slug)        { patchStore(s => { s.clients = s.clients.filter(c => c.slug !== slug); }); },

  getSettings()            { return readStore().settings; },
  setSettings(patch)       { patchStore(s => { s.settings = { ...s.settings, ...patch }; }); return this.getSettings(); },

  // Misc ----------------------------------------------------------------
  getUploadHistory() { return readStore().uploadHistory.slice(0, 20); },
  resolveImageURL,
  reseed() {
    localStorage.removeItem(STORE_KEY);
    return readStore();
  },

  // API sync ------------------------------------------------------------
  /* Force a sync attempt now (bypasses debounce). Returns true on success. */
  async forceSync()    { return pushToAPI(); },
  async pullFromAPI()  { return pullFromAPI(); },
  getSyncStatus() {
    const token = _getAuthToken();
    return {
      hasRealToken: _isRealJWT(token),
      lastSyncAt:   _lastSync.at,
      lastSyncOk:   _lastSync.ok,
      pending:      !!_syncTimer,
    };
  },
};

// On startup, if we have a real JWT, pull latest from Blobs so this device
// reflects edits made elsewhere. Silent on failure.
if (_isRealJWT(_getAuthToken())) {
  pullFromAPI().catch(() => {});
}

/* -------- React hook + helpers ---------------------------------------- */

function useStoreSubscribe() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const onChange = () => force(x => x + 1);
    window.addEventListener('admin-store-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('admin-store-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
}

function useImageURL(blobPath) {
  const [url, setUrl] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    resolveImageURL(blobPath).then(u => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [blobPath]);
  return url;
}

window.AdminStore = AdminStore;
window.useStoreSubscribe = useStoreSubscribe;
window.useImageURL = useImageURL;
