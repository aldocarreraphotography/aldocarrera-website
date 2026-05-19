/* utils/galleries.js — gallery token store */

import fs   from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

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

export function generateToken() {
  return crypto.randomBytes(14).toString('base64url');
}

export async function readGalleries() {
  const d = await readJson('galleries.json');
  return d || { galleries: [] };
}

export async function writeGalleries(data) {
  return writeJson('galleries.json', data);
}

export async function findGallery(token) {
  const { galleries } = await readGalleries();
  return galleries.find(g => g.token === token) || null;
}

export async function createGallery({ projectId, clientName, title, expiresAt, password }) {
  const data    = await readGalleries();
  const gallery = {
    token:       generateToken(),
    projectId,
    clientName:  clientName || '',
    title:       title || `${projectId} — Gallery`,
    createdAt:   new Date().toISOString(),
    expiresAt:   expiresAt || null,
    password:    password  || null,
    status:      'open',
    submittedAt: null,
    selections:  {},
  };
  data.galleries.unshift(gallery);
  await writeGalleries(data);
  return gallery;
}

export async function updateGallery(token, patch) {
  const data = await readGalleries();
  const idx  = data.galleries.findIndex(g => g.token === token);
  if (idx === -1) return null;
  data.galleries[idx] = { ...data.galleries[idx], ...patch };
  await writeGalleries(data);
  return data.galleries[idx];
}

export async function deleteGallery(token) {
  const data   = await readGalleries();
  const before = data.galleries.length;
  data.galleries = data.galleries.filter(g => g.token !== token);
  if (data.galleries.length === before) return false;
  await writeGalleries(data);
  return true;
}

export function isExpired(gallery) {
  if (!gallery.expiresAt) return false;
  return new Date(gallery.expiresAt) < new Date();
}
