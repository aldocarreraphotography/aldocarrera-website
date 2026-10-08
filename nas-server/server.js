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
import fs       from 'node:fs';
import sharp    from 'sharp';
import crypto   from 'node:crypto';
import exifr    from 'exifr';
import Anthropic from '@anthropic-ai/sdk';

import { issueToken, verifyToken, authMiddleware, requireAuth } from './utils/auth.js';
import { verifyCredentials as adminVerifyCredentials, verifyPassword as adminVerifyPassword, setPassword as adminSetPassword, hasStoredPassword as adminHasStoredPassword } from './utils/admin-auth.js';
import { listFolder, getThumbnailBatch, downloadFile, isImageFile, isConfigured as isDropboxConfigured, getAccessToken as getDropboxToken } from './utils/dropbox.js';
import { backupStatus, runBackup, scheduleBackups } from './utils/backup.js';
import { Resend } from 'resend';
import {
  readProjects, writeProjects,
  readAbout,    writeAbout,
  readClients,  writeClients,
  readServices, writeServices,
  readSettings, writeSettings,
  readBytes, writeBytes, deleteImage, deleteProjectImages,
  readVideos, writeVideos, readVideoBytes, writeVideoBytes, writeVideoBytesFromPath, getVideoTmpDir, deleteVideoFile,
  readGalleryPortals, writeGalleryPortals,
  readPrints, writePrints,
  readDispatches, writeDispatches,
} from './utils/store.js';
import {
  createGallery, readGalleries, findGallery, updateGallery, deleteGallery, isExpired,
} from './utils/galleries.js';
import * as UG from './utils/unified-galleries.js';
import {
  createDeck, readDecks, findDeck, deleteDeck, incrementViews,
} from './utils/decks.js';

const app        = express();
const PORT       = process.env.PORT       || 3001;
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const IMAGES_DIR = process.env.IMAGES_DIR || path.join(process.cwd(), 'images');
const DATA_DIR   = process.env.DATA_DIR   || path.join(process.cwd(), 'data');

if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD env var is required');

/* ------------------------------------------------------------------ */
/* Defensive: auto-catch async errors from route handlers              */
/* ------------------------------------------------------------------ */
/* Express 4 doesn't catch rejected promises returned from async route
   handlers, so an unguarded `throw` or `await` rejection leaves the
   response open and the client sees "Load failed" (CLAUDE.md Rule 5).
   We monkey-patch the route methods once here to auto-wrap every
   handler in a catch-and-forward, then add a global error middleware
   later (before app.listen) that turns the error into a clean 500.
   Existing try/catch blocks in routes still work — they catch first
   and never reach the wrapper. */
for (const method of ['get', 'post', 'put', 'patch', 'delete', 'all', 'use']) {
  const orig = app[method].bind(app);
  app[method] = (...args) => {
    const wrapped = args.map(h => {
      if (typeof h !== 'function' || h.length === 4) return h; // skip non-fns and error middleware
      return function _safeRouteHandler(req, res, next) {
        try {
          const out = h(req, res, next);
          if (out && typeof out.catch === 'function') out.catch(next);
        } catch (err) { next(err); }
      };
    });
    return orig(...wrapped);
  };
}

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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'x-gallery-password'],
  credentials: true,
}));

// JSON body limit bumped from default 100 KB. /api/admin/sync sends a full
// admin-store snapshot (projects + images metadata + galleries) which is
// ~1–2 MB once a studio has real work in it. 50 MB gives generous headroom
// without enabling unbounded payloads.
app.use(express.json({ limit: '50mb' }));
app.use(authMiddleware);   // populates req.auth on every request

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

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

  const { username, password } = req.body || {};
  const ok = await adminVerifyCredentials(username, password);
  if (!ok) {
    bucket.push(now);
    loginAttempts.set(ip, bucket);
    // Single generic error — never tell the caller which field was wrong
    return res.status(401).json({ error: 'invalid_credentials', message: 'Wrong username or password.' });
  }

  loginAttempts.delete(ip);
  const { token, expiresIn } = issueToken({ sub: 'aldo' });
  res.json({ token, expiresIn });
});

/* POST /api/auth/change-password — require old password + auth token. */
app.post('/api/auth/change-password', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'validation', message: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'weak_password', message: 'New password must be at least 8 characters' });
    }
    const ok = await adminVerifyPassword(currentPassword);
    if (!ok) {
      return res.status(401).json({ error: 'wrong_current_password', message: 'Current password is incorrect.' });
    }
    await adminSetPassword(newPassword);
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/auth/change-password]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
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

/* Pixel placeholder: a 20px-wide PNG shown with image-rendering: pixelated
   while the real image loads. PNG keeps hard pixel edges (JPEG/WebP at this
   size go mushy); a 16-colour palette cuts each one from ~1.9 KB to ~0.5 KB,
   which matters because /api/public/site ships one per image (433 images ≈
   800 KB → ~220 KB) on every page load. */
function _blurPipe(pipe) {
  return pipe.resize({ width: 20 }).removeAlpha()
    .png({ palette: true, colours: 16, dither: 0, compressionLevel: 9 });
}
async function makeBlurDataURL(input) {
  const buf = await _blurPipe(sharp(input).rotate()).toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/* Existing records still hold full-colour placeholders. /api/public/site
   serves compacted copies, memoised in memory and warmed at startup so the
   first visitor after a restart doesn't pay for ~400 conversions. */
const _compactBlurCache = new Map();
async function compactBlur(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) return dataUrl;
  const hit = _compactBlurCache.get(dataUrl);
  if (hit) return hit;
  let out = dataUrl;
  try {
    const buf = await _blurPipe(sharp(Buffer.from(dataUrl.slice(22), 'base64'))).toBuffer();
    const compact = `data:image/png;base64,${buf.toString('base64')}`;
    if (compact.length < dataUrl.length) out = compact;
  } catch (_) { /* keep the original */ }
  _compactBlurCache.set(dataUrl, out);
  return out;
}

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

    // Generate a tiny base64 blur placeholder + capture real dimensions in one sharp pass.
    // Best-effort; failure here must not block the upload.
    let blurDataURL = '';
    let realDims    = dimensions || '';
    try {
      const pipe  = sharp(req.file.buffer).rotate();
      const meta  = await pipe.metadata();
      if (meta.width && meta.height && !realDims) realDims = `${meta.width}×${meta.height}`;
      blurDataURL = await makeBlurDataURL(req.file.buffer);
    } catch (e) {
      console.warn('[upload] blur/meta gen failed:', e?.message);
    }

    const order  = (project.images.reduce((m, i) => Math.max(m, i.order || 0), 0) || 0) + 1;
    const record = {
      filename: finalName,
      blobPath: `${PUBLIC_URL}/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(finalName)}`,
      order,
      selected:  false,
      favorite:  false,
      rejected:  false,
      notes:     '',
      blurDataURL,
      exif: {
        dateTaken:  dateTaken || null,
        dimensions: realDims,
        fileSize:   req.file.buffer.length,
      },
    };

    project.images.push(record);
    project.updatedAt = new Date().toISOString();
    await writeProjects(data);
    res.status(201).json(record);
    _prewarmResizes(projectId, finalName, req.file.buffer); // after responding — don't slow the upload
  } catch (err) {
    console.error('[upload] FATAL:', err?.message, err?.stack);
    res.status(500).json({ error: 'internal', message: err?.message || 'Unknown error' });
  }
});

/* ------------------------------------------------------------------ */
/* AI: generate project description variants (Claude vision)            */
/* ------------------------------------------------------------------ */

/* Claude API client for the AI features (project descriptions, Dropbox
   curation). The SDK reads ANTHROPIC_API_KEY and retries 429/5xx itself. */
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ maxRetries: 4 }) : null;

/* Every AI feature runs on Claude Opus 5.5 at high effort. Those turns can
   take a minute or more, so both callers run as background jobs (Cloudflare
   drops requests after 100s) and stream the reply, which keeps a long
   request from hitting the SDK's HTTP timeout. */
const CLAUDE_MODEL  = 'claude-opus-5-5';
const CLAUDE_EFFORT = 'high';

async function _askClaudeJSON({ system, content, schema }) {
  const msg = await anthropic.beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 64000,
    // On a safety-classifier decline, re-run on Anthropic's recommended
    // fallback model instead of failing.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: CLAUDE_EFFORT,
      format: { type: 'json_schema', schema },
    },
    system,
    messages: [{ role: 'user', content }],
  }).finalMessage();
  return { data: JSON.parse(_replyText(msg)), usage: msg.usage };
}

/* Replies can open with thinking blocks — read the text block by type
   (never content[0]), after checking that the request wasn't declined or
   cut off. */
function _replyText(msg) {
  if (msg.stop_reason === 'refusal') {
    const category = msg.stop_details?.category;
    throw new Error(`Claude declined the request${category ? ` (${category})` : ''}`);
  }
  if (msg.stop_reason === 'max_tokens') throw new Error('Claude ran out of output tokens');
  return msg.content.find(b => b.type === 'text')?.text || '';
}

const AC_VOICE_SYSTEM = `You write project descriptions in the exact voice of Aldo Carrera, a fashion and editorial photographer in Los Angeles. Study these examples — they ARE the voice:

— "Rylee Stumpf navigates DTLA's spiritual underbelly for Praying... getting her nails done, seeking fortunes, acting feral on chrome. A study in duality: the edge and the tenderness, the reckless and the devoted."
— "2025. What Carly does when there's no actual resort. (Spoiler: better than most vacations.)"
— "Thomas Wylde campaign, featured in Vogue Japan. The work here is about contradiction: studded jackets, vulnerable bodies, the precise moment between armor and exposure. Monochrome & color pulling you in and out of tension."
— "9dcc. Luxury built on the blockchain. The clothes were the entry point, the NFC chip was the conversation. Shot for a brand that was always two steps ahead."
— "Transformers x Dim Mak for Hasbro. The graphics we memorized as kids, shot in the parts of LA that never sleep. Something between memory and now."
— "Sveta at Penthouse 211, 35mm. Tables as furniture, cats as props, stuffies as emotional support. Semi-undone, fully committed. Just a girl and her afternoon chaos."
— "Christian Cowan x Powerpuff Girls. Backstage. 35mm. Sugar, spice, and everything unhinged."
— "Melancholic botanicals sourced from the Downtown LA flower district, rendered in Rembrandt light with a whisper of Japanese restraint. Each bloom hand-picked for its imperfection becomes an ornament, a meditation on decay and beauty. Ephemeral. Rendered as pins adorning leather."
— "Sheena Liam. Shot on film, medium format and 35mm. A model who embroiders self-portraits in her spare time."

Voice rules — non-negotiable:
- Fragments allowed. Short sentences encouraged. Not every sentence needs a verb.
- Specific concrete nouns over abstractions. Real places (DTLA, Penthouse 211), real formats (35mm, medium format), real names when given.
- BANNED words/phrases: stunning, captivating, showcases, explores, delves into, vibrant tapestry, boasts, evocative, breathtaking, mesmerizing, ethereal (unless ironic), journey, embark.
- Often a colon or em-dash splits the sentence. Parenthetical asides work.
- Lead with a person, brand, place, or contradiction. Never with abstractions or commentary.
- Embrace duality and tension. Armor and exposure. Reckless and devoted.
- Present-tense bias when describing action.
- Length range: 1 sentence to 4. Never longer than 4.
- Do NOT invent facts. If model name, brand, or location isn't given, don't make one up — describe what's visible instead.
- No emoji. No hashtags. No quotation marks around the description itself.

Return six variants, one per tone, in this order: sparse, narrative, duality, witty, brand-forward, atmospheric.

Tone definitions:
- sparse: minimal, fragmentary, almost stage directions. 1-2 sentences.
- narrative: threads a small story, 3-4 sentences.
- duality: leads with a contradiction or tension.
- witty: includes a playful aside or parenthetical.
- brand-forward: leads with the client or collab as a statement.
- atmospheric: leans into light, mood, palette, texture.

Every variant must be DISTINCT in tone. Same project, six different angles.`;

const DESCRIPTIONS_SCHEMA = {
  type: 'object',
  properties: {
    variants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tone: { type: 'string', enum: ['sparse', 'narrative', 'duality', 'witty', 'brand-forward', 'atmospheric'] },
          text: { type: 'string' },
        },
        required: ['tone', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['variants'],
  additionalProperties: false,
};

/* Descriptions run as a background job the admin polls — see CLAUDE_MODEL. */
const _descJobs = new Map();

app.get('/api/projects/:id/generate-descriptions/:jobId', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const job = _descJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job_not_found' });
  res.json(job);
});

app.post('/api/projects/:id/generate-descriptions', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'api_key_missing', message: 'ANTHROPIC_API_KEY not set on the NAS .env' });
    }

    const projectId = req.params.id;
    const data = await readProjects();
    const project = data.projects.find(p => p.id === projectId);
    if (!project) return res.status(404).json({ error: 'project_not_found' });

    const brief = (req.body?.brief || '').toString().slice(0, 600);

    // Pick up to 5 images: cover first, then favorites, then selected, then top-ordered.
    const candidates = (project.images || []).filter(i => !i.rejected);
    if (candidates.length === 0) return res.status(400).json({ error: 'no_images' });

    const picks = [];
    const push = (img) => { if (img && !picks.find(p => p.filename === img.filename)) picks.push(img); };
    push(candidates.find(i => i.cover));
    candidates.filter(i => i.favorite).forEach(push);
    candidates.filter(i => i.selected).forEach(push);
    candidates.forEach(push);
    const finalPicks = picks.slice(0, 5);

    // Read + downsize to ~1024px to keep token use sane.
    const imageBlocks = await Promise.all(finalPicks.map(async (img) => {
      const bytes = await readBytes(projectId, img.filename);
      if (!bytes) return null;
      const resized = await sharp(bytes)
        .rotate()
        .resize({ width: 1024, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      return {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: resized.toString('base64') },
      };
    }));
    const cleanImages = imageBlocks.filter(Boolean);
    if (cleanImages.length === 0) return res.status(400).json({ error: 'no_readable_images' });

    const userText = [
      `Project: ${project.name}`,
      `Client: ${project.client || '—'}`,
      `Year: ${project.year || '—'}`,
      `Type: ${project.type || '—'}`,
      project.location ? `Location: ${project.location}` : null,
      project.format   ? `Format: ${project.format}`     : null,
      brief ? `\nPhotographer's brief (use this — it's the steer): ${brief}` : null,
      `\nGenerate 6 distinct description variants per the system prompt.`,
    ].filter(Boolean).join('\n');

    _sweepJobs(_descJobs);
    const jobId = _makeJobId('describe');
    const job = { id: jobId, status: 'running', result: null, error: null, finishedAt: null };
    _descJobs.set(jobId, job);

    _askClaudeJSON({
      system: AC_VOICE_SYSTEM,
      content: [...cleanImages, { type: 'text', text: userText }],
      schema: DESCRIPTIONS_SCHEMA,
    }).then(({ data, usage }) => {
      const variants = data.variants.filter(v => v && typeof v.text === 'string' && v.text.trim());
      job.result = { variants, meta: { imagesAnalyzed: cleanImages.length, usage: usage || null } };
      job.status = 'done';
    }).catch(err => {
      console.error('[generate-descriptions]', err?.status || '', err?.message?.slice(0, 500));
      job.error = err?.message?.slice(0, 500) || 'Unknown error';
      job.status = 'error';
    }).finally(() => { job.finishedAt = Date.now(); });

    res.json({ jobId });
  } catch (err) {
    console.error('[generate-descriptions] FATAL:', err?.message, err?.stack);
    res.status(500).json({ error: 'internal', message: err?.message || 'Unknown error' });
  }
});

/* ------------------------------------------------------------------ */
/* Image serve / patch / delete                                        */
/* ------------------------------------------------------------------ */

/* Three-tier resize cache:
 *   1. In-memory LRU (600 entries ≈ 80 MB at ~130 KB/variant — fine with 5.7 GB RAM)
 *   2. Disk (images/__resized/...) — survives container restarts, so the
 *      Celeron only ever resizes each variant ONCE, ever
 *   3. Cloudflare edge — immutable cache headers mean repeat visitors
 *      worldwide never even reach the NAS
 * Requested widths snap to fixed buckets so the caches stay dense and a
 * malicious ?w=1..3999 sweep can't fragment them. */
const _resizeCache = new Map();
const _RESIZE_CAP  = 600;
const _W_BUCKETS   = [200, 400, 800, 1200, 1600, 2000];
const _snapW = (w) => _W_BUCKETS.find(b => b >= w) || 2000;
/* The public site asks for WebP (&f=webp): ~30% smaller than JPEG at the
   same visual quality. Plain ?w= keeps returning JPEG for older links. */
function _encode(pipe, fmt) {
  return fmt === 'webp'
    ? pipe.webp({ quality: 80, effort: 4 })
    : pipe.jpeg({ quality: 82, mozjpeg: true });
}
async function _resized(bytes, w, fmt = 'jpeg') {
  try {
    return await _encode(sharp(bytes)
      .rotate()                          // auto-orient via EXIF
      .resize({ width: w, withoutEnlargement: true }), fmt)
      .toBuffer();
  } catch (_) { return bytes; }         // fall back to original on error
}
function _resizedDiskPath(id, filename, w, fmt = 'jpeg') {
  const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_');
  return path.join(IMAGES_DIR, '__resized', `w${w}`, safe(id), safe(filename) + (fmt === 'webp' ? '.webp' : '.jpg'));
}

/* Pre-generate the sizes the public site requests most, so the first
   visitor doesn't wait while the NAS shrinks a 60MP original (~3s each).
   Decodes the original once and writes straight to the disk cache. */
const _PREWARM_WIDTHS = [400, 800, 1200, 1600];
async function _prewarmResizes(id, filename, original) {
  try {
    const base = sharp(original).rotate();
    for (const w of _PREWARM_WIDTHS) {
      const buf = await _encode(base.clone().resize({ width: w, withoutEnlargement: true }), 'webp').toBuffer();
      const diskPath = _resizedDiskPath(id, filename, w, 'webp');
      await fs.promises.mkdir(path.dirname(diskPath), { recursive: true });
      await fs.promises.writeFile(diskPath, buf);
    }
  } catch (err) {
    console.warn('[prewarm] failed for', id, filename, err?.message);
  }
}

