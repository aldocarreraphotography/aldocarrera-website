/* aldo-data.jsx — projects, clients, archive, about, settings.
 *
 * The arrays + objects below are seed data only — used to bootstrap the
 * very first render before any real data is available. At runtime they
 * get replaced by content from:
 *   1. localStorage 'aldo_admin_v1'  (admin running in the same browser)
 *   2. GET /api/public/site          (Netlify Blobs — canonical for visitors)
 *
 * The arrays are MUTATED IN PLACE (length=0; push(...)) rather than
 * reassigned, so every component that captured the destructured reference
 * at module-load picks up the new contents on its next render.
 */

const PHOTOS = [
  "photos/aldo502-090.jpg",
  "photos/000085460013.jpg",
  "photos/barbie-rooftop.jpg",
];

const PROJECTS = [
  {
    id: "BAPE_FW24",
    name: "BAPE — FW24 Editorial",
    client: "BAPE",
    year: "2024",
    month: "November 2024",
    type: "EDITORIAL",
    format: "Digital",
    photo: PHOTOS[0],
    count: 14,
    note: "Hong Kong residency. Two days, one apartment, two cameras.",
    crew: "DIR Jia Liu · STY M. Park · MUA R. Okeefe",
    location: "Hong Kong — Sheung Wan",
  },
  {
    id: "FLAL_RS24",
    name: "For Love and Lemons — Resort '24",
    client: "FOR LOVE AND LEMONS",
    year: "2024",
    month: "March 2024",
    type: "COMMERCIAL",
    format: "Digital · Web + Print",
    photo: PHOTOS[1],
    count: 22,
    note: "Resort campaign shot on a 14th-floor walk-up. Sun cooperated for eleven seconds.",
    crew: "DIR L. Whittaker · STY S. Vidal · MUA J. Halberg",
    location: "Los Angeles — Downtown",
  },
  {
    id: "MATTEL_BARBIE",
    name: "Mattel — Barbie Press",
    client: "MATTEL",
    year: "2024",
    month: "June 2024",
    type: "COMMERCIAL",
    format: "Digital",
    photo: PHOTOS[2],
    count: 9,
    note: "Press portraits in a sunlit room. We didn't bring lights.",
    crew: "DIR A. Mendez · STY K. Choi",
    location: "Los Angeles — West Hollywood",
  },
  {
    id: "MARVEL_PRESS",
    name: "Marvel — Talent Portraits",
    client: "MARVEL",
    year: "2024",
    month: "February 2024",
    type: "COMMERCIAL",
    format: "Digital",
    photo: PHOTOS[0],
    count: 6,
    note: "Convention press day. Eight rooms, eight setups, one strobe.",
    location: "San Diego — Marriott",
  },
  {
    id: "HALSTON_SS23",
    name: "Halston — SS23 Lookbook",
    client: "HALSTON",
    year: "2023",
    month: "October 2023",
    type: "COMMERCIAL",
    format: "Digital · Print",
    photo: PHOTOS[1],
    count: 18,
    note: "Soft daylight only. Two roll backdrops, one shared coffee.",
    crew: "DIR J. Tran · STY P. Quinones",
    location: "New York — Tribeca Studio",
  },
  {
    id: "COWAN_AW23",
    name: "Christian Cowan — AW23",
    client: "CHRISTIAN COWAN",
    year: "2023",
    month: "September 2023",
    type: "EDITORIAL",
    format: "Digital",
    photo: PHOTOS[2],
    count: 12,
    note: "Backstage at NYFW. Mostly shot between fittings.",
    location: "New York — Spring Studios",
  },
  {
    id: "VS_2023",
    name: "Victoria's Secret — Campaign",
    client: "VICTORIA'S SECRET",
    year: "2023",
    month: "May 2023",
    type: "COMMERCIAL",
    format: "Digital · Print",
    photo: PHOTOS[0],
    count: 24,
    note: "Multi-day shoot, ten talents. Stayed under budget. Barely.",
    crew: "DIR S. Reyes · STY M. Park",
    location: "Los Angeles — Malibu",
  },
  {
    id: "SANRIO_2024",
    name: "Sanrio — Anniversary Series",
    client: "SANRIO",
    year: "2024",
    month: "August 2024",
    type: "EDITORIAL",
    format: "Digital",
    photo: PHOTOS[2],
    count: 11,
    note: "50th anniversary collab. Bright, soft, deliberate.",
    location: "Tokyo — Shibuya",
  },
];

