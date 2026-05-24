# Onboarding — aldocarrera.com

Operational handoff for any Claude session resuming work on this project.
For architecture deep-dive see `CLAUDE.md`; this file is the *living* state.

---

## The project

**aldocarrera.com** — fashion / campaign photographer portfolio for Aldo Carrera (LA).
Hand-rolled React (UMD, no bundler — Babel Standalone in the browser).
Mix of portfolio, archive, client galleries with PIN access, and an admin panel.

## Architecture (one-liner)

```
Browser ─► NAS Express (api.aldocarrera.com)  ← single source of truth
        └► Netlify (aldocarrera.com)          ← static hosting only
```

Everything that matters (projects, images, galleries, videos) lives on the NAS
in JSON files at `nas-server/data/` and image bytes at `IMAGES_DIR`. Netlify
serves the static SPA. See `CLAUDE.md` for the self-healing rules.

---

## Deploy workflows

### Frontend changes (`.jsx`, `.html`, `.css`)
```bash
git add <files>
git commit -m "..."
git push origin main      # Netlify auto-deploys in ~60s
```
Netlify serves from `dist/` (per `netlify.toml` → `publish = "dist"`).
`scripts/build.mjs` copies the right source files into `dist/` on every
build via `npm run build`. **`dist/` is gitignored** — it's a build
artifact. Your local `dist/` may be stale; Netlify rebuilds it fresh on
every deploy. Don't edit `dist/` directly; edit the root sources.

### NAS changes (`nas-server/**`)
```bash
ssh nas
cd "/volume2/Ingesting 2/aldocarrera-server/Aldo Carrera Photography Website"
git pull origin main
cd nas-server
sudo docker-compose up -d --build
```
**Docker 20.10 on this NAS uses `docker-compose` (hyphen, V1), NOT
`docker compose` (space, V2). Don't suggest the space form — it errors 125.**

### Both
Do both. They're independent — NAS rebuild doesn't trigger Netlify and vice versa.

---

## SSH access — the gotchas (took two hours to figure out)

Config in `~/.ssh/config`:
```
Host nas
  HostName aldocarrera.synology.me
  User aldocarrera
  IdentityFile ~/.ssh/nas_rsa
  HostKeyAlgorithms +ssh-rsa
  PubkeyAcceptedKeyTypes +ssh-rsa
  PubkeyAcceptedAlgorithms +ssh-rsa
```

**Critical caveats:**
- Use the **local IP `192.168.99.76`** if `aldocarrera.synology.me` fails over WAN.
  The hostname routes externally and SSH sometimes times out / asks for password.
