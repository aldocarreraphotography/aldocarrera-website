/**
 * scripts/build.mjs
 *
 * Static build for aldocarrera.com.
 *
 * There is no bundler — the public site and the admin SPA both load
 * plain .jsx files via @babel/standalone at runtime. The "build" step
 * is therefore just: copy the right source files into ./dist so
 * Netlify can publish that as the site root.
 *
 * We only copy what the deployed site actually needs. Source-of-truth
 * design files (Mobile Preview.html, To-Go Deck.html, screenshots/,
 * uploads/, admin-handoff/) are left out of dist.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');
const DIST       = path.join(ROOT, 'dist');

// ---------------------------------------------------------------- manifest
// Every file the deployed site needs. Keep this list explicit — it doubles
// as documentation of the runtime dependency graph.

const FILES = [
  // Public site entry
  'index.html',

  // Admin SPA entry
  'Admin.html',

  // Shared
  'logo.jsx',
  'logo.svg',
  'aldo-signature.png',

  // Public site code
  'aldo-styles.css',
  'aldo-data.jsx',
  'aldo-window.jsx',
  'aldo-views.jsx',
  'aldo-app.jsx',
  'tweaks-panel.jsx',

  // Admin code
  'admin-styles.css',
  'admin-store.jsx',
  'admin-shell.jsx',
  'admin-components.jsx',
  'admin-exif.jsx',
  'admin-views-auth.jsx',
  'admin-views-projects.jsx',
  'admin-views-content.jsx',
  'admin-views-galleries.jsx',
  'admin-views-videos.jsx',
  'admin-views-prints.jsx',
  'admin-views-analytics.jsx',
  'admin-views-dropbox.jsx',

  // Client gallery (token-gated)
  'gallery.html',
  'gallery-styles.css',

  // Client gallery portals (PIN-gated /g/:token)
  'client-gallery.html',
  'client-gallery.jsx',

  // Unified gallery (merged review + delivery, /ug/:token) — Phase 1+
  'unified-gallery.html',
  'unified-gallery.jsx',

  // To-go deck (public slideshow)
  'deck.html',
  'deck-styles.css',

  // Favicon
  'favicon.svg',

  // Social sharing / OG image
  'og-image.jpg',

  // Hidden /raw section
  'raw.html',
  'raw-styles.css',

  // /notes dispatch section
  'notes.html',
  'notes-styles.css',

  // Admin dispatches view
  'admin-views-dispatches.jsx',
];

const DIRS = [
  'photos',
];

// ---------------------------------------------------------------- helpers

async function rimraf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else if (entry.isFile()) {
      await fs.copyFile(s, d);
    }
  }
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

// ---------------------------------------------------------------- robots / 404

const ROBOTS = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /Admin.html
Disallow: /api/
Disallow: /g/

Sitemap: https://aldocarrera.com/sitemap.xml
`;

const today = new Date().toISOString().slice(0, 10);
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://aldocarrera.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

const NOT_FOUND = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Not found — Aldo Carrera</title>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-EJNJGESZT6"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-EJNJGESZT6', { send_page_view: true, page_path: '404' });
</script>
<link rel="stylesheet" href="/aldo-styles.css"/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"/>
<style>
  html, body { margin: 0; padding: 0; background: #f6f4ef; color: #1a1a1a; }
  body { font-family: "Inter", system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .wrap { text-align: left; padding: 2rem; max-width: 36rem; }
  .code { font-family: "IBM Plex Mono", monospace; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: #888; margin: 0 0 1.5rem; }
  h1 { font-size: 2rem; font-weight: 500; letter-spacing: -0.02em; margin: 0 0 1rem; line-height: 1.1; }
  p  { font-size: 0.95rem; line-height: 1.5; color: #555; margin: 0 0 1.5rem; }
  a  { color: #1a1a1a; text-decoration: none; border-bottom: 1px solid #1a1a1a; padding-bottom: 1px; font-size: 0.9rem; }
  a:hover { color: #888; border-color: #888; }
</style>
</head>
<body>
  <div class="wrap">
    <p class="code">404 / not found</p>
    <h1>This page doesn't exist.</h1>
    <p>The link may have moved, or it was never here. Head back to the archive and try again.</p>
    <a href="/">← Return to the archive</a>
  </div>
</body>
</html>
`;

// ---------------------------------------------------------------- main

async function main() {
  console.log('• cleaning dist/');
  await rimraf(DIST);
  await fs.mkdir(DIST, { recursive: true });

  let copied = 0;
  let skipped = [];

  console.log('• copying files');
  for (const rel of FILES) {
    const src  = path.join(ROOT, rel);
    const dest = path.join(DIST, rel);
    if (!(await exists(src))) {
      skipped.push(rel);
      continue;
    }
    await copyFile(src, dest);
    copied++;
  }

  console.log('• copying directories');
  for (const rel of DIRS) {
    const src  = path.join(ROOT, rel);
    const dest = path.join(DIST, rel);
    if (!(await exists(src))) {
      skipped.push(rel + '/');
      continue;
    }
    await copyDir(src, dest);
  }

  console.log('• writing robots.txt + sitemap.xml + 404.html');
  await fs.writeFile(path.join(DIST, 'robots.txt'),  ROBOTS);
  await fs.writeFile(path.join(DIST, 'sitemap.xml'), SITEMAP);
  await fs.writeFile(path.join(DIST, '404.html'),    NOT_FOUND);

  // Friendly /admin URL with no extension — a static stub for direct hits,
  // even though netlify.toml also redirects /admin → /Admin.html.
  const adminHtml = await fs.readFile(path.join(DIST, 'Admin.html'), 'utf8');
  await fs.mkdir(path.join(DIST, 'admin'), { recursive: true });
  await fs.writeFile(path.join(DIST, 'admin', 'index.html'), adminHtml);

  console.log('');
  console.log(`✓ build complete — ${copied} files copied to dist/`);
  if (skipped.length) {
    console.log('  (skipped, not present in source):');
    for (const s of skipped) console.log('    -', s);
  }
}

main().catch((err) => {
  console.error('build failed:', err);
  process.exit(1);
});
