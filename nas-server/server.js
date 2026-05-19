/* server.js — Express API for aldocarrera.com
 *
 * Runs on DS718+ NAS inside Docker. Replaces all Netlify Functions.
 * Env vars (set in docker-compose.yml or .env):
 *   JWT_SECRET        — required, random secret for signing tokens
 *   ADMIN_PASSWORD    — required, password for admin login
 *   PUBLIC_URL        — required, e.g. https://nas.aldocarrera.synology.me
 *   PORT              — optional, default 3001
 *   DATA_DIR          — optional, default ./data
 *   IMAGES_DIR        — optional, default ./images
 */

import express  from 'express';
import cors     from 'cors';
import multer   from 'multer';
import path     from 'node:path';

import { issueToken, verifyToken, authMiddleware, requireAuth } from './utils/auth.js';
import {
  readProjects, writeProjects,
  readAbout,    writeAbout,
  readClients,  writeClients,
  readServices, writeServices,
  readSettings, writeSettings,
  readBytes, writeBytes, deleteImage, deleteProjectImages,
} from './utils/store.js';

const app        = express();
const PORT       = process.env.PORT       || 3001;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD env var is required');

/* ------------------------------------------------------------------ */
/* Middleware                                                          */
/* ------------------------------------------------------------------ */

const ALLOWED_ORIGINS = [
  'https://aldocarrera.com',
  'https://www.aldocarrera.com',
  'http://localhost:8888',
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-origin)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
  credentials: true,
}));

app.use(express.json());
app.use(authMiddleware);   // populates req.auth on every request

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/* ------------------------------------------------------------------ */
/* Auth routes                                                         */
/* ------------------------------------------------------------------ */

const loginAttempts = new Map();

app.post('/api/auth/login', async (req, res) => {
  const ip  = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
  const now = Date.now();
  const window = 5 * 60 * 1000;
  const max    = parseInt(process.env.LOGIN_RATE_LIMIT || '10', 10);
  const bucket = (loginAttempts.get(ip) || []).filter(t => now - t < window);

  if (bucket.length >= max) {
    return res.status(429).json({ error: 'rate_limited', message: 'Too many login attempts. Try again later.' });
  }

  const { password } = req.body || {};
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    bucket.push(now);
    loginAttempts.set(ip, bucket);
    return res.status(401).json({ error: 'invalid_password', message: 'Wrong password.' });
  }

  loginAttempts.delete(ip);
  const { token, expiresIn } = issueToken({ sub: 'aldo' });
  res.json({ token, expiresIn });
});

app.all('/api/auth/verify', (req, res) => {
  const header = req.headers.authorization || '';
  const token  = header.replace(/^Bearer\s+/i, '');
  const result = verifyToken(token);
  res.status(result.valid ? 200 : 401).json(result);
});

app.post('/api/auth/logout', (req, res) => res.json({ ok: true }));

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

app.get('/api/projects', async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json(await readProjects());
});

app.post('/api/projects', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = req.body || {};
  if (!body.name) return res.status(422).json({ error: 'validation', message: '`name` required' });

  const data = await readProjects();
  const id   = (body.id || '').toUpperCase().replace(/[^A-Z0-9_]+/g, '_') || nextId();
  if (data.projects.find(p => p.id === id)) {
    return res.status(422).json({ error: 'validation', message: 'id already exists' });
  }

  const project = {
    id,
    name:        body.name,
    client:      body.client      || '',
    type:        body.type        || 'Editorial',
    year:        body.year        || new Date().getFullYear(),
    month:       body.month       || '',
    description: body.description || '',
    location:    body.location    || '',
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    folderPath:  `archive/${body.year || new Date().getFullYear()}/${id}`,
    images:      [],
  };

  data.projects.unshift(project);
  await writeProjects(data);
  res.status(201).json(project);
});

app.get('/api/projects/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const data = await readProjects();
  const p    = data.projects.find(p => p.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found' });
  res.json(p);
});

app.put('/api/projects/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const data = await readProjects();
  const idx  = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });

  const merged = {
    ...data.projects[idx],
    ...req.body,
    id:        data.projects[idx].id,
    createdAt: data.projects[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  data.projects[idx] = merged;
  await writeProjects(data);
  res.json(merged);
});

