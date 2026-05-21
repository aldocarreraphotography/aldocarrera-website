# SPEC.md — Aldo Carrera Photography Website

**Last Updated:** May 2026  
**Status:** Active/Maintained  
**Goal:** A full-stack photography portfolio + client delivery platform with gallery reviews, project management, and live analytics.

---

## Architecture Overview

| Layer | Tech | Purpose |
|-------|------|---------|
| **Frontend (Public)** | HTML + Vanilla JS + CSS | Gallery views, portfolio, client gallery sharing |
| **Frontend (Admin)** | React (JSX) | Project/image management, client management, analytics |
| **Build** | `scripts/build.mjs` (Node.js) | Bundling, optimization, static file generation |
| **Hosting (Frontend)** | Netlify | Static site, CI/CD via git push, CORS proxy for API |
| **Backend** | Express.js on Docker (NAS) | Image processing, gallery management, auth, analytics |
| **NAS Server** | Synology DS718+ | Host for Docker containers, file storage (NAS volumes) |
| **Storage (Originals)** | `/volume2/Ingesting 2/aldocarrera/` | Master JPEG/RAW originals + metadata JSON |
| **Storage (Thumbnails)** | `/volume2/Ingesting 2/aldocarrera/images/` | Web-optimized JPEGs (via Sharp) |
| **Auth** | JWT + password | Admin login via `/api/auth/login`, token in localStorage |
| **Analytics** | GA4 Data API | Live visitor metrics, traffic sources, top pages (inline in admin) |
| **CDN Tunnel** | Cloudflare Tunnel | Secure tunnel from NAS to `aldocarrera.com` |

---

## Project Structure

```
aldocarrera-website/
├── dist/                           # Built static files (Netlify deploy target)
├── src/
│   ├── public/                     # Static assets for public site
│   │   ├── index.html              # Gallery view (vanilla JS, client-review UI)
│   │   ├── gallery.html            # Client gallery link (shareable, token-protected)
│   │   ├── deck.html               # Reels deck (mobile-optimized video carousel)
│   │   ├── 404.html                # Error page
│   │   ├── aldo-styles.css         # Design tokens, layout primitives
│   │   ├── about.html              # About page
│   │   ├── services.html           # Services/pricing
│   │   └── styles/                 # Topic-specific stylesheets
│   ├── admin/                      # Admin dashboard (React SPA)
│   │   ├── admin.html              # SPA entry point
│   │   ├── admin-shell.jsx         # Shell (sidebar, topbar, routing)
│   │   ├── admin-views-*.jsx       # Route views (dashboard, projects, galleries, etc.)
│   │   ├── admin-styles.css        # Admin-specific styling
│   │   ├── admin-*.jsx             # Reusable components (Card, Button, Modal, etc.)
│   │   └── utils/                  # admin-store.jsx (API client + IndexedDB cache)
│   └── index.html                  # Webpack entry (deprecated, kept for reference)
├── nas-server/                     # Docker-based Express backend
│   ├── Dockerfile                  # Node.js + Sharp runtime
│   ├── docker-compose.yml          # Container orchestration (api + cloudflared)
│   ├── .env.example                # Template for credentials (JWT, password, GA4)
│   ├── server.js                   # Express app (7 endpoints)
│   └── utils/
│       ├── auth.js                 # JWT + password verification
│       ├── store.js                # File I/O for JSON data + image bytes
│       ├── galleries.js            # Gallery object management
│       ├── decks.js                # Video reels management
│       └── blobs.js                # Netlify Blobs API (unused, can remove)
├── scripts/
│   ├── build.mjs                   # Single-command build (copy + minify + deploy)
│   └── deploy.sh                   # Git push trigger for Netlify
├── package.json                    # Dependencies (Sharp, Express, etc.)
├── .gitignore                      # Excludes .env, dist/, node_modules, credentials
├── README.md                       # Setup guide
└── SPEC.md                         # This file

```

---

## Core Features

### 1. **Public Portfolio Site** (`/`)
- **Landing page:** Hero image, about link, services link
- **Gallery index:** Grid of all public projects (filterable by type)
- **Project detail:** Lightbox + metadata (client, year, type, description)
- **About page:** Bio, equipment, philosophy
- **Services page:** Pricing, packages, packages

**Tech:**
- Vanilla HTML + CSS + JavaScript (no framework)
- CSS Grid + Flexbox layout
- Lightbox interaction (prev/next, close, keyboard nav)
- Lazy loading for gallery images

