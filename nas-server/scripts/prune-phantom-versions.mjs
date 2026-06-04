#!/usr/bin/env node
/* prune-phantom-versions.mjs — repair galleries whose version uploads recorded
 * a new version but never wrote the bytes (the fs.rename-on-Synology bug).
 *
 * For each unified gallery, for each image: drop any version whose backing file
 * doesn't exist on disk (gallery-owned dir) AND isn't a migrated v1 (which reads
 * from the project bytes). Re-point "main" to the newest surviving version.
 *
 * SAFE: preview by default, writes only with --commit, backs up first.
 *
 * Usage on NAS (after rebuild):
 *   sudo docker exec -w /app $(sudo docker-compose ps -q api) node scripts/prune-phantom-versions.mjs
 *   sudo docker exec -w /app $(sudo docker-compose ps -q api) node scripts/prune-phantom-versions.mjs --commit
 *   # limit to one gallery:
 *   ... node scripts/prune-phantom-versions.mjs --commit --token X5hHUsX8tjQGgmbTckE
 */

import fs   from 'node:fs/promises';
import path from 'node:path';
import {
  readUnifiedGalleries, writeUnifiedGalleries,
  galleryImagePath, mainVersion,
} from '../utils/unified-galleries.js';

const DATA_DIR   = process.env.DATA_DIR   || path.join(process.cwd(), 'data');
const IMAGES_DIR = process.env.IMAGES_DIR || path.join(process.cwd(), 'images');
const COMMIT = process.argv.includes('--commit');
const tokenArg = (() => { const i = process.argv.indexOf('--token'); return i !== -1 ? process.argv[i + 1] : null; })();

const exists = async (p) => !!(await fs.stat(p).catch(() => null));

async function main() {
  console.log(`\n=== PRUNE PHANTOM VERSIONS — ${COMMIT ? 'COMMIT' : 'PREVIEW'} ===\n`);
  const data = await readUnifiedGalleries();
  let dropped = 0, repointed = 0, touchedGalleries = 0;

  for (const g of data.galleries) {
    if (tokenArg && g.token !== tokenArg) continue;
    let galleryTouched = false;

    for (const img of Object.values(g.images || {})) {
      const keep = [];
      for (const v of img.versions) {
        // v1 of a migrated gallery references project bytes → always keep.
        const isMigratedV1 = v.versionId === 'v1' && g.source && g.projectId;
        const ownedPath = galleryImagePath(g.token, img.filename, v.versionId);
        const hasBytes = await exists(ownedPath);
        // Also accept project-bytes fallback for v1
        const projPath = g.projectId ? path.join(IMAGES_DIR, g.projectId, img.filename) : null;
        const hasProject = projPath ? await exists(projPath) : false;

        if (hasBytes || (v.versionId === 'v1' && hasProject) || isMigratedV1) {
          keep.push(v);
        } else {
          dropped++; galleryTouched = true;
          console.log(`  drop ${g.token} · ${img.filename} · ${v.versionId} (no bytes)`);
        }
      }
      if (keep.length === 0 && img.versions.length) {
        // Shouldn't happen (v1 always kept), but guard: keep the first.
        keep.push(img.versions[0]);
      }
      // Rebuild feedback to only the kept versions
      const keptIds = new Set(keep.map(v => v.versionId));
      const newFeedback = {};
      for (const [vid, fb] of Object.entries(img.feedback || {})) if (keptIds.has(vid)) newFeedback[vid] = fb;
      // Re-point main to the newest surviving version
      const hadMain = keep.some(v => v.isMain);
      if (!hadMain && keep.length) { keep.forEach(v => v.isMain = false); keep[keep.length - 1].isMain = true; repointed++; galleryTouched = true; }
      img.versions = keep;
      img.feedback = newFeedback;
    }
    if (galleryTouched) touchedGalleries++;
  }

  console.log(`\n  Dropped ${dropped} phantom versions across ${touchedGalleries} galleries · re-pointed ${repointed} mains.`);
  if (!COMMIT) { console.log('\n  Preview only. Re-run with --commit to write.\n'); return; }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.copyFile(path.join(DATA_DIR, 'unified-galleries.json'), path.join(DATA_DIR, `unified-galleries.json.backup-${ts}`));
  await writeUnifiedGalleries(data);
  console.log(`\n  ✓ Written. Backup: unified-galleries.json.backup-${ts}\n`);
}

main().catch(e => { console.error('prune failed:', e); process.exit(1); });
