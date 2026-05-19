# Aldo Carrera — Photography Website

The portfolio and studio admin for **aldocarrera.com**, deployed on Netlify.

```
┌─────────────────────────────────────────────────────────────┐
│  Public site    →  index.html       (The Archive)           │
│  Admin SPA      →  Admin.html       (/admin)                │
│  API            →  functions/*      (/api/*)                │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick start

```sh
npm install
cp .env.example .env          # then edit ADMIN_PASSWORD + JWT_SECRET
npm run build                 # populates dist/
npm run preview               # static preview at http://localhost:5173
# — or —
npm run dev                   # full Netlify dev server (functions + redirects)
```

The deployed site serves `dist/` as its root and exposes Netlify Functions
under `/api/*`. See `netlify.toml` for the full redirect table.

---

## Scripts

| Script           | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `npm run build`  | Copy public site + admin SPA into `dist/`.       |
| `npm run clean`  | Wipe `dist/`.                                    |
| `npm run dev`    | `netlify dev` — functions, redirects, hot reload |
| `npm run preview`| Serve the existing `dist/` over localhost        |
| `npm start`      | Build then preview.                              |

---

## Project layout

```
.
├── index.html                ← Public site entry (was: The Archive.html)
├── Admin.html                ← Admin SPA entry
│
├── aldo-*.jsx, aldo-styles.css   public-site source
├── admin-*.jsx, admin-styles.css admin SPA source
├── logo.jsx, logo.svg            shared logo
├── tweaks-panel.jsx              shared Tweaks chrome
│
├── photos/                   ← portfolio images served as static assets
│
├── functions/                ← Netlify Functions (Node 18+, ESM)
│   ├── auth-login.js
│   ├── auth-verify.js
│   ├── auth-logout.js
│   ├── public-site.js        ← GET /api/public/site (no auth, edge-cached)
│   ├── projects.js
│   ├── projects-id.js
│   ├── projects-images.js
│   ├── projects-images-upload.js
│   ├── content-about.js
│   ├── content-services.js
│   ├── content-clients.js
│   ├── content-settings.js
│   └── utils/
│       ├── auth.js           ← JWT issue + verify, requireAuth() helper
│       └── blobs.js          ← thin wrapper around @netlify/blobs
│
├── scripts/
│   └── build.mjs             ← copies sources into dist/
│
├── netlify.toml              ← redirects, headers, build settings
├── package.json
├── .env.example
├── API_CONTRACT.md
├── SCHEMAS.md
└── README.md
```

---

## Deploy

1. Push to GitHub.
2. **New site from Git** in Netlify, pick the repo.
3. Build settings auto-detect from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `functions`
4. Set environment variables in Site Settings → Environment:
   - `ADMIN_PASSWORD` — the password Aldo signs in with.
   - `JWT_SECRET` — random 48+ char string. Generate with:
     ```sh
     node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
     ```
5. Deploy. The public site lives at `/`, the admin at `/admin`.

---

## API

The admin SPA talks to `/api/*`, which Netlify rewrites to the
corresponding function file. See **`API_CONTRACT.md`** for full request /
response shapes, and **`SCHEMAS.md`** for the JSON stored in Blobs.

Endpoints marked `501 not_implemented` are stubs — the admin handles them
gracefully and falls back to localStorage. Flesh them out by wiring to
`@netlify/blobs` via `functions/utils/blobs.js`.

---

## Why no bundler

Both entrypoints load `.jsx` files via `@babel/standalone` at runtime.
This keeps the prototype trivially editable — open any `.jsx` file, save,
reload. The "build" step is just `cp -r` into `dist/` so Netlify has a
single publish root.

If you ever want a real bundler (Vite, esbuild), swap `scripts/build.mjs`
and update the script tags in `index.html` + `Admin.html`. Nothing else
in the project assumes the runtime-Babel setup.