/* Archive — flat list with realistic file metadata */
const _ARCH = [];
function pushArch(opts) { _ARCH.push({ id: 'a' + _ARCH.length, ...opts }); }

// 2024
pushArch({ name: "BAPE_FW24_R01_F08.jpg",      project: "BAPE_FW24",    client: "BAPE",                year: "2024", type: "EDITORIAL", date: "2024-11-04", size: "8.4 MB",  dims: "5616×7488", photo: PHOTOS[0], note: "select" });
pushArch({ name: "BAPE_FW24_R01_F09.jpg",      project: "BAPE_FW24",    client: "BAPE",                year: "2024", type: "EDITORIAL", date: "2024-11-04", size: "8.6 MB",  dims: "5616×7488", photo: PHOTOS[0] });
pushArch({ name: "BAPE_FW24_R02_F12.jpg",      project: "BAPE_FW24",    client: "BAPE",                year: "2024", type: "EDITORIAL", date: "2024-11-05", size: "9.1 MB",  dims: "5616×7488", photo: PHOTOS[0], note: "cover candidate" });
pushArch({ name: "BAPE_FW24_R02_F14.jpg",      project: "BAPE_FW24",    client: "BAPE",                year: "2024", type: "EDITORIAL", date: "2024-11-05", size: "9.0 MB",  dims: "5616×7488", photo: PHOTOS[0] });
pushArch({ name: "MATTEL_BARBIE_R01_F03.jpg",  project: "MATTEL_BARBIE", client: "MATTEL",             year: "2024", type: "COMMERCIAL", date: "2024-06-19", size: "7.2 MB", dims: "4992×6240", photo: PHOTOS[2] });
pushArch({ name: "MATTEL_BARBIE_R01_F04.jpg",  project: "MATTEL_BARBIE", client: "MATTEL",             year: "2024", type: "COMMERCIAL", date: "2024-06-19", size: "7.3 MB", dims: "4992×6240", photo: PHOTOS[2], note: "approved" });
pushArch({ name: "FLAL_RS24_LOOK02_A.jpg",     project: "FLAL_RS24",    client: "FOR LOVE AND LEMONS", year: "2024", type: "COMMERCIAL", date: "2024-03-08", size: "6.8 MB", dims: "5104×7616", photo: PHOTOS[1] });
pushArch({ name: "FLAL_RS24_LOOK02_B.jpg",     project: "FLAL_RS24",    client: "FOR LOVE AND LEMONS", year: "2024", type: "COMMERCIAL", date: "2024-03-08", size: "6.7 MB", dims: "5104×7616", photo: PHOTOS[1] });
pushArch({ name: "FLAL_RS24_LOOK05_C.jpg",     project: "FLAL_RS24",    client: "FOR LOVE AND LEMONS", year: "2024", type: "COMMERCIAL", date: "2024-03-09", size: "7.1 MB", dims: "5104×7616", photo: PHOTOS[1], note: "hero" });
pushArch({ name: "MARVEL_PR24_TALENT3.jpg",    project: "MARVEL_PRESS", client: "MARVEL",              year: "2024", type: "COMMERCIAL", date: "2024-02-22", size: "5.9 MB", dims: "4992×6240", photo: PHOTOS[0] });
pushArch({ name: "MARVEL_PR24_TALENT4.jpg",    project: "MARVEL_PRESS", client: "MARVEL",              year: "2024", type: "COMMERCIAL", date: "2024-02-22", size: "5.8 MB", dims: "4992×6240", photo: PHOTOS[0] });
pushArch({ name: "SANRIO_50_F01.jpg",          project: "SANRIO_2024",  client: "SANRIO",              year: "2024", type: "EDITORIAL", date: "2024-08-12", size: "6.6 MB",  dims: "4992×6240", photo: PHOTOS[2] });
pushArch({ name: "SANRIO_50_F02.jpg",          project: "SANRIO_2024",  client: "SANRIO",              year: "2024", type: "EDITORIAL", date: "2024-08-12", size: "6.5 MB",  dims: "4992×6240", photo: PHOTOS[2] });
pushArch({ name: "SANRIO_50_F03.jpg",          project: "SANRIO_2024",  client: "SANRIO",              year: "2024", type: "EDITORIAL", date: "2024-08-13", size: "6.4 MB",  dims: "4992×6240", photo: PHOTOS[2] });

