# Handoff: Aldo Carrera Website — Real Backend

> **For Claude Code.** This package describes a Netlify-deployed photography site
> whose admin dashboard works, but whose public site has data-sync and caching
> issues. The job is to ship a production-grade backend (Netlify Functions +
> Netlify Blobs) so admin edits propagate to all visitors on every device.

- **Repo:** https://github.com/aldocarreraphotography/aldocarrera-website
- **Site:** https://aldocarrera.com
- **Admin:** https://aldocarrera.com/admin (and `/Admin.html`)
- **Local:** `npm install && npm run build && npm run dev` (uses `netlify dev`)

---

## About these files

The HTML, JSX, and CSS files bundled here are **the live prototype** — not
throwaway mocks. The admin SPA (`Admin.html` + `admin-*.jsx`) is feature-complete
and working in production. The public site (`index.html` + `aldo-*.jsx`) is also
deployed. The functions in `functions/` are partial — some are real, some are
stubs. Your job is to finish the backend wiring without changing the front-end
UX.

Treat the front-end as the contract: it already calls every endpoint you need
to support, and `admin-store.jsx` is the API client. Read it first.

---

## Fidelity

**High.** Pixel-perfect, in production, with real users. Don't redesign — match
the existing visual + interaction language. The admin uses a custom design
system in `admin-styles.css`; the public site uses `aldo-styles.css`. No
external UI libraries.

---

## What's already shipped

### Project structure

```
/
├── index.html               Public site (React via @babel/standalone, no bundler)
├── Admin.html               Admin SPA (same setup)
├── aldo-*.jsx               Public-site views, data, app shell
├── admin-*.jsx              Admin SPA views, store, components
├── *-styles.css             Per-app stylesheets
├── photos/                  Static seed images (3 JPGs)
├── functions/               Netlify Functions (some real, some stubs)
│   ├── auth-login.js        ✅ real — issues JWT
│   ├── auth-verify.js       ✅ real
│   ├── auth-logout.js       ✅ real (no-op, JWTs are stateless)
│   ├── admin-sync.js        ✅ real — bulk PUT for all content
│   ├── public-site.js       ✅ real — read-all-content endpoint
│   ├── projects.js          ⚠️  partial — GET/POST work; needs validation hardening
│   ├── projects-id.js       ✅ real — GET/PUT/DELETE single project
│   ├── projects-images.js   ✅ real — GET (public, immutable), PUT, DELETE
│   ├── projects-images-upload.js   ✅ real — multipart → Blobs
│   ├── content-about.js     ✅ real
│   ├── content-clients.js   ✅ real
│   ├── content-services.js  ✅ real
│   ├── content-settings.js  ✅ real
│   └── utils/
│       ├── auth.js          ✅ HS256 JWT, requireAuth helper
│       └── blobs.js         ✅ thin wrapper around @netlify/blobs
├── scripts/build.mjs        Copies sources → dist/
├── netlify.toml             Redirects + no-cache headers for /api/public/site
├── package.json
└── dist/                    Build output (Netlify publish dir)
```

### Data flow (intended)

```
┌─────────────┐   PUT /api/admin/sync   ┌──────────────┐
│  Admin SPA  │ ──────────────────────▶ │ Netlify      │
│  (Aldo)     │   POST /api/projects/   │ Blobs        │
│             │        :id/images/upload│ • projects   │
└─────────────┘                         │ • about      │
                                        │ • clients    │
                                        │ • services   │
                                        │ • settings   │
                                        │ • image bytes│
                                        └──────┬───────┘
                                               │
                                               │  GET /api/public/site
                                               ▼
                                        ┌──────────────┐
                                        │ Public site  │
                                        │ (every       │
                                        │  visitor,    │
                                        │  every load) │
                                        └──────────────┘
```

### Data shapes (canonical — defined in `SCHEMAS.md`)

