/* functions/public-site.js
 * GET /api/public/site
 *
 * The single endpoint the public site reads from. No auth — this is the
 * canonical source of truth for every visitor (main browser, phone,
 * private window, anyone). Always returns content:
 *
 *   - If Blobs has data for a section, that wins.
 *   - If a section is empty / never-initialised, the inline DEFAULTS below
 *     are returned so a fresh deploy is never a hollow site.
 *
 * Edge-cached briefly (~10s) so admin edits propagate to visitors quickly.
 * Browsers themselves bypass cache via `fetch(..., { cache: 'no-store' })`
 * in aldo-data.jsx.
 */

import {
  readProjects, readAbout, readClients, readServices, readSettings,
} from './utils/blobs.js';

/* ------------------------------------------------------------------ */
/* Seeded defaults — used whenever Blobs has nothing meaningful yet.   */
/* ------------------------------------------------------------------ */

const P = {
  bape:   '/photos/aldo502-090.jpg',
  flal:   '/photos/000085460013.jpg',
  barbie: '/photos/barbie-rooftop.jpg',
};

/* Build a flat-ish image record matching the admin store shape. */
function mk(prefix, n, photo, dateISO, opts = {}) {
  return {
    filename: `${prefix}_${String(n).padStart(2, '0')}.jpg`,
    blobPath: photo,
    order: n,
    selected: opts.selected ?? false,
    favorite: opts.favorite ?? false,
    rejected: false,
    notes: opts.notes || '',
    exif: {
      dateTaken: dateISO,
      dimensions: opts.dims || '5616x7488',
      fileSize: 7_000_000 + (n * 130_000),
    },
  };
}