### 2. **Client Gallery Sharing** (`/gallery.html?token=XXX`)
- **Secure link:** Token-protected gallery for client review
- **Three-choice review UI:** SELECT / ALT / KILL labels per image
- **Submission:** Client submits choices, gallery moves to "submitted" state
- **Analytics:** View count, last viewed date, selection stats

**Tech:**
- Token validation via `/api/galleries/:token` GET
- IndexedDB for offline selection persistence
- Real-time form validation + submission
- Supports 100–500 images per gallery

### 3. **Reels Video Deck** (`/deck.html`)
- **Mobile carousel:** Swipeable vertical video feed (TikTok-style)
- **Video metadata:** Title, description, tech specs
- **Public vs. private:** Toggle per video in admin

**Tech:**
- Custom carousel (vanilla JS, touch gestures)
- Video preload strategy (lazy load + buffer ahead)
- Respects portfolio visibility settings

### 4. **Admin Dashboard** (React SPA)
- **Login:** Email/password → JWT token stored in localStorage
- **Sidebar nav:** Projects, Galleries, Videos, Clients, Settings, Analytics
- **Project editor:** Upload images, tag as select/favorite/rejected/cover, bulk actions
- **Gallery manager:** Create review links, track submissions, archive
- **Client roster:** Track projects per client, contact info, notes
- **Analytics:** 5 sections covering site traffic, archive metrics, client work, gallery performance, insights
- **Settings:** Site metadata (about, services), password, billing info

**Tech:**
- React (Hooks, Context for state)
- Fetch API for NAS backend calls
- IndexedDB for offline image cache + form drafts
- CSV export for gallery submissions

### 5. **Live Analytics** (GA4 Data API)
- **Public traffic:** Real-time visitors, 28-day overview (users, sessions, page views, bounce rate, avg duration, new users)
- **Top pages:** Which galleries/projects get the most views
- **Traffic sources:** Organic, direct, referral, social
- **Device/country breakdown:** Mobile vs. desktop, top countries
- **Realtime pulse:** Active users right now
- **Install status:** Verify gtag tracking is active on live site

**Tech:**
- NAS endpoint `/api/ga-analytics` (requires GA4 service account)
- `@google-analytics/data` npm package for API calls
- 6 parallel GA4 queries (28-day metrics, realtime, breakdown)
- 503 fallback for unconfigured (setup guide shown)

---

## Data Models

### **Project**
```javascript
{
  id: "string (slug)",
  title: "string",
  client: "string (foreign key to clients)",
  year: 2025,
  type: "Engagement|Editorial|Event|Fashion|Other",
  description: "string (markdown)",
  public: true,
  images: [
    {
      id: "UUID",
      filename: "string",
      exif: {
        dateTaken: "ISO 8601",
        camera: "string",
        lens: "string",
        iso: 3200,
        aperture: "2.8",
        shutter: "1/1000",
        fileSize: 8500000,
      },
      selected: false,
      favorite: false,
      rejected: false,
      cover: false,
      notes: "string",
    },
  ],
}
```

### **Gallery** (client review link)
```javascript
{
  token: "UUID (shareable link suffix)",
  title: "string",
  projectId: "string (FK)",
  clientName: "string",
  clientEmail: "string (optional)",
  imageIds: ["uuid1", "uuid2", ...],
  selections: {
    "uuid1": { label: "SELECT", selectedAt: "ISO" },
    "uuid2": { label: "ALT", selectedAt: "ISO" },
    "uuid3": { label: "KILL", selectedAt: "ISO" },
  },
  status: "open|submitted|archived",
  viewCount: 42,
  lastViewedAt: "ISO 8601",
  createdAt: "ISO 8601",
  submittedAt: "ISO 8601 (null if not submitted)",
  expiresAt: "ISO 8601 (null if no expiry)",
}
```

### **Client**
```javascript
{
  id: "string (slug)",
  name: "string",
  email: "string (optional)",
  phone: "string (optional)",
  company: "string (optional)",
  notes: "string",
  projects: ["project-id-1", "project-id-2"],
  createdAt: "ISO 8601",
}
```

### **Video** (reels deck)
```javascript
{
  id: "UUID",
  title: "string",
  description: "string",
  videoUrl: "URL to MP4 or m3u8",
  thumbnailUrl: "URL to preview JPEG",
  duration: 15,
  public: true,
  createdAt: "ISO 8601",
}
```

---

## API Endpoints (NAS `/api/` routes)

