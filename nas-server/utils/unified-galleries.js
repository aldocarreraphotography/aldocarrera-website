/* utils/unified-galleries.js — data layer for the unified gallery system.
 *
 * One store (data/unified-galleries.json) replaces the two legacy stores
 * (galleries.json + gallery-portals.json). The gallery OWNS its image bytes
 * (images/__galleries/{token}/{filename}/{versionId}.<ext>) so versions are
 * gallery-scoped, decoupled from projects.
 *
 * This module is split into:
 *   1. Persistence  — atomic read/write of the JSON store
 *   2. Identity     — token + versionId generators
 *   3. CRUD         — find/create/update/delete galleries
 *   4. Versioning   — addInitialImages / layerVersions / setMain (PURE
 *                     functions that mutate a passed gallery object; caller
 *                     persists). Filename is the match key.
 *   5. Storage      — image dir/path helpers
 *   6. Transforms   — migrateLegacyGallery / migratePortal (canonical
 *                     transform shared by the dry-run + real migration)
 *
 * See UNIFIED-GALLERY-PLAN.md (repo root) for the full schema + decisions.
 */

import fs     from 'node:fs/promises';
import path   from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR   = process.env.DATA_DIR   || path.join(process.cwd(), 'data');
const IMAGES_DIR = process.env.IMAGES_DIR || path.join(process.cwd(), 'images');
const FILE       = 'unified-galleries.json';

/* ── 1. Persistence ───────────────────────────────────── */

async function readJson(filename) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function writeJson(filename, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const dest = path.join(DATA_DIR, filename);
  const tmp  = dest + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, dest); // atomic
}

export async function readUnifiedGalleries() {
  const d = await readJson(FILE);
  return d || { galleries: [] };
}

export async function writeUnifiedGalleries(data) {
  return writeJson(FILE, data);
}

/* ── 2. Identity ──────────────────────────────────────── */

export function generateToken() {
  // 9 bytes → 12 url-safe chars. Distinct namespace from legacy tokens.
  return crypto.randomBytes(9).toString('base64url');
}

/** Next sequential version id for an image ("v1", "v2", …). */
export function nextVersionId(image) {
  return `v${(image.versions?.length || 0) + 1}`;
}

/* ── 3. CRUD ──────────────────────────────────────────── */

const REVIEW_FEATURES   = { labels: true, stars: true, markups: true, notes: true, voice: true, downloads: false };
const DELIVERY_FEATURES = { labels: false, stars: false, markups: false, notes: false, voice: false, downloads: true };

export function defaultFeatures(mode) {
  return mode === 'delivery' ? { ...DELIVERY_FEATURES } : { ...REVIEW_FEATURES };
}

export async function findUnified(token) {
  const { galleries } = await readUnifiedGalleries();
  return galleries.find(g => g.token === token) || null;
}

export async function createUnified({ mode = 'review', title = '', clientName = '', projectId = null, pin = null, features = null } = {}) {
  const data = await readUnifiedGalleries();
  const gallery = {
    token:      generateToken(),
    mode,
    title,
    clientName,
    projectId,
    auth:       pin ? { type: 'pin', pin: String(pin), password: null }
                    : { type: 'open', pin: null, password: null },
    features:   features || defaultFeatures(mode),
    images:     {},                 // filename → { filename, versions[], feedback{} }
    rounds:     [],                 // [{ round, createdAt }]
    status:     'open',
    submitted:  false,
    submittedAt:null,
    createdAt:  new Date().toISOString(),
    expiresAt:  null,
  };
  data.galleries.unshift(gallery);
  await writeUnifiedGalleries(data);
  return gallery;
}

const UPDATABLE = new Set(['mode', 'title', 'clientName', 'projectId', 'features', 'auth', 'status', 'submitted', 'submittedAt', 'expiresAt']);

export async function updateUnified(token, patch) {
  const data = await readUnifiedGalleries();
  const idx  = data.galleries.findIndex(g => g.token === token);
  if (idx === -1) return null;
  for (const k of Object.keys(patch || {})) {
    if (UPDATABLE.has(k)) data.galleries[idx][k] = patch[k];
  }
  await writeUnifiedGalleries(data);
  return data.galleries[idx];
}

export async function deleteUnified(token) {
  const data   = await readUnifiedGalleries();
  const before = data.galleries.length;
  data.galleries = data.galleries.filter(g => g.token !== token);
  if (data.galleries.length === before) return false;
  await writeUnifiedGalleries(data);
  return true;
}