const DEFAULT_PROJECTS = [
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
      mk('BAPE_FW24_R01', 1, P.bape, '2024-11-04T14:45:00Z', { favorite: true, selected: true }),
      mk('BAPE_FW24_R01', 2, P.bape, '2024-11-04T15:12:00Z', { selected: true }),
      mk('BAPE_FW24_R02', 3, P.bape, '2024-11-05T10:02:00Z', { selected: true }),
      mk('BAPE_FW24_R02', 4, P.bape, '2024-11-05T10:14:00Z'),
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
    location: 'Los Angeles — Downtown',
    createdAt: '2024-03-10T09:00:00Z',
    updatedAt: '2024-03-10T09:00:00Z',
    folderPath: 'archive/2024/FLAL_RS24',
    images: [
      mk('FLAL_RS24_LOOK02', 1, P.flal, '2024-03-08T12:30:00Z', { favorite: true, selected: true, notes: 'campaign hero' }),
      mk('FLAL_RS24_LOOK02', 2, P.flal, '2024-03-08T12:34:00Z', { selected: true }),
      mk('FLAL_RS24_LOOK05', 3, P.flal, '2024-03-09T11:18:00Z', { selected: true, notes: 'hero' }),
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
    location: 'Los Angeles — West Hollywood',
    createdAt: '2024-06-20T10:00:00Z',
    updatedAt: '2024-06-20T10:00:00Z',
    folderPath: 'archive/2024/MATTEL_BARBIE',
    images: [
      mk('MATTEL_BARBIE_R01', 1, P.barbie, '2024-06-19T13:45:00Z', { favorite: true, selected: true }),
      mk('MATTEL_BARBIE_R01', 2, P.barbie, '2024-06-19T13:48:00Z', { selected: true, notes: 'approved' }),
    ],
  },
  {
    id: 'MARVEL_PRESS',
    name: 'Marvel — Talent Portraits',
    client: 'MARVEL',
    type: 'Commercial',
    year: 2024,
    month: 'February',
    description: 'Convention press day. Eight rooms, eight setups, one strobe.',
    location: 'San Diego — Marriott',
    createdAt: '2024-02-22T10:00:00Z',
    updatedAt: '2024-02-22T10:00:00Z',
    folderPath: 'archive/2024/MARVEL_PRESS',
    images: [
      mk('MARVEL_PR24_TALENT', 1, P.bape, '2024-02-22T09:00:00Z', { selected: true }),
      mk('MARVEL_PR24_TALENT', 2, P.bape, '2024-02-22T09:30:00Z', { selected: true }),
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
    location: 'New York — Tribeca Studio',
    createdAt: '2023-10-04T15:00:00Z',
    updatedAt: '2023-10-04T15:00:00Z',
    folderPath: 'archive/2023/HALSTON_SS23',
    images: [
      mk('HALSTON_SS23_L', 1, P.flal, '2023-10-02T11:10:00Z', { selected: true }),
      mk('HALSTON_SS23_L', 2, P.flal, '2023-10-02T11:14:00Z'),
      mk('HALSTON_SS23_L', 3, P.flal, '2023-10-03T10:08:00Z', { favorite: true, selected: true, notes: 'selected' }),
    ],
  },
  {
    id: 'COWAN_AW23',
    name: 'Christian Cowan — AW23',
    client: 'CHRISTIAN COWAN',
    type: 'Editorial',
    year: 2023,
    month: 'September',
    description: 'Backstage at NYFW. Mostly shot between fittings.',
    location: 'New York — Spring Studios',
    createdAt: '2023-09-12T15:00:00Z',
    updatedAt: '2023-09-12T15:00:00Z',
    folderPath: 'archive/2023/COWAN_AW23',
    images: [
      mk('COWAN_AW23_BACKSTAGE', 1, P.barbie, '2023-09-11T17:20:00Z', { selected: true }),
      mk('COWAN_AW23_BACKSTAGE', 2, P.barbie, '2023-09-11T17:34:00Z'),
    ],
  },
  {
    id: 'VS_2023',
    name: 'Victoria\u2019s Secret — Campaign',
    client: 'VICTORIA\u2019S SECRET',
    type: 'Commercial',
    year: 2023,
    month: 'May',
    description: 'Multi-day shoot, ten talents. Stayed under budget. Barely.',
    location: 'Los Angeles — Malibu',
    createdAt: '2023-05-17T15:00:00Z',
    updatedAt: '2023-05-17T15:00:00Z',
    folderPath: 'archive/2023/VS_2023',
    images: [
      mk('VS_CAMP23_DAY1', 1, P.bape, '2023-05-15T10:00:00Z', { selected: true }),
      mk('VS_CAMP23_DAY1', 2, P.bape, '2023-05-15T10:45:00Z', { selected: true }),
      mk('VS_CAMP23_DAY2', 3, P.bape, '2023-05-16T11:20:00Z', { favorite: true, selected: true, notes: 'campaign hero' }),
    ],
  },
  {
    id: 'SANRIO_2024',
    name: 'Sanrio — Anniversary Series',
    client: 'SANRIO',
    type: 'Editorial',
    year: 2024,
    month: 'August',
    description: '50th anniversary collab. Bright, soft, deliberate.',
    location: 'Tokyo — Shibuya',
    createdAt: '2024-08-13T10:00:00Z',
    updatedAt: '2024-08-13T10:00:00Z',
    folderPath: 'archive/2024/SANRIO_2024',
    images: [
      mk('SANRIO_50_F', 1, P.barbie, '2024-08-12T13:00:00Z', { selected: true }),
      mk('SANRIO_50_F', 2, P.barbie, '2024-08-12T13:20:00Z', { selected: true }),
      mk('SANRIO_50_F', 3, P.barbie, '2024-08-13T11:00:00Z'),
    ],
  },
];

const DEFAULT_ABOUT = {
  bio: "Photography has always been more than a profession \u2014 it's a way to tell stories, evoke emotion, and create work that resonates. From early experiments in the darkroom to collaborations with some of the most iconic brands in fashion, I've always sought to push the boundaries of visual storytelling.",
  bio2: "My work is spontaneous, driven by ingenuity, and rooted in authenticity. I aim to tell a story in every frame \u2014 bringing out the soul of the moment.",
  location: 'Los Angeles',
  role: 'Photographer',
  education: { school: 'Academy of Art University', degree: 'BFA, Fine Art Photography', year: 2019 },
  practice: ['High-end fashion','Campaign','Lookbook','Editorial','Casting','Art Direction','Creative Direction','Post Production'],
};

const DEFAULT_CLIENTS = [
  { name: 'BAPE',                slug: 'bape',                yearsActive: [2023, 2024] },
  { name: 'Christian Cowan',     slug: 'christian-cowan',     yearsActive: [2022, 2023, 2024] },
  { name: 'Dim Mak',             slug: 'dim-mak',             yearsActive: [2022, 2024] },
  { name: 'For Love and Lemons', slug: 'for-love-and-lemons', yearsActive: [2020, 2024] },
  { name: 'Halston',             slug: 'halston',             yearsActive: [2023] },
  { name: 'Hasbro',              slug: 'hasbro',              yearsActive: [2024] },
  { name: 'Lucky Brand',         slug: 'lucky-brand',         yearsActive: [2022, 2023] },
  { name: 'Marvel',              slug: 'marvel',              yearsActive: [2022, 2024] },
  { name: 'Mattel',              slug: 'mattel',              yearsActive: [2023, 2024] },
  { name: 'Recycled Karma',      slug: 'recycled-karma',      yearsActive: [2021, 2023] },
  { name: 'Sanrio',              slug: 'sanrio',              yearsActive: [2024] },
  { name: 'Thomas Wylde',        slug: 'thomas-wylde',        yearsActive: [2022] },
  { name: 'Viacom',              slug: 'viacom',              yearsActive: [2023] },
  { name: 'Victoria\u2019s Secret', slug: 'victorias-secret', yearsActive: [2021, 2024] },
  { name: 'Viz Media',           slug: 'viz-media',           yearsActive: [2024] },
];

const DEFAULT_SERVICES = [
  { id: 1, title: 'Photography',        description: 'Campaign \u00b7 Lookbook \u00b7 Editorial \u00b7 High-end fashion',        order: 1 },
  { id: 2, title: 'Creative Direction', description: 'Concept development \u00b7 Mood \u00b7 Visual narrative',                   order: 2 },
  { id: 3, title: 'Art Direction',      description: 'On-set styling decisions \u00b7 Composition \u00b7 Set design',             order: 3 },
  { id: 4, title: 'Casting',            description: 'Talent sourcing \u00b7 Model selection \u00b7 Fit confirmation',            order: 4 },
  { id: 5, title: 'Post Production',    description: 'Color grading \u00b7 Retouching \u00b7 Final delivery',                     order: 5 },
];

const DEFAULT_SETTINGS = {
  contactEmail: 'aldo@aldocarrera.com',
  contactPhone: '+1 (619) 971-7182',
  instagram:    '@aldocarrera',
  accentColor:  '#d63e5a',
};

/* ------------------------------------------------------------------ */
/* Handler                                                            */
/* ------------------------------------------------------------------ */

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  // Pull every section from Blobs in parallel. Each helper returns null /
  // an empty wrapper when its file doesn't exist yet.
  const [projectsFile, aboutFile, clientsFile, servicesFile, settingsFile] = await Promise.all([
    safe(readProjects),
    safe(readAbout),
    safe(readClients),
    safe(readServices),
    safe(readSettings),
  ]);

  // Resolve each section: Blobs if populated, else inline defaults.
  const projects = pickArray(projectsFile?.projects, DEFAULT_PROJECTS);
  const about    = pickObject(aboutFile,             DEFAULT_ABOUT, 'bio');
  const clients  = pickArray(clientsFile?.clients,   DEFAULT_CLIENTS);
  const services = pickArray(servicesFile?.services, DEFAULT_SERVICES);
  const settings = pickObject(settingsFile,          DEFAULT_SETTINGS, 'contactEmail');

  // Strip rejected images; keep everything else so Archive shows the full
  // curated set, not just `selected: true` frames.
  const cleanedProjects = projects
    .map(p => ({ ...p, images: (p.images || []).filter(img => !img.rejected) }))
    .filter(p => p.images.length > 0);

  const body = {
    projects: cleanedProjects,
    about,
    clients,
    services: services.slice().sort((a, b) => (a.order || 0) - (b.order || 0)),
    settings,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // No caching anywhere. Every visitor on every load hits this function
      // and reads the latest from Blobs. Worth the few-ms cost for a
      // portfolio site — content correctness > performance here.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Vary': 'Cookie',
      // Echo the upstream Blobs timestamp so admins can verify freshness
      // from devtools (Network tab → Response Headers → x-aldo-served).
      'x-aldo-served': new Date().toISOString(),
    },
  });
}

async function safe(fn) { try { return await fn(); } catch (_) { return null; } }

function pickArray(value, fallback) {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}
function pickObject(value, fallback, requiredKey) {
  return value && typeof value === 'object' && value[requiredKey] ? value : fallback;
}