/* Returns the resized buffer via mem → disk → generate; populates both caches. */
async function _resizedCached(id, filename, w, readOriginal, fmt = 'jpeg') {
  const cacheKey = `${id}/${filename}?w=${w}&f=${fmt}`;
  let buf = _resizeCache.get(cacheKey);
  if (buf) return buf;
  const diskPath = _resizedDiskPath(id, filename, w, fmt);
  buf = await fs.promises.readFile(diskPath).catch(() => null);
  if (!buf) {
    const original = await readOriginal();
    if (!original) return null;
    buf = await _resized(original, w, fmt);
    // Persist best-effort — a failed disk write must not fail the request
    fs.promises.mkdir(path.dirname(diskPath), { recursive: true })
      .then(() => fs.promises.writeFile(diskPath, buf))
      .catch(() => {});
  }
  if (_resizeCache.size >= _RESIZE_CAP) _resizeCache.delete(_resizeCache.keys().next().value);
  _resizeCache.set(cacheKey, buf);
  return buf;
}

app.get('/api/projects/:id/images/:filename', async (req, res) => {
  const { id, filename } = req.params;

  const wRaw = parseInt(req.query.w, 10);
  if (wRaw > 0 && wRaw < 4000) {
    const w = _snapW(wRaw);
    const fmt = req.query.f === 'webp' ? 'webp' : 'jpeg';
    const resized = await _resizedCached(id, filename, w, () => readBytes(id, filename).catch(() => null), fmt);
    if (!resized) return res.status(404).send('Not found');
    res.setHeader('Content-Type', fmt === 'webp' ? 'image/webp' : 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(resized);
  }

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
    // Visibility guard: this endpoint REPLACES projects.json wholesale with
    // the admin's localStorage snapshot. If the snapshot is stale (e.g. a
    // Dropbox import wrote projects server-side that this browser never
    // pulled), the sync would silently erase them. The client now pulls
    // before syncing, but if a drop still happens, scream about it in the
    // logs and report it in the response so it's never invisible again.
    let droppedIds = [];
    work.push(
      readProjects()
        .then(existing => {
          const incoming = new Set(body.projects.map(p => p.id));
          droppedIds = (existing.projects || []).map(p => p.id).filter(id => !incoming.has(id));
          if (droppedIds.length) {
            console.warn(`[admin/sync] ⚠ snapshot DROPS ${droppedIds.length} project(s) that exist on disk: ${droppedIds.join(', ')}`);
          }
        })
        .catch(() => {})
        .then(() => writeProjects({ projects: body.projects }))
        .then(() => { wrote.push('projects'); if (droppedIds.length) wrote.push(`projects_dropped:${droppedIds.join(',')}`); })
    );
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

  const [projectsFile, aboutFile, clientsFile, servicesFile, settingsFile, videosFile] = await Promise.all([
    safe(readProjects), safe(readAbout), safe(readClients), safe(readServices), safe(readSettings), safe(readVideos),
  ]);

  const about    = pick(aboutFile,             DEFAULT_ABOUT,    'bio');
  const clients  = pickArr(clientsFile?.clients,  DEFAULT_CLIENTS);
  const services = pickArr(servicesFile?.services, DEFAULT_SERVICES);
  const settings = pick(settingsFile,          DEFAULT_SETTINGS, 'contactEmail');

  const sortMode = settings.projectSort || 'year';
  const cleanedFromStore = (projectsFile?.projects || [])
    .filter(p => p.public !== false && !p.raw) // raw projects live at /raw only
    .map(p => {
      const imgs = (p.images || []).filter(img => !img.rejected);
      const coverIdx = imgs.findIndex(i => i.cover);
      if (coverIdx > 0) { const [c] = imgs.splice(coverIdx, 1); imgs.unshift(c); }
      return { ...p, images: imgs };
    })
    .filter(p => p.images.length > 0)
    .sort((a, b) => {
      if (sortMode === 'manual') return (a.order ?? 9999) - (b.order ?? 9999);
      if (sortMode === 'client') return (a.client || '').localeCompare(b.client || '');
      return Number(b.year || 0) - Number(a.year || 0);
    });
  const projects = await Promise.all(pickArr(cleanedFromStore, DEFAULT_PROJECTS).map(async p => ({
    ...p,
    images: await Promise.all((p.images || []).map(async img =>
      img.blurDataURL ? { ...img, blurDataURL: await compactBlur(img.blurDataURL) } : img)),
  })));

  const videos = (videosFile?.videos || [])
    .filter(v => v.public !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Public prints: filter to active prints with at least one size available
  const printsFile = await readPrints().catch(() => ({ prints: [] }));
  const prints = (printsFile?.prints || [])
    .filter(p => p.active !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('x-aldo-served', new Date().toISOString());
  res.json({
    projects,
    videos,
    prints,
    about,
    clients,
    services: services.slice().sort((a, b) => (a.order || 0) - (b.order || 0)),
    settings,
  });
});

/* ------------------------------------------------------------------ */
/* Raw projects — public, no auth (obscurity is the protection)       */
/* ------------------------------------------------------------------ */

app.get('/api/raw-projects', async (req, res) => {
  try {
    const data = await readProjects();
    const raws = (data.projects || [])
      .filter(p => p.raw === true)
      .map(p => {
        const imgs = (p.images || []).filter(img => !img.rejected);
        const coverIdx = imgs.findIndex(i => i.cover);
        if (coverIdx > 0) { const [c] = imgs.splice(coverIdx, 1); imgs.unshift(c); }
        return { ...p, images: imgs };
      })
      .sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    res.json({ projects: raws });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

/* ------------------------------------------------------------------ */
/* Dispatches — public read, auth write                                */
/* ------------------------------------------------------------------ */

app.get('/api/dispatches', async (req, res) => {
  try {
    const data = await readDispatches();
    const published = (data.dispatches || [])
      .filter(d => d.published)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ dispatches: published });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

app.get('/api/dispatches/:id', async (req, res) => {
  try {
    const data = await readDispatches();
    const d = data.dispatches.find(d => d.id === req.params.id);
    if (!d || !d.published) return res.status(404).json({ error: 'not_found' });
    res.json(d);
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

app.get('/api/admin/dispatches', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data = await readDispatches();
    const sorted = (data.dispatches || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ dispatches: sorted });
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/dispatches', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { title, body, date, published } = req.body || {};
    const data = await readDispatches();
    const entry = {
      id: `DISPATCH_${Date.now()}`,
      title: (title || '').trim(),
      body:  (body  || '').trim(),
      date:  date || new Date().toISOString().slice(0, 10),
      published: !!published,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.dispatches.push(entry);
    await writeDispatches(data);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

app.put('/api/dispatches/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data = await readDispatches();
    const idx = data.dispatches.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    data.dispatches[idx] = {
      ...data.dispatches[idx],
      ...req.body,
      id:        data.dispatches[idx].id,
      createdAt: data.dispatches[idx].createdAt,
      updatedAt: new Date().toISOString(),
    };
    await writeDispatches(data);
    res.json(data.dispatches[idx]);
  } catch (err) {
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

app.delete('/api/dispatches/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data = await readDispatches();
    data.dispatches = data.dispatches.filter(d => d.id !== req.params.id);
    await writeDispatches(data);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'internal' });
  }
});

/* ------------------------------------------------------------------ */
/* Prints — admin CRUD                                                 */
/* ------------------------------------------------------------------ */

function nextPrintId() { return 'PRINT_' + Date.now(); }

app.get('/api/prints', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try { res.json(await readPrints()); }
  catch (err) { console.error('[GET /api/prints]', err); res.status(500).json({ error: 'internal' }); }
});

app.post('/api/prints', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data = await readPrints();
    const print = {
      id: nextPrintId(),
      title: req.body.title || 'Untitled print',
      sourceProjectId: req.body.sourceProjectId || '',
      sourceFilename:  req.body.sourceFilename  || '',
      blobPath:        req.body.blobPath        || '',
      description:     req.body.description     || '',
      editionTotal:    req.body.editionTotal ?? 50,
      editionsSold:    req.body.editionsSold ?? 0,
      sizes:           Array.isArray(req.body.sizes) ? req.body.sizes : [],
      active:          req.body.active !== false,
      order:           data.prints.length,
      createdAt:       new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
    };
    data.prints.push(print);
    await writePrints(data);
    res.status(201).json(print);
  } catch (err) { console.error('[POST /api/prints]', err); res.status(500).json({ error: 'internal' }); }
});

app.put('/api/prints/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data = await readPrints();
    const idx  = data.prints.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    data.prints[idx] = { ...data.prints[idx], ...req.body, id: data.prints[idx].id, updatedAt: new Date().toISOString() };
    await writePrints(data);
    res.json(data.prints[idx]);
  } catch (err) { console.error('[PUT /api/prints/:id]', err); res.status(500).json({ error: 'internal' }); }
});

app.delete('/api/prints/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data = await readPrints();
    data.prints = data.prints.filter(p => p.id !== req.params.id);
    await writePrints(data);
    res.status(204).send();
  } catch (err) { console.error('[DELETE /api/prints/:id]', err); res.status(500).json({ error: 'internal' }); }
});

/* ------------------------------------------------------------------ */
/* Videos — admin CRUD + upload + public serve                         */
/* ------------------------------------------------------------------ */

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const dir = getVideoTmpDir();
      await fs.promises.mkdir(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const safe = (file.originalname || `video_${Date.now()}.mp4`).replace(/[^A-Za-z0-9._-]+/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function nextVideoId() { return 'VID_' + Date.now(); }

/* Multer error handler — catches LIMIT_FILE_SIZE before it silently
   hangs the connection (which Safari reports as "Load failed"). */
function handleMulterError(err, req, res, next) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'file_too_large', message: 'File exceeds the 100 MB limit.' });
  }
  next(err);
}

app.get('/api/videos', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    res.json(await readVideos());
  } catch (err) {
    console.error('[GET /api/videos]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message || 'Failed to read videos' });
  }
});

app.post('/api/videos', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const body = req.body || {};
    if (!body.title) return res.status(422).json({ error: 'validation', message: '`title` required' });
    const data  = await readVideos();
    const video = {
      id:          (body.id || nextVideoId()).toUpperCase().replace(/[^A-Z0-9_]+/g, '_'),
      title:       body.title,
      client:      body.client      || '',
      year:        body.year        || new Date().getFullYear(),
      category:    body.category    || 'Reel',
      description: body.description || '',
      embedUrl:    body.embedUrl    || '',
      blobPath:    '',
      poster:      body.poster      || '',
      public:      body.public !== false,
      projectId:   body.projectId   || null,    // BTS link — which project this reel belongs to
      order:       body.order       ?? data.videos.length,
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    };
    data.videos.unshift(video);
    await writeVideos(data);
    res.status(201).json(video);
  } catch (err) {
    console.error('[POST /api/videos]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message || 'Failed to create video' });
  }
});

app.put('/api/videos/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data  = await readVideos();
    const idx   = data.videos.findIndex(v => v.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const allowed = ['title','client','year','category','description','embedUrl','public','projectId','order'];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    data.videos[idx] = { ...data.videos[idx], ...patch, id: data.videos[idx].id, updatedAt: new Date().toISOString() };
    await writeVideos(data);
    res.json(data.videos[idx]);
  } catch (err) {
    console.error('[PUT /api/videos/:id]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message || 'Failed to update video' });
  }
});

app.delete('/api/videos/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data   = await readVideos();
    const video  = data.videos.find(v => v.id === req.params.id);
    if (!video) return res.status(404).json({ error: 'not_found' });
    if (video.blobPath) {
      const [, vidId, filename] = video.blobPath.split('/');
      await deleteVideoFile(vidId, filename).catch(() => {});
    }
    data.videos = data.videos.filter(v => v.id !== req.params.id);
    await writeVideos(data);
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /api/videos/:id]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message || 'Failed to delete video' });
  }
});

app.post('/api/videos/:id/upload', videoUpload.single('file'), handleMulterError, async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data  = await readVideos();
    const video = data.videos.find(v => v.id === req.params.id);
    if (!video) return res.status(404).json({ error: 'not_found' });
    if (!req.file) return res.status(400).json({ error: 'missing_file' });
    const safeName = (req.file.originalname || `video_${Date.now()}.mp4`).replace(/[^A-Za-z0-9._-]+/g, '_');
    await writeVideoBytesFromPath(video.id, safeName, req.file.path);
    video.blobPath = `__videos/${video.id}/${safeName}`;
    video.updatedAt = new Date().toISOString();
    await writeVideos(data);
    res.json({ blobPath: video.blobPath });
  } catch (err) {
    console.error('[POST /api/videos/:id/upload]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message || 'Upload failed' });
  }
});

app.post('/api/videos/:id/poster', upload.single('file'), handleMulterError, async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data  = await readVideos();
    const video = data.videos.find(v => v.id === req.params.id);
    if (!video) return res.status(404).json({ error: 'not_found' });
    if (!req.file) return res.status(400).json({ error: 'missing_file' });
    const safeName = `poster_${Date.now()}_${(req.file.originalname || 'poster.jpg').replace(/[^A-Za-z0-9._-]+/g, '_')}`;
    await writeBytes(`__vidposters/${video.id}`, safeName, req.file.buffer);
    video.poster = `__vidposters/${video.id}/${safeName}`;
    video.updatedAt = new Date().toISOString();
    await writeVideos(data);
    res.json({ poster: video.poster });
  } catch (err) {
    console.error('[POST /api/videos/:id/poster]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message || 'Poster upload failed' });
  }
});

app.get('/api/videoposters/:videoId/:filename', async (req, res) => {
  const bytes = await readBytes('__vidposters/' + req.params.videoId, req.params.filename).catch(() => null);
  if (!bytes) return res.status(404).send('Not found');
  res.setHeader('Content-Type',  contentTypeFor(req.params.filename));
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(bytes);
});

app.get('/api/videos/:id/file/:filename', async (req, res) => {
  const bytes = await readVideoBytes(req.params.id, req.params.filename).catch(() => null);
  if (!bytes) return res.status(404).send('Not found');
  const ext  = req.params.filename.split('.').pop().toLowerCase();
  const mime = ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : ext === 'ogg' ? 'video/ogg' : 'video/mp4';
  const total = bytes.length;
  const range = req.headers.range;
  if (range) {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end   = endStr ? parseInt(endStr, 10) : total - 1;
    res.status(206);
    res.setHeader('Content-Range',  `bytes ${start}-${end}/${total}`);
    res.setHeader('Accept-Ranges',  'bytes');
    res.setHeader('Content-Length', end - start + 1);
    res.setHeader('Content-Type',   mime);
    res.send(bytes.slice(start, end + 1));
  } else {
    res.setHeader('Content-Type',   mime);
    res.setHeader('Content-Length', total);
    res.setHeader('Accept-Ranges',  'bytes');
    res.setHeader('Cache-Control',  'public, max-age=3600');
    res.send(bytes);
  }
});

/* ------------------------------------------------------------------ */
/* Galleries — admin management (auth required)                        */
/* ------------------------------------------------------------------ */

app.get('/api/galleries', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const { galleries } = await readGalleries();
  // Attach image/selection counts without exposing full project data
  const projects = (await readProjects()).projects;
  const enriched = galleries.map(g => {
    const proj   = projects.find(p => p.id === g.projectId);
    const total  = proj ? proj.images.length : 0;
    const reviewed = Object.keys(g.selections || {}).length;
    const selected  = Object.values(g.selections || {}).filter(s => s.label === 'SELECT').length;
    const alted     = Object.values(g.selections || {}).filter(s => s.label === 'ALT').length;
    const killed    = Object.values(g.selections || {}).filter(s => s.label === 'KILL').length;
    return { ...g, password: g.password ? '••••' : null, _counts: { total, reviewed, selected, alted, killed } };
  });
  res.json({ galleries: enriched });
});

app.post('/api/galleries', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = req.body || {};
  if (!body.projectId) return res.status(422).json({ error: 'validation', message: '`projectId` required' });
  const data = await readProjects();
  if (!data.projects.find(p => p.id === body.projectId)) {
    return res.status(422).json({ error: 'validation', message: 'project not found' });
  }
  const gallery = await createGallery({
    projectId:  body.projectId,
    clientName: body.clientName || '',
    title:      body.title || '',
    expiresAt:  body.expiresAt || null,
    password:   body.password  || null,
  });
  res.status(201).json({ ...gallery, password: gallery.password ? '••••' : null });
});

app.get('/api/galleries/:token', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const gallery = await findGallery(req.params.token).catch(() => null);
  if (!gallery) return res.status(404).json({ error: 'not_found' });

  const data    = await readProjects();
  const project = data.projects.find(p => p.id === gallery.projectId);
  const images  = project
    ? project.images
        .filter(i => !i.rejected)
        .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
        .map(i => ({
          filename: i.filename,
          blobPath: i.blobPath,
          order:    i.order,
          exif:     i.exif || {},
        }))
    : [];

  res.json({
    ...gallery,
    password:     gallery.password ? '••••' : null,
    projectName:  project?.name || null,
    viewCount:    gallery.viewCount    || 0,
    lastViewedAt: gallery.lastViewedAt || null,
    images,
  });
});

app.patch('/api/galleries/:token', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const allowed = ['clientName', 'title', 'expiresAt', 'password', 'status'];
  const patch   = {};
  for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
  const updated = await updateGallery(req.params.token, patch);
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ ...updated, password: updated.password ? '••••' : null });
});

app.delete('/api/galleries/:token', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const ok = await deleteGallery(req.params.token);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).send();
});

/* POST /api/galleries/:token/zip
   Body: { labels: ['SELECT','ALT'] }  — omit or pass [] for all images
   Streams a ZIP of the matching images directly to the client. */