// 2023
pushArch({ name: "HALSTON_SS23_L01.jpg",       project: "HALSTON_SS23", client: "HALSTON",             year: "2023", type: "COMMERCIAL", date: "2023-10-02", size: "7.8 MB", dims: "5616×7488", photo: PHOTOS[1] });
pushArch({ name: "HALSTON_SS23_L02.jpg",       project: "HALSTON_SS23", client: "HALSTON",             year: "2023", type: "COMMERCIAL", date: "2023-10-02", size: "7.6 MB", dims: "5616×7488", photo: PHOTOS[1] });
pushArch({ name: "HALSTON_SS23_L03_SELECT.jpg",project: "HALSTON_SS23", client: "HALSTON",             year: "2023", type: "COMMERCIAL", date: "2023-10-03", size: "7.9 MB", dims: "5616×7488", photo: PHOTOS[1], note: "selected" });
pushArch({ name: "COWAN_AW23_BACKSTAGE_01.jpg",project: "COWAN_AW23",   client: "CHRISTIAN COWAN",     year: "2023", type: "EDITORIAL", date: "2023-09-11", size: "8.2 MB", dims: "5616×7488", photo: PHOTOS[2] });
pushArch({ name: "COWAN_AW23_BACKSTAGE_02.jpg",project: "COWAN_AW23",   client: "CHRISTIAN COWAN",     year: "2023", type: "EDITORIAL", date: "2023-09-11", size: "8.1 MB", dims: "5616×7488", photo: PHOTOS[2] });
pushArch({ name: "VS_CAMP23_DAY1_A.jpg",       project: "VS_2023",      client: "VICTORIA'S SECRET",   year: "2023", type: "COMMERCIAL", date: "2023-05-15", size: "8.9 MB", dims: "6048×8064", photo: PHOTOS[0] });
pushArch({ name: "VS_CAMP23_DAY1_B.jpg",       project: "VS_2023",      client: "VICTORIA'S SECRET",   year: "2023", type: "COMMERCIAL", date: "2023-05-15", size: "9.2 MB", dims: "6048×8064", photo: PHOTOS[0] });
pushArch({ name: "VS_CAMP23_DAY2_HERO.jpg",    project: "VS_2023",      client: "VICTORIA'S SECRET",   year: "2023", type: "COMMERCIAL", date: "2023-05-16", size: "9.4 MB", dims: "6048×8064", photo: PHOTOS[0], note: "campaign hero" });

// 2022
pushArch({ name: "COWAN_SS22_L05.jpg",         project: "COWAN_SS22",   client: "CHRISTIAN COWAN",     year: "2022", type: "COMMERCIAL", date: "2022-10-08", size: "6.4 MB", dims: "4992×6240", photo: PHOTOS[1] });
pushArch({ name: "COWAN_SS22_L06.jpg",         project: "COWAN_SS22",   client: "CHRISTIAN COWAN",     year: "2022", type: "COMMERCIAL", date: "2022-10-08", size: "6.5 MB", dims: "4992×6240", photo: PHOTOS[1] });
pushArch({ name: "FLAL_FW22_LOOK01.jpg",       project: "FLAL_FW22",    client: "FOR LOVE AND LEMONS", year: "2022", type: "COMMERCIAL", date: "2022-06-12", size: "5.9 MB", dims: "4992×6240", photo: PHOTOS[2] });
pushArch({ name: "FLAL_FW22_LOOK02.jpg",       project: "FLAL_FW22",    client: "FOR LOVE AND LEMONS", year: "2022", type: "COMMERCIAL", date: "2022-06-12", size: "5.8 MB", dims: "4992×6240", photo: PHOTOS[2] });
pushArch({ name: "MARVEL_PR22_TALENT1.jpg",    project: "MARVEL_PR22",  client: "MARVEL",              year: "2022", type: "COMMERCIAL", date: "2022-07-22", size: "5.2 MB", dims: "4992×6240", photo: PHOTOS[0] });