**`projects.json`** in Blobs:
```ts
{
  projects: [
    {
      id: "BAPE_FW24",              // uppercase, underscores
      name: "BAPE — FW24 Editorial",
      client: "BAPE",
      type: "Editorial" | "Commercial" | "Personal",
      year: 2024,
      month: "November",            // human-readable string
      description: "...",
      location: "Hong Kong",
      createdAt: ISO_DATE,
      updatedAt: ISO_DATE,
      folderPath: "archive/2024/BAPE_FW24",
      images: [
        {
          filename: "BAPE_FW24_R01_F08.jpg",
          blobPath: "/api/projects/BAPE_FW24/images/BAPE_FW24_R01_F08.jpg",
          order: 1,                  // 1-based curated order
          selected: true,            // shown in Selected Work portfolio
          favorite: false,
          rejected: false,
          notes: "",
          exif: {
            dateTaken: ISO_DATE | null,
            dimensions: "5616x7488",
            fileSize: 8400000        // bytes
          }
        }
      ]
    }
  ]
}
```

**`about.json`**, **`clients.json`**, **`services.json`**, **`settings.json`** —
see `SCHEMAS.md` in the repo root. The function defaults in
`functions/public-site.js` are the source of truth for shape — match those.

### API contract (read this — front-end calls these exactly)

| Method | Path                                         | Auth | Description |
|--------|----------------------------------------------|------|-------------|
| POST   | `/api/auth/login`                            | —    | `{password}` → `{token, expiresIn}` |
| POST   | `/api/auth/verify`                           | JWT  | `{ok: true}` or 401 |
| POST   | `/api/auth/logout`                           | —    | always ok |
| GET    | `/api/public/site`                           | —    | `{projects, about, clients, services, settings}` — **the only endpoint the public site calls** |
| GET    | `/api/projects`                              | JWT  | `{projects: [...]}` |
| POST   | `/api/projects`                              | JWT  | create |
| GET    | `/api/projects/:id`                          | JWT  | one project |
| PUT    | `/api/projects/:id`                          | JWT  | patch — **including reordered images[]** |
| DELETE | `/api/projects/:id`                          | JWT  | remove project + image blobs |
| POST   | `/api/projects/:id/images/upload`            | JWT  | multipart `file`, optional `filename`/`dateTaken`/`dimensions` |
| GET    | `/api/projects/:id/images/:filename`         | —    | image bytes, immutable cache |
| PUT    | `/api/projects/:id/images/:filename`         | JWT  | patch `{selected, favorite, rejected, notes}` |
| DELETE | `/api/projects/:id/images/:filename`         | JWT  | remove + renumber |
| GET    | `/api/about`                                 | —    | full about object |
| PUT    | `/api/about`                                 | JWT  | merge-patch |
| GET    | `/api/clients`                               | —    | `{clients: [...]}` |
| POST   | `/api/clients`                               | JWT  | create |
| GET    | `/api/clients/:slug`                         | —    | one |
| PUT    | `/api/clients/:slug`                         | JWT  | bulk via `{clients: [...]}` or single-patch |
| DELETE | `/api/clients/:slug`                         | JWT  | remove |
| GET    | `/api/services`                              | —    | `{services: [...]}` |
| POST/PUT/DELETE `/api/services[/:id]`                | JWT  | analogous |
| GET    | `/api/settings`                              | —    | settings object |
| PUT    | `/api/settings`                              | JWT  | merge-patch |
| PUT/POST | `/api/admin/sync`                          | JWT  | **bulk push of entire content state — admin uses this** |

All redirects live in `netlify.toml`. Don't break them.

### JWT

- Algorithm: HS256
- Secret: `JWT_SECRET` env var (48+ random bytes, base64url)
- Lifetime: 30 days
- Issued only by `auth-login.js` after matching `ADMIN_PASSWORD`
- Verified by `withAuth()` / `requireAuth()` in `functions/utils/auth.js`

### Image storage