app.post('/api/galleries/:token/zip', async (req, res) => {
  if (!requireAuth(req, res)) return;

  const { labels } = req.body || {};

  const gallery = await findGallery(req.params.token).catch(() => null);
  if (!gallery) return res.status(404).json({ error: 'not_found' });

  const data    = await readProjects();
  const project = data.projects.find(p => p.id === gallery.projectId);
  if (!project) return res.status(404).json({ error: 'project_not_found' });

  const sels = gallery.selections || {};
  let images = project.images.filter(i => !i.rejected);

  if (labels && labels.length) {
    images = images.filter(img => labels.includes(sels[img.filename]?.label));
  }

  if (images.length === 0) {
    return res.status(400).json({ error: 'no_images', message: 'No images match the selected filter.' });
  }

  try {
    const { default: archiver } = await import('archiver');
    const archive = archiver('zip', { zlib: { level: 0 } }); // store-only (JPEGs don't compress further)

    const safeTitle = (gallery.title || gallery.token).replace(/[^a-zA-Z0-9_\-]/g, '_');
    const labelStr  = labels && labels.length ? `_${labels.join('-')}` : '_ALL';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}${labelStr}.zip"`);

    archive.on('error', (err) => {
      console.error('[zip] archive error:', err.message);
      if (!res.headersSent) res.status(500).end();
    });

    archive.pipe(res);

    let added = 0;
    for (const img of images) {
      const filePath = path.join(IMAGES_DIR, gallery.projectId, img.filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: img.filename });
        added++;
      } else {
        console.warn('[zip] file not found on disk:', filePath);
      }
    }

    if (added === 0) {
      res.removeHeader('Content-Disposition');
      return res.status(400).json({ error: 'no_files', message: 'No image files found on disk.' });
    }

    await archive.finalize();
    console.log(`[zip] gallery ${gallery.token} — ${added} files zipped`);
  } catch (err) {
    console.error('[zip] fatal:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'zip_failed', message: err.message });
  }
});

/* ------------------------------------------------------------------ */
/* Gallery — client-facing (token-gated, no auth)                      */
/* ------------------------------------------------------------------ */

function galleryTokenCheck(gallery, req) {
  if (!gallery)                return { err: 'not_found',  status: 404 };
  if (isExpired(gallery))      return { err: 'expired',    status: 410 };
  if (gallery.status === 'archived') return { err: 'archived', status: 410 };
  if (gallery.password) {
    const supplied = req.headers['x-gallery-password'] || (req.body || {}).password || '';
    if (supplied !== gallery.password) return { err: 'password_required', status: 401 };
  }
  return null;
}

app.get('/api/gallery/:token', async (req, res) => {
  const gallery = await findGallery(req.params.token).catch(() => null);
  const errCheck = galleryTokenCheck(gallery, req);
  if (errCheck) return res.status(errCheck.status).json({ error: errCheck.err });

  // Fire-and-forget view tracking
  updateGallery(gallery.token, {
    viewCount:    (gallery.viewCount || 0) + 1,
    lastViewedAt: new Date().toISOString(),
  }).catch(() => {});

  const data    = await readProjects();
  const project = data.projects.find(p => p.id === gallery.projectId);
  if (!project) return res.status(404).json({ error: 'project_not_found' });

  const images = project.images
    .filter(i => !i.rejected)
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
    .map(i => ({
      filename: i.filename,
      url:      i.blobPath,
      order:    i.order,
      exif:     i.exif || {},
      selection: gallery.selections?.[i.filename] || { label: null, stars: 0, note: '', markups: [] },
    }));

  res.json({
    token:       gallery.token,
    title:       gallery.title,
    clientName:  gallery.clientName,
    projectId:   gallery.projectId,
    status:      gallery.status,
    submittedAt: gallery.submittedAt,
    expiresAt:   gallery.expiresAt,
    images,
  });
});

app.put('/api/gallery/:token/select', async (req, res) => {
  const gallery = await findGallery(req.params.token).catch(() => null);
  const errCheck = galleryTokenCheck(gallery, req);
  if (errCheck) return res.status(errCheck.status).json({ error: errCheck.err });
  const updates = req.body?.updates;
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(422).json({ error: 'validation', message: '`updates` array required' });
  }

  const validLabels = new Set(['SELECT', 'ALT', 'KILL', null]);
  const selections  = { ...(gallery.selections || {}) };

  for (const u of updates) {
    if (!u.filename) continue;
    if (!validLabels.has(u.label)) continue;
    const existing = selections[u.filename] || {};
    selections[u.filename] = {
      label:        u.label ?? null,
      stars:        Math.min(5, Math.max(0, parseInt(u.stars ?? 0, 10))),
      note:         String(u.note ?? '').slice(0, 500),
      markups:      Array.isArray(u.markups)      ? u.markups.slice(0, 100)      : (existing.markups      || []),
      voiceMarkups: Array.isArray(u.voiceMarkups) ? u.voiceMarkups.slice(0, 50)  : (existing.voiceMarkups || []),
      // Preserve server-written voice fields
      voiceNote:      existing.voiceNote      || undefined,
      adminVoiceNote: existing.adminVoiceNote || undefined,
    };
  }

  await updateGallery(gallery.token, { selections });
  res.json({ ok: true });
});

app.post('/api/gallery/:token/submit', async (req, res) => {
  const gallery = await findGallery(req.params.token).catch(() => null);
  const errCheck = galleryTokenCheck(gallery, req);
  if (errCheck) return res.status(errCheck.status).json({ error: errCheck.err });
  const submittedAt = new Date().toISOString();
  await updateGallery(gallery.token, { status: 'submitted', submittedAt });

  // Fire email notification
  const sels = gallery.selections || {};
  const selected = Object.entries(sels)
    .filter(([, s]) => s.label === 'SELECT' || s.label === 'ALT')
    .map(([filename, s]) => ({ filename, label: s.label, note: (s.note || '').trim() }))
    .sort((a, b) => (a.label === 'SELECT' ? -1 : 1));
  _sendGallerySubmitEmail({ gallery, selected, submittedAt }).catch(e => console.error('[email] gallery submit failed:', e?.message));

  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Decks — admin management (auth required)                            */
/* ------------------------------------------------------------------ */

app.get('/api/decks', async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json(await readDecks());
});

app.post('/api/decks', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = req.body || {};
  if (!body.projectId) return res.status(422).json({ error: 'validation', message: '`projectId` required' });
  const data = await readProjects();
  if (!data.projects.find(p => p.id === body.projectId)) {
    return res.status(422).json({ error: 'validation', message: 'project not found' });
  }
  const deck = await createDeck({
    projectId:    body.projectId,
    title:        body.title        || '',
    imagesFilter: body.imagesFilter || 'selected',
    expiresAt:    body.expiresAt    || null,
  });
  res.status(201).json(deck);
});

app.delete('/api/decks/:token', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const ok = await deleteDeck(req.params.token);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).send();
});

/* ------------------------------------------------------------------ */
/* Deck — public viewer (token-gated, no auth)                         */
/* ------------------------------------------------------------------ */

app.get('/api/deck/:token', async (req, res) => {
  const deck = await findDeck(req.params.token).catch(() => null);
  if (!deck) return res.status(404).json({ error: 'not_found' });
  if (deck.expiresAt && new Date(deck.expiresAt) < new Date()) {
    return res.status(410).json({ error: 'expired' });
  }

  const data    = await readProjects();
  const project = data.projects.find(p => p.id === deck.projectId);
  if (!project) return res.status(404).json({ error: 'project_not_found' });

  const filter   = deck.imagesFilter || 'selected';
  const images   = project.images
    .filter(i => !i.rejected)
    .filter(i => filter === 'all' ? true : i.selected || i.favorite)
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
    .map(i => ({
      filename: i.filename,
      url:      i.blobPath,
      order:    i.order,
      exif:     i.exif || {},
    }));

  await incrementViews(deck.token).catch(() => {});

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    token:     deck.token,
    title:     deck.title || project.name,
    project: {
      id:          project.id,
      name:        project.name,
      client:      project.client,
      year:        project.year,
      month:       project.month,
      type:        project.type,
      description: project.description,
      location:    project.location,
    },
    images,
    views:     deck.views || 0,
  });
});

/* ------------------------------------------------------------------ */
/* Gallery Portals — PIN-gated /g/:token pages (admin + public)       */
/* ------------------------------------------------------------------ */

/* Gallery session keys are HMACs under the server secret: the old
   base64(token:pin) could be computed by anyone who knew the token and
   guessed the 4-character PIN. Changing JWT_SECRET re-locks every gallery
   (clients just re-enter the PIN). */
function _galleryHmac(text) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-only').update(text).digest('base64url');
}
function _portalKey(token, pin) {
  return _galleryHmac(`portal:${token}:${pin}`).slice(0, 24);
}
function _nextPortalToken() {
  return crypto.randomBytes(9).toString('base64url'); // was 7 chars of Math.random
}

/* PINs are short, so unlock attempts are rate-limited per IP + gallery:
   10 wrong guesses per 15 minutes, then 429 until the window passes. */
const _unlockFails = new Map();
const _UNLOCK_WINDOW = 15 * 60 * 1000;
const _UNLOCK_MAX = 10;
function _clientIp(req) {
  return req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
}
function _unlockBlocked(req, res, token) {
  const key = `${_clientIp(req)}|${token}`;
  const recent = (_unlockFails.get(key) || []).filter(t => Date.now() - t < _UNLOCK_WINDOW);
  _unlockFails.set(key, recent);
  if (recent.length < _UNLOCK_MAX) return false;
  res.status(429).json({ error: 'rate_limited', message: 'Too many attempts. Try again in a few minutes.' });
  return true;
}
function _unlockFailed(req, token) {
  const key = `${_clientIp(req)}|${token}`;
  _unlockFails.set(key, [...(_unlockFails.get(key) || []), Date.now()]);
  if (_unlockFails.size > 5000) _unlockFails.delete(_unlockFails.keys().next().value);
}

