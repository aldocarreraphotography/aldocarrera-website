/* backup.js — nightly off-site backup to Dropbox.
 *
 * The NAS is a single disk with no snapshots; until this existed, a disk
 * failure would have lost every admin edit (projects.json, galleries,
 * settings) and any photo uploaded straight to the admin. Each night:
 *
 *   1. Site data: every JSON file in DATA_DIR is copied to
 *      /_aldocarrera-site-backups/<YYYY-MM-DD>/ — dated folders, 30 kept.
 *   2. Media: IMAGES_DIR is mirrored to /_aldocarrera-site-backups/images/,
 *      uploading only files missing (or a different size) in Dropbox, so
 *      after the first run it's just new uploads. Regenerable caches
 *      (__resized, temp dirs) are skipped.
 *
 * Status is kept in memory for /api/health and /api/admin/backup-status.
 */

import fs   from 'node:fs/promises';
import path from 'node:path';
import { listFolder, uploadFile, deletePath, isConfigured } from './dropbox.js';

const ROOT        = process.env.BACKUP_ROOT || '/_aldocarrera-site-backups';
const KEEP_DAYS   = 30;
const MAX_UPLOAD  = 145 * 1024 * 1024;           // files/upload limit is 150 MB
const SKIP_DIRS   = new Set(['__resized', '__ug_tmp', '__video_tmp']);
const SKIP_FILES  = /^(admin-auth\.json|\.)/;    // password hash + dotfiles stay home

export const backupStatus = {
  running: false,
  lastStartedAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastRun: null,   // { dataFiles, mediaUploaded, mediaSkipped, mediaTooLarge, pruned, seconds }
};

const today = () => new Date().toISOString().slice(0, 10);

async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...await walk(full, base));
    } else if (entry.isFile() && !entry.name.startsWith('.')) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

async function remoteSizes(folder) {
  try {
    const entries = await listFolder(null, folder, { mediaInfo: false, recursive: true });
    const sizes = new Map();
    for (const e of entries) if (e['.tag'] === 'file') sizes.set(e.path_lower, e.size);
    return sizes;
  } catch (err) {
    if (/not_found/.test(err.message)) return new Map();
    throw err;
  }
}

export async function runBackup({ dataDir, imagesDir }) {
  if (backupStatus.running) return backupStatus;
  if (!isConfigured()) throw new Error('Dropbox not configured');
  backupStatus.running = true;
  backupStatus.lastStartedAt = new Date().toISOString();
  const t0 = Date.now();
  const run = { dataFiles: 0, mediaUploaded: 0, mediaSkipped: 0, mediaTooLarge: 0, pruned: 0 };
  try {
    // 1. Dated copy of the site data
    const day = today();
    for (const name of await fs.readdir(dataDir)) {
      if (!name.endsWith('.json') || SKIP_FILES.test(name)) continue;
      await uploadFile(`${ROOT}/${day}/${name}`, await fs.readFile(path.join(dataDir, name)));
      run.dataFiles++;
    }

    // 2. Keep the newest KEEP_DAYS dated folders
    const top = await listFolder(null, ROOT, { mediaInfo: false });
    const dated = top
      .filter(e => e['.tag'] === 'folder' && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
      .map(e => e.name).sort().reverse();
    for (const old of dated.slice(KEEP_DAYS)) {
      await deletePath(`${ROOT}/${old}`);
      run.pruned++;
    }

    // 3. Incremental media mirror
    const mediaRoot = `${ROOT}/images`;
    const remote = await remoteSizes(mediaRoot);
    for (const rel of await walk(imagesDir)) {
      const stat = await fs.stat(path.join(imagesDir, rel)).catch(() => null);
      if (!stat) continue;
      const dest = `${mediaRoot}/${rel}`;
      if (remote.get(dest.toLowerCase()) === stat.size) { run.mediaSkipped++; continue; }
      if (stat.size > MAX_UPLOAD) { run.mediaTooLarge++; continue; }
      await uploadFile(dest, await fs.readFile(path.join(imagesDir, rel)));
      run.mediaUploaded++;
    }

    backupStatus.lastSuccessAt = new Date().toISOString();
    backupStatus.lastError = null;
  } catch (err) {
    backupStatus.lastError = err?.message || String(err);
    console.error('[backup] failed:', backupStatus.lastError);
  } finally {
    run.seconds = Math.round((Date.now() - t0) / 1000);
    backupStatus.lastRun = run;
    backupStatus.running = false;
    console.log('[backup]', JSON.stringify(run), backupStatus.lastError ? `error: ${backupStatus.lastError}` : 'ok');
  }
  return backupStatus;
}

/* Check every hour; run once per day after 03:00 server time (and shortly
   after startup if today's backup hasn't happened yet). The last success is
   recovered from Dropbox on boot, so restarts don't trigger extra runs. */
export function scheduleBackups({ dataDir, imagesDir }) {
  if (!isConfigured()) { console.warn('[backup] Dropbox not configured — backups disabled'); return; }
  const tick = async () => {
    if (backupStatus.running) return;
    if (!backupStatus.lastSuccessAt) {
      try {
        const top = await listFolder(null, ROOT, { mediaInfo: false });
        const last = top.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.name)).map(e => e.name).sort().pop();
        if (last) backupStatus.lastSuccessAt = `${last}T00:00:00.000Z`;
      } catch (_) { /* first ever run */ }
    }
    const doneToday = (backupStatus.lastSuccessAt || '').slice(0, 10) === today();
    if (!doneToday && new Date().getHours() >= 3) runBackup({ dataDir, imagesDir });
  };
  setTimeout(tick, 2 * 60 * 1000);   // let the server settle after a restart
  setInterval(tick, 60 * 60 * 1000);
}
