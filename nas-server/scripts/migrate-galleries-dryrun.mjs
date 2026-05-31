#!/usr/bin/env node
/* migrate-galleries-dryrun.mjs — Phase 0 of the unified-gallery merge.
 *
 * READ-ONLY by default. Reads galleries.json + gallery-portals.json (+ projects.json
 * for image resolution) and reports EXACTLY what the merged unified store would
 * contain. Verifies that every label, star, note, markup, and voice note survives
 * the transform. Writes nothing to the live store.
 *
 * Usage (on the NAS):
 *   # inside the running container (DATA_DIR already set correctly):
 *   sudo docker exec -w /app $(sudo docker-compose ps -q api) node scripts/migrate-galleries-dryrun.mjs
 *
 *   # or on the host, pointing at the data dir:
 *   node scripts/migrate-galleries-dryrun.mjs --data "/path/to/nas-server/data"
 *
 * Flags:
 *   --data <path>     override data directory (else $DATA_DIR, else ./data)
 *   --write-preview   ALSO write the full proposed unified store to
 *                     data/unified-galleries.PREVIEW.json (a NON-LIVE file the
 *                     server never reads — safe to inspect, safe to delete).
 *                     Without this flag, the script prints a summary only.
 */

import fs   from 'node:fs/promises';
import path from 'node:path';

/* ── args ─────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const dataArgIdx = argv.indexOf('--data');
const DATA_DIR = dataArgIdx !== -1 ? argv[dataArgIdx + 1]
               : process.env.DATA_DIR || path.join(process.cwd(), 'data');
const WRITE_PREVIEW = argv.includes('--write-preview');

/* ── helpers ──────────────────────────────────────────── */
async function readJson(file) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function nonRejectedImages(project) {
  return (project?.images || [])
    .filter(i => !i.rejected)
    .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
}

const REVIEW_FEATURES = { labels: true, stars: true, markups: true, notes: true, voice: true };

/* Build a v1 image entry + its feedback. */
function imageEntry(filename, blobPath, uploadedAt, feedback) {
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
    voiceNote:    sel.voiceNote || null,            // preserved verbatim
  };
}

/* Empty feedback for images with no client interaction yet. */
function emptyFeedback() {
  return { label: null, stars: 0, note: '', markups: [], voiceMarkups: [], voiceNote: null };
}

