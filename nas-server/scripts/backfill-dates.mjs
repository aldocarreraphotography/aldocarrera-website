#!/usr/bin/env node
/**
 * backfill-dates.mjs — one-off: fill in exif.dateTaken for project images
 * that were imported without one. The import used to ask exifr for tag
 * names it doesn't use, so only DateTimeOriginal was ever found; film scans
 * (CreateDate / IPTC DigitalCreationDate only) came in with no date.
 * Same lookup as _exifDate in server.js. Only touches images with no date.
 *
 * Usage (inside the api container):
 *   node scripts/backfill-dates.mjs           # dry run
 *   node scripts/backfill-dates.mjs --write   # update projects.json
 */

import path from 'node:path';
import fs   from 'node:fs/promises';
import exifr from 'exifr';
import { readProjects, writeProjects } from '../utils/store.js';

const IMAGES_DIR = process.env.IMAGES_DIR || path.join(process.cwd(), 'images');
const WRITE = process.argv.includes('--write');

async function exifDate(file) {
  try {
    const e = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate', 'DigitalCreationDate'], iptc: true, xmp: false });
    let raw = e?.DateTimeOriginal || e?.CreateDate;
    const dc = String(e?.DigitalCreationDate || '');
    if (!raw && /^\d{8}$/.test(dc)) raw = `${dc.slice(0, 4)}-${dc.slice(4, 6)}-${dc.slice(6, 8)}T12:00:00Z`;
    const d = raw ? new Date(raw) : null;
    return d && !isNaN(d.getTime()) && d.getFullYear() > 1990 ? d.toISOString() : null;
  } catch (_) { return null; }
}

const { projects } = await readProjects();
const found = new Map(); // `${projectId}/${filename}` → ISO date
let missing = 0;

for (const p of projects) {
  let n = 0, hit = 0;
  for (const img of p.images || []) {
    if (img.exif?.dateTaken) continue;
    n++; missing++;
    const d = await exifDate(path.join(IMAGES_DIR, p.id, img.filename));
    if (d) { found.set(`${p.id}/${img.filename}`, d); hit++; }
  }
  if (n) console.log(`${p.id}: ${hit} of ${n} undated photos have a date in the file`);
}

console.log(`\n${found.size} of ${missing} undated photos can be filled in`);

if (WRITE && found.size) {
  // Re-read just before writing so edits made while this ran aren't lost
  const data = await readProjects();
  for (const p of data.projects) for (const img of p.images || []) {
    const d = found.get(`${p.id}/${img.filename}`);
    if (d && !img.exif?.dateTaken) img.exif = { ...(img.exif || {}), dateTaken: d };
  }
  await writeProjects(data);
  console.log('projects.json updated');
} else if (!WRITE) {
  console.log('dry run — nothing changed. Re-run with --write to apply.');
}