/* GET /api/gallery-portals  — list all portals (admin) */
app.get('/api/gallery-portals', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data = await readGalleryPortals();
    res.json(data.portals || []);
  } catch (err) {
    console.error('[GET /api/gallery-portals]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

/* POST /api/gallery-portals  — create a portal (admin) */
app.post('/api/gallery-portals', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const body = req.body || {};
    if (!body.projectId) return res.status(422).json({ error: 'validation', message: '`projectId` required' });
    if (!body.pin || String(body.pin).length !== 4) return res.status(422).json({ error: 'validation', message: '`pin` must be 4 digits' });

    const data = await readGalleryPortals();
    const portal = {
      token:            _nextPortalToken(),
      projectId:        body.projectId,
      title:            body.title || '',
      pin:              String(body.pin),
      downloadsEnabled: !!body.downloadsEnabled,
      selects:          {},
      createdAt:        new Date().toISOString(),
    };
    data.portals = [portal, ...(data.portals || [])];
    await writeGalleryPortals(data);
    res.status(201).json(portal);
  } catch (err) {
    console.error('[POST /api/gallery-portals]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

/* DELETE /api/gallery-portals/:token  — delete a portal (admin) */
app.delete('/api/gallery-portals/:token', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data = await readGalleryPortals();
    const before = (data.portals || []).length;
    data.portals = (data.portals || []).filter(p => p.token !== req.params.token);
    if (data.portals.length === before) return res.status(404).json({ error: 'not_found' });
    await writeGalleryPortals(data);
    res.status(204).send();
  } catch (err) {
    console.error('[DELETE /api/gallery-portals/:token]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

/* PATCH /api/gallery-portals/:token  — update portal settings (admin) */
app.patch('/api/gallery-portals/:token', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data = await readGalleryPortals();
    const idx = (data.portals || []).findIndex(p => p.token === req.params.token);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const portal = data.portals[idx];

    // Whitelist of admin-editable fields — never touch token/pin/selects/createdAt
    if (typeof req.body?.downloadsEnabled === 'boolean') portal.downloadsEnabled = req.body.downloadsEnabled;
    if (typeof req.body?.title === 'string')             portal.title            = req.body.title;

    data.portals[idx] = portal;
    await writeGalleryPortals(data);
    res.json(portal);
  } catch (err) {
    console.error('[PATCH /api/gallery-portals/:token]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

/* POST /api/gallery-portals/:token/unlock  — verify PIN, return session key (public) */
app.post('/api/gallery-portals/:token/unlock', async (req, res) => {
  try {
    const data = await readGalleryPortals();
    const portal = (data.portals || []).find(p => p.token === req.params.token);
    if (!portal) return res.status(404).json({ error: 'not_found' });

    if (_unlockBlocked(req, res, portal.token)) return;
    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: 'pin required' });
    if (String(pin) !== String(portal.pin)) {
      _unlockFailed(req, portal.token);
      return res.status(403).json({ error: 'wrong_pin' });
    }

    const key = _portalKey(portal.token, portal.pin);

    // Count images from project
    const projectsData = await readProjects();
    const project = (projectsData.projects || []).find(p => p.id === portal.projectId);
    const imageCount = project ? (project.images || []).filter(i => !i.rejected).length : 0;

    res.json({ ok: true, key, title: portal.title, imageCount });
  } catch (err) {
    console.error('[POST /api/gallery-portals/:token/unlock]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

/* GET /api/gallery-portals/:token/images?key=KEY  — get images (PIN-gated, public) */
app.get('/api/gallery-portals/:token/images', async (req, res) => {
  try {
    const data = await readGalleryPortals();
    const portal = (data.portals || []).find(p => p.token === req.params.token);
    if (!portal) return res.status(404).json({ error: 'not_found' });

    const key = req.query.key || req.headers['x-gallery-key'] || '';
    if (key !== _portalKey(portal.token, portal.pin)) return res.status(403).json({ error: 'forbidden' });

    const projectsData = await readProjects();
    const project = (projectsData.projects || []).find(p => p.id === portal.projectId);
    if (!project) return res.status(404).json({ error: 'project_not_found' });

    const images = (project.images || [])
      .filter(i => !i.rejected)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .map(img => ({
        filename: img.filename,
        src:      img.blobPath,
        dims:     img.exif?.dimensions || '',
        size:     img.exif?.fileSize ? _fmtPortalBytes(img.exif.fileSize) : '',
        select:   portal.selects?.[img.filename] || {},
      }));

    res.json({
      title: portal.title,
      projectId: portal.projectId,
      images,
      downloadsEnabled: !!portal.downloadsEnabled,
      submitted: !!portal.submitted,
      submittedAt: portal.submittedAt || null,
    });
  } catch (err) {
    console.error('[GET /api/gallery-portals/:token/images]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

/* PATCH /api/gallery-portals/:token/select/:filename?key=KEY  — heart/note (PIN-gated, public) */
app.patch('/api/gallery-portals/:token/select/:filename', async (req, res) => {
  try {
    const data = await readGalleryPortals();
    const idx = (data.portals || []).findIndex(p => p.token === req.params.token);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const portal = data.portals[idx];

    const key = req.query.key || req.headers['x-gallery-key'] || '';
    if (key !== _portalKey(portal.token, portal.pin)) return res.status(403).json({ error: 'forbidden' });

    const filename = req.params.filename;
    if (!filename) return res.status(400).json({ error: 'filename required' });

    if (!portal.selects) portal.selects = {};
    portal.selects[filename] = { ...(portal.selects[filename] || {}), ...(req.body || {}) };
    data.portals[idx] = portal;
    await writeGalleryPortals(data);
    res.json({ ok: true, select: portal.selects[filename] });
  } catch (err) {
    console.error('[PATCH /api/gallery-portals/:token/select]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

/* ------------------------------------------------------------------ */
/* Portal voice notes — client records audio feedback per image       */
/* ------------------------------------------------------------------ */

const _audioExt = (mime) => {
  if (!mime) return 'webm';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4'))  return 'm4a';   // Safari's default
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('ogg'))  return 'ogg';
  if (mime.includes('wav'))  return 'wav';
  return 'webm';
};

/* Best-effort Whisper transcription. Returns null on failure — never throws.
   Requires OPENAI_API_KEY env var; without it, voice notes are still saved
   but have no transcript. */
async function _transcribeAudio(buffer, mime) {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const form = new FormData();
    const blob = new Blob([buffer], { type: mime || 'audio/webm' });
    form.append('file', blob, 'note.' + _audioExt(mime));
    form.append('model', 'whisper-1');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.warn('[whisper]', r.status, txt.slice(0, 200));
      return null;
    }
    const data = await r.json();
    return (data?.text || '').trim() || null;
  } catch (e) {
    console.warn('[whisper] failed:', e?.message);
    return null;
  }
}

/* POST /api/gallery-portals/:token/voice/:filename?key=KEY  — upload voice note (PIN-gated) */
app.post('/api/gallery-portals/:token/voice/:filename', upload.single('audio'), async (req, res) => {
  const data = await readGalleryPortals();
  const idx  = (data.portals || []).findIndex(p => p.token === req.params.token);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  const portal = data.portals[idx];

  const key = req.query.key || req.headers['x-gallery-key'] || '';
  if (key !== _portalKey(portal.token, portal.pin)) return res.status(403).json({ error: 'forbidden' });
  if (!req.file?.buffer) return res.status(400).json({ error: 'no_audio' });

  const filename     = req.params.filename;
  const ext          = _audioExt(req.file.mimetype);
  const audioFile    = `${filename}.${ext}`;
  await writeBytes(`__voice/${portal.token}`, audioFile, req.file.buffer);

  // Transcribe in parallel — best-effort, doesn't block upload success
  const transcript = await _transcribeAudio(req.file.buffer, req.file.mimetype);

  if (!portal.selects) portal.selects = {};
  if (!portal.selects[filename]) portal.selects[filename] = {};
  portal.selects[filename].voiceNote = {
    file:       audioFile,
    mime:       req.file.mimetype || 'audio/webm',
    transcript: transcript,
    size:       req.file.buffer.length,
    recordedAt: new Date().toISOString(),
  };
  data.portals[idx] = portal;
  await writeGalleryPortals(data);

  res.json({ ok: true, voiceNote: portal.selects[filename].voiceNote });
});

/* GET /api/gallery-portals/:token/voice/:filename?key=KEY  — serve audio (PIN-gated, public) */
app.get('/api/gallery-portals/:token/voice/:filename', async (req, res) => {
  const data = await readGalleryPortals();
  const portal = (data.portals || []).find(p => p.token === req.params.token);
  if (!portal) return res.status(404).end();

  const key = req.query.key || req.headers['x-gallery-key'] || '';
  if (key !== _portalKey(portal.token, portal.pin)) return res.status(403).end();

  const voice = portal.selects?.[req.params.filename]?.voiceNote;
  if (!voice) return res.status(404).end();

  const bytes = await readBytes(`__voice/${portal.token}`, voice.file);
  if (!bytes) return res.status(404).end();

  res.setHeader('Content-Type', voice.mime || 'audio/webm');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(bytes);
});

/* DELETE /api/gallery-portals/:token/voice/:filename?key=KEY  — remove voice note (PIN-gated) */
app.delete('/api/gallery-portals/:token/voice/:filename', async (req, res) => {
  const data = await readGalleryPortals();
  const idx  = (data.portals || []).findIndex(p => p.token === req.params.token);
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  const portal = data.portals[idx];

  const key = req.query.key || req.headers['x-gallery-key'] || '';
  if (key !== _portalKey(portal.token, portal.pin)) return res.status(403).json({ error: 'forbidden' });

  const filename = req.params.filename;
  const voice    = portal.selects?.[filename]?.voiceNote;
  if (voice?.file) {
    try { await deleteImage(`__voice/${portal.token}`, voice.file); } catch (_) {}
  }
  if (portal.selects?.[filename]) {
    delete portal.selects[filename].voiceNote;
    data.portals[idx] = portal;
    await writeGalleryPortals(data);
  }
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* Portal downloads — single image + ZIP (PIN-gated, opt-in per portal)*/
/* ------------------------------------------------------------------ */

/* GET /api/gallery-portals/:token/download/:filename?key=KEY
   Serves a single image as an attachment. PIN-gated; requires
   portal.downloadsEnabled === true. Streams the original bytes on disk
   (uncompressed, unmodified) — the same file the photographer uploaded. */
app.get('/api/gallery-portals/:token/download/:filename', async (req, res) => {
  try {
    const data = await readGalleryPortals();
    const portal = (data.portals || []).find(p => p.token === req.params.token);
    if (!portal) return res.status(404).json({ error: 'not_found' });

    const key = req.query.key || req.headers['x-gallery-key'] || '';
    if (key !== _portalKey(portal.token, portal.pin)) return res.status(403).json({ error: 'forbidden' });
    if (!portal.downloadsEnabled) return res.status(403).json({ error: 'downloads_disabled' });

    // Verify the file is actually one of this portal's images (not a path-traversal attempt)
    const projectsData = await readProjects();
    const project = (projectsData.projects || []).find(p => p.id === portal.projectId);
    if (!project) return res.status(404).json({ error: 'project_not_found' });
    const allowed = new Set((project.images || []).filter(i => !i.rejected).map(i => i.filename));
    if (!allowed.has(req.params.filename)) return res.status(404).json({ error: 'not_in_portal' });

    const filePath = path.join(IMAGES_DIR, portal.projectId, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file_missing_on_disk' });

    // Encode the filename for both legacy + RFC 5987 (handles non-ASCII filenames)
    const safe   = req.params.filename.replace(/[\\"]/g, '_');
    const encoded = encodeURIComponent(req.params.filename);
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`);
    res.setHeader('Content-Type',        contentTypeFor(req.params.filename));
    res.setHeader('Cache-Control',       'private, max-age=0, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // sendFile handles Content-Length, range requests, and stream errors properly
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        console.error('[GET portal download] sendFile error:', err?.message);
        res.status(500).end();
      }
    });
    console.log(`[portal download] ${portal.token} → ${req.params.filename}`);
  } catch (err) {
    console.error('[GET portal download]', err?.message);
    if (!res.headersSent) res.status(500).json({ error: 'internal' });
  }
});

/* GET /api/gallery-portals/:token/download-zip?key=KEY
   Streams a ZIP of all images in the portal. PIN-gated; requires
   portal.downloadsEnabled === true. */
app.get('/api/gallery-portals/:token/download-zip', async (req, res) => {
  try {
    const data = await readGalleryPortals();
    const portal = (data.portals || []).find(p => p.token === req.params.token);
    if (!portal) return res.status(404).json({ error: 'not_found' });

    const key = req.query.key || req.headers['x-gallery-key'] || '';
    if (key !== _portalKey(portal.token, portal.pin)) return res.status(403).json({ error: 'forbidden' });
    if (!portal.downloadsEnabled) return res.status(403).json({ error: 'downloads_disabled' });

    const projectsData = await readProjects();
    const project = (projectsData.projects || []).find(p => p.id === portal.projectId);
    if (!project) return res.status(404).json({ error: 'project_not_found' });

    const images = (project.images || []).filter(i => !i.rejected);
    if (images.length === 0) return res.status(400).json({ error: 'no_images' });

    const { default: archiver } = await import('archiver');
    const archive = archiver('zip', { zlib: { level: 0 } }); // store-only (JPEGs don't compress further)

    const safeTitle = (portal.title || portal.token).replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.zip"`);

    archive.on('error', (err) => {
      console.error('[portal zip] archive error:', err.message);
      if (!res.headersSent) res.status(500).end();
    });

    archive.pipe(res);

    let added = 0;
    for (const img of images) {
      const filePath = path.join(IMAGES_DIR, portal.projectId, img.filename);
      if (fs.existsSync(filePath)) {
        // mode: 0o644 → readable by all on the client side after extraction.
        // Without this, archived files inherit Docker filesystem permissions
        // (sometimes 0o600 / owner-only), which causes macOS Finder to show
        // "You don't have permission to open" after the user unzips.
        archive.file(filePath, { name: img.filename, mode: 0o644 });
        added++;
      } else {
        console.warn('[portal zip] file not on disk:', filePath);
      }
    }

    if (added === 0) {
      res.removeHeader('Content-Disposition');
      return res.status(400).json({ error: 'no_files' });
    }

    await archive.finalize();
    console.log(`[portal zip] ${portal.token} — ${added} files`);
  } catch (err) {
    console.error('[portal zip] fatal:', err?.message);
    if (!res.headersSent) res.status(500).json({ error: 'zip_failed', message: err?.message });
  }
});

/* GET /api/admin/gallery-portals/:token/voice/:filename  — admin playback (JWT-auth) */
app.get('/api/admin/gallery-portals/:token/voice/:filename', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const data   = await readGalleryPortals();
  const portal = (data.portals || []).find(p => p.token === req.params.token);
  if (!portal) return res.status(404).end();
  const voice = portal.selects?.[req.params.filename]?.voiceNote;
  if (!voice) return res.status(404).end();
  const bytes = await readBytes(`__voice/${portal.token}`, voice.file);
  if (!bytes) return res.status(404).end();
  res.setHeader('Content-Type', voice.mime || 'audio/webm');
  res.send(bytes);
});

/* ── Admin voice notes for galleries (markup/selects system) ───────────────
   POST   /api/admin/galleries/:token/images/:filename/voice  — upload + transcribe
   GET    /api/admin/galleries/:token/images/:filename/voice  — serve audio
   DELETE /api/admin/galleries/:token/images/:filename/voice  — remove
   All JWT-auth (admin only).
   Audio stored in __gallery-voice-admin/{token}/; metadata in selections[filename].adminVoiceNote
   (Kept separate from the client voiceNote so they don't overwrite each other.)
   ─────────────────────────────────────────────────────────────────────────── */

app.post('/api/admin/galleries/:token/images/:filename/voice', upload.single('audio'), async (req, res) => {
  if (!requireAuth(req, res)) return;
  const gallery = await findGallery(req.params.token);
  if (!gallery) return res.status(404).json({ error: 'not_found' });
  if (!req.file) return res.status(400).json({ error: 'no_file' });

  const filename = req.params.filename;
  const ext      = _audioExt(req.file.mimetype);
  const audioFile = `${Date.now()}_${filename.replace(/\.[^.]+$/, '')}.${ext}`;

  await writeBytes(`__gallery-voice-admin/${gallery.token}`, audioFile, req.file.buffer);

  const transcript = await _transcribeAudio(req.file.buffer, req.file.mimetype);

  const selections = { ...(gallery.selections || {}) };
  if (!selections[filename]) selections[filename] = {};
  if (selections[filename].adminVoiceNote?.file) {
    try { await deleteImage(`__gallery-voice-admin/${gallery.token}`, selections[filename].adminVoiceNote.file); } catch (_) {}
  }
  selections[filename].adminVoiceNote = {
    file:       audioFile,
    mime:       req.file.mimetype,
    transcript: transcript || '',
    size:       req.file.size,
    recordedAt: new Date().toISOString(),
  };
  await updateGallery(gallery.token, { selections });
  res.json({ ok: true, voiceNote: selections[filename].adminVoiceNote });
});

app.get('/api/admin/galleries/:token/images/:filename/voice', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const gallery = await findGallery(req.params.token);
  if (!gallery) return res.status(404).end();
  const voice = gallery.selections?.[req.params.filename]?.adminVoiceNote;
  if (!voice) return res.status(404).end();
  const bytes = await readBytes(`__gallery-voice-admin/${gallery.token}`, voice.file);
  if (!bytes) return res.status(404).end();
  res.setHeader('Content-Type', voice.mime || 'audio/webm');
  res.send(bytes);
});

app.delete('/api/admin/galleries/:token/images/:filename/voice', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const gallery  = await findGallery(req.params.token);
  if (!gallery) return res.status(404).json({ error: 'not_found' });
  const filename = req.params.filename;
  const voice    = gallery.selections?.[filename]?.adminVoiceNote;
  if (voice?.file) {
    try { await deleteImage(`__gallery-voice-admin/${gallery.token}`, voice.file); } catch (_) {}
  }
  const selections = { ...(gallery.selections || {}) };
  if (selections[filename]) {
    delete selections[filename].adminVoiceNote;
    await updateGallery(gallery.token, { selections });
  }
  res.json({ ok: true });
});

/* ── Client voice notes for galleries (markup/selects system) ──────────────
   POST   /api/gallery/:token/images/:filename/voice  — upload + transcribe (password-gated)
   GET    /api/gallery/:token/images/:filename/voice  — serve audio (password-gated)
   DELETE /api/gallery/:token/images/:filename/voice  — remove (password-gated)
   Audio stored in __gallery-voice/{token}/; metadata in selections[filename].voiceNote
   ─────────────────────────────────────────────────────────────────────────── */

app.post('/api/gallery/:token/images/:filename/voice', upload.single('audio'), async (req, res) => {
  const gallery = await findGallery(req.params.token).catch(() => null);
  const check   = galleryTokenCheck(gallery, req);
  if (check) return res.status(check.status).json({ error: check.err });
  if (!req.file) return res.status(400).json({ error: 'no_file' });

  const filename  = req.params.filename;
  const ext       = _audioExt(req.file.mimetype);
  const audioFile = `${Date.now()}_${filename.replace(/\.[^.]+$/, '')}.${ext}`;

  await writeBytes(`__gallery-voice/${gallery.token}`, audioFile, req.file.buffer);

  const transcript = await _transcribeAudio(req.file.buffer, req.file.mimetype);

  const selections = { ...(gallery.selections || {}) };
  if (!selections[filename]) selections[filename] = {};
  if (selections[filename].voiceNote?.file) {
    try { await deleteImage(`__gallery-voice/${gallery.token}`, selections[filename].voiceNote.file); } catch (_) {}
  }
  selections[filename].voiceNote = {
    file:       audioFile,
    mime:       req.file.mimetype,
    transcript: transcript || '',
    size:       req.file.size,
    recordedAt: new Date().toISOString(),
  };
  await updateGallery(gallery.token, { selections });
  res.json({ ok: true, voiceNote: selections[filename].voiceNote });
});

app.get('/api/gallery/:token/images/:filename/voice', async (req, res) => {
  const gallery = await findGallery(req.params.token).catch(() => null);
  const check   = galleryTokenCheck(gallery, req);
  if (check) return res.status(check.status).end();
  const voice = gallery.selections?.[req.params.filename]?.voiceNote;
  if (!voice) return res.status(404).end();
  const bytes = await readBytes(`__gallery-voice/${gallery.token}`, voice.file);
  if (!bytes) return res.status(404).end();
  res.setHeader('Content-Type', voice.mime || 'audio/webm');
  res.send(bytes);
});

app.delete('/api/gallery/:token/images/:filename/voice', async (req, res) => {
  const gallery = await findGallery(req.params.token).catch(() => null);
  const check   = galleryTokenCheck(gallery, req);
  if (check) return res.status(check.status).json({ error: check.err });
  const filename = req.params.filename;
  const voice    = gallery.selections?.[filename]?.voiceNote;
  if (voice?.file) {
    try { await deleteImage(`__gallery-voice/${gallery.token}`, voice.file); } catch (_) {}
  }
  const selections = { ...(gallery.selections || {}) };
  if (selections[filename]) {
    delete selections[filename].voiceNote;
    await updateGallery(gallery.token, { selections });
  }
  res.json({ ok: true });
});

/* ── Positioned voice markups for client markup galleries ──────────────────
   POST   /api/gallery/:token/images/:filename/voice-markup   — record at x,y
   GET    /api/gallery/:token/images/:filename/voice-markup/:id  — serve audio
   DELETE /api/gallery/:token/images/:filename/voice-markup/:id  — remove
   Audio stored in __gallery-voice-mk/{token}/; metadata in selections[fn].voiceMarkups[]
   ─────────────────────────────────────────────────────────────────────────── */

app.post('/api/gallery/:token/images/:filename/voice-markup', upload.single('audio'), async (req, res) => {
  const gallery = await findGallery(req.params.token).catch(() => null);
  const check   = galleryTokenCheck(gallery, req);
  if (check) return res.status(check.status).json({ error: check.err });
  if (!req.file) return res.status(400).json({ error: 'no_file' });

  const filename  = req.params.filename;
  const x         = parseFloat(req.body?.x ?? 0.5);
  const y         = parseFloat(req.body?.y ?? 0.5);
  const ext       = _audioExt(req.file.mimetype);
  const audioFile = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

  await writeBytes(`__gallery-voice-mk/${gallery.token}`, audioFile, req.file.buffer);

  const transcript = await _transcribeAudio(req.file.buffer, req.file.mimetype);

  const id = 'vm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const selections = { ...(gallery.selections || {}) };
  if (!selections[filename]) selections[filename] = {};
  if (!selections[filename].voiceMarkups) selections[filename].voiceMarkups = [];
  selections[filename].voiceMarkups.push({
    id, x, y,
    file:       audioFile,
    mime:       req.file.mimetype,
    transcript: transcript || '',
    size:       req.file.size,
    recordedAt: new Date().toISOString(),
  });
  await updateGallery(gallery.token, { selections });
  res.json({ ok: true, voiceMarkup: selections[filename].voiceMarkups.at(-1) });
});

app.get('/api/gallery/:token/images/:filename/voice-markup/:id', async (req, res) => {
  const gallery = await findGallery(req.params.token).catch(() => null);
  const check   = galleryTokenCheck(gallery, req);
  if (check) return res.status(check.status).end();
  const vm = (gallery.selections?.[req.params.filename]?.voiceMarkups || [])
    .find(v => v.id === req.params.id);
  if (!vm) return res.status(404).end();
  const bytes = await readBytes(`__gallery-voice-mk/${gallery.token}`, vm.file);
  if (!bytes) return res.status(404).end();
  res.setHeader('Content-Type', vm.mime || 'audio/webm');
  res.send(bytes);
});

app.delete('/api/gallery/:token/images/:filename/voice-markup/:id', async (req, res) => {
  const gallery = await findGallery(req.params.token).catch(() => null);
  const check   = galleryTokenCheck(gallery, req);
  if (check) return res.status(check.status).json({ error: check.err });
  const filename = req.params.filename;
  const id       = req.params.id;
  const selections = { ...(gallery.selections || {}) };
  if (!selections[filename]?.voiceMarkups) return res.json({ ok: true });
  const vm = selections[filename].voiceMarkups.find(v => v.id === id);
  if (vm?.file) {
    try { await deleteImage(`__gallery-voice-mk/${gallery.token}`, vm.file); } catch (_) {}
  }
  selections[filename].voiceMarkups = selections[filename].voiceMarkups.filter(v => v.id !== id);
  await updateGallery(gallery.token, { selections });
  res.json({ ok: true });
});

/* POST /api/gallery-portals/:token/submit  — client submits final selections (PIN-gated, public) */
app.post('/api/gallery-portals/:token/submit', async (req, res) => {
  try {
    const data = await readGalleryPortals();
    const idx = (data.portals || []).findIndex(p => p.token === req.params.token);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const portal = data.portals[idx];

    const key = req.query.key || req.body?.key || req.headers['x-gallery-key'] || '';
    if (key !== _portalKey(portal.token, portal.pin)) return res.status(403).json({ error: 'forbidden' });

    portal.submitted   = true;
    portal.submittedAt = new Date().toISOString();
    data.portals[idx]  = portal;
    await writeGalleryPortals(data);

    // Fire email — don't let a mail failure block the 200 response.
    // Include any image with ANY feedback (heart, note, or voice) so voice-only
    // feedback surfaces too.
    const feedback = Object.entries(portal.selects || {})
      .filter(([, v]) => v.hearted || (v.note || '').trim() || v.voiceNote?.transcript || v.voiceNote?.file)
      .map(([filename, v]) => ({
        filename,
        hearted:         !!v.hearted,
        note:            (v.note || '').trim(),
        voiceTranscript: v.voiceNote?.transcript || '',
        hasVoice:        !!v.voiceNote?.file,
      }));
    const heartedCount = feedback.filter(f => f.hearted).length;
    _sendSubmitEmail({ portal, feedback, heartedCount }).catch(e => console.error('[email] send failed:', e?.message));

    res.json({ ok: true, submittedAt: portal.submittedAt });
  } catch (err) {
    console.error('[POST /api/gallery-portals/:token/submit]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

async function _sendSubmitEmail({ portal, feedback, heartedCount }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('[email] RESEND_API_KEY not set — skipping notification email'); return; }

  const resend  = new Resend(apiKey);
  const to      = process.env.NOTIFY_EMAIL || 'aldo@aldocarrera.com';
  const subject = `Gallery submitted: ${portal.title || portal.token} · ${heartedCount} selected`;
  const voiceCount = feedback.filter(f => f.hasVoice).length;

  const esc = (s) => String(s || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));

  const imageRows = feedback.length > 0
    ? feedback.map(f => {
        const heart = f.hearted ? '♥' : '·';
        const noteBlock = f.note
          ? `<div style="font-size:13px;color:#444;margin-top:4px;">${esc(f.note)}</div>`
          : '';
        const voiceBlock = f.voiceTranscript
          ? `<div style="font-size:13px;color:#7c2a2a;margin-top:6px;font-style:italic;">🎤 "${esc(f.voiceTranscript)}"</div>`
          : f.hasVoice
          ? `<div style="font-size:12px;color:#999;margin-top:6px;font-style:italic;">🎤 (voice note — no transcript)</div>`
          : '';
        return `
        <tr>
          <td style="padding:10px 12px 10px 0;font-size:13px;font-family:monospace;color:#1a1810;vertical-align:top;width:36px;">${heart}</td>
          <td style="padding:10px 0;border-bottom:1px solid #f0ece4;">
            <div style="font-size:13px;font-family:monospace;color:#1a1810;">${esc(f.filename)}</div>
            ${noteBlock}
            ${voiceBlock}
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="2" style="padding:6px 0;color:#999;font-size:13px;font-style:italic;">No feedback recorded</td></tr>`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#fafaf8;">
<div style="max-width:560px;margin:40px auto;padding:32px 28px;background:#fff;border:1px solid #e8e4dc;font-family:'IBM Plex Mono',monospace,sans-serif;">
  <p style="margin:0 0 4px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#999;">Aldo Carrera</p>
  <h1 style="margin:0 0 28px;font-size:18px;font-weight:600;letter-spacing:.04em;color:#1a1810;">Gallery Submitted</h1>
  <table style="border-collapse:collapse;width:100%;margin-bottom:28px;">
    <tr>
      <td style="padding:5px 20px 5px 0;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;white-space:nowrap;vertical-align:top;">Gallery</td>
      <td style="padding:5px 0;font-size:14px;color:#1a1810;">${esc(portal.title) || '(untitled)'}</td>
    </tr>
    <tr>
      <td style="padding:5px 20px 5px 0;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;white-space:nowrap;vertical-align:top;">Project</td>
      <td style="padding:5px 0;font-size:13px;font-family:monospace;color:#555;">${esc(portal.projectId)}</td>
    </tr>
    <tr>
      <td style="padding:5px 20px 5px 0;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;white-space:nowrap;vertical-align:top;">Hearted</td>
      <td style="padding:5px 0;font-size:14px;color:#1a1810;font-weight:600;">${heartedCount} image${heartedCount !== 1 ? 's' : ''}${voiceCount > 0 ? ` · ${voiceCount} voice note${voiceCount !== 1 ? 's' : ''}` : ''}</td>
    </tr>
    <tr>
      <td style="padding:5px 20px 5px 0;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;white-space:nowrap;vertical-align:top;">Submitted</td>
      <td style="padding:5px 0;font-size:13px;color:#555;">${new Date(portal.submittedAt).toLocaleString('en-US', { dateStyle:'long', timeStyle:'short' })}</td>
    </tr>
  </table>
  <p style="margin:0 0 10px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;">Client feedback</p>
  <table style="border-collapse:collapse;width:100%;border-top:1px solid #e8e4dc;">
    ${imageRows}
  </table>
</div>
</body></html>`;

  const { error } = await resend.emails.send({
    from:    'Aldo Gallery <onboarding@resend.dev>',
    to:      [to],
    subject,
    html,
  });
  if (error) throw new Error(error.message);
  console.log(`[email] Submission notification sent to ${to} for portal ${portal.token}`);
}

async function _sendGallerySubmitEmail({ gallery, selected, submittedAt }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('[email] RESEND_API_KEY not set — skipping gallery notification'); return; }

  const resend  = new Resend(apiKey);
  const to      = process.env.NOTIFY_EMAIL || 'aldo@aldocarrera.com';
  const selCount = selected.filter(s => s.label === 'SELECT').length;
  const altCount = selected.filter(s => s.label === 'ALT').length;
  const subject = `Gallery submitted: ${gallery.name || gallery.token} · ${selCount} select${altCount > 0 ? `, ${altCount} alt` : ''}`;

  const imageRows = selected.length > 0
    ? selected.map(s => `
        <tr>
          <td style="padding:6px 16px 6px 0;font-size:11px;font-weight:600;letter-spacing:.06em;color:${s.label === 'SELECT' ? '#1a6a1a' : '#555'};white-space:nowrap;">${s.label}</td>
          <td style="padding:6px 16px 6px 0;font-size:13px;font-family:monospace;color:#1a1810;">${s.filename}</td>
          <td style="padding:6px 0;font-size:13px;color:#666;">${s.note || ''}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:6px 0;color:#999;font-size:13px;font-style:italic;">No images selected</td></tr>`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#fafaf8;">
<div style="max-width:560px;margin:40px auto;padding:32px 28px;background:#fff;border:1px solid #e8e4dc;font-family:'IBM Plex Mono',monospace,sans-serif;">
  <p style="margin:0 0 4px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#999;">Aldo Carrera</p>
  <h1 style="margin:0 0 28px;font-size:18px;font-weight:600;letter-spacing:.04em;color:#1a1810;">Gallery Submitted</h1>
  <table style="border-collapse:collapse;width:100%;margin-bottom:28px;">
    <tr>
      <td style="padding:5px 20px 5px 0;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;white-space:nowrap;">Gallery</td>
      <td style="padding:5px 0;font-size:14px;color:#1a1810;">${gallery.name || '(untitled)'}</td>
    </tr>
    <tr>
      <td style="padding:5px 20px 5px 0;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;white-space:nowrap;">Selected</td>
      <td style="padding:5px 0;font-size:14px;color:#1a1810;font-weight:600;">${selCount} select · ${altCount} alt</td>
    </tr>
    <tr>
      <td style="padding:5px 20px 5px 0;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;white-space:nowrap;">Submitted</td>
      <td style="padding:5px 0;font-size:13px;color:#555;">${new Date(submittedAt).toLocaleString('en-US', { dateStyle:'long', timeStyle:'short' })}</td>
    </tr>
  </table>
  <p style="margin:0 0 10px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#999;">Selections</p>
  <table style="border-collapse:collapse;width:100%;border-top:1px solid #e8e4dc;">
    ${imageRows}
  </table>
</div>
</body></html>`;

  const { error } = await resend.emails.send({
    from:    'Aldo Gallery <onboarding@resend.dev>',
    to:      [to],
    subject,
    html,
  });
  if (error) throw new Error(error.message);
  console.log(`[email] Gallery submit notification sent to ${to} for gallery ${gallery.token}`);
}

function _fmtPortalBytes(n) {
  if (!n) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' MB';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + ' KB';
  return n + ' B';
}

/* ------------------------------------------------------------------ */
/* Debug endpoint (no auth)                                            */
/* ------------------------------------------------------------------ */

app.get('/api/debug', async (req, res) => {
  // Public callers (the Docker healthcheck) only learn that the server is up;
  // the project inventory below includes private project IDs.
  if (!req.auth?.valid) return res.json({ ok: true, server: 'nas-express' });
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
/* Health + backups                                                    */
/* ------------------------------------------------------------------ */

/* GET /api/health — public, for the uptime monitor (.github/workflows).
   200 when everything checks out, 503 with the failing checks otherwise.
   Reveals nothing beyond pass/fail per check. */
app.get('/api/health', async (req, res) => {
  const checks = {};
  const t = async (name, fn) => {
    try { checks[name] = (await fn()) ?? true; } catch (err) { checks[name] = false; console.warn(`[health] ${name}:`, err?.message); }
  };
  await t('data', async () => (await readProjects()).projects.length > 0);
  await t('disk', async () => {
    const st = await fs.promises.statfs(IMAGES_DIR);
    return (st.bavail * st.bsize) / (1024 ** 3) > 20;     // > 20 GB free
  });
  await t('dropbox', async () => !!(await getDropboxToken()));
  // Backups: fail only when one is overdue (>36h), not before the first run.
  checks.backup = !backupStatus.lastSuccessAt
    || (Date.now() - Date.parse(backupStatus.lastSuccessAt)) < 36 * 3600 * 1000;
  const ok = Object.values(checks).every(Boolean);
  res.setHeader('Cache-Control', 'no-store');
  res.status(ok ? 200 : 503).json({ ok, checks });
});

app.get('/api/admin/backup-status', (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json(backupStatus);
});

app.post('/api/admin/backup-now', (req, res) => {
  if (!requireAuth(req, res)) return;
  if (!backupStatus.running) runBackup({ dataDir: DATA_DIR, imagesDir: IMAGES_DIR });
  res.status(202).json({ started: true });
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

/* ══════════════════════════════════════════════════════════════════
   UNIFIED GALLERIES  (/api/ug/*)
   New merged gallery system. Coexists with the legacy /api/galleries
   and /api/gallery-portals routes until cutover (UNIFIED-GALLERY-PLAN.md).
   ══════════════════════════════════════════════════════════════════ */

/* Session key for client access. Derived from token + the secret
   (pin or password). 'open' galleries need no key. */
function _ugKey(gallery) {
  const secret = gallery.auth?.type === 'pin' ? gallery.auth.pin
               : gallery.auth?.type === 'password' ? gallery.auth.password
               : '';
  return _galleryHmac(`ug:${gallery.token}:${secret}`).slice(0, 24);
}
function _ugCheckKey(gallery, req) {
  if (gallery.auth?.type === 'open') return true;
  const key = req.query.key || req.body?.key || req.headers['x-gallery-key'] || '';
  return key === _ugKey(gallery);
}

/* Resolve the bytes for a version. New uploads live in the gallery-owned dir;
   MIGRATED galleries' v1 references the source project's image bytes (no copy
   was made), so fall back to the project dir by filename. */
function _ugFilePath(gallery, img, version) {
  const owned = UG.galleryImagePath(gallery.token, img.filename, version.versionId);
  if (fs.existsSync(owned)) return owned;
  if (gallery.projectId) {
    const proj = path.join(IMAGES_DIR, gallery.projectId, img.filename);
    if (fs.existsSync(proj)) return proj;
  }
  return owned; // caller checks existsSync → 404 if truly missing
}

/* Disk-storage multer for gallery batch uploads — streams to a tmp dir so a
   large batch never balloons RAM. Files moved into place by the route. */
const ugUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const dir = path.join(IMAGES_DIR, '__ug_tmp');
      try { await fs.promises.mkdir(dir, { recursive: true }); cb(null, dir); }
      catch (e) { cb(e); }
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}_${Math.random().toString(36).slice(2,8)}_${UG.sanitizeName(file.originalname)}`),
  }),
  limits: { fileSize: 150 * 1024 * 1024 }, // 150 MB/file; no count cap
});

/* Shape an image for the client view: main version src + feedback for that version. */
function _ugViewImage(token, img) {
  const main = UG.mainVersion(img);
  return {
    filename: img.filename,
    src:      main?.blobPath || null,
    versionId: main?.versionId || null,
    versionCount: img.versions.length,
    feedback: img.feedback?.[main?.versionId] || null,
  };
}

/* ── Admin: list / create / read / update / delete ──────── */

app.get('/api/ug', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { galleries } = await UG.readUnifiedGalleries();
    // Summary only — don't ship every markup in the list view
    const list = galleries.map(g => {
      const imgs = Object.values(g.images || {});
      let feedbackCount = 0, markupCount = 0;
      for (const im of imgs) {
        for (const fb of Object.values(im.feedback || {})) {
          if (fb.label || fb.stars || fb.note || fb.markups?.length || fb.voiceMarkups?.length || fb.voiceNote) feedbackCount++;
          markupCount += (fb.markups?.length || 0);
        }
      }
      return {
        token: g.token, mode: g.mode, title: g.title, clientName: g.clientName,
        projectId: g.projectId, authType: g.auth?.type, pin: g.auth?.pin || null,
        features: g.features, imageCount: imgs.length, rounds: (g.rounds || []).length,
        feedbackCount, markupCount, status: g.status, submitted: g.submitted,
        submittedAt: g.submittedAt, createdAt: g.createdAt,
      };
    });
    res.json({ galleries: list });
  } catch (err) {
    console.error('[GET /api/ug]', err?.message);
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/ug', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { mode, title, clientName, projectId, pin, features } = req.body || {};
    if (mode && !['review', 'delivery'].includes(mode)) return res.status(422).json({ error: 'bad_mode' });
    if (pin && !/^\d{4}$/.test(String(pin))) return res.status(422).json({ error: 'bad_pin', message: 'PIN must be 4 digits' });
    const gallery = await UG.createUnified({ mode, title, clientName, projectId, pin, features });
    res.status(201).json(gallery);
  } catch (err) {
    console.error('[POST /api/ug]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

app.get('/api/ug/:token', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const g = await UG.findUnified(req.params.token);
    if (!g) return res.status(404).json({ error: 'not_found' });
    res.json({ ...g, sessionKey: _ugKey(g) }); // admin sees the client key (to preview/share)
  } catch (err) {
    console.error('[GET /api/ug/:token]', err?.message);
    res.status(500).json({ error: 'internal' });
  }
});

app.patch('/api/ug/:token', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const patch = {};
    const b = req.body || {};
    if (typeof b.title === 'string')      patch.title = b.title;
    if (typeof b.clientName === 'string') patch.clientName = b.clientName;
    if (b.mode && ['review','delivery'].includes(b.mode)) patch.mode = b.mode;
    if (b.features && typeof b.features === 'object')      patch.features = b.features;
    if (b.status && ['open','submitted','archived'].includes(b.status)) patch.status = b.status;
    if (b.auth && typeof b.auth === 'object') {
      if (b.auth.type === 'pin' && !/^\d{4}$/.test(String(b.auth.pin || ''))) {
        return res.status(422).json({ error: 'bad_pin' });
      }
      patch.auth = b.auth;
    }
    const updated = await UG.updateUnified(req.params.token, patch);
    if (!updated) return res.status(404).json({ error: 'not_found' });
    res.json(updated);
  } catch (err) {
    console.error('[PATCH /api/ug/:token]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

app.delete('/api/ug/:token', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const ok = await UG.deleteUnified(req.params.token);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    // Best-effort: remove this gallery's owned image bytes
    fs.promises.rm(path.join(IMAGES_DIR, '__galleries', UG.sanitizeName(req.params.token)), { recursive: true, force: true }).catch(() => {});
    res.status(204).end();
  } catch (err) {
    console.error('[DELETE /api/ug/:token]', err?.message);
    res.status(500).json({ error: 'internal' });
  }
});

/* ── Admin: batch image upload (initial round or version layer) ──────
   ?mode=initial → add everything as round 1
   ?mode=version → match by filename, layer matched, ignore non-matching */
app.post('/api/ug/:token/upload', ugUpload.array('files'), async (req, res) => {
  if (!requireAuth(req, res)) {
    // clean up any tmp files multer wrote before auth failed
    for (const f of req.files || []) fs.promises.unlink(f.path).catch(() => {});
    return;
  }
  try {
    const data = await UG.readUnifiedGalleries();
    const idx = data.galleries.findIndex(g => g.token === req.params.token);
    if (idx === -1) {
      for (const f of req.files || []) fs.promises.unlink(f.path).catch(() => {});
      return res.status(404).json({ error: 'not_found' });
    }
    const gallery = data.galleries[idx];
    const uploadMode = req.query.mode === 'version' ? 'version' : 'initial';
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'no_files' });

    // Normalize incoming names with the SAME sanitization the storage uses,
    // so 'Foo Bar 001.jpg' coming off the user's disk matches a stored
    // 'Foo_Bar_001.jpg'. We still echo the original name back in the report
    // so the UI shows what the user uploaded.
    const incoming = files.map(f => ({
      original: f.originalname,
      filename: UG.sanitizeName(f.originalname),
      _tmp: f.path,
    }));

    let report;
    if (uploadMode === 'version') {
      // Determine which match (by sanitized name) before moving bytes
      const matchedSet = new Set(incoming.filter(i => gallery.images[i.filename]).map(i => i.original));
      // Discard ignored tmp files
      for (const f of files) if (!matchedSet.has(f.originalname)) fs.promises.unlink(f.path).catch(() => {});
      const toLayer = incoming.filter(i => matchedSet.has(i.original));
      // Move matched bytes into place + assign blobPath
      const placed = [];
      for (const it of toLayer) {
        const img = gallery.images[it.filename];
        const vid = UG.nextVersionId(img);
        const dest = UG.galleryImagePath(gallery.token, it.filename, vid);
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await _moveFile(it._tmp, dest);
        placed.push({ filename: it.filename, blobPath: `${PUBLIC_URL}/api/ug/${gallery.token}/image/${encodeURIComponent(it.filename)}?v=${vid}` });
      }
      report = UG.layerVersions(gallery, placed);
    } else {
      // initial: move all bytes, all become v1 (or a fresh version if re-adding)
      const placed = [];
      for (const it of incoming) {
        const fn = it.filename;
        const existing = gallery.images[fn];
        const vid = existing ? UG.nextVersionId(existing) : 'v1';
        const dest = UG.galleryImagePath(gallery.token, fn, vid);
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await _moveFile(it._tmp, dest);
        placed.push({ filename: fn, blobPath: `${PUBLIC_URL}/api/ug/${gallery.token}/image/${encodeURIComponent(fn)}?v=${vid}` });
      }
      report = UG.addInitialImages(gallery, placed);
    }

    data.galleries[idx] = gallery;
    await UG.writeUnifiedGalleries(data);
    res.json({ ok: true, mode: uploadMode, ...report });
  } catch (err) {
    for (const f of req.files || []) fs.promises.unlink(f.path).catch(() => {});
    console.error('[POST /api/ug/:token/upload]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

async function _moveFile(src, dest) {
  // IMPORTANT: do NOT use fs.rename here. On this Synology bind mount, rename
  // can silently no-op across the overlay (the version record gets written but
  // the bytes never land), and confirmed via test: cp/copyFile WORKS where
  // rename doesn't. copyFile uses the same create-write semantics as the
  // project-image writeBytes path, which is proven on this volume.
  await fs.promises.copyFile(src, dest);
  // Verify the destination actually has bytes before discarding the temp file.
  const st = await fs.promises.stat(dest).catch(() => null);
  if (!st || st.size === 0) throw new Error(`copy verification failed for ${dest}`);
  await fs.promises.unlink(src).catch(() => {});
}

/* ── Admin: set which version is "main" for an image ──── */
app.post('/api/ug/:token/images/:filename/set-main', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const data = await UG.readUnifiedGalleries();
    const idx = data.galleries.findIndex(g => g.token === req.params.token);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const { versionId } = req.body || {};
    const ok = UG.setMain(data.galleries[idx], req.params.filename, versionId);
    if (!ok) return res.status(404).json({ error: 'image_or_version_not_found' });
    await UG.writeUnifiedGalleries(data);
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST set-main]', err?.message);
    res.status(500).json({ error: 'internal' });
  }
});

/* ── Image bytes (gallery-owned). ?v=versionId for a specific version,
   else the main version. Optional ?w=NNN resize via the shared cache. ── */
app.get('/api/ug/:token/image/:filename', async (req, res) => {
  try {
    const g = await UG.findUnified(req.params.token);
    if (!g) return res.status(404).end();
    const img = g.images?.[req.params.filename];
    if (!img) return res.status(404).end();
    const v = req.query.v
      ? img.versions.find(x => x.versionId === req.query.v)
      : UG.mainVersion(img);
    if (!v) return res.status(404).end();
    const filePath = _ugFilePath(g, img, v);
    if (!fs.existsSync(filePath)) return res.status(404).end();

    const wRaw = parseInt(req.query.w, 10);
    if (wRaw > 0 && wRaw < 4000) {
      const w = _snapW(wRaw);
      const resized = await _resizedCached(
        `ug_${g.token}`, `${img.filename}@${v.versionId}`, w,
        () => fs.promises.readFile(filePath).catch(() => null)
      );
      if (!resized) return res.status(404).end();
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(resized);
    }
    res.setHeader('Content-Type', contentTypeFor(img.filename));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[GET /api/ug/:token/image]', err?.message);
    if (!res.headersSent) res.status(500).end();
  }
});

/* ── Client: peek (public, no secret) — tells the unlock screen which
   credential to ask for. Leaks gallery existence + auth type only,
   never the secret. ── */
app.get('/api/ug/:token/peek', async (req, res) => {
  try {
    const g = await UG.findUnified(req.params.token);
    if (!g) return res.status(404).json({ error: 'not_found' });
    res.json({ exists: true, authType: g.auth?.type || 'open', title: g.title || '', mode: g.mode || 'review' });
  } catch (err) { res.status(500).json({ error: 'internal' }); }
});

/* ── Client: unlock (pin/password) → session key ──────── */
app.post('/api/ug/:token/unlock', async (req, res) => {
  try {
    const g = await UG.findUnified(req.params.token);
    if (!g) return res.status(404).json({ error: 'not_found' });
    if (g.auth?.type === 'open') {
      return res.json({ ok: true, key: '', title: g.title, mode: g.mode, features: g.features });
    }
    if (_unlockBlocked(req, res, g.token)) return;
    const supplied = g.auth.type === 'pin' ? String(req.body?.pin || '') : String(req.body?.password || '');
    const secret   = g.auth.type === 'pin' ? String(g.auth.pin || '')     : String(g.auth.password || '');
    if (!supplied || supplied !== secret) {
      _unlockFailed(req, g.token);
      return res.status(403).json({ error: 'wrong_credentials' });
    }
    res.json({ ok: true, key: _ugKey(g), title: g.title, mode: g.mode, features: g.features });
  } catch (err) {
    console.error('[POST /api/ug/:token/unlock]', err?.message);
    res.status(500).json({ error: 'internal' });
  }
});

/* ── Client: view (main versions + feedback + features) ── */
app.get('/api/ug/:token/view', async (req, res) => {
  try {
    const g = await UG.findUnified(req.params.token);
    if (!g) return res.status(404).json({ error: 'not_found' });
    if (!_ugCheckKey(g, req)) return res.status(403).json({ error: 'forbidden' });
    const images = Object.values(g.images || {})
      .map(img => _ugViewImage(g.token, img));
    res.json({
      title: g.title, mode: g.mode, features: g.features,
      images, submitted: g.submitted, submittedAt: g.submittedAt,
    });
  } catch (err) {
    console.error('[GET /api/ug/:token/view]', err?.message);
    res.status(500).json({ error: 'internal' });
  }
});

/* ── Client: feedback on the MAIN version of an image ──── */
app.patch('/api/ug/:token/feedback/:filename', async (req, res) => {
  try {
    const data = await UG.readUnifiedGalleries();
    const idx = data.galleries.findIndex(g => g.token === req.params.token);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const g = data.galleries[idx];
    if (!_ugCheckKey(g, req)) return res.status(403).json({ error: 'forbidden' });
    const img = g.images?.[req.params.filename];
    if (!img) return res.status(404).json({ error: 'image_not_found' });
    const main = UG.mainVersion(img);
    const fb = img.feedback[main.versionId] || (img.feedback[main.versionId] = { label:null,stars:0,note:'',markups:[],voiceMarkups:[],voiceNote:null });

    const b = req.body || {};
    if ('label' in b) fb.label = (['SELECT','ALT','KILL',null].includes(b.label)) ? b.label : fb.label;
    if ('stars' in b) fb.stars = Math.max(0, Math.min(5, parseInt(b.stars, 10) || 0));
    if ('note'  in b) fb.note  = String(b.note || '').slice(0, 1000);

    await UG.writeUnifiedGalleries(data);
    res.json({ ok: true, feedback: fb });
  } catch (err) {
    console.error('[PATCH /api/ug feedback]', err?.message);
    res.status(500).json({ error: 'internal' });
  }
});

/* ── Client: add / delete a markup on the MAIN version ─── */
app.post('/api/ug/:token/feedback/:filename/markup', async (req, res) => {
  try {
    const data = await UG.readUnifiedGalleries();
    const idx = data.galleries.findIndex(g => g.token === req.params.token);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const g = data.galleries[idx];
    if (!_ugCheckKey(g, req)) return res.status(403).json({ error: 'forbidden' });
    const img = g.images?.[req.params.filename];
    if (!img) return res.status(404).json({ error: 'image_not_found' });
    const main = UG.mainVersion(img);
    const fb = img.feedback[main.versionId];
    const { markup } = req.body || {};
    if (!markup || !markup.tool) return res.status(400).json({ error: 'bad_markup' });
    markup.id = markup.id || `mk_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    markup._v = 2;
    fb.markups.push(markup);
    await UG.writeUnifiedGalleries(data);
    res.json({ ok: true, markup });
  } catch (err) {
    console.error('[POST /api/ug markup]', err?.message);
    res.status(500).json({ error: 'internal' });
  }
});

/* Update a markup (currently just its comment). */
app.patch('/api/ug/:token/feedback/:filename/markup/:markupId', async (req, res) => {
  try {
    const data = await UG.readUnifiedGalleries();
    const idx = data.galleries.findIndex(g => g.token === req.params.token);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const g = data.galleries[idx];
    if (!_ugCheckKey(g, req)) return res.status(403).json({ error: 'forbidden' });
    const img = g.images?.[req.params.filename];
    if (!img) return res.status(404).json({ error: 'image_not_found' });
    let target = null;
    for (const fb of Object.values(img.feedback || {})) {
      target = (fb.markups || []).find(m => m.id === req.params.markupId);
      if (target) break;
    }
    if (!target) return res.status(404).json({ error: 'markup_not_found' });
    if ('comment' in (req.body || {})) target.comment = String(req.body.comment || '').slice(0, 500);
    await UG.writeUnifiedGalleries(data);
    res.json({ ok: true, markup: target });
  } catch (err) {
    console.error('[PATCH /api/ug markup]', err?.message);
    res.status(500).json({ error: 'internal' });
  }
});

app.delete('/api/ug/:token/feedback/:filename/markup/:markupId', async (req, res) => {
  try {
    const data = await UG.readUnifiedGalleries();
    const idx = data.galleries.findIndex(g => g.token === req.params.token);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const g = data.galleries[idx];
    if (!_ugCheckKey(g, req)) return res.status(403).json({ error: 'forbidden' });
    const img = g.images?.[req.params.filename];
    if (!img) return res.status(404).json({ error: 'image_not_found' });
    const main = UG.mainVersion(img);
    const fb = img.feedback[main.versionId];
    fb.markups = (fb.markups || []).filter(m => m.id !== req.params.markupId);
    await UG.writeUnifiedGalleries(data);
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/ug markup]', err?.message);
    res.status(500).json({ error: 'internal' });
  }
});

/* ── Client: positioned voice markup (record audio at an x,y on the MAIN
   version). Reuses the legacy voice-note storage convention. ── */
app.post('/api/ug/:token/feedback/:filename/voice', upload.single('audio'), async (req, res) => {
  try {
    const data = await UG.readUnifiedGalleries();
    const idx = data.galleries.findIndex(g => g.token === req.params.token);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const g = data.galleries[idx];
    if (!_ugCheckKey(g, req)) return res.status(403).json({ error: 'forbidden' });
    if (!req.file?.buffer) return res.status(400).json({ error: 'no_audio' });
    const img = g.images?.[req.params.filename];
    if (!img) return res.status(404).json({ error: 'image_not_found' });

    const x = parseFloat(req.body.x), y = parseFloat(req.body.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return res.status(400).json({ error: 'bad_coords' });

    const main = UG.mainVersion(img);
    const fb   = img.feedback[main.versionId] || (img.feedback[main.versionId] = { label:null,stars:0,note:'',markups:[],voiceMarkups:[],voiceNote:null });
    const id   = `v_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const ext  = _audioExt(req.file.mimetype);
    const audioFile = `${UG.sanitizeName(req.params.filename)}-${id}.${ext}`;
    await writeBytes(`__ug-voice/${g.token}`, audioFile, req.file.buffer);

    const transcript = await _transcribeAudio(req.file.buffer, req.file.mimetype);
    const voiceMarkup = {
      id, x, y,
      file:       audioFile,
      mime:       req.file.mimetype || 'audio/webm',
      transcript: transcript,
      size:       req.file.buffer.length,
      recordedAt: new Date().toISOString(),
      _v:         2,
    };
    fb.voiceMarkups = fb.voiceMarkups || [];
    fb.voiceMarkups.push(voiceMarkup);
    await UG.writeUnifiedGalleries(data);
    res.json({ ok: true, voiceMarkup });
  } catch (err) {
    console.error('[POST /api/ug voice]', err?.message);
    res.status(500).json({ error: 'internal', message: err?.message });
  }
});

/* Serve audio (PIN-gated, public). */
app.get('/api/ug/:token/feedback/:filename/voice/:id', async (req, res) => {
  try {
    const g = await UG.findUnified(req.params.token);
    if (!g) return res.status(404).end();
    if (!_ugCheckKey(g, req)) return res.status(403).end();
    const img = g.images?.[req.params.filename];
    if (!img) return res.status(404).end();
    let vm = null;
    for (const fb of Object.values(img.feedback || {})) {
      const hit = (fb.voiceMarkups || []).find(v => v.id === req.params.id);
      if (hit) { vm = hit; break; }
    }
    if (!vm) return res.status(404).end();
    const bytes = await readBytes(`__ug-voice/${g.token}`, vm.file);
    if (!bytes) return res.status(404).end();
    res.setHeader('Content-Type', vm.mime || 'audio/webm');
    res.send(bytes);
  } catch (err) { if (!res.headersSent) res.status(500).end(); }
});

/* Delete a voice markup. */
app.delete('/api/ug/:token/feedback/:filename/voice/:id', async (req, res) => {
  try {
    const data = await UG.readUnifiedGalleries();
    const idx = data.galleries.findIndex(g => g.token === req.params.token);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const g = data.galleries[idx];
    if (!_ugCheckKey(g, req)) return res.status(403).json({ error: 'forbidden' });
    const img = g.images?.[req.params.filename];
    if (!img) return res.status(404).json({ error: 'image_not_found' });
    let removed = null;
    for (const fb of Object.values(img.feedback || {})) {
      const i = (fb.voiceMarkups || []).findIndex(v => v.id === req.params.id);
      if (i !== -1) { removed = fb.voiceMarkups.splice(i, 1)[0]; break; }
    }
    if (!removed) return res.status(404).json({ error: 'not_found' });
    await UG.writeUnifiedGalleries(data);
    // Best-effort file removal
    if (removed.file) deleteImage(`__ug-voice/${g.token}`, removed.file).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/ug voice]', err?.message);
    res.status(500).json({ error: 'internal' });
  }
});

/* Admin playback (JWT-auth). */
app.get('/api/admin/ug/:token/feedback/:filename/voice/:id', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const g = await UG.findUnified(req.params.token);
    if (!g) return res.status(404).end();
    const img = g.images?.[req.params.filename];
    if (!img) return res.status(404).end();
    let vm = null;
    for (const fb of Object.values(img.feedback || {})) {
      const hit = (fb.voiceMarkups || []).find(v => v.id === req.params.id);
      if (hit) { vm = hit; break; }
    }
    if (!vm) return res.status(404).end();
    const bytes = await readBytes(`__ug-voice/${g.token}`, vm.file);
    if (!bytes) return res.status(404).end();
    res.setHeader('Content-Type', vm.mime || 'audio/webm');
    res.send(bytes);
  } catch (err) { if (!res.headersSent) res.status(500).end(); }
});

/* ── Client: submit ─────────────────────────────────────── */
app.post('/api/ug/:token/submit', async (req, res) => {
  try {
    const data = await UG.readUnifiedGalleries();
    const idx = data.galleries.findIndex(g => g.token === req.params.token);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });
    const g = data.galleries[idx];
    if (!_ugCheckKey(g, req)) return res.status(403).json({ error: 'forbidden' });
    g.submitted = true; g.submittedAt = new Date().toISOString(); g.status = 'submitted';
    await UG.writeUnifiedGalleries(data);

    // Reuse the portal email template (it reads title/token/projectId/submittedAt)
    const feedback = [];
    for (const img of Object.values(g.images)) {
      const main = UG.mainVersion(img);
      const fb = img.feedback?.[main?.versionId];
      if (!fb) continue;
      if (fb.label || (fb.note || '').trim() || fb.voiceNote?.file || fb.markups?.length) {
        feedback.push({
          filename: img.filename,
          hearted: fb.label === 'SELECT',
          note: (fb.note || '').trim() + (fb.markups?.length ? ` [${fb.markups.length} markup${fb.markups.length!==1?'s':''}]` : ''),
          voiceTranscript: fb.voiceNote?.transcript || '',
          hasVoice: !!fb.voiceNote?.file,
        });
      }
    }
    const heartedCount = feedback.filter(f => f.hearted).length;
    _sendSubmitEmail({ portal: { title: g.title, token: g.token, projectId: g.projectId || '', submittedAt: g.submittedAt }, feedback, heartedCount })
      .catch(e => console.error('[email] ug submit failed:', e?.message));

    res.json({ ok: true, submittedAt: g.submittedAt });
  } catch (err) {
    console.error('[POST /api/ug/:token/submit]', err?.message);
    res.status(500).json({ error: 'internal' });
  }
});

/* ── Client: downloads (delivery / when enabled) ───────── */
app.get('/api/ug/:token/download/:filename', async (req, res) => {
  try {
    const g = await UG.findUnified(req.params.token);
    if (!g) return res.status(404).json({ error: 'not_found' });
    if (!_ugCheckKey(g, req)) return res.status(403).json({ error: 'forbidden' });
    if (!g.features?.downloads) return res.status(403).json({ error: 'downloads_disabled' });
    const img = g.images?.[req.params.filename];
    if (!img) return res.status(404).json({ error: 'not_found' });
    const main = UG.mainVersion(img);
    const filePath = _ugFilePath(g, img, main);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file_missing' });
    const safe = img.filename.replace(/[\\"]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(img.filename)}`);
    res.setHeader('Content-Type', contentTypeFor(img.filename));
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[GET /api/ug download]', err?.message);
    if (!res.headersSent) res.status(500).end();
  }
});

app.get('/api/ug/:token/download-zip', async (req, res) => {
  try {
    const g = await UG.findUnified(req.params.token);
    if (!g) return res.status(404).json({ error: 'not_found' });
    if (!_ugCheckKey(g, req)) return res.status(403).json({ error: 'forbidden' });
    if (!g.features?.downloads) return res.status(403).json({ error: 'downloads_disabled' });
    const imgs = Object.values(g.images || {});
    if (!imgs.length) return res.status(400).json({ error: 'no_images' });

    const { default: archiver } = await import('archiver');
    const archive = archiver('zip', { zlib: { level: 0 } });
    const safeTitle = (g.title || g.token).replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.zip"`);
    archive.on('error', (e) => { console.error('[ug zip]', e.message); if (!res.headersSent) res.status(500).end(); });
    archive.pipe(res);
    let added = 0;
    for (const img of imgs) {
      const main = UG.mainVersion(img);
      const fp = _ugFilePath(g, img, main);
      if (fs.existsSync(fp)) { archive.file(fp, { name: img.filename, mode: 0o644 }); added++; }
    }
    if (!added) { res.removeHeader('Content-Disposition'); return res.status(400).json({ error: 'no_files' }); }
    await archive.finalize();
  } catch (err) {
    console.error('[GET /api/ug zip]', err?.message);
    if (!res.headersSent) res.status(500).json({ error: 'zip_failed' });
  }
});

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
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

app.get('/api/analytics', async (req, res) => {
  if (!requireAuth(req, res)) return;

  const [projectsData, galleriesData, videosData] = await Promise.all([
    readProjects().catch(() => ({ projects: [] })),
    readGalleries().catch(() => ({ galleries: [] })),
    readVideos().catch(()    => ({ videos: [] })),
  ]);

  const projects  = projectsData.projects   || [];
  const galleries = galleriesData.galleries || [];
  const videos    = videosData.videos       || [];

  // ── Images aggregation ──────────────────────────────────────────────
  let totalImages = 0, totalStorage = 0, totalSelected = 0;
  let totalFavorite = 0, totalRejected = 0, totalCover = 0;
  const byYear = {}, byType = {}, projectsByClient = {}, byMonth = {};

  for (const p of projects) {
    const imgs = p.images || [];
    totalImages   += imgs.length;
    projectsByClient[p.client || 'Unknown'] = (projectsByClient[p.client || 'Unknown'] || 0) + 1;
    byYear[String(p.year || 'Unknown')]     = (byYear[String(p.year || 'Unknown')] || 0) + imgs.length;
    byType[(p.type || 'Other').toUpperCase()] = (byType[(p.type || 'Other').toUpperCase()] || 0) + imgs.length;

    for (const img of imgs) {
      totalStorage  += img.exif?.fileSize || 0;
      if (img.selected)  totalSelected++;
      if (img.favorite)  totalFavorite++;
      if (img.rejected)  totalRejected++;
      if (img.cover)     totalCover++;
      const dt = img.exif?.dateTaken;
      if (dt) {
        const m = dt.slice(0, 7);
        byMonth[m] = (byMonth[m] || 0) + 1;
      }
    }
  }

  // ── Gallery aggregation ─────────────────────────────────────────────
  let totalViews = 0, neverOpened = 0, galSubmitted = 0, galArchived = 0;
  let totalSelects = 0, totalAlts = 0, totalKills = 0, totalReviewed = 0;
  let totalTurnaroundDays = 0, turnaroundCount = 0;

  const galleryRows = galleries.map(g => {
    const sels   = g.selections || {};
    const vals   = Object.values(sels);
    const sel    = vals.filter(s => s.label === 'SELECT').length;
    const alt    = vals.filter(s => s.label === 'ALT').length;
    const kill   = vals.filter(s => s.label === 'KILL').length;
    const rev    = vals.filter(s => s.label).length;
    totalViews   += (g.viewCount || 0);
    totalSelects += sel;
    totalAlts    += alt;
    totalKills   += kill;
    totalReviewed += rev;
    if (!g.viewCount) neverOpened++;
    if (g.status === 'submitted') {
      galSubmitted++;
      if (g.createdAt && g.submittedAt) {
        const days = (new Date(g.submittedAt) - new Date(g.createdAt)) / 86400000;
        if (days >= 0 && days < 365) { totalTurnaroundDays += days; turnaroundCount++; }
      }
    }
    if (g.status === 'archived') galArchived++;
    return {
      token:       g.token,
      title:       g.title,
      clientName:  g.clientName,
      status:      g.status || 'open',
      viewCount:   g.viewCount   || 0,
      lastViewedAt: g.lastViewedAt || null,
      selects: sel, alts: alt, kills: kill, reviewed: rev,
      createdAt:   g.createdAt   || null,
      submittedAt: g.submittedAt || null,
    };
  });

  const topByViews = galleryRows.slice().sort((a, b) => b.viewCount - a.viewCount).slice(0, 5);
  const avgTurnaround = turnaroundCount > 0 ? Math.round(totalTurnaroundDays / turnaroundCount) : null;

  // ── Upload activity — last 12 months ───────────────────────────────
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return d.toISOString().slice(0, 7);
  });
  const uploadsByMonth = months.map(m => ({ month: m, count: byMonth[m] || 0 }));

  res.json({
    generatedAt: new Date().toISOString(),
    overview: {
      totalProjects:  projects.length,
      publicProjects: projects.filter(p => p.public !== false).length,
      totalImages,
      totalStorage,
      totalSelected,
      totalFavorite,
      totalRejected,
      totalCover,
      totalVideos:    videos.length,
      publicVideos:   videos.filter(v => v.public !== false).length,
    },
    projects: {
      byYear:    Object.entries(byYear).sort((a,b) => b[0].localeCompare(a[0])).map(([year, count]) => ({ year, count })),
      byType:    Object.entries(byType).sort((a,b) => b[1] - a[1]).map(([type, count]) => ({ type, count })),
      byClient:  Object.entries(projectsByClient).sort((a,b) => b[1] - a[1]).slice(0, 12).map(([client, count]) => ({ client, count })),
    },
    galleries: {
      total:        galleries.length,
      open:         galleries.length - galSubmitted - galArchived,
      submitted:    galSubmitted,
      archived:     galArchived,
      totalViews,
      neverOpened,
      totalSelects,
      totalAlts,
      totalKills,
      totalReviewed,
      avgTurnaroundDays: avgTurnaround,
      topByViews,
    },
    activity: { uploadsByMonth },
  });
});

/* ------------------------------------------------------------------ */
/* Google Analytics 4 Data API                                        */
/* ------------------------------------------------------------------ */

app.get('/api/ga-analytics', async (req, res) => {
  if (!requireAuth(req, res)) return;

  const propertyId  = process.env.GA_PROPERTY_ID;
  const credFile    = process.env.GA_CREDENTIALS_FILE;
  const credJson    = process.env.GA_CREDENTIALS_JSON;

  if (!propertyId || (!credFile && !credJson)) {
    return res.status(503).json({
      error:   'not_configured',
      message: 'Set GA_PROPERTY_ID + GA_CREDENTIALS_FILE (or GA_CREDENTIALS_JSON) on the NAS.',
    });
  }

  let credentials;
  try {
    const raw = credFile ? fs.readFileSync(credFile, 'utf8') : credJson;
    credentials = JSON.parse(raw);
  } catch (e) {
    return res.status(500).json({
      error:   'invalid_credentials',
      message: `Could not parse GA credentials: ${e.message}`,
    });
  }

  try {
    const { BetaAnalyticsDataClient } = await import('@google-analytics/data');
    const client   = new BetaAnalyticsDataClient({ credentials });
    const property = `properties/${propertyId}`;
    const dateRange = { startDate: '28daysAgo', endDate: 'today' };

    const [
      overviewRes,
      topPagesRes,
      acquisitionRes,
      deviceRes,
      countryRes,
      realtimeRes,
      ageRes,
      genderRes,
    ] = await Promise.all([
      // 28-day overview
      client.runReport({
        property,
        dateRanges: [dateRange],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'newUsers' },
        ],
      }),
      // Top 10 pages
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics:    [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
        orderBys:   [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),
      // Traffic acquisition channels
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
        orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }),
      // Device categories
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: 'deviceCategory' }],
        metrics:    [{ name: 'sessions' }, { name: 'activeUsers' }],
        orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
      }),
      // Top countries
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: 'country' }],
        metrics:    [{ name: 'sessions' }],
        orderBys:   [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }),
      // Realtime active users
      client.runRealtimeReport({
        property,
        metrics: [{ name: 'activeUsers' }],
      }),
      // Age brackets (requires Demographics & Interests enabled in GA4)
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: 'userAgeBracket' }],
        metrics:    [{ name: 'activeUsers' }],
        orderBys:   [{ metric: { metricName: 'activeUsers' }, desc: true }],
      }).catch(() => [{ rows: [] }]),
      // Gender (requires Demographics & Interests enabled in GA4)
      client.runReport({
        property,
        dateRanges: [dateRange],
        dimensions: [{ name: 'userGender' }],
        metrics:    [{ name: 'activeUsers' }],
        orderBys:   [{ metric: { metricName: 'activeUsers' }, desc: true }],
      }).catch(() => [{ rows: [] }]),
    ]);

    const getVal = (row, idx) => row.metricValues?.[idx]?.value    || '0';
    const getDim = (row, idx) => row.dimensionValues?.[idx]?.value || '';

    const overviewRow = overviewRes[0].rows?.[0];
    const overview = overviewRow ? {
      users:         parseInt(getVal(overviewRow, 0), 10),
      sessions:      parseInt(getVal(overviewRow, 1), 10),
      pageViews:     parseInt(getVal(overviewRow, 2), 10),
      bounceRate:    parseFloat(getVal(overviewRow, 3)),
      avgSessionDur: parseFloat(getVal(overviewRow, 4)),
      newUsers:      parseInt(getVal(overviewRow, 5), 10),
    } : { users: 0, sessions: 0, pageViews: 0, bounceRate: 0, avgSessionDur: 0, newUsers: 0 };

    const topPages = (topPagesRes[0].rows || []).map(row => ({
      path:  getDim(row, 0),
      title: getDim(row, 1),
      views: parseInt(getVal(row, 0), 10),
      users: parseInt(getVal(row, 1), 10),
    }));

    const acquisition = (acquisitionRes[0].rows || []).map(row => ({
      channel:  getDim(row, 0),
      sessions: parseInt(getVal(row, 0), 10),
      users:    parseInt(getVal(row, 1), 10),
    }));

    const devices = (deviceRes[0].rows || []).map(row => ({
      device:   getDim(row, 0),
      sessions: parseInt(getVal(row, 0), 10),
      users:    parseInt(getVal(row, 1), 10),
    }));

    const countries = (countryRes[0].rows || []).map(row => ({
      country:  getDim(row, 0),
      sessions: parseInt(getVal(row, 0), 10),
    }));

    const realtimeActiveUsers = parseInt(
      realtimeRes[0].rows?.[0]?.metricValues?.[0]?.value || '0',
      10,
    );

    const ageGroups = (ageRes[0].rows || [])
      .filter(row => getDim(row, 0) && getDim(row, 0) !== '(not set)')
      .map(row => ({ age: getDim(row, 0), users: parseInt(getVal(row, 0), 10) }));

    const genders = (genderRes[0].rows || [])
      .filter(row => getDim(row, 0) && getDim(row, 0) !== '(not set)' && getDim(row, 0) !== 'unknown')
      .map(row => ({ gender: getDim(row, 0), users: parseInt(getVal(row, 0), 10) }));

    res.json({
      period:      '28daysAgo to today',
      generatedAt: new Date().toISOString(),
      realtime:    { activeUsers: realtimeActiveUsers },
      overview,
      topPages,
      acquisition,
      devices,
      countries,
      ageGroups,
      genders,
    });
  } catch (err) {
    console.error('[ga-analytics] API error:', err?.message, err?.code);
    res.status(500).json({
      error:   'api_error',
      message: err?.message || 'Unknown GA4 API error',
      code:    err?.code,
    });
  }
});

