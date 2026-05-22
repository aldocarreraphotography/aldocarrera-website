# CLAUDE.md — Self-Healing Architecture Guide

This file documents the architecture of aldocarrera.com so Claude can self-diagnose and fix issues without manual intervention.

---

## Architecture Overview

```
Browser (admin.html / index.html)
        │
        ├──► NAS Express server  https://api.aldocarrera.com  (PRIMARY — all data lives here)
        │      • All projects, images, videos, gallery portals
        │      • Auth: JWT signed with NAS JWT_SECRET
        │      • Files: /images dir on NAS disk
        │
        └──► Netlify Functions  https://aldocarrera.com/.netlify/functions/*
               • Static site hosting only
               • admin-sync: syncs NAS data → Netlify Blobs (fire-and-forget, NOT authoritative)
               • Auth: JWT signed with NETLIFY JWT_SECRET (different key from NAS)
```

**Single source of truth: the NAS.**  
Netlify Blobs is a read-through cache only. Never store canonical data in Netlify Blobs.

---

## Self-Healing Rules

### Rule 1 — If something works locally but not in production
Check these in order:
1. **CORS** — `ALLOWED_ORIGINS` in `nas-server/server.js` must include `https://aldocarrera.com`
2. **Env vars** — `JWT_SECRET`, `ADMIN_PASSWORD`, `PUBLIC_URL` must be set in `docker-compose.yml`
3. **Rebuild needed** — run `sudo docker-compose up -d --build` on the NAS after any server.js change
4. **Netlify deploy** — push to `main`; Netlify auto-deploys in ~60s

### Rule 2 — If an API call returns `bad_signature` or `401`
The JWT was signed by the wrong server. Admin calls must go to the NAS (`window.API_BASE`), not Netlify. Never pass a NAS token to a Netlify function or vice versa.

### Rule 3 — If a page is blank / React doesn't mount
Check the script `src` path:
- Relative paths like `src="client-gallery.jsx"` break when served at `/g/TOKEN` — Netlify's redirect catches `/g/client-gallery.jsx` and returns HTML.
- Always use **absolute paths**: `src="/client-gallery.jsx"`

### Rule 4 — If images don't appear in a client gallery portal
Gallery portals are stored on the NAS in `data/gallery-portals.json`. Images come from the project's `blobPath` field (also on NAS). There is no Netlify Blobs involved. If images are missing:
1. Confirm the portal's `projectId` matches a real project in `data/projects.json`
2. Confirm project images have `blobPath` set and `rejected !== true`
3. Check `GET https://api.aldocarrera.com/api/debug` for NAS health

### Rule 5 — If an Express route hangs / Safari shows "Load failed"
An async route handler threw without a try/catch. Express leaves the response open → browser times out. Every route handler must be wrapped in try/catch with a `res.status(500).json(...)` fallback.

### Rule 6 — If uploads fail with a 413 or "file too large"
Multer's `LIMIT_FILE_SIZE` was exceeded. The `handleMulterError` middleware in `server.js` returns a clean 413. If it's a Netlify Function, the 6 MB body limit is hard — use the NAS directly for all uploads.

---

## Key Files

| File | Purpose |
|------|---------|
| `nas-server/server.js` | All API endpoints. Add new routes here. |
| `nas-server/utils/store.js` | Read/write JSON data files. Add new stores here. |
| `nas-server/utils/auth.js` | JWT auth helpers |
| `admin-store.jsx` | Frontend API client. `apiFetch()` calls NAS with auth. |
| `admin-views-galleries.jsx` | Gallery + portal management UI |
| `client-gallery.jsx` | Client-facing PIN gallery SPA |
| `client-gallery.html` | Shell for client gallery — sets `window.GALLERY_API` |
| `functions/` | Netlify Functions — minimal, mostly stubs. Don't add new data here. |

---

## Data Storage

All JSON files live in `nas-server/data/`:

| File | Contents |
|------|---------|
| `projects.json` | All projects + their images |
| `videos.json` | Video library |
| `gallery-portals.json` | PIN-gated client gallery portals |
| `galleries.json` | Legacy proofing galleries (password-based) |
| `about.json` | About page content |
| `settings.json` | Site settings |

---

## Adding a New Data Type

1. Add `readFoo` / `writeFoo` to `nas-server/utils/store.js` (two lines)
2. Add CRUD endpoints to `nas-server/server.js` (all wrapped in try/catch)
3. Add `apiFetch` calls in the relevant admin view
4. Run `sudo docker-compose up -d --build` on NAS to deploy

---

## Deployment

### NAS changes (server.js, utils/*, Dockerfile)
```bash
# On the NAS via SSH:
cd ~/aldocarrera-site/nas-server
sudo docker-compose up -d --build
```

### Frontend changes (*.jsx, *.html, *.css)
```bash
git add <files>
git commit -m "description"
git push origin main
# Netlify auto-deploys in ~60s
```

### Both changed
Do both steps above. The NAS rebuild is independent of Netlify's deploy.