// 2021 – 2019
pushArch({ name: "VS_CAMP21_L01.jpg",          project: "VS_2021",      client: "VICTORIA'S SECRET",   year: "2021", type: "COMMERCIAL", date: "2021-04-09", size: "6.0 MB", dims: "4992×6240", photo: PHOTOS[1] });
pushArch({ name: "VS_CAMP21_L02.jpg",          project: "VS_2021",      client: "VICTORIA'S SECRET",   year: "2021", type: "COMMERCIAL", date: "2021-04-09", size: "5.8 MB", dims: "4992×6240", photo: PHOTOS[1] });
pushArch({ name: "FLAL_SS21_TEST.jpg",         project: "FLAL_SS21",    client: "FOR LOVE AND LEMONS", year: "2021", type: "COMMERCIAL", date: "2021-01-19", size: "5.0 MB", dims: "4000×5000", photo: PHOTOS[2] });
pushArch({ name: "FLAL_AW20_L03.jpg",          project: "FLAL_AW20",    client: "FOR LOVE AND LEMONS", year: "2020", type: "COMMERCIAL", date: "2020-08-14", size: "5.4 MB", dims: "4000×5000", photo: PHOTOS[0] });
pushArch({ name: "PERS_LA_NIGHT_01.jpg",       project: "PERS_LA",      client: "PERSONAL",            year: "2020", type: "PERSONAL", date: "2020-03-02", size: "3.8 MB", dims: "3000×3750", photo: PHOTOS[2] });
pushArch({ name: "PERS_LA_NIGHT_02.jpg",       project: "PERS_LA",      client: "PERSONAL",            year: "2020", type: "PERSONAL", date: "2020-03-02", size: "3.9 MB", dims: "3000×3750", photo: PHOTOS[2] });
pushArch({ name: "PERS_SF_THESIS_FRAME01.jpg", project: "AAU_THESIS",   client: "PERSONAL",            year: "2019", type: "PERSONAL", date: "2019-04-26", size: "4.2 MB", dims: "3000×3750", photo: PHOTOS[1] });
pushArch({ name: "PERS_SF_THESIS_FRAME02.jpg", project: "AAU_THESIS",   client: "PERSONAL",            year: "2019", type: "PERSONAL", date: "2019-04-26", size: "4.1 MB", dims: "3000×3750", photo: PHOTOS[1] });

const ARCHIVE = _ARCH;

const CLIENTS = [
  { name: "BAPE",                  range: "2023 – 2024", work: "FW23 · FW24 editorial" },
  { name: "Christian Cowan",       range: "2022 – 2024", work: "SS22 · AW23 · backstage" },
  { name: "Dim Mak",               range: "2022 – 2024", work: "Steve Aoki tour book, press" },
  { name: "For Love and Lemons",   range: "2020 – 2024", work: "AW20 · SS21 · FW22 · Resort '24" },
  { name: "Halston",               range: "2023",         work: "SS23 lookbook" },
  { name: "Hasbro",                range: "2024",         work: "press portraits, talent" },
  { name: "Lucky Brand",           range: "2022 – 2023", work: "campaign · denim" },
  { name: "Marvel",                range: "2022 – 2024", work: "press portraits, talent days" },
  { name: "Mattel",                range: "2023 – 2024", work: "Barbie press, Hot Wheels" },
  { name: "Recycled Karma",        range: "2021 – 2023", work: "lookbook, ecomm" },
  { name: "Sanrio",                range: "2024",         work: "50th anniversary series" },
  { name: "Thomas Wylde",          range: "2022",         work: "AW22 lookbook" },
  { name: "Viacom",                range: "2023",         work: "talent portraits" },
  { name: "Victoria's Secret",     range: "2021 – 2024", work: "campaign · catalog · ecomm" },
  { name: "Viz Media",             range: "2024",         work: "press, brand portraits" },
];

const SERVICES = [
  { n: '01', title: 'Photography',       items: ['Campaign', 'Lookbook', 'Editorial', 'High-end fashion'] },
  { n: '02', title: 'Creative Direction', items: ['Concept development', 'Mood', 'Visual narrative'] },
  { n: '03', title: 'Art Direction',     items: ['On-set styling decisions', 'Composition', 'Set design'] },
  { n: '04', title: 'Casting',           items: ['Talent sourcing', 'Model selection', 'Fit confirmation'] },
  { n: '05', title: 'Post Production',   items: ['Color grading', 'Retouching', 'Final delivery'] },
];

