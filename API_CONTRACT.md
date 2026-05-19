# API Contract

All endpoints live under `/api/*`, which redirects to
`/.netlify/functions/*` via `netlify.toml`.

All requests except `POST /api/auth/login` require the
`Authorization: Bearer <jwt>` header. An invalid or expired token returns
**401 Unauthorized**.

JSON only. `Content-Type: application/json` for write requests.
Image uploads use `multipart/form-data` — see `POST /api/projects/:id/images/upload` below.

---

## Auth

### `POST /api/auth/login`

Request

```json
{ "password": "string" }
```

Response (200)

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 2592000
}
```

`expiresIn` is in seconds. 30 days.

Errors

| Code | Body                                | When                              |
|------|-------------------------------------|-----------------------------------|
| 401  | `{ "error": "invalid_password" }`   | Wrong password.                   |
| 429  | `{ "error": "rate_limited" }`       | More than 10 attempts / 5 min.    |

### `POST /api/auth/verify`

Headers: `Authorization: Bearer <token>`

Response (200) `{ "valid": true }`
Response (401) `{ "valid": false, "reason": "expired" | "malformed" }`

### `POST /api/auth/logout`

Server-side a no-op (JWTs are stateless). The client just discards the
token. Returns `{ "success": true }` for symmetry.

---

## Projects

### `GET /api/projects`

Response

```json
{
  "projects": [
    {
      "id": "BAPE_FW24",
      "name": "BAPE — FW24 Editorial",
      "client": "BAPE",
      "type": "Editorial",
      "year": 2024,
      "month": "November",
      "description": "Hong Kong residency. Two days, one apartment, two cameras.",
      "location": "Hong Kong — Sheung Wan",
      "createdAt": "2024-11-20T14:30:00Z",
      "updatedAt": "2026-05-18T09:30:00Z",
      "folderPath": "archive/2024/BAPE_FW24",
      "images": [
        {
          "filename": "BAPE_FW24_R01_F08.jpg",
          "blobPath": "archive/2024/BAPE_FW24/BAPE_FW24_R01_F08.jpg",
          "selected": true,
          "favorite": false,
          "rejected": false,
          "notes": "",
          "exif": {
            "dateTaken": "2024-11-15T14:45:00Z",
            "dimensions": "5104x7616",
            "fileSize": 4200000
          }
        }
      ]
    }
  ]
}
```

### `POST /api/projects`

Request (every field optional except `name`):

```json
{
  "id":          "BAPE_SS25",
  "name":        "BAPE — SS25 Editorial",
  "client":      "BAPE",
  "type":        "Editorial",
  "year":        2025,
  "month":       "March",
  "description": "",
  "location":    ""
}
```

Response (201): full project object as above. `id` is generated if omitted.

### `GET /api/projects/:id`

Response: single project object (404 if not found).

### `PUT /api/projects/:id`

Body: partial project object (any subset of fields). Server merges and bumps `updatedAt`.

Response: full project object.

### `DELETE /api/projects/:id`

Removes the project AND deletes every blob under its `folderPath`.

Response (200): `{ "success": true }`

---

## Images

### `POST /api/projects/:id/images/upload`

Multipart form upload. Field name `files`, one or more.

```
POST /api/projects/BAPE_SS25/images/upload
Content-Type: multipart/form-data; boundary=...

--...
Content-Disposition: form-data; name="files"; filename="BAPE_SS25_R01_F01.jpg"
Content-Type: image/jpeg

<binary>
--...
Content-Disposition: form-data; name="exif"; filename="exif.json"
Content-Type: application/json

{ "BAPE_SS25_R01_F01.jpg": { "dateTaken": "2025-03-04T11:30:00Z", "dimensions": "5104x7616" } }
--...--
```

The `exif` field is an OPTIONAL JSON sidecar of pre-parsed EXIF per
filename. The server uses it verbatim (saving CPU + working around HEIC).
If absent, the server parses EXIF itself.

Response (200):

```json
{
  "uploaded": [
    {
      "filename": "BAPE_SS25_R01_F01.jpg",
      "blobPath": "archive/2025/BAPE_SS25/BAPE_SS25_R01_F01.jpg",
      "selected": false,
      "favorite": false,
      "rejected": false,
      "notes":    "",
      "exif": { "dateTaken": "...", "dimensions": "...", "fileSize": 0 }
    }
  ],
  "projectUpdated": { /* full project, with year/month possibly auto-set */ }
}
```

### `PUT /api/projects/:id/images/:filename`

Update an image's tags / notes:

```json
{ "selected": true, "favorite": false, "rejected": false, "notes": "campaign hero" }
```

All fields optional; merge semantics.

Response: updated image object.

### `DELETE /api/projects/:id/images/:filename`

Removes the blob and the metadata entry.

Response: `{ "success": true }`

---

## Content

### `GET /api/about` / `PUT /api/about`

Body / response shape: see `SCHEMAS.md → about.json`.

### `GET /api/services`

Response

```json
{ "services": [ /* SCHEMAS.md → services.json */ ] }
```

### `POST /api/services`

```json
{ "title": "New service", "description": "..." }
```

Server assigns `id` and `order = max+1`. Returns the new service.

### `PUT /api/services/:id`

Partial update. To reorder, send `{ "order": 3 }`. To bulk-reorder, use `PUT /api/services` with the full array.

### `PUT /api/services`

Body: full `{ services: [...] }`. Used for drag-reorder; server writes verbatim.

### `DELETE /api/services/:id`

`{ "success": true }`

### `GET /api/clients` / `POST` / `PUT /:slug` / `DELETE /:slug`

Same patterns as services. Slug is auto-generated from `name` on create.

### `GET /api/settings` / `PUT /api/settings`

Body / response: see `SCHEMAS.md → settings.json`. PUT accepts partial updates.

---

## Public (no auth)

### `GET /api/public/site`

Returns everything a public-site fetch needs in one shot:

```json
{
  "projects": [ /* only images where selected=true */ ],
  "about": { ... },
  "clients": [ ... ],
  "services": [ ... ],
  "settings": {
    "contactEmail": "...",
    "contactPhone": "...",
    "instagram": "...",
    "accentColor": "#d63e5a"
  }
}
```

Add aggressive caching:

```
Cache-Control: public, s-maxage=30, stale-while-revalidate=300
```

---

## Errors

All error responses share this shape:

```json
{
  "error": "snake_case_code",
  "message": "Human-readable description.",
  "details": { /* optional, varies by error */ }
}
```

Common codes:

| Code                 | HTTP | When                                                     |
|----------------------|------|----------------------------------------------------------|
| `unauthorized`       | 401  | Missing or invalid bearer token.                         |
| `invalid_password`   | 401  | Login failed.                                            |
| `not_found`          | 404  | No project / image / etc with that id.                   |
| `validation`         | 422  | Request body failed schema validation; `details` lists.  |
| `rate_limited`       | 429  | Too many requests on auth.                               |
| `storage_error`      | 500  | Blob read/write failed.                                  |
| `internal_error`     | 500  | Anything else.                                           |