/* ── 4. Versioning (PURE — mutate the passed gallery, caller persists) ── */

function emptyFeedback() {
  return { label: null, stars: 0, note: '', markups: [], voiceMarkups: [], voiceNote: null };
}

function nextRound(gallery) {
  const max = (gallery.rounds || []).reduce((m, r) => Math.max(m, r.round || 0), 0);
  return max + 1;
}

/**
 * Round 1 (or any "add everything") upload. Every incoming file becomes a new
 * image at v1. Incoming: [{ filename, blobPath, uploadedAt? }].
 * Returns { round, added: [filenames] }.
 */
export function addInitialImages(gallery, incoming) {
  const round = nextRound(gallery);
  const now   = new Date().toISOString();
  const added = [];
  for (const f of incoming) {
    if (!f?.filename) continue;
    if (gallery.images[f.filename]) {
      // Already exists → treat as a version layer instead of duplicating
      _pushVersion(gallery.images[f.filename], f, round, now);
    } else {
      gallery.images[f.filename] = {
        filename: f.filename,
        versions: [{ versionId: 'v1', round, blobPath: f.blobPath || null, uploadedAt: f.uploadedAt || now, isMain: true }],
        feedback: { v1: emptyFeedback() },
      };
    }
    added.push(f.filename);
  }
  gallery.rounds = gallery.rounds || [];
  gallery.rounds.push({ round, createdAt: now });
  return { round, added };
}

/**
 * Version upload. Match incoming files to existing images BY FILENAME.
 * Matched → a new version is layered on top and set as main. Their feedback
 * thread gets a fresh empty entry for the new version (prior versions keep
 * their feedback). Non-matching incoming files are IGNORED (per spec).
 * Incoming: [{ filename, blobPath, uploadedAt? }].
 * Returns { round, matched: [filenames], ignored: [filenames] }.
 */
export function layerVersions(gallery, incoming) {
  const round   = nextRound(gallery);
  const now     = new Date().toISOString();
  const matched = [];
  const ignored = [];
  for (const f of incoming) {
    if (!f?.filename) continue;
    const img = gallery.images[f.filename];
    if (!img) { ignored.push(f.filename); continue; }
    _pushVersion(img, f, round, now);
    matched.push(f.filename);
  }
  if (matched.length) {
    gallery.rounds = gallery.rounds || [];
    gallery.rounds.push({ round, createdAt: now });
  }
  return { round, matched, ignored };
}

function _pushVersion(image, f, round, now) {
  const vid = nextVersionId(image);
  // Demote current main
  for (const v of image.versions) v.isMain = false;
  image.versions.push({ versionId: vid, round, blobPath: f.blobPath || null, uploadedAt: f.uploadedAt || now, isMain: true });
  image.feedback[vid] = emptyFeedback();
  return vid;
}

/** Roll an image back to a prior version (or forward). Returns true if changed. */
export function setMain(gallery, filename, versionId) {
  const img = gallery.images?.[filename];
  if (!img) return false;
  const target = img.versions.find(v => v.versionId === versionId);
  if (!target) return false;
  for (const v of img.versions) v.isMain = (v.versionId === versionId);
  return true;
}

/** The currently-main version of an image (or the last one as a fallback). */
export function mainVersion(image) {
  return image.versions.find(v => v.isMain) || image.versions[image.versions.length - 1] || null;
}

/* ── 5. Storage helpers ───────────────────────────────── */

export function sanitizeName(name) {
  return String(name || '').replace(/[^A-Za-z0-9._-]+/g, '_');
}

/** Directory holding all versions of one image: images/__galleries/{token}/{filename}/ */
export function galleryImageDir(token, filename) {
  return path.join(IMAGES_DIR, '__galleries', sanitizeName(token), sanitizeName(filename));
}

/** Absolute path to a specific version's bytes. ext defaults to the filename's ext. */
export function galleryImagePath(token, filename, versionId, ext) {
  const e = ext || path.extname(filename) || '.jpg';
  return path.join(galleryImageDir(token, filename), `${versionId}${e}`);
}

/* ── 6. Transforms (canonical — shared by dry-run + real migration) ───── */

function nonRejectedImages(project) {
  return (project?.images || [])
    .filter(i => !i.rejected)
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
}