/* ── transforms ───────────────────────────────────────── */
function migrateLegacy(g, projectIndex, stats) {
  const project = projectIndex.get(g.projectId);
  if (!project) stats.anomalies.push(`legacy gallery "${g.token}" → project "${g.projectId}" NOT FOUND`);

  const projImgs = nonRejectedImages(project);
  const images = {};

  // Image set from project; feedback from selections
  for (const img of projImgs) {
    const sel = g.selections?.[img.filename];
    images[img.filename] = imageEntry(img.filename, img.blobPath, g.createdAt, sel ? legacyFeedback(sel) : emptyFeedback());
  }
  // Orphaned selections (feedback on filenames not in the project) — preserve anyway
  for (const fn of Object.keys(g.selections || {})) {
    if (!images[fn]) {
      stats.anomalies.push(`legacy gallery "${g.token}" → selection "${fn}" not in project (orphan feedback preserved)`);
      images[fn] = imageEntry(fn, null, g.createdAt, legacyFeedback(g.selections[fn]));
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

function migratePortal(p, projectIndex, stats) {
  const project = projectIndex.get(p.projectId);
  if (!project) stats.anomalies.push(`portal "${p.token}" → project "${p.projectId}" NOT FOUND`);

  const projImgs = nonRejectedImages(project);
  const images = {};

  for (const img of projImgs) {
    const sel = p.selects?.[img.filename];
    images[img.filename] = imageEntry(img.filename, img.blobPath, p.createdAt, sel ? portalFeedback(sel) : emptyFeedback());
  }
  for (const fn of Object.keys(p.selects || {})) {
    if (!images[fn]) {
      stats.anomalies.push(`portal "${p.token}" → select "${fn}" not in project (orphan feedback preserved)`);
      images[fn] = imageEntry(fn, null, p.createdAt, portalFeedback(p.selects[fn]));
    }
  }

  return {
    token: p.token,
    source: 'portal',
    mode: 'review',                                  // portals had selection feedback → review
    title: p.title || '',
    clientName: p.clientName || '',
    projectId: p.projectId || null,
    auth: { type: 'pin', pin: p.pin || null, password: null },
    features: { ...REVIEW_FEATURES, downloads: !!p.downloadsEnabled },
    images,
    rounds: [{ round: 1, createdAt: p.createdAt || null }],
    status: p.submitted ? 'submitted' : 'open',
    submitted: !!p.submitted,
    submittedAt: p.submittedAt || null,
    createdAt: p.createdAt || null,
    expiresAt: null,
  };
}

/* ── feedback counters (for verification) ─────────────── */
function countFeedback(gallery) {
  let imgs = 0, withFeedback = 0, labels = 0, stars = 0, notes = 0, markups = 0, voiceMarkups = 0, voiceNotes = 0;
  const labelBreakdown = { SELECT: 0, ALT: 0, KILL: 0 };
  for (const img of Object.values(gallery.images)) {
    imgs++;
    const fb = img.feedback.v1;
    const has = fb.label || fb.stars || fb.note || fb.markups.length || fb.voiceMarkups.length || fb.voiceNote;
    if (has) withFeedback++;
    if (fb.label) { labels++; if (labelBreakdown[fb.label] !== undefined) labelBreakdown[fb.label]++; }
    if (fb.stars) stars++;
    if (fb.note) notes++;
    markups      += fb.markups.length;
    voiceMarkups += fb.voiceMarkups.length;
    if (fb.voiceNote) voiceNotes++;
  }
  return { imgs, withFeedback, labels, labelBreakdown, stars, notes, markups, voiceMarkups, voiceNotes };
}

/* ── main ─────────────────────────────────────────────── */
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  UNIFIED GALLERY — DRY-RUN MIGRATION (read-only)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Data dir: ${DATA_DIR}`);
  console.log('');

  const galleriesFile = await readJson('galleries.json');
  const portalsFile   = await readJson('gallery-portals.json');
  const projectsFile  = await readJson('projects.json');

  if (!galleriesFile && !portalsFile) {
    console.log('  ⚠  Neither galleries.json nor gallery-portals.json found in this data dir.');
    console.log('     Point at the right dir with --data <path>, or run inside the container.');
    console.log('');
    process.exit(1);
  }

  const legacyGalleries = galleriesFile?.galleries || [];
  const portals         = portalsFile?.portals || [];
  const projects        = projectsFile?.projects || [];

  const projectIndex = new Map(projects.map(p => [p.id, p]));

  console.log(`  Found: ${legacyGalleries.length} legacy galleries · ${portals.length} portals · ${projects.length} projects`);
  console.log('');

  const stats = { anomalies: [] };
  const unified = [];

  // ── Legacy galleries ──
  console.log('───────────────────────────────────────────────────────────────');
  console.log('  LEGACY GALLERIES → review mode');
  console.log('───────────────────────────────────────────────────────────────');
  const totals = { imgs: 0, labels: 0, stars: 0, notes: 0, markups: 0, voiceMarkups: 0, voiceNotes: 0 };
  for (const g of legacyGalleries) {
    const u = migrateLegacy(g, projectIndex, stats);
    unified.push(u);
    const c = countFeedback(u);
    totals.imgs += c.imgs; totals.labels += c.labels; totals.stars += c.stars;
    totals.notes += c.notes; totals.markups += c.markups; totals.voiceMarkups += c.voiceMarkups;
    console.log(`  • ${u.token}  "${u.title}"  [${u.clientName || '—'}]  auth=${u.auth.type}`);
    console.log(`      ${c.imgs} imgs · ${c.withFeedback} w/ feedback · labels ${c.labels} (S${c.labelBreakdown.SELECT}/A${c.labelBreakdown.ALT}/K${c.labelBreakdown.KILL}) · ${c.stars}★ · ${c.notes} notes · ${c.markups} markups · ${c.voiceMarkups} voice`);
  }

  // ── Portals ──
  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('  CLIENT PORTALS → review mode (hearts → SELECT)');
  console.log('───────────────────────────────────────────────────────────────');
  for (const p of portals) {
    const u = migratePortal(p, projectIndex, stats);
    unified.push(u);
    const c = countFeedback(u);
    totals.imgs += c.imgs; totals.labels += c.labels; totals.notes += c.notes;
    totals.voiceNotes += c.voiceNotes;
    console.log(`  • ${u.token}  "${u.title}"  [${u.clientName || '—'}]  pin=${u.auth.pin || '—'}  downloads=${u.features.downloads ? 'ON' : 'off'}`);
    console.log(`      ${c.imgs} imgs · ${c.withFeedback} w/ feedback · ${c.labelBreakdown.SELECT} hearts→SELECT · ${c.notes} notes · ${c.voiceNotes} voice notes`);
  }

  // ── Totals ──
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TOTALS (what the unified store would contain)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Galleries:        ${unified.length}`);
  console.log(`  Images:           ${totals.imgs}`);
  console.log(`  Labels:           ${totals.labels}`);
  console.log(`  Stars:            ${totals.stars}`);
  console.log(`  Notes:            ${totals.notes}`);
  console.log(`  Markups:          ${totals.markups}   ← must match what clients drew`);
  console.log(`  Positioned voice: ${totals.voiceMarkups}`);
  console.log(`  Portal voice:     ${totals.voiceNotes}`);
  console.log('');

  // ── Anomalies ──
  if (stats.anomalies.length) {
    console.log('───────────────────────────────────────────────────────────────');
    console.log(`  ⚠  ANOMALIES (${stats.anomalies.length}) — review before cutover`);
    console.log('───────────────────────────────────────────────────────────────');
    for (const a of stats.anomalies) console.log(`  · ${a}`);
    console.log('');
  } else {
    console.log('  ✓ No anomalies — every project resolved, no orphaned feedback.');
    console.log('');
  }

  // ── Token collision check (legacy + portal share a token?) ──
  const seen = new Map();
  for (const u of unified) {
    if (seen.has(u.token)) {
      console.log(`  ⚠  TOKEN COLLISION: "${u.token}" exists in both ${seen.get(u.token)} and ${u.source}`);
    } else {
      seen.set(u.token, u.source);
    }
  }

  // ── Optional preview write (NON-LIVE file) ──
  if (WRITE_PREVIEW) {
    const out = path.join(DATA_DIR, 'unified-galleries.PREVIEW.json');
    await fs.writeFile(out, JSON.stringify({ galleries: unified }, null, 2), 'utf8');
    console.log(`  📄 Full proposed structure written to: ${out}`);
    console.log('     (NON-LIVE — the server never reads this file. Inspect, then delete.)');
    console.log('');
  } else {
    console.log('  (Run again with --write-preview to dump the full proposed JSON for inspection.)');
    console.log('');
  }

  console.log('  Dry run complete. Nothing live was modified.');
  console.log('');
}

main().catch(err => {
  console.error('dry-run failed:', err);
  process.exit(1);
});
