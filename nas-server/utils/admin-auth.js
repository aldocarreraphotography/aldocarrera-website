/* utils/admin-auth.js — admin credentials storage with scrypt hashing.
 *
 * Layered authority:
 *   1. If data/admin-auth.json exists with a {username, salt, hash}
 *      → use it. (Set after the admin changes password via UI.)
 *   2. Otherwise fall back to the ADMIN_USERNAME + ADMIN_PASSWORD env vars.
 *      (Bootstrap before any password change. ADMIN_USERNAME defaults
 *      to "aldocarrera" if unset for backward compatibility.)
 *
 * Recovery: if the admin forgets their changed password, deleting
 * data/admin-auth.json reverts auth to the env vars.
 *
 * Hashing: Node's built-in crypto.scrypt with a 16-byte random salt
 * and 64-byte derived key. No external deps. Constant-time compare
 * via crypto.timingSafeEqual to defeat timing side channels.
 *
 * Username is compared case-insensitively (we trim + lowercase both
 * sides) — usernames are not the secret, passwords are.
 */

import fs     from 'node:fs/promises';
import path   from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR  = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');

/* ── Internal helpers ──────────────────────────────────────── */

async function readStored() {
  try {
    const raw = await fs.readFile(AUTH_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null; // not configured yet → fall back to env var
  }
}

async function writeStored(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = AUTH_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, AUTH_FILE); // atomic
}

function scryptHash(password, saltHex) {
  return new Promise((resolve, reject) => {
    const salt = Buffer.from(saltHex, 'hex');
    crypto.scrypt(String(password), salt, 64, (err, derived) => {
      if (err) reject(err);
      else     resolve(derived.toString('hex'));
    });
  });
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function safeEqualPlain(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Pad shorter to longer so timingSafeEqual works on equal-length buffers
  const len = Math.max(Buffer.byteLength(a), Buffer.byteLength(b));
  const ab = Buffer.alloc(len);
  const bb = Buffer.alloc(len);
  ab.write(a); bb.write(b);
  const ok = crypto.timingSafeEqual(ab, bb);
  return ok && Buffer.byteLength(a) === Buffer.byteLength(b);
}

/* ── Public API ────────────────────────────────────────────── */

const DEFAULT_USERNAME = 'aldocarrera';

function normalizeUsername(u) {
  return String(u || '').trim().toLowerCase();
}

async function currentUsername() {
  const stored = await readStored();
  if (stored && stored.username) return normalizeUsername(stored.username);
  return normalizeUsername(process.env.ADMIN_USERNAME || DEFAULT_USERNAME);
}

/** True if the admin has changed their password from the env-var default. */
export async function hasStoredPassword() {
  const s = await readStored();
  return !!(s && s.salt && s.hash);
}

/** Verify a username + password attempt. Constant-time. Returns boolean. */
export async function verifyCredentials(username, plaintext) {
  if (!plaintext) return false;
  // Username check (case-insensitive, trimmed)
  const expectedUser = await currentUsername();
  if (normalizeUsername(username) !== expectedUser) {
    // Still run the password hash so timing reveals nothing about which field is wrong
    await scryptHash(plaintext, '00'.repeat(16)).catch(() => {});
    return false;
  }
  // Password check
  const stored = await readStored();
  if (stored && stored.salt && stored.hash) {
    const candidate = await scryptHash(plaintext, stored.salt);
    return safeEqualHex(candidate, stored.hash);
  }
  const envPw = process.env.ADMIN_PASSWORD;
  if (!envPw) return false;
  return safeEqualPlain(plaintext, envPw);
}

/** Legacy alias — verify password only (used by /api/auth/change-password
 *  where the caller is already an authenticated session, so they only need
 *  to re-prove the current password, not the username). */
export async function verifyPassword(plaintext) {
  if (!plaintext) return false;
  const stored = await readStored();
  if (stored && stored.salt && stored.hash) {
    const candidate = await scryptHash(plaintext, stored.salt);
    return safeEqualHex(candidate, stored.hash);
  }
  const envPw = process.env.ADMIN_PASSWORD;
  if (!envPw) return false;
  return safeEqualPlain(plaintext, envPw);
}

/** Hash and persist a new password. Throws on weak input.
 *  Preserves the existing username — change it via setUsername separately. */
export async function setPassword(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  const existing = (await readStored()) || {};
  const saltHex = crypto.randomBytes(16).toString('hex');
  const hashHex = await scryptHash(plaintext, saltHex);
  await writeStored({
    username:  existing.username || normalizeUsername(process.env.ADMIN_USERNAME || DEFAULT_USERNAME),
    salt:      saltHex,
    hash:      hashHex,
    algorithm: 'scrypt',
    updatedAt: new Date().toISOString(),
  });
}
