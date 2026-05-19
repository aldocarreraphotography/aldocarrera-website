/* utils/decks.js — shareable deck token store */

import fs     from 'node:fs/promises';
import path   from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

async function readJson(filename) {
  try { return JSON.parse(await fs.readFile(path.join(DATA_DIR, filename), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function writeJson(filename, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const dest = path.join(DATA_DIR, filename);
  const tmp  = dest + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, dest);
}

export function generateToken() { return crypto.randomBytes(14).toString('base64url'); }

export const readDecks  = async () => (await readJson('decks.json')) || { decks: [] };
export const writeDecks = (d)    => writeJson('decks.json', d);

export async function findDeck(token) {
  const { decks } = await readDecks();
  return decks.find(d => d.token === token) || null;
}

export async function createDeck({ projectId, title, imagesFilter, expiresAt }) {
  const data = await readDecks();
  const deck = {
    token:        generateToken(),
    projectId,
    title:        title        || '',
    imagesFilter: imagesFilter || 'selected',
    createdAt:    new Date().toISOString(),
    expiresAt:    expiresAt    || null,
    views:        0,
  };
  data.decks.unshift(deck);
  await writeDecks(data);
  return deck;
}

export async function incrementViews(token) {
  const data = await readDecks();
  const d    = data.decks.find(x => x.token === token);
  if (d) { d.views = (d.views || 0) + 1; await writeDecks(data); }
}

export async function deleteDeck(token) {
  const data   = await readDecks();
  const before = data.decks.length;
  data.decks   = data.decks.filter(d => d.token !== token);
  if (data.decks.length === before) return false;
  await writeDecks(data);
  return true;
}
