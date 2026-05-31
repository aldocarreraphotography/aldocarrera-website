#!/usr/bin/env node
/* migrate-galleries.mjs — Phase 4 WRITE migration for the unified gallery merge.
 *
 * Folds galleries.json + gallery-portals.json → unified-galleries.json using the
 * SAME canonical transforms as the verified dry-run (imported from
 * utils/unified-galleries.js — single source of truth).
 *
 * SAFE BY DEFAULT:
 *   • Prints a summary and writes NOTHING unless you pass --commit.
 *   • Refuses to overwrite an existing unified-galleries.json unless --force.
 *   • On --commit it first backs up the source files to *.backup-<timestamp>
 *     and NEVER deletes them — rollback = point the server back at the old
 *     stores and delete unified-galleries.json.
 *
 * Migrated galleries' v1 images REFERENCE the source project's bytes (no copy);
 * the server's _ugFilePath() falls back to the project dir for them. New uploads
 * get gallery-owned bytes. So this migration moves no image files.
 *
 * Usage (on the NAS, after a rebuild so scripts/ + utils/ are in the image):
 *   # preview (no write):
 *   sudo docker exec -w /app $(sudo docker-compose ps -q api) node scripts/migrate-galleries.mjs
 *   # commit:
 *   sudo docker exec -w /app $(sudo docker-compose ps -q api) node scripts/migrate-galleries.mjs --commit
 */

import fs   from 'node:fs/promises';
import path from 'node:path';
import { migrateLegacyGallery, migratePortal, writeUnifiedGalleries } from '../utils/unified-galleries.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const COMMIT = process.argv.includes('--commit');
const FORCE  = process.argv.includes('--force');

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(path.join(DATA_DIR, file), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

function stamp() {
  // standalone node script — Date is fine here (this is NOT a workflow script)
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  console.log('\n═══ UNIFIED GALLERY — WRITE MIGRATION ═══');
  console.log(`  Data dir: ${DATA_DIR}`);
  console.log(`  Mode: ${COMMIT ? 'COMMIT (will write)' : 'PREVIEW (no write — pass --commit to apply)'}\n`);

  const existing = await readJson('unified-galleries.json');
  if (existing && !FORCE) {
    console.log('  ⚠  unified-galleries.json already exists. Refusing to overwrite.');
    console.log('     Pass --force to overwrite (the existing file will be backed up first).\n');
    process.exit(1);
  }

  const galleriesFile = await readJson('galleries.json');
  const portalsFile   = await readJson('gallery-portals.json');
  const projectsFile  = await readJson('projects.json');
  const projectIndex  = new Map((projectsFile?.projects || []).map(p => [p.id, p]));

  const anomalies = [];
  const unified = [];
  for (const g of (galleriesFile?.galleries || [])) unified.push(migrateLegacyGallery(g, projectIndex, anomalies));
  for (const p of (portalsFile?.portals || []))     unified.push(migratePortal(p, projectIndex, anomalies));

  // Stats
  let imgs = 0, markups = 0, labels = 0, notes = 0;
  for (const u of unified) {
    for (const im of Object.values(u.images)) {
      imgs++;
      for (const fb of Object.values(im.feedback)) {
        markups += (fb.markups?.length || 0);
        if (fb.label) labels++;
        if (fb.note)  notes++;
      }
    }
  }
  console.log(`  Galleries: ${unified.length}  ·  Images: ${imgs}  ·  Labels: ${labels}  ·  Notes: ${notes}  ·  Markups: ${markups}`);
  const modes = unified.reduce((m, u) => { m[u.mode] = (m[u.mode] || 0) + 1; return m; }, {});
  console.log(`  Modes: ${JSON.stringify(modes)}`);
  if (anomalies.length) { console.log(`\n  ⚠  ${anomalies.length} anomalies:`); anomalies.forEach(a => console.log('   · ' + a)); }
  else console.log('  ✓ No anomalies.');

  if (!COMMIT) { console.log('\n  Preview only. Re-run with --commit to write.\n'); return; }

  // Back up sources (never deleted)
  const ts = stamp();
  for (const f of ['galleries.json', 'gallery-portals.json', 'unified-galleries.json']) {
    try { await fs.copyFile(path.join(DATA_DIR, f), path.join(DATA_DIR, `${f}.backup-${ts}`)); console.log(`  ↳ backed up ${f}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }

  await writeUnifiedGalleries({ galleries: unified });
  console.log(`\n  ✓ Wrote unified-galleries.json (${unified.length} galleries). Sources preserved as *.backup-${ts}.`);
  console.log('  Rollback: delete unified-galleries.json + revert the server to the legacy routes.\n');
}

main().catch(e => { console.error('migration failed:', e); process.exit(1); });