app.delete('/api/projects/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const data = await readProjects();
  const idx  = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });

  await deleteProjectImages(req.params.id).catch(() => {});
  data.projects.splice(idx, 1);
  await writeProjects(data);
  res.status(204).send();
});

/* ------------------------------------------------------------------ */
/* Image upload  (must come before /:id/images/:filename)             */
/* ------------------------------------------------------------------ */

app.post('/api/projects/:id/images/upload', upload.single('file'), async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const projectId = req.params.id;
    const data      = await readProjects();
    const project   = data.projects.find(p => p.id === projectId);
    if (!project) return res.status(404).json({ error: 'project_not_found' });

    if (!req.file) return res.status(400).json({ error: 'missing_file' });

    const rawName  = (req.body?.filename || req.file.originalname || `upload_${Date.now()}.jpg`).toString();
    const safeName = rawName.replace(/[^A-Za-z0-9._-]+/g, '_');
    const dateTaken  = req.body?.dateTaken  || null;
    const dimensions = req.body?.dimensions || '';

    // De-dupe filename
    let finalName = safeName;
    if (project.images.find(i => i.filename === finalName)) {
      const dot  = safeName.lastIndexOf('.');
      const stem = dot === -1 ? safeName      : safeName.slice(0, dot);
      const ext  = dot === -1 ? ''            : safeName.slice(dot);
      let n = 2;
      while (project.images.find(i => i.filename === `${stem}_${n}${ext}`)) n++;
      finalName = `${stem}_${n}${ext}`;
    }

    await writeBytes(projectId, finalName, req.file.buffer);

    const order  = (project.images.reduce((m, i) => Math.max(m, i.order || 0), 0) || 0) + 1;
    const record = {
      filename: finalName,
      blobPath: `${PUBLIC_URL}/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(finalName)}`,
      order,
      selected:  false,
      favorite:  false,
      rejected:  false,
      notes:     '',
      exif: {
        dateTaken:  dateTaken || null,
        dimensions: dimensions || '',
        fileSize:   req.file.buffer.length,
      },
    };

    project.images.push(record);
    project.updatedAt = new Date().toISOString();
    await writeProjects(data);
    res.status(201).json(record);
  } catch (err) {
    console.error('[upload] FATAL:', err?.message, err?.stack);
    res.status(500).json({ error: 'internal', message: err?.message || 'Unknown error' });
  }
});

/* ------------------------------------------------------------------ */
/* Image serve / patch / delete                                        */
/* ------------------------------------------------------------------ */

app.get('/api/projects/:id/images/:filename', async (req, res) => {
  const { id, filename } = req.params;
  const bytes = await readBytes(id, filename).catch(() => null);
  if (!bytes) return res.status(404).send('Not found');
  res.setHeader('Content-Type', contentTypeFor(filename));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(bytes);
});

app.put('/api/projects/:id/images/:filename', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const { id, filename } = req.params;
  const data    = await readProjects();
  const project = data.projects.find(p => p.id === id);
  if (!project) return res.status(404).json({ error: 'project_not_found' });
  const img = project.images.find(i => i.filename === filename);
  if (!img) return res.status(404).json({ error: 'image_not_found' });
  const body = req.body || {};
  if ('selected' in body) img.selected = !!body.selected;
  if ('favorite' in body) img.favorite = !!body.favorite;
  if ('rejected' in body) img.rejected = !!body.rejected;
  if ('notes'    in body) img.notes    = String(body.notes || '');
  project.updatedAt = new Date().toISOString();
  await writeProjects(data);
  res.json(img);
});

app.delete('/api/projects/:id/images/:filename', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const { id, filename } = req.params;
  const data    = await readProjects();
  const project = data.projects.find(p => p.id === id);
  if (!project) return res.status(404).json({ error: 'project_not_found' });
  const before = project.images.length;
  project.images = project.images.filter(i => i.filename !== filename);
  if (project.images.length === before) return res.status(404).json({ error: 'image_not_found' });
  project.images
    .slice().sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
    .forEach((img, i) => { img.order = i + 1; });
  project.updatedAt = new Date().toISOString();
  await writeProjects(data);
  await deleteImage(id, filename).catch(() => {});
  res.status(204).send();
});