/* About + Settings — bound to the admin's `about` and `settings` JSON
   files in Netlify Blobs. Mutated in place at runtime; the object
   identity stays stable so consumers can safely destructure them. */
const ABOUT = {
  bio: "Photography has always been more than a profession — it's a way to tell stories, evoke emotion, and create work that resonates. From early experiments in the darkroom to collaborations with some of the most iconic brands in fashion, I've always sought to push the boundaries of visual storytelling.",
  bio2: "My work is spontaneous, driven by ingenuity, and rooted in authenticity. I aim to tell a story in every frame — bringing out the soul of the moment.",
  location: 'Los Angeles',
  role: 'Photographer',
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
};

const SETTINGS = {
  contactEmail: 'aldo@aldocarrera.com',
  contactPhone: '+1 (619) 971-7182',
  instagram:    '@aldocarrera',
  accentColor:  '#d63e5a',
};

window.ALDO = { PROJECTS, ARCHIVE, CLIENTS, PHOTOS, SERVICES, ABOUT, SETTINGS };

/* ============================================================================
   LIVE DATA SYNC — admin ↔ public site
   ============================================================================
   The public site reads its content from three layers, in order:

     1. Netlify Blobs (production) via GET /api/public/site — the canonical
        source once deployed. Picks up changes Aldo makes from any device
        within ~30s of the Blobs edge cache.

     2. localStorage 'aldo_admin_v1' — when the same browser is also running
        the admin SPA (e.g. Aldo previewing his own edits). Same-origin, so
        admin writes show up here immediately. Cross-tab via the storage
        event.

     3. The hardcoded SEED above — only used the very first time, before
        anything has been edited.

   We MUTATE PROJECTS / ARCHIVE / CLIENTS / SERVICES in place rather than
   reassigning them — every view captured those array references at module
   load time, and replacing the property on window.ALDO wouldn't propagate.
   Mutating in place means a single re-render picks up every change.
============================================================================ */

const ADMIN_STORE_KEY = 'aldo_admin_v1';

/* ---------- IndexedDB resolver -----------------------------------------
   In production, admin uploads go through /api/projects/.../images/upload
   and the resulting blobPath is a server-served URL — the public site can
   load it with a plain <img>. But in the prototype (same-browser preview,
   no real backend), uploads are stashed in IndexedDB under the admin's
   origin. Since the public site shares that origin, we can read those
   bytes back and turn them into object URLs so locally-uploaded images
   are visible on the public site too. */

const _ALDO_IDB_NAME  = 'aldo_admin_images';
const _ALDO_IDB_STORE = 'blobs';

