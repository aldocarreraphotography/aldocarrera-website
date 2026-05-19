# JSON Schemas

Every admin endpoint reads from / writes to a small set of JSON files
stored in Netlify Blobs at the keys below. All timestamps are ISO 8601 UTC.

---

## `projects.json`

```json
{
  "projects": [
    {
      "id":          "BAPE_FW24",          // uppercase slug, used in URLs + folder names
      "name":        "BAPE — FW24 Editorial",
      "client":      "BAPE",
      "type":        "Editorial",          // Editorial | Commercial | Lookbook | Campaign | Portrait
      "year":        2024,
      "month":       "November",           // empty string allowed
      "description": "Hong Kong residency. Two days, one apartment, two cameras.",
      "location":    "Hong Kong — Sheung Wan",
      "createdAt":   "2024-11-20T14:30:00Z",
      "updatedAt":   "2026-05-18T09:30:00Z",
      "folderPath":  "archive/2024/BAPE_FW24",   // derived from year + id; do not edit by hand

      "images": [
        {
          "filename":  "BAPE_FW24_R01_F08.jpg",
          "blobPath":  "archive/2024/BAPE_FW24/BAPE_FW24_R01_F08.jpg",
          "selected":  true,
          "favorite":  false,
          "rejected":  false,
          "notes":     "",                      // internal only
          "exif": {
            "dateTaken":  "2024-11-15T14:45:00Z", // null if no EXIF
            "dimensions": "5104×7616",            // unicode × glyph
            "fileSize":   4200000                  // bytes
          }
        }
      ]
    }
  ]
}
```

**Notes**

- `id` is uppercase, alphanumeric + underscore. Used in URLs (`#/projects/:id`).
- `selected`, `favorite`, `rejected` are independent booleans. An image
  can be both `favorite: true` AND `rejected: true` if the photographer
  flagged something they love but won't use; the public site treats
  `selected: true` as the only inclusion criterion.
- `exif.dateTaken` is the single source of truth for "when this was
  taken" — the project's `year` and `month` are convenience labels
  derived from the majority of image dates on first upload.
- **What's NOT in `exif`** — camera, lens, ISO, aperture, shutter speed.
  Deliberate. The product spec forbids displaying gear info anywhere.

---

## `about.json`

```json
{
  "bio":      "Photography has always been more than a profession — …",
  "location": "Los Angeles",
  "education": {
    "school": "Academy of Art University",
    "degree": "BFA, Fine Art Photography",
    "year":   2019
  },
  "practice": [
    "High-end fashion",
    "Campaign",
    "Lookbook",
    "Editorial",
    "Casting",
    "Art Direction",
    "Creative Direction",
    "Post Production"
  ]
}
```

`practice` is an ordered array; reorder is by index.

---

## `clients.json`

```json
{
  "clients": [
    {
      "name":        "BAPE",
      "slug":        "bape",                // auto-generated from name; URL-safe
      "yearsActive": [2023, 2024]
    }
  ]
}
```

---

## `services.json`

```json
{
  "services": [
    {
      "id":          1,
      "title":       "Photography",
      "description": "Campaign · Lookbook · Editorial · High-end fashion",
      "order":       1
    }
  ]
}
```

`id` is monotonic integer assigned at creation. `order` is what the
public site uses to sort; updated whenever the admin reorders.

---

## `settings.json`

```json
{
  "contactEmail": "aldo@aldocarrera.com",
  "contactPhone": "+1 (619) 971-7182",
  "instagram":    "@aldocarrera",
  "accentColor":  "#d63e5a"
}
```

`accentColor` is a 7-char hex string with leading `#`. The public site
sets `--accent` to this value in JS on load.

---

## Validation rules (server-side)

Use [`zod`](https://zod.dev) or similar. Reject on first error with HTTP 422.

```js
// functions/utils/schemas.js (Claude Code: fill this in)
const Project = z.object({
  id:          z.string().regex(/^[A-Z0-9_]{2,}$/),
  name:        z.string().min(1).max(200),
  client:      z.string().max(120),
  type:        z.enum(['Editorial','Commercial','Lookbook','Campaign','Portrait']),
  year:        z.number().int().min(1990).max(2100),
  month:       z.string().max(20),
  description: z.string().max(2000),
  location:    z.string().max(200),
  // ...
});
```

---

## Storage layout in Netlify Blobs

| Key                              | Type     | What                              |
|----------------------------------|----------|-----------------------------------|
| `projects.json`                  | JSON     | The whole projects array.         |
| `about.json`                     | JSON     | Bio + education + practice.       |
| `clients.json`                   | JSON     | Clients array.                    |
| `services.json`                  | JSON     | Services array.                   |
| `settings.json`                  | JSON     | Studio settings.                  |
| `archive/<year>/<id>/<file>.jpg` | binary   | The actual photo. One per image.  |
| `upload-history.json`            | JSON     | Last 50 upload events (rolling).  |

All JSON files are read on every API call; write-locked by Blobs'
optimistic concurrency. If a write conflicts, retry once.