/* ------------------------------------------------------------------ */
/* Content — About, Clients, Services, Settings                       */
/* ------------------------------------------------------------------ */

app.get('/api/about', async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json(await readAbout());
});
app.put('/api/about', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const current = await readAbout();
  const merged  = { ...current, ...req.body, education: { ...current.education, ...(req.body?.education || {}) } };
  await writeAbout(merged);
  res.json(merged);
});

const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

app.get('/api/clients', async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json(await readClients());
});
app.get('/api/clients/:slug', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const data = await readClients();
  const c    = data.clients.find(x => x.slug === req.params.slug);
  if (!c) return res.status(404).json({ error: 'not_found' });
  res.json(c);
});
app.post('/api/clients', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = req.body || {};
  if (!body.name) return res.status(422).json({ error: 'validation', message: '`name` required' });
  const data    = await readClients();
  const newSlug = body.slug || slugify(body.name);
  if (data.clients.find(c => c.slug === newSlug)) {
    return res.status(422).json({ error: 'validation', message: 'slug already exists' });
  }
  const client = { name: body.name, slug: newSlug, yearsActive: body.yearsActive || [], work: body.work || '' };
  data.clients.push(client);
  await writeClients(data);
  res.status(201).json(client);
});
app.put('/api/clients/:slug', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const data = await readClients();
  const body = req.body || {};
  if (Array.isArray(body.clients)) {
    data.clients = body.clients;
    await writeClients(data);
    return res.json(data);
  }
  const c = data.clients.find(x => x.slug === req.params.slug);
  if (!c) return res.status(404).json({ error: 'not_found' });
  Object.assign(c, body, { slug: c.slug });
  await writeClients(data);
  res.json(c);
});
app.delete('/api/clients/:slug', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const data   = await readClients();
  const before = data.clients.length;
  data.clients = data.clients.filter(c => c.slug !== req.params.slug);
  if (before === data.clients.length) return res.status(404).json({ error: 'not_found' });
  await writeClients(data);
  res.status(204).send();
});

app.get('/api/services', async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json(await readServices());
});
app.get('/api/services/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const id   = parseInt(req.params.id, 10);
  const data = await readServices();
  const svc  = data.services.find(s => s.id === id);
  if (!svc) return res.status(404).json({ error: 'not_found' });
  res.json(svc);
});
app.post('/api/services', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = req.body || {};
  if (!body.title) return res.status(422).json({ error: 'validation', message: '`title` required' });
  const data     = await readServices();
  const newId    = (data.services.reduce((m, s) => Math.max(m, s.id),    0) || 0) + 1;
  const newOrder = (data.services.reduce((m, s) => Math.max(m, s.order), 0) || 0) + 1;
  const svc      = { id: newId, title: body.title, description: body.description || '', order: body.order ?? newOrder };
  data.services.push(svc);
  await writeServices(data);
  res.status(201).json(svc);
});
app.put('/api/services/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const id   = parseInt(req.params.id, 10);
  const data = await readServices();
  const body = req.body || {};
  if (Array.isArray(body.services)) {
    data.services = body.services.map((s, i) => ({ ...s, order: i + 1 }));
    await writeServices(data);
    return res.json(data);
  }
  const svc = data.services.find(s => s.id === id);
  if (!svc) return res.status(404).json({ error: 'not_found' });
  Object.assign(svc, body, { id: svc.id });
  await writeServices(data);
  res.json(svc);
});
app.delete('/api/services/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const id     = parseInt(req.params.id, 10);
  const data   = await readServices();
  const before = data.services.length;
  data.services = data.services.filter(s => s.id !== id);
  if (before === data.services.length) return res.status(404).json({ error: 'not_found' });
  await writeServices(data);
  res.status(204).send();
});

