#!/usr/bin/env node
/**
 * shrink-originals.mjs — one-off: replace oversized camera originals in
 * portfolio projects with the same 4000px / quality-90 web master that new
 * uploads and Dropbox imports now store (see _webMaster in server.js).
 *
 * Skips projects whose client portal hands out downloads, and anything
 * that isn't a JPEG (changing the extension would change the filename).
 * The resized cache stays valid: it's keyed by filename and the picture
 * itself doesn't change.
 *
 * Usage (inside the api container):
 *   node scripts/shrink-originals.mjs           # dry run: what would shrink, and by how much
 *   node scripts/shrink-originals.mjs --write   # replace the files and update projects.json
 */

import path from 'node:path';
import fs   from 'node:fs/promises';
import sharp from 'sharp';
import { readProjects, writeProjects, readGalleryPortals } from '../utils/store.js';

const IMAGES_DIR = process.env.IMAGES_DIR || path.join(process.cwd(), 'images');
const WRITE = process.argv.includes('--write');
const LONG_EDGE = 4000;
const MAX_BYTES = 8 * 1024 * 1024;
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

const portals = (await readGalleryPortals()).portals || [];
const delivers = new Set(portals.filter(p => p.downloadsEnabled).map(p => p.projectId));
const { projects } = await readProjects();

let before = 0, after = 0, count = 0;
const patches = []; // { projectId, filename, fileSize, dimensions }

for (const p of projects) {
  if (delivers.has(p.id)) { console.log(`skip ${p.id} (client portal downloads)`); continue; }
  for (const img of p.images || []) {
    if (!/\.jpe?g$/i.test(img.filename)) continue;
    const file = path.join(IMAGES_DIR, p.id, img.filename);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) continue;
    const meta = await sharp(file).metadata().catch(() => null);
    if (!meta) continue;
    if (stat.size <= MAX_BYTES && Math.max(meta.width, meta.height) <= LONG_EDGE) continue;

    const out = await sharp(file).rotate()
      .resize({ width: LONG_EDGE, height: LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .withMetadata()
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (out.data.length >= stat.size) continue;

    before += stat.size; after += out.data.length; count++;
    console.log(`${p.id}/${img.filename}: ${mb(stat.size)} → ${mb(out.data.length)}`);
    if (WRITE) {
      // write-then-copy: rename doesn't land reliably on this volume
      const tmp = `${file}.shrink-tmp`;
      await fs.writeFile(tmp, out.data);
      await fs.copyFile(tmp, file);
      await fs.unlink(tmp);
      patches.push({ projectId: p.id, filename: img.filename, fileSize: out.data.length, dimensions: `${out.info.width}×${out.info.height}` });
    }
  }
}

console.log(`\n${count} files: ${mb(before)} → ${mb(after)} (saves ${mb(before - after)})`);

if (WRITE && patches.length) {
  // Re-read just before writing so edits made while this ran aren't lost
  const data = await readProjects();
  for (const x of patches) {
    const img = data.projects.find(p => p.id === x.projectId)?.images?.find(i => i.filename === x.filename);
    if (img) img.exif = { ...(img.exif || {}), fileSize: x.fileSize, dimensions: x.dimensions };
  }
  await writeProjects(data);
  console.log('projects.json updated');
} else if (!WRITE) {
  console.log('dry run — nothing changed. Re-run with --write to apply.');
}