/* ------------------------------------------------------------------ */
/* Dropbox AI curation endpoints                                       */
/* ------------------------------------------------------------------ */

// In-memory job stores (per-process; restarting the server clears jobs —
// the admin UI reports a vanished job instead of polling forever).
const _curateJobs = new Map();
const _importJobs = new Map();
const _JOB_TTL = 2 * 60 * 60 * 1000;

function _makeJobId(kind = 'curate') {
  return kind + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/* Finished jobs hold thumbnails and results; drop them after two hours so a
   long-running container doesn't accumulate every job it ever ran. */
function _sweepJobs(jobs) {
  const cutoff = Date.now() - _JOB_TTL;
  for (const [id, job] of jobs) {
    if (job.finishedAt && job.finishedAt < cutoff) jobs.delete(id);
  }
}

// Capture One keeps cache/proxy files inside the shoot folder, and dot-folders
// are system junk — neither holds photos worth rating.
const _SKIP_DIR = /(^|\/)(\.[^/]*|CaptureOne)\//i;
// Formats browsers can't show and Dropbox can't thumbnail. Only used when a
// shot exists in nothing else.
const _NON_WEB_EXT = new Set(['cr3', 'nef', 'arw', 'dng', 'raf', 'rw2', 'heic']);

/* Collapse a recursive listing to one entry per shot. Shoots are often
   delivered as the same frames at several sizes ("FULL RES" + "LOW RES",
   "Full Resolution/FULL RES"), with identical filenames. Each shot is rated
   once — thumbnailing its smallest copy, which Dropbox renders fastest — and
   imported from its largest. */
function _uniqueShots(entries, folderPath) {
  const base = folderPath.replace(/\/+$/, '');
  const byStem = new Map();
  for (const e of entries) {
    if (e['.tag'] !== 'file' || !isImageFile(e.name)) continue;
    const rel = e.path_display.slice(base.length + 1);
    if (_SKIP_DIR.test(rel)) continue;
    const stem = e.name.replace(/\.[^.]+$/, '').toLowerCase();
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(e);
  }
  const shots = [];
  for (const copies of byStem.values()) {
    const web = copies.filter(c => !_NON_WEB_EXT.has(c.name.split('.').pop().toLowerCase()));
    const pool = (web.length ? web : copies).sort((a, b) => (a.size || 0) - (b.size || 0));
    const largest = pool[pool.length - 1];
    shots.push({
      importPath: largest.path_display,
      thumbPath:  pool[0].path_display,
      label:      largest.path_display.slice(base.length + 1),
    });
  }
  shots.sort((a, b) => a.label.localeCompare(b.label));
  return { shots, duplicates: [...byStem.values()].reduce((n, c) => n + c.length - 1, 0) };
}

/* Run `fn` over `items` with at most `limit` in flight. */
async function _mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

/** GET /api/dropbox/folders — list root folders */
/* One paginated listing of the Dropbox root (~4s for ~800 folders). Image
   counts used to be computed here too — one listing per folder — which grew
   to ~60s and brushed Cloudflare's 100s proxy timeout. The picker now asks
   for counts per folder via /api/dropbox/folder-count. Cached 5 minutes;
   ?refresh=1 forces a re-fetch. */
let _dbxFoldersCache = { at: 0, folders: null };
const _DBX_FOLDERS_TTL = 5 * 60 * 1000;

app.get('/api/dropbox/folders', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    if (!isDropboxConfigured()) {
      return res.json({ error: 'Dropbox not configured — set DROPBOX_APP_KEY + DROPBOX_APP_SECRET + DROPBOX_REFRESH_TOKEN', folders: [] });
    }

    if (!req.query.refresh && _dbxFoldersCache.folders && Date.now() - _dbxFoldersCache.at < _DBX_FOLDERS_TTL) {
      return res.json({ folders: _dbxFoldersCache.folders, cached: true });
    }

    const rootEntries = await listFolder(null, '', { mediaInfo: false });
    const folders = rootEntries
      .filter(e => e['.tag'] === 'folder')
      .map(f => ({ name: f.name, path: f.path_display, imageCount: null }))
      .sort((a, b) => a.name.localeCompare(b.name));

    _dbxFoldersCache = { at: Date.now(), folders };
    res.json({ folders });
  } catch (err) {
    console.error('[dropbox/folders] FATAL:', err?.message, err?.stack);
    res.status(500).json({ error: 'internal', message: err?.message || 'Unknown error' });
  }
});