app.get('/api/settings', async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json(await readSettings());
});
app.put('/api/settings', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const current = await readSettings();
  const merged  = { ...current, ...(req.body || {}) };
  await writeSettings(merged);
  res.json(merged);
});

/* ------------------------------------------------------------------ */
/* Admin bulk sync                                                     */
/* ------------------------------------------------------------------ */

app.put('/api/admin/sync', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body  = req.body || {};
  const work  = [];
  const wrote = [];

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
    res.json({ ok: true, wrote });
  } catch (err) {
    res.status(500).json({ error: 'write_failed', message: err.message });
  }
});
app.post('/api/admin/sync', async (req, res) => {
  req.method = 'PUT';
  app.handle(req, res);
});

/* ------------------------------------------------------------------ */
/* Public site endpoint (no auth)                                      */
/* ------------------------------------------------------------------ */

const DEFAULT_PROJECTS = buildDefaultProjects();
const DEFAULT_ABOUT = {
  bio: "Photography has always been more than a profession — it's a way to tell stories, evoke emotion, and create work that resonates. From early experiments in the darkroom to collaborations with some of the most iconic brands in fashion, I've always sought to push the boundaries of visual storytelling.",
  bio2: "My work is spontaneous, driven by ingenuity, and rooted in authenticity. I aim to tell a story in every frame — bringing out the soul of the moment.",
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
  { name: "Victoria’s Secret", slug: 'victorias-secret', yearsActive: [2021, 2024] },
  { name: 'Viz Media',           slug: 'viz-media',           yearsActive: [2024] },
];
const DEFAULT_SERVICES = [
  { id: 1, title: 'Photography',        description: 'Campaign · Lookbook · Editorial · High-end fashion', order: 1 },
  { id: 2, title: 'Creative Direction', description: 'Concept development · Mood · Visual narrative',            order: 2 },
  { id: 3, title: 'Art Direction',      description: 'On-set styling decisions · Composition · Set design',      order: 3 },
  { id: 4, title: 'Casting',            description: 'Talent sourcing · Model selection · Fit confirmation',     order: 4 },
  { id: 5, title: 'Post Production',    description: 'Color grading · Retouching · Final delivery',              order: 5 },
];
const DEFAULT_SETTINGS = {
  contactEmail: 'aldo@aldocarrera.com',
  contactPhone: '+1 (619) 971-7182',
  instagram: '@aldocarrera',
  accentColor: '#d63e5a',
};

app.get('/api/public/site', async (req, res) => {
  const safe = async (fn) => { try { return await fn(); } catch (_) { return null; } };

  const [projectsFile, aboutFile, clientsFile, servicesFile, settingsFile] = await Promise.all([
    safe(readProjects), safe(readAbout), safe(readClients), safe(readServices), safe(readSettings),
  ]);

  const about    = pick(aboutFile,             DEFAULT_ABOUT,    'bio');
  const clients  = pickArr(clientsFile?.clients,  DEFAULT_CLIENTS);
  const services = pickArr(servicesFile?.services, DEFAULT_SERVICES);
  const settings = pick(settingsFile,          DEFAULT_SETTINGS, 'contactEmail');

  const cleanedFromStore = (projectsFile?.projects || [])
    .map(p => ({ ...p, images: (p.images || []).filter(img => !img.rejected) }))
    .filter(p => p.images.length > 0);
  const projects = pickArr(cleanedFromStore, DEFAULT_PROJECTS);

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('x-aldo-served', new Date().toISOString());
  res.json({
    projects,
    about,
    clients,
    services: services.slice().sort((a, b) => (a.order || 0) - (b.order || 0)),
    settings,
  });
});

/* ------------------------------------------------------------------ */
/* Debug endpoint (no auth)                                            */
/* ------------------------------------------------------------------ */

