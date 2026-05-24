#!/usr/bin/env node
/**
 * backfill-exif.js — one-off script to populate missing EXIF metadata
 * on existing project images.
 *
 * For every image in projects.json that's missing dimensions / fileSize /
 * dateTaken, this opens the actual file from IMAGES_DIR with sharp and
 * fills in what it can read.
 *
 * Usage (from inside nas-server/):
 *   node scripts/backfill-exif.js                # dry-run, prints what would change
 *   node scripts/backfill-exif.js --write        # actually patches projects.json
 *
 * Idempotent — only fills empty fields, never overwrites existing values.
 */

import path from 'node:path';
import fs   from 'node:fs/promises';
import sharp from 'sharp';
import { readProjects, writeProjects } from '../utils/store.js';

const IMAGES_DIR = process.env.IMAGES_DIR || path.join(process.cwd(), 'images');
const WRITE      = process.argv.includes('--write');
const FORCE_BLUR = process.argv.includes('--force-blur'); // regenerate blurDataURL even when one exists

function fmtBytes(n) {
  if (!n) return '—';
  const u = ['B','KB','MB','GB'];
  let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}

async function readExif(filePath) {
  const stat = await fs.stat(filePath);
  const meta = await sharp(filePath).metadata();
  let dateTaken = null;
  // sharp surfaces EXIF DateTimeOriginal in meta.exif (raw buffer); easier route is meta.exif → exifr,
  // but for one-off we'll fall back to file mtime if no exif date is present.
  // (sharp doesn't decode EXIF strings on its own — we'd need exifr for that.)
  // We at least get dimensions and size deterministically:
  return {
    dimensions: meta.width && meta.height ? `${meta.width}×${meta.height}` : '',
    fileSize: stat.size,
    dateTaken, // left null on purpose; mtime is unreliable
  };
}

async function main() {
  const data = await readProjects();
  let touched = 0, scanned = 0, missing = 0;

  for (const project of data.projects || []) {
    for (const img of project.images || []) {
      scanned++;
      const ex = img.exif || {};
      const needsDims = !ex.dimensions;
      const needsSize = !ex.fileSize;
      const needsBlur = !img.blurDataURL || FORCE_BLUR;
      if (!needsDims && !needsSize && !needsBlur) continue;

      const filePath = path.join(IMAGES_DIR, project.id, img.filename);
      try {
        let patchedSomething = false;

        if (needsDims || needsSize) {
          const read = await readExif(filePath);
          const patch = {};
          if (needsDims && read.dimensions) patch.dimensions = read.dimensions;
          if (needsSize && read.fileSize)   patch.fileSize   = read.fileSize;
          if (Object.keys(patch).length > 0) {
            img.exif = { ...ex, ...patch };
            patchedSomething = true;
          }
        }

        if (needsBlur) {
          // 20px PNG — preserves pixel edges when scaled with image-rendering: pixelated.
          const blur = await sharp(filePath)
            .rotate()
            .resize({ width: 20 })
            .png()
            .toBuffer();
          img.blurDataURL = `data:image/png;base64,${blur.toString('base64')}`;
          patchedSomething = true;
        }

        if (patchedSomething) {
          touched++;
          console.log(`✓ ${project.id}/${img.filename}  →  ${img.exif?.dimensions || '?'}  ·  ${fmtBytes(img.exif?.fileSize)}  ·  blur ${img.blurDataURL ? 'ok' : '—'}`);
        }
      } catch (err) {
        missing++;
        console.warn(`✗ ${project.id}/${img.filename}  →  ${err.code || err.message}`);
      }
    }
  }

  console.log(`\nScanned ${scanned} images · ${touched} filled · ${missing} missing-on-disk · mode = ${WRITE ? 'WRITE' : 'DRY-RUN'}`);
  if (WRITE && touched > 0) {
    await writeProjects(data);
    console.log('projects.json updated.');
  } else if (touched > 0) {
    console.log('Re-run with --write to persist these changes.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