/** GET /api/dropbox/folder-count?path= — photos in a folder, subfolders included */
const _dbxCountCache = new Map(); // path → { at, imageCount, duplicates }

app.get('/api/dropbox/folder-count', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const folderPath = String(req.query.path || '');
    if (!folderPath) return res.status(400).json({ error: 'validation', message: '`path` is required' });

    const hit = _dbxCountCache.get(folderPath);
    if (hit && Date.now() - hit.at < _DBX_FOLDERS_TTL) {
      return res.json({ path: folderPath, imageCount: hit.imageCount, duplicates: hit.duplicates, cached: true });
    }

    const entries = await listFolder(null, folderPath, { mediaInfo: false, recursive: true });
    const { shots, duplicates } = _uniqueShots(entries, folderPath);
    _dbxCountCache.set(folderPath, { at: Date.now(), imageCount: shots.length, duplicates });
    res.json({ path: folderPath, imageCount: shots.length, duplicates });
  } catch (err) {
    console.error('[dropbox/folder-count] FATAL:', err?.message, err?.stack);
    res.status(500).json({ error: 'internal', message: err?.message || 'Unknown error' });
  }
});

/** POST /api/dropbox/curate — start async curation job */
app.post('/api/dropbox/curate', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    if (!isDropboxConfigured()) {
      return res.status(503).json({ error: 'Dropbox not configured — set DROPBOX_APP_KEY + DROPBOX_APP_SECRET + DROPBOX_REFRESH_TOKEN' });
    }

    const { folders, targetCount = 15, direct = false } = req.body || {};
    if (!Array.isArray(folders) || folders.length === 0) {
      return res.status(400).json({ error: 'validation', message: '`folders` array is required' });
    }

    _sweepJobs(_curateJobs);
    const jobId = _makeJobId('curate');
    const job = {
      id: jobId,
      status: 'running',
      phase: 'Starting…',
      foldersDone: 0,
      foldersTotal: folders.length,
      results: [],
      error: null,
      direct: !!direct,
      finishedAt: null,
    };
    _curateJobs.set(jobId, job);

    // Fire off async — do NOT await
    _runCurationJob(job, folders, targetCount, !!direct).catch(err => {
      job.status = 'error';
      job.error = err?.message || 'Unknown error';
      job.finishedAt = Date.now();
      console.error('[_runCurationJob] uncaught:', err?.message, err?.stack);
    });

    res.json({ jobId });
  } catch (err) {
    console.error('[dropbox/curate] FATAL:', err?.message, err?.stack);
    res.status(500).json({ error: 'internal', message: err?.message || 'Unknown error' });
  }
});

