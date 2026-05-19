/* functions/utils/blobs.js
 *
 * Thin wrapper around @netlify/blobs so the rest of the codebase
 * doesn't depend on the SDK shape directly.
 *
 * Stores:
 *   getJson(key)       → parsed JSON or null
 *   setJson(key, obj)  → writes JSON
 *   getBytes(key)      → Buffer or null
 *   setBytes(key, buf) → writes binary
 *   del(key)           → removes
 *   list(prefix)       → array of keys
 */

import { getStore } from '@netlify/blobs';

const store = getStore('aldocarrera');

export async function getJson(key) {
  const raw = await store.get(key, { type: 'text' });
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

export async function setJson(key, value) {
  await store.set(key, JSON.stringify(value), {
    metadata: { contentType: 'application/json' },
  });
}

export async function getBytes(key) {
  return store.get(key, { type: 'arrayBuffer' });
}

export async function setBytes(key, bytes, contentType = 'application/octet-stream') {
  await store.set(key, bytes, { metadata: { contentType } });
}

export async function del(key) {
  await store.delete(key);
}

export async function list(prefix) {
  const { blobs } = await store.list({ prefix });
  return blobs.map(b => b.key);
}

/* ------------------------------------------------------------------ */
/* Convenience getters/setters for the five JSON files                */
/* ------------------------------------------------------------------ */

export const PROJECTS_KEY = 'projects.json';
export const ABOUT_KEY    = 'about.json';
export const CLIENTS_KEY  = 'clients.json';
export const SERVICES_KEY = 'services.json';
export const SETTINGS_KEY = 'settings.json';
export const HISTORY_KEY  = 'upload-history.json';

export const readProjects = () => getJson(PROJECTS_KEY).then(d => d || { projects: [] });
export const writeProjects = (data) => setJson(PROJECTS_KEY, data);

export const readAbout    = () => getJson(ABOUT_KEY).then(d => d || defaultAbout());
export const writeAbout   = (data) => setJson(ABOUT_KEY, data);

export const readClients  = () => getJson(CLIENTS_KEY).then(d => d || { clients: [] });
export const writeClients = (data) => setJson(CLIENTS_KEY, data);

export const readServices  = () => getJson(SERVICES_KEY).then(d => d || { services: [] });
export const writeServices = (data) => setJson(SERVICES_KEY, data);

export const readSettings  = () => getJson(SETTINGS_KEY).then(d => d || defaultSettings());
export const writeSettings = (data) => setJson(SETTINGS_KEY, data);

export const readHistory   = () => getJson(HISTORY_KEY).then(d => d || { uploads: [] });
export const writeHistory  = (data) => setJson(HISTORY_KEY, data);

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