function v1Entry(filename, blobPath, uploadedAt, feedback) {
  return {
    filename,
    versions: [{ versionId: 'v1', round: 1, blobPath: blobPath || null, uploadedAt: uploadedAt || null, isMain: true }],
    feedback: { v1: feedback },
  };
}

function legacyFeedback(sel) {
  sel = sel || {};
  return {
    label:        sel.label || null,
    stars:        sel.stars || 0,
    note:         sel.note || '',
    markups:      Array.isArray(sel.markups) ? sel.markups : [],
    voiceMarkups: Array.isArray(sel.voiceMarkups) ? sel.voiceMarkups : [],
    voiceNote:    null,
  };
}

function portalFeedback(sel) {
  sel = sel || {};
  return {
    label:        sel.hearted ? 'SELECT' : null,   // hearts → SELECT
    stars:        0,
    note:         sel.note || '',
    markups:      [],
    voiceMarkups: [],
    voiceNote:    sel.voiceNote || null,
  };
}

/** Transform a legacy gallery object → unified. anomalies: string[] (appended to). */
export function migrateLegacyGallery(g, projectIndex, anomalies = []) {
  const project = projectIndex.get(g.projectId);
  if (!project) anomalies.push(`legacy gallery "${g.token}" → project "${g.projectId}" NOT FOUND`);

  const images = {};
  for (const img of nonRejectedImages(project)) {
    const sel = g.selections?.[img.filename];
    images[img.filename] = v1Entry(img.filename, img.blobPath, g.createdAt, sel ? legacyFeedback(sel) : emptyFeedback());
  }
  for (const fn of Object.keys(g.selections || {})) {
    if (!images[fn]) {
      anomalies.push(`legacy gallery "${g.token}" → selection "${fn}" not in project (orphan preserved)`);
      images[fn] = v1Entry(fn, null, g.createdAt, legacyFeedback(g.selections[fn]));
    }
  }

  return {
    token: g.token,
    source: 'gallery',
    mode: 'review',
    title: g.title || '',
    clientName: g.clientName || '',
    projectId: g.projectId || null,
    auth: { type: g.password ? 'password' : 'open', pin: null, password: g.password || null },
    features: { ...REVIEW_FEATURES, downloads: false },
    images,
    rounds: [{ round: 1, createdAt: g.createdAt || null }],
    status: g.status || 'open',
    submitted: g.status === 'submitted' || !!g.submittedAt,
    submittedAt: g.submittedAt || null,
    createdAt: g.createdAt || null,
    expiresAt: g.expiresAt || null,
  };
}

/** Transform a portal object → unified. Heuristic: downloads-on + zero feedback → delivery. */
export function migratePortal(p, projectIndex, anomalies = []) {
  const project = projectIndex.get(p.projectId);
  if (!project) anomalies.push(`portal "${p.token}" → project "${p.projectId}" NOT FOUND`);

  const images = {};
  let anyFeedback = false;
  for (const img of nonRejectedImages(project)) {
    const sel = p.selects?.[img.filename];
    if (sel && (sel.hearted || sel.note || sel.voiceNote)) anyFeedback = true;
    images[img.filename] = v1Entry(img.filename, img.blobPath, p.createdAt, sel ? portalFeedback(sel) : emptyFeedback());
  }
  for (const fn of Object.keys(p.selects || {})) {
    if (!images[fn]) {
      anomalies.push(`portal "${p.token}" → select "${fn}" not in project (orphan preserved)`);
      images[fn] = v1Entry(fn, null, p.createdAt, portalFeedback(p.selects[fn]));
      anyFeedback = true;
    }
  }

  const mode = (p.downloadsEnabled && !anyFeedback) ? 'delivery' : 'review';

  return {
    token: p.token,
    source: 'portal',
    mode,
    title: p.title || '',
    clientName: p.clientName || '',
    projectId: p.projectId || null,
    auth: { type: 'pin', pin: p.pin || null, password: null },
    features: mode === 'delivery'
      ? { ...DELIVERY_FEATURES, downloads: true }
      : { ...REVIEW_FEATURES, downloads: !!p.downloadsEnabled },
    images,
    rounds: [{ round: 1, createdAt: p.createdAt || null }],
    status: p.submitted ? 'submitted' : 'open',
    submitted: !!p.submitted,
    submittedAt: p.submittedAt || null,
    createdAt: p.createdAt || null,
    expiresAt: null,
  };
}