/** GET /api/dropbox/curate/:jobId — poll job status */
app.get('/api/dropbox/curate/:jobId', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const job = _curateJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job_not_found' });
  res.json(job);
});

/** POST /api/dropbox/import — start async import of approved images */
/* Importing downloads full-resolution originals (often 40MB+ each) and
   processes them with sharp — minutes of work. Run it as a background job
   the admin polls, like curation: a request that long would hit
   Cloudflare's 100s proxy timeout and report failure while the import
   carried on unseen. */
app.post('/api/dropbox/import', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    if (!isDropboxConfigured()) {
      return res.status(503).json({ error: 'Dropbox not configured — set DROPBOX_APP_KEY + DROPBOX_APP_SECRET + DROPBOX_REFRESH_TOKEN' });
    }

    const { foldersToImport } = req.body || {};
    if (!Array.isArray(foldersToImport) || foldersToImport.length === 0) {
      return res.status(400).json({ error: 'validation', message: '`foldersToImport` array is required' });
    }
    const specs = foldersToImport.filter(f =>
      f && f.projectName && Array.isArray(f.imageDropboxPaths) && f.imageDropboxPaths.length > 0);
    if (specs.length === 0) {
      return res.status(400).json({ error: 'validation', message: 'Nothing to import — every folder needs a project name and at least one image' });
    }

    _sweepJobs(_importJobs);
    const jobId = _makeJobId('import');
    const job = {
      id: jobId,
      status: 'running',
      phase: 'Starting…',
      done: 0,
      total: specs.reduce((n, f) => n + f.imageDropboxPaths.length, 0),
      projects: [],
      totalImages: 0,
      failed: [],
      error: null,
      finishedAt: null,
    };
    _importJobs.set(jobId, job);

    _runImportJob(job, specs).catch(err => {
      job.status = 'error';
      job.error = err?.message || 'Unknown error';
      job.finishedAt = Date.now();
      console.error('[_runImportJob] uncaught:', err?.message, err?.stack);
    });

    res.json({ jobId });
  } catch (err) {
    console.error('[dropbox/import] FATAL:', err?.message, err?.stack);
    res.status(500).json({ error: 'internal', message: err?.message || 'Unknown error' });
  }
});