Image bytes live in Blob keys `images/<projectId>/<filename>`. The `blobPath`
field stored in `projects.json` is the public URL (`/api/projects/...`), and
that URL is what the public site puts in `<img src=>`. The GET handler in
`projects-images.js` is auth-free and serves with `Cache-Control:
public, max-age=31536000, immutable`.

---

## What's broken / what to fix

### 1. Cache & freshness on `/api/public/site`

The current state:
- Function returns `Cache-Control: no-store, no-cache, must-revalidate`
- `netlify.toml` reinforces the same on the public path
- Public-site fetch includes cache-busting `?t=` and `cache: 'no-store'`
- Initial render blocks on the fetch (no seed → API flicker)

User-reported symptoms:
- Stale data on phone / private windows
- Flicker between old and new on main browser (likely fixed)
- All devices not seeing the same content

**Verify in production:**
- `curl -I https://aldocarrera.com/api/public/site` returns `cache-control: no-store...` (no `s-maxage`, no `public`)
- Two devices fetched within 1s of each other return byte-identical JSON
- The `x-aldo-served` header changes on every call
- Cloudflare / any other CDN in front of Netlify isn't overriding headers

If admin pushes via `/api/admin/sync` but the public response doesn't reflect
it within ~5s, the bug is in either:
- `admin-sync.js` not actually writing (check `wrote: [...]` response)
- `public-site.js` not reading (the `pickArray` fallback treats `length: 0`
  arrays as "uninitialized" — may need to change to "respect explicit empty")
- Edge cache (verify the headers above)

### 2. Archive view connection

`aldo-data.jsx` derives `ARCHIVE` from `projects[*].images[*]` via
`_aldoToPublicArchive()`. Sort defaults to `'curated'` — groups by year (desc),
then project, then image `order`. Reordering in admin should appear in Archive
immediately.

**Verify:** drag an image in admin → check that the same image's position
changes in `/api/public/site` JSON within a few seconds, and that the Archive
view on the public site reflects it after `_aldoFetchFromApi` runs (tab
focus, page reload).

### 3. Admin login when env vars aren't set

If `ADMIN_PASSWORD` or `JWT_SECRET` are missing, the function module throws on
import — every `/api/*` call returns 500. The admin SPA silently falls back to
"prototype mode" (any password works, token tagged `proto.*`, sync becomes
a no-op). Detection:
- Network tab → admin POST `/api/auth/login` returns 500
- localStorage key `aldo_admin_token` starts with `proto.`