app.get('/api/debug', async (req, res) => {
  const { readProjects: rp } = await import('./utils/store.js');
  let projectsState = null;
  try {
    const pjs = await rp();
    projectsState = {
      projectCount: pjs.projects?.length ?? 0,
      projects: (pjs.projects || []).map(p => ({
        id: p.id, imageCount: p.images?.length ?? 0,
      })),
    };
  } catch (e) {
    projectsState = { error: e.message };
  }
  res.json({
    ok: true,
    server: 'nas-express',
    projectsInStore: projectsState,
    env: {
      hasJwtSecret:      !!process.env.JWT_SECRET,
      hasAdminPassword:  !!process.env.ADMIN_PASSWORD,
      publicUrl:         PUBLIC_URL || '(not set)',
    },
  });
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function pick(value, fallback, requiredKey) {
  return value && typeof value === 'object' && value[requiredKey] ? value : fallback;
}
function pickArr(value, fallback) {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}
function nextId() {
  return 'PRJ_' + Math.random().toString(36).slice(2, 9).toUpperCase();
}
function contentTypeFor(name) {
  const ext = (name || '').toLowerCase().split('.').pop();
  return ({
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', avif: 'image/avif',
  })[ext] || 'application/octet-stream';
}

function buildDefaultProjects() {
  const P = {
    bape:   '/photos/aldo502-090.jpg',
    flal:   '/photos/000085460013.jpg',
    barbie: '/photos/barbie-rooftop.jpg',
  };
  const mk = (prefix, n, photo, dateISO, opts = {}) => ({
    filename: `${prefix}_${String(n).padStart(2, '0')}.jpg`,
    blobPath: photo,
    order: n,
    selected: opts.selected ?? false,
    favorite: opts.favorite ?? false,
    rejected: false,
    notes: opts.notes || '',
    exif: { dateTaken: dateISO, dimensions: opts.dims || '5616x7488', fileSize: 7_000_000 + (n * 130_000) },
  });
  return [
    { id: 'BAPE_FW24', name: 'BAPE — FW24 Editorial', client: 'BAPE', type: 'Editorial', year: 2024, month: 'November', description: 'Hong Kong residency. Two days, one apartment, two cameras.', location: 'Hong Kong — Sheung Wan', createdAt: '2024-11-20T14:30:00Z', updatedAt: '2024-11-20T14:30:00Z', folderPath: 'archive/2024/BAPE_FW24', images: [mk('BAPE_FW24_R01',1,P.bape,'2024-11-04T14:45:00Z',{favorite:true,selected:true}),mk('BAPE_FW24_R01',2,P.bape,'2024-11-04T15:12:00Z',{selected:true}),mk('BAPE_FW24_R02',3,P.bape,'2024-11-05T10:02:00Z',{selected:true}),mk('BAPE_FW24_R02',4,P.bape,'2024-11-05T10:14:00Z')] },
    { id: 'FLAL_RS24', name: 'For Love and Lemons — Resort ’24', client: 'FOR LOVE AND LEMONS', type: 'Commercial', year: 2024, month: 'March', description: 'Resort campaign shot on a 14th-floor walk-up. Sun cooperated for eleven seconds.', location: 'Los Angeles — Downtown', createdAt: '2024-03-10T09:00:00Z', updatedAt: '2024-03-10T09:00:00Z', folderPath: 'archive/2024/FLAL_RS24', images: [mk('FLAL_RS24_LOOK02',1,P.flal,'2024-03-08T12:30:00Z',{favorite:true,selected:true,notes:'campaign hero'}),mk('FLAL_RS24_LOOK02',2,P.flal,'2024-03-08T12:34:00Z',{selected:true}),mk('FLAL_RS24_LOOK05',3,P.flal,'2024-03-09T11:18:00Z',{selected:true,notes:'hero'})] },
    { id: 'MATTEL_BARBIE', name: 'Mattel — Barbie Press', client: 'MATTEL', type: 'Commercial', year: 2024, month: 'June', description: "Press portraits in a sunlit room. We didn't bring lights.", location: 'Los Angeles — West Hollywood', createdAt: '2024-06-20T10:00:00Z', updatedAt: '2024-06-20T10:00:00Z', folderPath: 'archive/2024/MATTEL_BARBIE', images: [mk('MATTEL_BARBIE_R01',1,P.barbie,'2024-06-19T13:45:00Z',{favorite:true,selected:true}),mk('MATTEL_BARBIE_R01',2,P.barbie,'2024-06-19T13:48:00Z',{selected:true,notes:'approved'})] },
    { id: 'MARVEL_PRESS', name: 'Marvel — Talent Portraits', client: 'MARVEL', type: 'Commercial', year: 2024, month: 'February', description: 'Convention press day. Eight rooms, eight setups, one strobe.', location: 'San Diego — Marriott', createdAt: '2024-02-22T10:00:00Z', updatedAt: '2024-02-22T10:00:00Z', folderPath: 'archive/2024/MARVEL_PRESS', images: [mk('MARVEL_PR24_TALENT',1,P.bape,'2024-02-22T09:00:00Z',{selected:true}),mk('MARVEL_PR24_TALENT',2,P.bape,'2024-02-22T09:30:00Z',{selected:true})] },
    { id: 'HALSTON_SS23', name: 'Halston — SS23 Lookbook', client: 'HALSTON', type: 'Commercial', year: 2023, month: 'October', description: 'Soft daylight only. Two roll backdrops, one shared coffee.', location: 'New York — Tribeca Studio', createdAt: '2023-10-04T15:00:00Z', updatedAt: '2023-10-04T15:00:00Z', folderPath: 'archive/2023/HALSTON_SS23', images: [mk('HALSTON_SS23_L',1,P.flal,'2023-10-02T11:10:00Z',{selected:true}),mk('HALSTON_SS23_L',2,P.flal,'2023-10-02T11:14:00Z'),mk('HALSTON_SS23_L',3,P.flal,'2023-10-03T10:08:00Z',{favorite:true,selected:true,notes:'selected'})] },
    { id: 'COWAN_AW23', name: 'Christian Cowan — AW23', client: 'CHRISTIAN COWAN', type: 'Editorial', year: 2023, month: 'September', description: 'Backstage at NYFW. Mostly shot between fittings.', location: 'New York — Spring Studios', createdAt: '2023-09-12T15:00:00Z', updatedAt: '2023-09-12T15:00:00Z', folderPath: 'archive/2023/COWAN_AW23', images: [mk('COWAN_AW23_BACKSTAGE',1,P.barbie,'2023-09-11T17:20:00Z',{selected:true}),mk('COWAN_AW23_BACKSTAGE',2,P.barbie,'2023-09-11T17:34:00Z')] },
    { id: 'VS_2023', name: "Victoria’s Secret — Campaign", client: "VICTORIA’S SECRET", type: 'Commercial', year: 2023, month: 'May', description: 'Multi-day shoot, ten talents. Stayed under budget. Barely.', location: 'Los Angeles — Malibu', createdAt: '2023-05-17T15:00:00Z', updatedAt: '2023-05-17T15:00:00Z', folderPath: 'archive/2023/VS_2023', images: [mk('VS_CAMP23_DAY1',1,P.bape,'2023-05-15T10:00:00Z',{selected:true}),mk('VS_CAMP23_DAY1',2,P.bape,'2023-05-15T10:45:00Z',{selected:true}),mk('VS_CAMP23_DAY2',3,P.bape,'2023-05-16T11:20:00Z',{favorite:true,selected:true,notes:'campaign hero'})] },
    { id: 'SANRIO_2024', name: 'Sanrio — Anniversary Series', client: 'SANRIO', type: 'Editorial', year: 2024, month: 'August', description: '50th anniversary collab. Bright, soft, deliberate.', location: 'Tokyo — Shibuya', createdAt: '2024-08-13T10:00:00Z', updatedAt: '2024-08-13T10:00:00Z', folderPath: 'archive/2024/SANRIO_2024', images: [mk('SANRIO_50_F',1,P.barbie,'2024-08-12T13:00:00Z',{selected:true}),mk('SANRIO_50_F',2,P.barbie,'2024-08-12T13:20:00Z',{selected:true}),mk('SANRIO_50_F',3,P.barbie,'2024-08-13T11:00:00Z')] },
  ];
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

app.listen(PORT, () => {
  console.log(`[nas-api] listening on port ${PORT}`);
  console.log(`[nas-api] PUBLIC_URL: ${PUBLIC_URL || '(not set — blobPaths will be relative)'}`);
});
