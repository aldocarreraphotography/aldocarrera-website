#!/usr/bin/env node
/* warm-resize-cache.mjs — pre-generate the disk resize cache for every
 * public image so no visitor ever waits on a cold resize.
 *
 * Generates the same bucket widths the frontend requests (800/1200/1600/2000
 * — 200/400 variants are tiny and cheap to do on demand) and writes them to
 * images/__resized/... where the server's disk-cache tier picks them up.
 * Skips variants that already exist, so re-running is cheap and incremental.
 *
 * Run inside the container (sharp + paths already set up):
 *   sudo docker exec -w /app $(sudo docker-compose ps -q api) node scripts/warm-resize-cache.mjs
 */

import fs    from 'node:fs/promises';
import path  from 'node:path';
import sharp from 'sharp';

const DATA_DIR   = process.env.DATA_DIR   || path.join(process.cwd(), 'data');
const IMAGES_DIR = process.env.IMAGES_DIR || path.join(process.cwd(), 'images');
const WIDTHS = [800, 1200, 1600, 2000];

const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_');
const exists = async (p) => !!(await fs.stat(p).catch(() => null));

async function warmOne(srcPath, id, filename) {
  let made = 0;
  for (const w of WIDTHS) {
    const dest = path.join(IMAGES_DIR, '__resized', `w${w}`, safe(id), safe(filename) + '.jpg');
    if (await exists(dest)) continue;
    try {
      const buf = await sharp(srcPath)
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, buf);
      made++;
    } catch (e) {
      console.warn(`  ! ${id}/${filename} w${w}: ${e.message}`);
    }
  }
  return made;
}

async function main() {
  const t0 = Date.now();
  const projectsRaw = await fs.readFile(path.join(DATA_DIR, 'projects.json'), 'utf8');
  const { projects } = JSON.parse(projectsRaw);

  let totalImages = 0, totalVariants = 0;
  for (const p of projects) {
    if (p.public === false && !p.raw) continue; // private projects aren't served publicly
    const imgs = (p.images || []).filter(i => !i.rejected);
    let projVariants = 0;
    for (const img of imgs) {
      const src = path.join(IMAGES_DIR, p.id, img.filename);
      if (!(await exists(src))) continue;
      projVariants += await warmOne(src, p.id, img.filename);
      totalImages++;
    }
    totalVariants += projVariants;
    if (projVariants) console.log(`  ${p.id}: +${projVariants} variants`);
  }

  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`\n✓ Warmed ${totalVariants} new variants across ${totalImages} images in ${secs}s.`);
  console.log('  (Re-run any time — existing variants are skipped.)');
}

main().catch(e => { console.error('warm failed:', e); process.exit(1); });