- Old NAS sshd only supports **RSA** host keys — ed25519 will not work.
- Must use `+ssh-rsa` algorithm overrides above (modern OpenSSH disables ssh-rsa by default).
- Docker commands inside the NAS need **`sudo`** (the `aldocarrera` user isn't in the docker group).
- `git pull` on the NAS requires the safe-directory exception:
  ```
  git config --global --add safe.directory '/volume2/Ingesting 2/aldocarrera-server/Aldo Carrera Photography Website'
  ```
- Data lives at `/volume2/Ingesting 2/aldocarrera/data/` (mounted into the container).

---

## Email — Resend

- Notifications fire from `nas-server/server.js` on gallery submission (both legacy and portal).
- API key in `.env` at `nas-server/.env` → `RESEND_API_KEY=...`
- Notification target: `aldo@aldocarrera.com` (override with `NOTIFY_EMAIL` env var).
- **Current sender:** `Aldo Gallery <onboarding@resend.dev>` — Resend's test sender.
- **TODO:** verify `aldocarrera.com` in Resend → Domains, then change the `from`
  field to `noreply@aldocarrera.com`. (Two-step: add DNS records, then one-line code change.)
- Email send is **fire-and-forget** (`.catch(err => console.error(...))`) so SMTP
  failures never block the HTTP 200 to the client.

### MX records (Cloudflare) — already configured
Five MX records pointing to Google Workspace. If email starts failing again,
first check Cloudflare DNS hasn't been wiped (this happened May 18 2026).

---

## The two gallery systems — easy to confuse

| System | URL | Token | Storage | Submit endpoint |
|---|---|---|---|---|
| **Legacy galleries** | `/gallery.html?token=X` | password-protected | `data/galleries.json` | `POST /api/gallery/:token/submit` |
| **Portal galleries** | `/g/X` (PIN-gated SPA) | PIN + session key | `data/gallery-portals.json` | `POST /api/gallery-portals/:token/submit` |

Both have submit-email wired. Both allow **resubmission** (no 409 block).
Client UI: legacy uses `gallery.html`, portals use `client-gallery.{html,jsx}`.

---

## Recent state (May 2026)

- **Focal point** feature is live. Admin sets a pink dot in the image viewer
  (`admin-views-projects.jsx` → `ImageViewer`). Stored as `focalX`/`focalY` (0–100).
  Applied as `objectPosition` on five image grids:
  - Desktop project tiles (homepage)
  - Desktop archive grid
  - Desktop project image grid
  - Mobile project tiles + project images + archive thumbs
  - Project tiles read `coverFocalX`/`coverFocalY` from the cover image (added in `aldo-data.jsx`)
- **Resubmission** is allowed on both gallery systems. Client UI shows a
  "Sent ✓" toast top-left, no permanent banner.
- **OpenGraph** uses `og-image.jpg` (1200×630). Previously was SVG which didn't
  render on iMessage/FB/Twitter/LinkedIn.
- **EXIF backfill script** exists at `nas-server/scripts/backfill-exif.js`.
  Dry-runs by default; `--write` to persist. Fills `exif.dimensions` and
  `exif.fileSize` for images uploaded before the EXIF capture pipeline existed.
  Doesn't fill `dateTaken` (sharp can't decode EXIF strings; would need exifr).

---

## Pending / known issues

1. **Resend domain verification** — switch `from` to `noreply@aldocarrera.com`.
2. **EXIF date backfill** — would need to add `exifr` to the backfill script for shoot dates.
3. **OG image upgrade** — current OG is logo-only. Could be more striking with a
   hero photo + name overlay (worth ~3 min if Aldo wants it).
4. **Pause-on-hover + keyboard arrows for featured strip** — only matters once
   there's 2+ highlighted images (currently 1, so auto-rotate doesn't fire).
5. **Right-click / watermark protection** for client portals — discussed, not built.

---

## Key files cheat sheet

| File | Why you touch it |
|---|---|
| `nas-server/server.js` | All API endpoints. Wrap in try/catch (Express hang rule). |
| `nas-server/utils/store.js` | Read/write JSON data files. |
| `admin-views-projects.jsx` | Project list, image grid, image viewer (focal picker). |
| `admin-views-galleries.jsx` | Gallery + portal management UI. |
| `client-gallery.{jsx,html}` | Client portal SPA (PIN-gated). |
| `gallery.html` | Legacy gallery (password-protected, single-file). |
| `aldo-views.jsx` | Desktop public site (portfolio, archive, etc.). |
| `aldo-app.jsx` | App shell + **`MobileShell`** (~line 1774). Mobile lives here. |
| `aldo-data.jsx` | `_aldoToPublicProjects` / `_aldoToPublicArchive` — public data shape. |
| `aldo-styles.css` | All public site styles. Mobile is `@media (max-width: 820px)`. |
| `admin-styles.css` | Admin styles. |

---

## Working style

- Aldo says when he's frustrated. When he is, the fix needs to be precise and
  immediate, not "let me investigate." Bias toward shipping over debating.
- He doesn't want emoji in code/docs unless explicitly requested.
- He prefers concise responses with the working command, not paragraphs.
- He sometimes operates from the NAS shell directly — keep commands copy-pasteable.
- Don't auto-commit. Only commit when he asks.