| Verb | Path | Auth | Purpose |
|------|------|------|---------|
| POST | `/auth/login` | — | `{ email, password }` → `{ token }` |
| GET | `/debug` | — | Health check + Blobs connectivity probe |
| GET | `/projects` | ✓ | List all projects (admin) |
| POST | `/projects` | ✓ | Create project |
| GET | `/projects/:id` | — | Project detail (public if `public=true`) |
| PATCH | `/projects/:id` | ✓ | Update project metadata |
| POST | `/projects/:id/images/upload` | ✓ | Multipart upload + Sharp resize |
| PATCH | `/projects/:id/images/:imgId` | ✓ | Update image metadata (tags, notes) |
| DELETE | `/projects/:id/images/:imgId` | ✓ | Soft-delete image |
| GET | `/galleries` | ✓ | List galleries (admin) |
| POST | `/galleries` | ✓ | Create gallery + generate token |
| GET | `/galleries/:token` | — | Gallery detail (public, token-protected) |
| PATCH | `/galleries/:token` | — | Client submits selections |
| DELETE | `/galleries/:token` | ✓ | Archive gallery |
| GET | `/clients` | ✓ | List clients |
| POST | `/clients` | ✓ | Create client |
| GET | `/videos` | ✓ | List videos (admin) |
| POST | `/videos` | ✓ | Create video metadata |
| GET | `/ga-analytics` | ✓ | Fetch GA4 metrics (28-day + realtime) |

**Auth:** `✓` means `Authorization: Bearer <JWT>` required; `—` means public or token-scoped.

---

## File Storage Paths (NAS Volumes)

```
/volume2/Ingesting 2/aldocarrera/
├── data/                          # JSON metadata (mounted as /app/data in Docker)
│   ├── projects.json              # Master project list
│   ├── clients.json               # Master client list
│   ├── galleries.json             # Gallery review objects
│   ├── videos.json                # Video metadata
│   ├── about.json                 # Site about/bio
│   ├── services.json              # Services/pricing
│   └── settings.json              # Admin password hash, site config
│
├── images/                        # Web-optimized JPEGs (mounted as /app/images in Docker)
│   ├── project-id/                # Per-project folder
│   │   ├── uuid.jpg               # Sharp-resized for web (max 2400px, 85% quality)
│   │   └── uuid_thumb.jpg         # Thumbnail (300px)
│   └── video-id/
│       └── thumb.jpg              # Video thumbnail
│
└── ga4-credentials.json           # GA4 service account (on host, mounted as /credentials/ga4.json in container)
```

---

## Workflows

### **Photographer Uploads a Project**
1. Admin creates new project (title, client, year, type)
2. Admin selects images via file input (supports 50–500 files, 100MB total)
3. Frontend chunks uploads via `/api/projects/:id/images/upload` multipart
4. NAS server uses Sharp to resize + optimize for web
5. Metadata saved to `projects.json` + images cached to `/app/images/`
6. Admin tags images (select, favorite, reject, cover)
7. Publish project (toggle `public=true`)

### **Client Reviews a Gallery**
1. Admin creates gallery link (picks images, sets title, client email)
2. NAS generates random token, saves to `galleries.json`
3. Admin shares link: `aldocarrera.com/gallery.html?token=ABC123`
4. Client opens link, sees images, selects (SELECT/ALT/KILL per image)
5. Client submits, gallery moves to "submitted" state
6. Admin sees submissions in Gallery Manager, can archive

### **Publishing New Content**
1. Edit `src/public/{index,about,services}.html` or upload images
2. Run `npm run build` → copies to `dist/`
3. Commit + push to main branch
4. Netlify auto-deploys `dist/` to `aldocarrera.com` (~60 seconds)

### **Adding a Video to Reels**
1. Admin uploads MP4 to NAS (or links external m3u8)
2. Creates video object via admin UI: title, description, thumbnail
3. Sets `public=true` to show in `/deck.html`
4. Video appears in mobile carousel feed

---

## Tech Stack Details

### **Frontend Dependencies**
- **React 18+:** Hooks (useState, useEffect, useContext)
- **No bundler:** Pure JSX via Babel CDN (simpler setup)
- **CSS:** Custom design tokens, Grid + Flexbox, no Tailwind
- **Sharp (serverside only):** Image optimization on NAS

### **Backend Dependencies**
- **Express.js:** Lightweight routing
- **Multer:** Multipart form parsing for image uploads
- **Sharp:** JPEG optimization + resize
- **@google-analytics/data:** GA4 API client
- **jsonwebtoken:** JWT signing/verification
- **CORS:** Cross-origin Netlify → NAS requests
- **Docker:** Node.js + dependencies in container