function _aldoIdbOpen() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('no_indexeddb'));
    const req = indexedDB.open(_ALDO_IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(_ALDO_IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
async function _aldoIdbGet(key) {
  try {
    const db = await _aldoIdbOpen();
    return await new Promise((resolve) => {
      const tx = db.transaction(_ALDO_IDB_STORE, 'readonly');
      const req = tx.objectStore(_ALDO_IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => resolve(null);
    });
  } catch (_) { return null; }
}

const _aldoUrlCache = new Map();
function _aldoIsServedPath(p) {
  return !!p && (
    p.startsWith('/api/')   || p.startsWith('http://')  ||
    p.startsWith('https://') || p.startsWith('photos/') ||
    p.startsWith('data:')   || p.startsWith('blob:')
  );
}
async function _aldoResolveIdbPaths(projects) {
  if (!('indexedDB' in window)) return projects;
  for (const p of (projects || [])) {
    for (const img of (p.images || [])) {
      const bp = img.blobPath;
      if (!bp || _aldoIsServedPath(bp)) continue;
      if (_aldoUrlCache.has(bp)) { img.blobPath = _aldoUrlCache.get(bp); continue; }
      const blob = await _aldoIdbGet(bp);
      if (blob) {
        const url = URL.createObjectURL(blob);
        _aldoUrlCache.set(bp, url);
        img.blobPath = url;
      }
    }
  }
  return projects;
}

function _aldoReadAdminStore() {
  try {
    const raw = localStorage.getItem(ADMIN_STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function _aldoFmtBytes(n) {
  if (!n || n < 1024) return n ? n + ' B' : '';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function _aldoSortImgs(imgs) {
  return (imgs || []).slice().sort((a, b) => {
    const ao = a.order ?? 9999;
    const bo = b.order ?? 9999;
    return ao - bo;
  });
}

/* Transform an admin-shape project record into the PROJECTS row the public
   portfolio expects. Drops rejected frames. */
function _aldoToPublicProject(p) {
  const sorted = _aldoSortImgs(p.images).filter(img => !img.rejected);
  const cover = sorted[0];
  return {
    id: p.id,
    name: p.name,
    client: (p.client || '').toUpperCase(),
    year: String(p.year || ''),
    month: p.month ? `${p.month} ${p.year || ''}`.trim() : String(p.year || ''),
    type: (p.type || 'EDITORIAL').toUpperCase(),
    format: p.format || 'Digital',
    photo: cover ? cover.blobPath : PHOTOS[0],
    count: sorted.length,
    note: p.description || '',
    crew: p.crew || '',
    location: p.location || '',
  };
}

/* Flatten every project's images into the ARCHIVE list. Curated order
   from admin is preserved as `order` so the archive view can sort by it. */
function _aldoToPublicArchive(projects) {
  const out = [];
  (projects || []).forEach(p => {
    const sorted = _aldoSortImgs(p.images).filter(img => !img.rejected);
    sorted.forEach((img, idx) => {
      const dt = img.exif?.dateTaken ? new Date(img.exif.dateTaken) : null;
      out.push({
        id: `a_${p.id}_${idx}`,
        name: img.filename,
        project: p.id,
        client: (p.client || '').toUpperCase(),
        year: String(p.year || ''),
        type: (p.type || 'EDITORIAL').toUpperCase(),
        date: dt && !isNaN(dt) ? dt.toISOString().slice(0, 10) : '',
        size: _aldoFmtBytes(img.exif?.fileSize || 0),
        dims: img.exif?.dimensions || '',
        photo: img.blobPath,
        note: img.favorite ? 'favorite' : (img.selected ? 'select' : ''),
        order: img.order ?? 9999,
      });
    });
  });
  return out;
}

function _aldoToPublicClients(clients) {
  return (clients || []).map(c => {
    const yrs = c.yearsActive || [];
    let range = '';
    if (yrs.length === 1) range = String(yrs[0]);
    else if (yrs.length > 1) {
      const min = Math.min(...yrs), max = Math.max(...yrs);
      range = min === max ? String(min) : `${min} – ${max}`;
    }
    return { name: c.name, range, work: c.work || '' };
  });
}

function _aldoToPublicServices(services) {
  return (services || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((s, idx) => ({
    n: String(idx + 1).padStart(2, '0'),
    title: s.title,
    items: (s.description || '')
      .split(/\s*[·\u00b7]\s*/)
      .map(x => x.trim())
      .filter(Boolean),
  }));
}

/* Replace the contents of object `target` with those of `src` in place,
   preserving the original object reference so anything that destructured
   it at module load keeps working. */
function _aldoReplaceObject(target, src) {
  Object.keys(target).forEach(k => delete target[k]);
  if (src && typeof src === 'object') Object.assign(target, src);
}

/* Replace every public array + object with values from `data`.
   `_aldoApplyData` is the canonical entry point for any new payload.

   Semantics: always replace. An empty `projects` array DOES wipe the public
   portfolio (that's how admin deletions become visible). The /api/public/site
   function is responsible for substituting seed defaults when Blobs has
   never been written to — once we get content from it, we trust it. */
function _aldoApplyData(data) {
  if (!data) return false;
  const newProjects = (data.projects || []).map(_aldoToPublicProject);
  const newArchive  = _aldoToPublicArchive(data.projects || []);
  const newClients  = _aldoToPublicClients(data.clients || []);
  const newServices = _aldoToPublicServices(data.services || []);

  PROJECTS.length = 0; PROJECTS.push(...newProjects);
  ARCHIVE.length  = 0; ARCHIVE.push(...newArchive);
  CLIENTS.length  = 0; CLIENTS.push(...newClients);
  SERVICES.length = 0; SERVICES.push(...newServices);

  if (data.about    && Object.keys(data.about).length    > 0) _aldoReplaceObject(ABOUT,    data.about);
  if (data.settings && Object.keys(data.settings).length > 0) _aldoReplaceObject(SETTINGS, data.settings);
  return true;
}

function _aldoNotify(source) {
  window.dispatchEvent(new CustomEvent('aldo-data-updated', { detail: { source } }));
}

/* Fetch from production Netlify Blobs. Silent on failure.
   Adds a unique query param so neither the browser, the service-worker,
   nor any intermediary CDN can hand us a stale copy. */
async function _aldoFetchFromApi() {
  try {
    const base = (typeof window !== 'undefined' && window.API_BASE) || '';
    const url = `${base}/api/public/site?t=${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
    });
    if (!res.ok) return false;
    const data = await res.json();
    // public-site.js returns { projects, about, clients, services, settings }.
    // `services` and `clients` come as raw arrays in the Blobs shape.
    const normalized = {
      projects: data.projects || [],
      clients:  Array.isArray(data.clients)  ? data.clients  : (data.clients?.clients  || []),
      services: Array.isArray(data.services) ? data.services : (data.services?.services || []),
      about:    data.about    || {},
      settings: data.settings || {},
    };
    if (_aldoApplyData(normalized)) {
      _aldoNotify('api');
      return true;
    }
  } catch (_) {}
  return false;
}

/* Apply whatever's in the local admin store. Two-pass:
   1) sync: apply with raw (possibly IDB-style) paths so first paint has data.
   2) async: resolve IDB paths to object URLs and re-apply so locally-uploaded
      images actually render in the public site (same-browser preview only). */
async function _aldoApplyFromLocalAdmin(source) {
  const store = _aldoReadAdminStore();
  if (!store) return false;

  // Sync pass — deep clone so the IDB-resolve mutation below doesn't touch
  // the raw localStorage payload other listeners might re-read.
  const projects = JSON.parse(JSON.stringify(store.projects || []));
  const applied = _aldoApplyData({
    projects,
    clients:  store.clients  || [],
    services: store.services || [],
    about:    store.about    || {},
    settings: store.settings || {},
  });
  if (applied) _aldoNotify(source);

  // Async pass — resolve IDB-style blobPaths to object URLs.
  try {
    const resolved = await _aldoResolveIdbPaths(projects);
    _aldoApplyData({
      projects: resolved,
      clients:  store.clients  || [],
      services: store.services || [],
      about:    store.about    || {},
      settings: store.settings || {},
    });
    _aldoNotify(source + ':idb');
  } catch (_) {}
  return applied;
}

// ----- Init: API is the canonical source for every visitor on every load.
//        We BLOCK INITIAL RENDER on this fetch (briefly) so the page paints
//        with real data, not the seed in this file — that's what was causing
//        the new/old flicker on the main browser. If the API doesn't answer
//        within a short timeout, we fall through to whatever local state we
//        have (admin localStorage or seed) so the page still renders.
let _aldoInitPromise = (async function aldoInit() {
  try {
    const apiOk = await Promise.race([
      _aldoFetchFromApi(),
      new Promise(resolve => setTimeout(() => resolve(false), 1800)),
    ]);
    if (!apiOk) _aldoApplyFromLocalAdmin('offline-fallback');
  } catch (_) {
    _aldoApplyFromLocalAdmin('offline-fallback');
  } finally {
    window.__aldoReady = true;
    window.dispatchEvent(new Event('aldo-ready'));
  }
})();
window.__aldoWaitReady = () => _aldoInitPromise;

// Background refresh on tab focus — if the user switches back to this tab
// after a while, pull the latest in case admin edited from another device.
window.addEventListener('focus', () => _aldoFetchFromApi());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _aldoFetchFromApi();
});

// Same-browser preview convenience: surface admin's localStorage edits
// without waiting for a full reload + API round-trip. In production this
// just means an admin tab in the same browser previews instantly; visitors
// on other devices still see the API copy and refresh on next load.
window.addEventListener('storage', (e) => {
  if (e.key === ADMIN_STORE_KEY) _aldoApplyFromLocalAdmin('storage');
});

// ----- Same-tab sync: admin-store dispatches this when it writes.
window.addEventListener('admin-store-changed', () => _aldoApplyFromLocalAdmin('same-tab'));

// ----- Expose for debugging from devtools.
window.aldoSync = {
  rebuild: () => _aldoApplyFromLocalAdmin('manual'),
  refetch: () => _aldoFetchFromApi(),
  store:   _aldoReadAdminStore,
};
