/* utils/store.js — filesystem replacement for Netlify Blobs.
 *
 * JSON files live in DATA_DIR  (default: ./data)
 * Image bytes live in IMAGES_DIR (default: ./images)
 *
 * Writes are atomic: we write to a .tmp file then rename, so a crash
 * mid-write can't corrupt the main file.
 */

import fs   from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR   = process.env.DATA_DIR   || path.join(process.cwd(), 'data');
const IMAGES_DIR = process.env.IMAGES_DIR || path.join(process.cwd(), 'images');

/* ------------------------------------------------------------------ */
/* JSON helpers                                                        */
/* ------------------------------------------------------------------ */

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
  await fs.rename(tmp, dest);
}

/* ------------------------------------------------------------------ */
/* Image bytes helpers                                                 */
/* ------------------------------------------------------------------ */

export async function readBytes(projectId, filename) {
  try {
    return await fs.readFile(path.join(IMAGES_DIR, projectId, filename));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeBytes(projectId, filename, buffer) {
  const dir = path.join(IMAGES_DIR, projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
}

export async function deleteImage(projectId, filename) {
  try { await fs.unlink(path.join(IMAGES_DIR, projectId, filename)); } catch (_) {}
}

export async function deleteProjectImages(projectId) {
  try { await fs.rm(path.join(IMAGES_DIR, projectId), { recursive: true, force: true }); } catch (_) {}
}

/* ------------------------------------------------------------------ */
/* Named convenience functions (mirrors Netlify blobs.js interface)   */
/* ------------------------------------------------------------------ */

function defaultAbout() {
  return {
    bio: '',
    location: '',
    education: { school: '', degree: '', year: null },
    practice: [],
  };
}
function defaultSettings() {
  return {
    contactEmail: '',
    contactPhone: '',
    instagram: '',
    accentColor: '#d63e5a',
  };
}

export const readProjects  = () => readJson('projects.json').then(d => d || { projects: [] });
export const writeProjects = (d) => writeJson('projects.json', d);

export const readVideos  = () => readJson('videos.json').then(d => d || { videos: [] });
export const writeVideos = (d) => writeJson('videos.json', d);

export const readPrints  = () => readJson('prints.json').then(d => d || { prints: [] });
export const writePrints = (d) => writeJson('prints.json', d);

export async function readVideoBytes(videoId, filename) {
  try { return await fs.readFile(path.join(IMAGES_DIR, '__videos', videoId, filename)); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export async function writeVideoBytes(videoId, filename, buffer) {
  const dir = path.join(IMAGES_DIR, '__videos', videoId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
}
export async function writeVideoBytesFromPath(videoId, filename, tmpPath) {
  const dir  = path.join(IMAGES_DIR, '__videos', videoId);
  const dest = path.join(dir, filename);
  await fs.mkdir(dir, { recursive: true });
  // Try rename first (same filesystem = instant), fall back to copy+unlink
  try {
    await fs.rename(tmpPath, dest);
  } catch (e) {
    if (e.code === 'EXDEV') {
      await fs.copyFile(tmpPath, dest);
      await fs.unlink(tmpPath).catch(() => {});
    } else { throw e; }
  }
}
export function getVideoTmpDir() {
  return path.join(IMAGES_DIR, '__video_tmp');
}
export async function deleteVideoFile(videoId, filename) {
  try { await fs.unlink(path.join(IMAGES_DIR, '__videos', videoId, filename)); } catch (_) {}
}

export const readAbout    = () => readJson('about.json').then(d => d || defaultAbout());
export const writeAbout   = (d) => writeJson('about.json', d);

export const readClients  = () => readJson('clients.json').then(d => d || { clients: [] });
export const writeClients = (d) => writeJson('clients.json', d);

export const readServices  = () => readJson('services.json').then(d => d || { services: [] });
export const writeServices = (d) => writeJson('services.json', d);

export const readSettings  = () => readJson('settings.json').then(d => d || defaultSettings());
export const writeSettings = (d) => writeJson('settings.json', d);

export const readGalleryPortals  = () => readJson('gallery-portals.json').then(d => d || { portals: [] });
export const writeGalleryPortals = (d) => writeJson('gallery-portals.json', d);