### **Deployment**
- **Netlify:** Frontend (auto-deploy on git push)
- **Docker on NAS:** Backend (manual rebuild: `sudo docker-compose up -d`)
- **Cloudflare Tunnel:** Secure public URL for NAS (`aldocarrera.com`)

---

## Current Status & Known Issues

| Item | Status | Notes |
|------|--------|-------|
| Public portfolio (index, galleries) | ✓ Complete | Mobile-optimized, lightbox works |
| Client gallery review links | ✓ Complete | Token-based, 28-day expiry optional |
| Reels video deck | ✓ Complete | Mobile carousel, lazy load |
| Admin dashboard (projects, galleries) | ✓ Complete | Full CRUD, image tagging, bulk actions |
| Analytics (GA4 inline) | ⚠️ Configured (needs NAS env vars) | Endpoint exists; /api/ga-analytics returns 503 if GA_PROPERTY_ID not in .env |
| Image upload chunking | ✓ Complete | 100MB limit per upload batch |
| Client management UI | ✓ Complete | Add/edit/view clients, link to projects |
| Design consistency | ✓ Complete | Unified tokens across public + admin |
| Mobile responsiveness | ✓ Good | Tested down to 375px viewport |

### **Outstanding Tasks**
1. **GA4 503 fix:** Add to NAS `.env`: `GA_PROPERTY_ID=538429297`, `GA_CREDENTIALS_FILE=/credentials/ga4.json`, `GA_CREDENTIALS_HOST_PATH=/var/services/homes/aldocarrera/ga4-credentials.json` + rebuild Docker container
2. **Large image optimization:** Gallery pages with 200+ images slow down on first load; consider pagination or lazy load in lightbox
3. **Video playback optimization:** Reels deck can buffer better with HLS/DASH streaming
4. **Client email notifications:** Currently no automated emails when gallery link created or submitted
5. **Dark mode:** Admin dashboard lacks dark mode toggle
6. **Backup strategy:** NAS volumes not regularly backed up; recommend scheduled rsync to external drive

---

## Design Tokens

```css
/* Colors */
--paper:            #f9f6f1;        /* Background */
--ink:              #1d1a15;        /* Text */
--accent:           #d63e5a;        /* Pink primary (CTA, highlights) */
--accent2:          #3a70a8;        /* Blue secondary */
--accent-soft:      #f5d6db;        /* Pink tint (hover, soft) */
--rule:             #e8e4df;        /* Border, divider */
--window:           #ffffff;        /* Card background */
--window-soft:      #faf8f5;        /* Hover state */

/* Typography */
--font-body:        "Neue Haas Grotesk Display Pro", "Inter", sans-serif;
--font-mono:        "IBM Plex Mono", monospace;

/* Spacing */
--gap-xs:           4px;
--gap-sm:           8px;
--gap-md:           16px;
--gap-lg:           24px;
--gap-xl:           32px;

/* Shadows */
--shadow-sm:        0 1px 3px rgba(0,0,0,0.1);
--shadow-md:        0 4px 12px rgba(0,0,0,0.08);
--shadow-lg:        0 12px 28px rgba(0,0,0,0.15);

/* Radius */
--radius-sm:        2px;
--radius-md:        4px;
--radius-lg:        8px;
--radius-full:      9999px;
```

---

## Environment Variables (NAS `.env` template)

```bash
# Required
JWT_SECRET=<64-char hex, e.g. $(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
ADMIN_PASSWORD=<your password>
PUBLIC_URL=https://aldocarrera.com

# Docker paths
DATA_HOST_PATH=/volume2/Ingesting\ 2/aldocarrera/data
IMAGES_HOST_PATH=/volume2/Ingesting\ 2/aldocarrera/images
CLOUDFLARED_TOKEN=<Cloudflare tunnel token>

# GA4 (optional, for analytics)
GA_PROPERTY_ID=538429297
GA_CREDENTIALS_FILE=/credentials/ga4.json
GA_CREDENTIALS_HOST_PATH=/var/services/homes/aldocarrera/ga4-credentials.json
```

---

## Next Priorities

1. **Complete GA4 fix** (add env vars, rebuild container) → live metrics appear in admin
2. **Test large uploads** (500+ image batch) → ensure chunking + resumption works
3. **Client notifications** → send email when gallery link created, when submitted
4. **Performance audit** → profile image loading, optimize lightbox scroll
5. **Backup automation** → cron job to rsync NAS data to external drive

---

**End of SPEC.md**
