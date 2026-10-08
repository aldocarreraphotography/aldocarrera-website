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
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Babel from '@babel/standalone';
import { buildSeo } from './seo.mjs';

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
  'admin-views-unified.jsx',

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

// ---------------------------------------------------------------- precompile

/* The source pages load .jsx through @babel/standalone, compiling in every
   visitor's browser (~3 MB of compiler + compile time before first paint).
   The deployed copy is compiled here instead, with the SAME Babel version
   and the options @babel/standalone uses for <script type="text/babel">
   (presets react + env, its three default plugins), so behaviour matches.
   Output goes to /build/<name>.<hash>.js — content-hashed, so netlify.toml
   can cache it for a year — loaded with `defer`, which runs the scripts in
   document order after parsing, like Babel did on DOMContentLoaded.
   Source files are untouched; local dev keeps working without a build. */
const BABEL_OPTIONS = {
  presets: ['react', 'env'],
  plugins: ['transform-class-properties', 'transform-object-rest-spread', 'transform-flow-strip-types'],
  targets: { browsers: undefined },
  comments: false,
};

// React's production builds: ~140 KB vs ~1.1 MB for the development builds.
const REACT_PROD = {
  'react': '<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js" integrity="sha384-DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z" crossorigin="anonymous"></script>',
  'react-dom': '<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" integrity="sha384-gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1" crossorigin="anonymous"></script>',
};

async function writeCompiled(name, code) {
  const out = Babel.transform(code, { ...BABEL_OPTIONS, filename: name + '.jsx' }).code;
  const hash = crypto.createHash('sha256').update(out).digest('hex').slice(0, 10);
  const rel = `build/${name}.${hash}.js`;
  await fs.mkdir(path.join(DIST, 'build'), { recursive: true });
  await fs.writeFile(path.join(DIST, rel), out);
  return '/' + rel;
}

async function precompilePages() {
  const compiled = new Map(); // jsx path → /build/... url
  const pages = (await fs.readdir(DIST)).filter(f => f.endsWith('.html'));
  for (const page of pages) {
    const file = path.join(DIST, page);
    let html = await fs.readFile(file, 'utf8');
    if (!/text\/babel/.test(html)) continue;

    // External <script type="text/babel" src="x.jsx">
    for (const m of [...html.matchAll(/<script type="text\/babel" src="\/?([^"]+\.jsx)"><\/script>/g)]) {
      const rel = m[1];
      if (!compiled.has(rel)) {
        const code = await fs.readFile(path.join(DIST, rel), 'utf8');
        compiled.set(rel, await writeCompiled(rel.replace(/\.jsx$/, ''), code));
      }
      html = html.replace(m[0], `<script defer src="${compiled.get(rel)}"></script>`);
    }
    // Inline <script type="text/babel"> blocks
    let n = 0;
    for (const m of [...html.matchAll(/<script type="text\/babel">([\s\S]*?)<\/script>/g)]) {
      const url = await writeCompiled(`${page.replace(/\.html$/, '')}-inline-${++n}`, m[1]);
      html = html.replace(m[0], `<script defer src="${url}"></script>`);
    }
    if (/text\/babel/.test(html)) throw new Error(`${page}: unhandled text/babel script`);

    html = html
      .replace(/<script src="https:\/\/unpkg\.com\/@babel\/standalone@[^"]+"[^>]*><\/script>\n?/g, '')
      .replace(/<script src="https:\/\/unpkg\.com\/react@18\.3\.1\/umd\/react\.development\.js"[^>]*><\/script>/g, REACT_PROD['react'])
      .replace(/<script src="https:\/\/unpkg\.com\/react-dom@18\.3\.1\/umd\/react-dom\.development\.js"[^>]*><\/script>/g, REACT_PROD['react-dom']);
    await fs.writeFile(file, html);
    console.log(`  · ${page}: compiled`);
  }
  return compiled.size;
}

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

  console.log('• precompiling JSX');
  const nCompiled = await precompilePages();
  console.log(`  ${nCompiled} scripts → dist/build/`);

  console.log('• building SEO pages');
  const seoSitemap = await buildSeo({ fs, path, DIST });

  console.log('• writing robots.txt + sitemap.xml + 404.html');
  await fs.writeFile(path.join(DIST, 'robots.txt'),  ROBOTS);
  await fs.writeFile(path.join(DIST, 'sitemap.xml'), seoSitemap || SITEMAP);
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