/** GET /api/dropbox/import/:jobId — poll import progress */
app.get('/api/dropbox/import/:jobId', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const job = _importJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job_not_found' });
  res.json(job);
});

/* Re-read projects.json before every write. An import runs for minutes, and
   admin edits (or an /api/admin/sync) can land meanwhile — writing back a
   snapshot taken at the start would silently undo them, and a sync that
   dropped the in-progress project gets it restored on the next write. */
async function _upsertProject(project) {
  const data = await readProjects();
  const i = data.projects.findIndex(p => p.id === project.id);
  if (i === -1) data.projects.push(project);
  else data.projects[i] = project;
  await writeProjects(data);
}

/**
 * _runImportJob — async background function, not a route.
 * Downloads each approved image from Dropbox into a new (private) project.
 */
async function _runImportJob(job, specs) {
  for (const { projectName, year, imageDropboxPaths } of specs) {
    // Generate unique project ID
    const existingIds = new Set((await readProjects()).projects.map(p => p.id));
    const baseId = projectName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase() + '_' + (year || new Date().getFullYear());
    let projectId = baseId;
    let suffix = 2;
    while (existingIds.has(projectId)) {
      projectId = `${baseId}_${suffix}`;
      suffix++;
    }

    const newProject = {
      id: projectId,
      name: projectName,
      year: parseInt(year, 10) || new Date().getFullYear(),
      images: [],
      public: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await _upsertProject(newProject);

    let order = 1;
    const yearTally = {}; // track EXIF years across all images in this folder

    for (const dropboxPath of imageDropboxPaths) {
      job.phase = `Importing ${projectName} (${order} of ${imageDropboxPaths.length})…`;
      try {
        const rawName = dropboxPath.split('/').pop() || `image_${order}.jpg`;
        const safeName = rawName.replace(/[^A-Za-z0-9._-]+/g, '_');

        // De-dupe filename
        let finalName = safeName;
        if (newProject.images.find(i => i.filename === finalName)) {
          const dot  = safeName.lastIndexOf('.');
          const stem = dot === -1 ? safeName      : safeName.slice(0, dot);
          const ext  = dot === -1 ? ''            : safeName.slice(dot);
          let n = 2;
          while (newProject.images.find(i => i.filename === `${stem}_${n}${ext}`)) n++;
          finalName = `${stem}_${n}${ext}`;
        }

        // Download full-res from Dropbox (refresh-token auth handled in util)
        const buffer = await downloadFile(null, dropboxPath);

        await writeBytes(projectId, finalName, buffer);
        await _prewarmResizes(projectId, finalName, buffer);

        // Generate blur placeholder + dimensions (same pattern as upload route)
        let blurDataURL = '';
        let realDims = '';
        try {
          const pipe = sharp(buffer).rotate();
          const meta = await pipe.metadata();
          if (meta.width && meta.height) realDims = `${meta.width}×${meta.height}`;
          blurDataURL = await makeBlurDataURL(buffer);
        } catch (e) {
          console.warn('[dropbox/import] blur/meta gen failed:', e?.message);
        }

        // Read EXIF date directly from the image bytes — more reliable than
        // Dropbox's media_info which is often unpopulated for RAW/unindexed files.
        let dateTaken = null;
        try {
          const exif = await exifr.parse(buffer, ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime']);
          const raw = exif?.DateTimeOriginal || exif?.DateTimeDigitized || exif?.DateTime;
          if (raw) {
            const d = new Date(raw);
            if (!isNaN(d.getTime()) && d.getFullYear() > 1990) {
              dateTaken = d.toISOString();
              yearTally[d.getFullYear()] = (yearTally[d.getFullYear()] || 0) + 1;
            }
          }
        } catch (_) { /* EXIF unavailable — fine, leave dateTaken null */ }

        newProject.images.push({
          filename: finalName,
          blobPath: `${PUBLIC_URL}/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(finalName)}`,
          order,
          selected: false,
          favorite: false,
          rejected: false,
          notes: '',
          blurDataURL,
          exif: {
            dateTaken,
            dimensions: realDims,
            fileSize: buffer.length,
          },
        });
        order++;
        job.totalImages++;

        // Persist after each image so partial results are saved
        newProject.updatedAt = new Date().toISOString();
        await _upsertProject(newProject);
      } catch (imgErr) {
        console.error(`[dropbox/import] failed to import ${dropboxPath}:`, imgErr?.message);
        job.failed.push({ path: dropboxPath, message: imgErr?.message || 'Unknown error' });
        // Continue with the remaining images
      }
      job.done++;
    }

    // If we got real EXIF years from the images, use the dominant one for the
    // project — overrides any default/guessed year passed from the frontend.
    if (Object.keys(yearTally).length > 0) {
      const dominantYear = parseInt(
        Object.entries(yearTally).sort((a, b) => b[1] - a[1])[0][0], 10
      );
      if (dominantYear !== newProject.year) {
        newProject.year = dominantYear;
        await _upsertProject(newProject);
      }
    }

    job.projects.push({ id: projectId, name: projectName, year: newProject.year, imageCount: newProject.images.length });
  }

  job.status = 'done';
  job.phase = 'Complete';
  job.finishedAt = Date.now();
}

const CURATION_SYSTEM = 'You are curating fashion/editorial photography by Aldo Carrera, a professional photographer in Los Angeles.';

const CURATION_SCHEMA = {
  type: 'object',
  properties: {
    ratings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:     { type: 'string' },
          score:  { type: 'integer' },
          keep:   { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['id', 'score', 'keep', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['ratings'],
  additionalProperties: false,
};

const FINAL_PICKS_SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:     { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['id', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['picks'],
  additionalProperties: false,
};

async function _askClaude(text, photos, schema) {
  const content = [{ type: 'text', text }];
  for (const { id, shot, thumbnail } of photos) {
    content.push({ type: 'text', text: `[${id}] ${shot.label}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: thumbnail } });
  }
  return (await _askClaudeJSON({ system: CURATION_SYSTEM, content, schema })).data;
}

/* Batches are rated independently, so scores bunch up (several 9s per
   batch) and can't rank the finalists against each other. One more pass
   shows Claude the strongest candidates side by side to choose the set. */
async function _choosePicks(candidates, folderName, targetCount) {
  const { picks } = await _askClaude(
    `These are the strongest ${candidates.length} photos from the shoot '${folderName}', already screened for technical quality. Choose the ${targetCount} that make the best portfolio set: strongest images first, with variety across looks, setups and framing — leave out near-duplicates of the same moment. Return the chosen ids best-first, each with a one-sentence reason.`,
    candidates.map(c => c.r),
    FINAL_PICKS_SCHEMA,
  );
  return picks;
}

async function _rateBatch(batch, folderName, targetCount) {
  const { ratings } = await _askClaude(
    `Review these ${batch.length} photos from the shoot '${folderName}'. Rate each 1-10 for portfolio quality. Consider: sharpness, exposure, composition, subject energy/expression. Set keep to false for soft focus, closed eyes, blown highlights, motion blur, and duplicate frames (keep only the best of a burst). Across the whole shoot we're choosing about ${targetCount} hero shots, so reserve 9-10 for frames that belong in that set. Each photo is labeled with an id and its path inside the shoot folder — return exactly one rating per id.`,
    batch,
    CURATION_SCHEMA,
  );
  return ratings;
}

/**
 * _runCurationJob — async background function, not a route.
 * Lists each folder (subfolders included), fetches thumbnails from Dropbox,
 * has Claude rate them, and keeps the top picks.
 */
async function _runCurationJob(job, folderPaths, targetCount, direct = false) {
  for (const folderPath of folderPaths) {
    const folderName = folderPath.split('/').filter(Boolean).pop() || folderPath;
    job.phase = direct
      ? `Listing images in ${folderName}…`
      : `Fetching images from ${folderName}…`;

    // 1. List every image in this folder and its subfolders, one per shot
    const entries = await listFolder(null, folderPath, { recursive: true });
    const imageFiles = entries.filter(e => e['.tag'] === 'file' && isImageFile(e.name));
    const { shots, duplicates } = _uniqueShots(entries, folderPath);

    // Breakdown of file extensions for diagnostics
    const extCounts = {};
    for (const f of imageFiles) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }
    console.log(`[curation] ${folderName}: ${imageFiles.length} image files, ${shots.length} unique shots —`, extCounts);

    // Detect shoot year from Dropbox media_info.time_taken (most common year wins)
    const yearCounts = {};
    for (const f of imageFiles) {
      const timeTaken = f.media_info?.metadata?.time_taken;
      if (timeTaken) {
        const y = new Date(timeTaken).getFullYear();
        if (y > 1990) yearCounts[y] = (yearCounts[y] || 0) + 1;
      }
    }
    const exifYear = Object.keys(yearCounts).length
      ? parseInt(Object.entries(yearCounts).sort((a,b) => b[1]-a[1])[0][0], 10)
      : null;

    if (shots.length === 0) {
      job.results.push({
        folderPath,
        folderName,
        total: 0,
        selected: [],
        note: 'No image files found in this folder or its subfolders.',
      });
      job.foldersDone++;
      continue;
    }

    // Direct mode — skip thumbnails and Claude, select everything
    if (direct) {
      job.results.push({
        folderPath,
        folderName,
        total: shots.length,
        duplicates,
        exifYear,
        direct: true,
        selected: shots.map(s => ({
          dropboxPath: s.importPath,
          filename: s.label,
          thumbnailDataUrl: null,
          score: null,
          reason: null,
        })),
      });
      job.foldersDone++;
      continue;
    }

    job.phase = `Fetching thumbnails for ${folderName} (${shots.length} images)…`;

    // 2. Batch fetch thumbnails
    let thumbResult;
    try {
      thumbResult = await getThumbnailBatch(null, shots.map(s => s.thumbPath));
    } catch (err) {
      console.error(`[curation] thumbnail fetch failed for ${folderPath}:`, err?.message);
      job.results.push({
        folderPath, folderName, total: shots.length, selected: [],
        error: err?.message,
        note: `Dropbox thumbnail API errored: ${err?.message || 'unknown'}`,
      });
      job.foldersDone++;
      continue;
    }

    const thumbByPath = new Map((thumbResult.results || []).map(t => [t.path, t.thumbnail]));
    const thumbFailures = thumbResult.failures || [];
    console.log(`[curation] ${folderName}: ${thumbByPath.size} thumbnails OK, ${thumbFailures.length} failed`);
    if (thumbFailures.length > 0) {
      const reasonCounts = {};
      for (const f of thumbFailures) reasonCounts[f.reason] = (reasonCounts[f.reason] || 0) + 1;
      console.log(`[curation] ${folderName} failure reasons:`, reasonCounts);
    }

    const rateable = shots
      .map((shot, i) => ({ id: String(i + 1), shot, thumbnail: thumbByPath.get(shot.thumbPath) }))
      .filter(r => r.thumbnail);

    if (rateable.length === 0) {
      // Build a helpful diagnostic message
      const extList = Object.entries(extCounts).map(([k,v]) => `${v} .${k}`).join(', ');
      const reasonCounts = {};
      for (const f of thumbFailures) reasonCounts[f.reason] = (reasonCounts[f.reason] || 0) + 1;
      const reasonList = Object.entries(reasonCounts).map(([k,v]) => `${v}× ${k}`).join(', ');
      const hasRaw = Object.keys(extCounts).some(k => _NON_WEB_EXT.has(k));
      const hint = hasRaw
        ? ' Dropbox cannot thumbnail RAW or HEIC files — only JPEG/PNG/TIFF/BMP/GIF/WebP. Export web-size JPEGs into the folder first.'
        : '';
      job.results.push({
        folderPath, folderName,
        total: shots.length,
        selected: [],
        note: `Found ${extList}. Dropbox returned no thumbnails (${reasonList || 'all failed silently'}).${hint}`,
        extCounts,
        thumbFailures: thumbFailures.length,
      });
      job.foldersDone++;
      continue;
    }

    // 3. Have Claude rate them — batches of 20, four in flight
    const BATCH_SIZE = 20;
    const batches = [];
    for (let i = 0; i < rateable.length; i += BATCH_SIZE) batches.push(rateable.slice(i, i + BATCH_SIZE));

    let rated = 0;
    const failedBatches = [];
    job.phase = `Rating ${rateable.length} images in ${folderName} with Claude…`;

    const ratingById = new Map();
    await _mapPool(batches, 4, async (batch) => {
      if (!anthropic) {
        failedBatches.push('ANTHROPIC_API_KEY not configured');
        return;
      }
      try {
        for (const r of await _rateBatch(batch, folderName, targetCount)) ratingById.set(r.id, r);
      } catch (err) {
        console.error(`[curation] rating batch failed for ${folderName}:`, err?.message);
        failedBatches.push(err?.message || 'Unknown error');
      }
      rated += batch.length;
      job.phase = `Rated ${rated} of ${rateable.length} images in ${folderName}…`;
    });

    // 4. Top picks: Claude's keepers by score. Photos Claude couldn't rate
    //    (failed batch, missing from its reply) go after them, unscored, so a
    //    failure can't pass placeholder scores off as real picks.
    const scored = [];
    const unscored = [];
    for (const r of rateable) {
      const rating = ratingById.get(r.id);
      if (!rating) unscored.push({ r, score: null, reason: 'Not rated — review manually' });
      else if (rating.keep !== false) scored.push({ r, score: rating.score, reason: rating.reason || '' });
    }
    scored.sort((a, b) => b.score - a.score);

    // 5. Final pass over the top candidates (about twice the target).
    let ranked = scored;
    if (scored.length > targetCount) {
      const finalists = scored.slice(0, Math.min(targetCount * 2, 40));
      job.phase = `Choosing the final ${targetCount} from ${finalists.length} finalists in ${folderName}…`;
      try {
        const byId = new Map(finalists.map(c => [c.r.id, c]));
        const chosen = [];
        for (const p of await _choosePicks(finalists, folderName, targetCount)) {
          const c = byId.get(p.id);
          if (!c) continue;
          byId.delete(p.id);
          chosen.push({ ...c, reason: p.reason || c.reason });
        }
        // Top up by score if Claude returned fewer than asked.
        ranked = [...chosen, ...finalists.filter(c => byId.has(c.r.id))];
      } catch (err) {
        console.error(`[curation] final pick failed for ${folderName} — using score order:`, err?.message);
      }
    }

    const selected = [...ranked, ...unscored].slice(0, targetCount).map(({ r, score, reason }) => ({
      filename: r.shot.label,
      dropboxPath: r.shot.importPath,
      score,
      reason,
      thumbnailDataUrl: `data:image/jpeg;base64,${r.thumbnail}`,
    }));

    job.results.push({
      folderPath,
      folderName,
      total: shots.length,
      duplicates,
      selected,
      exifYear: exifYear || null,
      warning: failedBatches.length
        ? `Claude couldn't rate ${unscored.length} of ${rateable.length} images (${failedBatches[0]}). Unrated images are listed last.`
        : null,
    });
    job.foldersDone++;
  }

  job.status = 'done';
  job.phase = 'Complete';
  job.finishedAt = Date.now();
}

/* ------------------------------------------------------------------ */
/* Global error handler — catches anything the route wrappers forward  */
/* ------------------------------------------------------------------ */
/* Paired with the safeRoute monkey-patch near `const app = express()`.
   Any async rejection in any handler ends up here as a clean 500
   instead of a hung connection. Routes with their own try/catch +
   res.status(...).json(...) short-circuit before this fires. */
app.use((err, req, res, next) => {
  console.error('[express-error]', req.method, req.path, err?.stack || err?.message || err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'internal', message: err?.message || 'Unknown error' });
});

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

app.listen(PORT, () => {
  console.log(`[nas-api] listening on port ${PORT}`);
  scheduleBackups({ dataDir: DATA_DIR, imagesDir: IMAGES_DIR });
  // Warm the compact placeholder cache in the background (see compactBlur).
  readProjects().then(async data => {
    for (const p of data.projects || []) for (const img of p.images || []) await compactBlur(img.blurDataURL);
    console.log(`[nas-api] compact placeholders ready (${_compactBlurCache.size})`);
  }).catch(() => {});
  console.log(`[nas-api] PUBLIC_URL: ${PUBLIC_URL || '(not set — blobPaths will be relative)'}`);
});