Action: surface this in the admin UI (a banner: "Backend offline — changes won't
sync"). Currently the silent fallback is a footgun.

### 4. Image upload error handling

`projects-images-upload.js` uses `req.formData()`. Confirm it works for files up
to Netlify's per-function body limit (~6MB on free tier, ~10MB on Pro). For
larger originals, switch to a signed-URL flow:
1. Admin requests `POST /api/projects/:id/images/sign-upload` → returns presigned
   PUT URL to Blobs
2. Admin uploads bytes directly to that URL
3. Admin notifies `POST /api/projects/:id/images/confirm` with the filename +
   metadata

### 5. Same-origin tab sync vs cross-device sync

The public site listens for the `storage` event so an admin tab in the same
browser updates the public tab without waiting for a refresh. That's correct
and should stay. The `admin-store-changed` same-tab listener was intentionally
removed (the admin is the only writer; the public site doesn't need to
mirror admin-local state when the API is reachable).

---

## Specific tasks for Claude Code

In priority order:

1. **Smoke-test the existing functions on a real Netlify deploy.** Set
   `ADMIN_PASSWORD` and `JWT_SECRET` env vars. Run through:
   - Login
   - Upload an image
   - Reorder via drag
   - Delete a project
   - Refresh public site in a private window
   - Refresh on a phone
   Make sure each step works end-to-end. File a fix for whatever first breaks.

2. **Verify cache headers are honored end-to-end** with `curl -I` from outside
   any CDN. If `cache-control` isn't `no-store...` on the production response,
   diagnose where it's being rewritten.

3. **Decide the empty-state policy** for `projects.json`. The current
   `public-site.js` `pickArray()` falls back to seeded defaults when Blobs has
   `length: 0` — that means admin can never produce an empty public portfolio.
   If the user wants strict "what admin writes is what shows," change to
   "use Blobs whenever the file exists, even if empty." (See
   `functions/public-site.js` line ~280.)

4. **Add the admin-side backend status banner** described under "Admin login
   when env vars aren't set" above. Should be a one-line component in
   `admin-shell.jsx` that polls `/api/auth/verify` on a 30s interval; if it
   401s with a prototype token, show "Offline — your changes aren't being
   saved to the server."

5. **Wire up Netlify Forms verification.** The contact form is already
   registered (`index.html` has the hidden detection stub + `aldo-views.jsx`
   posts to `/`). Smoke-test that submissions appear in the Netlify dashboard.

6. **(Optional)** Move image uploads to a signed-URL flow so files >6MB work
   on the free tier.

7. **(Optional)** Add a `seed` admin button that POSTs the defaults from
   `public-site.js` to `/api/admin/sync` — useful for first-deploy bootstrap
   without depending on the runtime fallback.

---

## Environment

| Var               | Required | Notes |
|-------------------|----------|-------|
| `ADMIN_PASSWORD`  | yes      | Single password Aldo signs in with |
| `JWT_SECRET`      | yes      | 48+ random bytes, base64url |
| `JWT_EXPIRES_IN`  | no       | Default 30 days (seconds) |
| `LOGIN_RATE_LIMIT`| no       | Per-IP per 5min, default 10 |
| `NETLIFY_SITE_ID` | auto     | Netlify injects in deploy + dev |
| `NETLIFY_TOKEN`   | auto     | Same |

Generate a JWT secret:
```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Local development

```sh
git clone git@github.com:aldocarreraphotography/aldocarrera-website.git
cd aldocarrera-website
npm install
cp .env.example .env       # then edit values
npm run dev                # netlify dev, serves at http://localhost:8888
```

`npm run build` regenerates `dist/`. The publish dir is `dist/`; the source
files live at the repo root. The build is just a copy (no bundler) — JSX is
loaded with `@babel/standalone` at runtime.

---

## Deploy

Netlify auto-builds from `main`. Required setup before first deploy:

1. Push to GitHub
2. Netlify → "New site from Git" → pick repo (auto-detects `netlify.toml`)
3. Site Settings → Environment → add `ADMIN_PASSWORD` and `JWT_SECRET`
4. Site Settings → Build & deploy → confirm publish dir is `dist`, functions
   dir is `functions`
5. Site Settings → Custom domain → `aldocarrera.com`
6. Deploy

Netlify Blobs is on by default for new sites; no extra config.

---

## Files in this bundle

All the source files needed to understand and finish the backend:

- `index.html`, `Admin.html` — entrypoints
- `aldo-*.jsx`, `aldo-styles.css` — public site
- `admin-*.jsx`, `admin-styles.css` — admin SPA
- `functions/` — Netlify Functions (full tree)
- `scripts/build.mjs` — build script
- `netlify.toml`, `package.json`, `.env.example`
- `API_CONTRACT.md`, `SCHEMAS.md` — formal spec for endpoints + data shapes
- `README.md` — repo overview (also lives at repo root)
- `photos/` — seed images referenced by the function defaults

---

## What NOT to change

- The visual design of either app. Match what's there.
- The frontend build setup (no bundler). If you genuinely need one, talk to
  the user first — but the runtime-Babel setup is intentional, the user
  edits `.jsx` files directly.
- The data shapes documented in `SCHEMAS.md` — the admin SPA depends on them.
- The redirect table in `netlify.toml` — frontend routes are hardcoded.

Good luck. The architecture is sound; the work is mostly verification +
hardening.
