# Unified Gallery — Plan & Spec

Status: **Phases 0–1 built locally (not deployed)**
Owner: Aldo · Last updated by the merge work session

## Build log
- ✅ **Phase 0** — dry-run migration verified on live data: 76 markups, 26 labels, 28 images, 0 anomalies, lossless.
- ✅ **Data layer** — `nas-server/utils/unified-galleries.js`, 22/22 self-tests pass.
- ✅ **Server API** — `/api/ug/*` full surface in `server.js` (node --check clean). Dormant in prod.
- ✅ **Client app** — `unified-gallery.{html,jsx}` at `/ug/:token`; canvas markup engine ported; babel-validated. Wired into build + netlify.toml.
- ⏳ **Voice notes** — deferred follow-up: `/api/ug/.../voice` endpoints + recorder UI (positioned voice markups, like legacy). Feedback schema already has `voiceMarkups`/`voiceNote` slots.
- ⏳ **Phase 3** — admin UI (create gallery, version-upload w/ match-ignore confirm, version history + set-main, feedback review, PDF/ZIP).
- ⏳ **Phase 4** — write-migration (`scripts/migrate-galleries.mjs`, keeps backups) + old-link redirects + one rebuild/deploy to test.

Merges the two gallery systems (legacy proofing `gallery.html` + PIN portal `/g/:token`)
into one React app with one data model, one auth path, and image versioning.

---

## Why

Two tools grew apart serving two phases of the same client relationship:

| | Legacy Gallery (`gallery.html`) | Client Portal (`/g/:token`) |
|---|---|---|
| Phase | Proofing / review / selection | Final delivery |
| Tech | Vanilla JS | React |
| Access | `?token=` + optional password (per request) | PIN → session key |
| Client can | SELECT/ALT/KILL, stars, **markups**, voice markups, notes, submit | hearts, notes, voice, **download**, submit |
| Markups | ✅ | ❌ |
| Downloads | admin ZIP only | client single + ZIP (opt-in) |
| Admin | filter pills, PDF export, ZIP, "New Round" | heart count, downloads toggle |

70% the same plumbing, two feature sets. Merge → one tool.

---

## Decisions (locked)

- **Hearts are retired.** Selection = **SELECT / ALT / KILL labels + 1–5 stars** (the legacy pro toolkit). Migration maps existing portal `hearted: true` → label `SELECT`.
- **Two modes:**
  - **REVIEW** — labels, stars, markups (rect/arrow/ellipse/freehand + comments), notes, voice, submit. Versioned rounds. Downloads optional toggle.
  - **DELIVERY** — download only (single + ZIP). Clean handoff.
- **Auth:** PIN + session key (drop password-on-every-request). Legacy passwords preserved during migration; those galleries keep working until re-issued.
- **Round 1 images:** uploaded directly into the gallery (gallery owns its bytes, decoupled from projects). Must handle **large batches** — no artificial count cap, per-file progress, one failure skips + reports (never aborts the batch).
- **Existing links:** migrate + keep old `/gallery?token=` and `/g/TOKEN` URLs working via redirects. Zero client disruption.

---

## Versioning (core mechanic)

- Each image is a **version stack**, keyed by **filename**.
- Re-upload a batch → **filename match** layers a new version onto the existing image; **non-matching files are ignored**. Admin sees a pre-commit report ("4 matched, 1 ignored — proceed?").
- Newest version = **main** (what the client sees + downloads) by default. **"Set as main"** rolls back to any prior version.
- **Feedback attaches per version.** Round-1 markups stay on v1, so you can verify a fix addressed what the client circled.

---

## Unified data model (proposed)

Stored in `nas-server/data/unified-galleries.json`. Image bytes in `images/__galleries/{token}/{filename}/{versionId}.<ext>`.

```jsonc
{
  "galleries": [
    {
      "token": "abc123",            // preserved from source for link continuity
      "source": "gallery|portal",   // provenance (migration only)
      "mode": "review|delivery",
      "title": "BAPE SS24 — Round 1",
      "clientName": "BAPE",
      "projectId": "BAPE_SS24",     // nullable; seed/reference only

      "auth": {
        "type": "pin|password|open",
        "pin": "1234",              // when type=pin
        "password": null            // legacy passwords preserved
      },

      "features": {                 // explicit; derived from mode
        "labels": true, "stars": true, "markups": true,
        "notes": true, "voice": true, "downloads": false
      },

      "images": {
        "a.jpg": {
          "filename": "a.jpg",
          "versions": [
            { "versionId": "v1", "round": 1, "blobPath": "...", "uploadedAt": "...", "isMain": false },
            { "versionId": "v2", "round": 2, "blobPath": "...", "uploadedAt": "...", "isMain": true }
          ],
          "feedback": {             // keyed by versionId
            "v1": { "label": "SELECT", "stars": 4, "note": "...", "markups": [], "voiceMarkups": [], "voiceNote": null },
            "v2": { "label": null, "stars": 0, "note": "", "markups": [], "voiceMarkups": [], "voiceNote": null }
          }
        }
      },

      "rounds": [ { "round": 1, "createdAt": "..." } ],
      "status": "open|submitted|archived",
      "submitted": false,
      "submittedAt": null,
      "createdAt": "...",
      "expiresAt": null
    }
  ]
}
```

Migration is **lossless**: legacy `voiceMarkups` (positioned, x/y) and portal `voiceNote` (single) are
both preserved verbatim inside `feedback`. Normalization (one voice representation) happens in Phase 1, not migration.

---

## Phases

- **Phase 0 — Schema + migration** *(current)*. Dry-run script reads `galleries.json` + `gallery-portals.json`, reports exactly what the merged store would contain, **writes nothing live**. Verify every markup/note/label survives before any cutover.
- **Phase 1 — Unified React client.** Port the vanilla canvas markup engine into the React app. Mode-aware UI. Old-link redirects.
- **Phase 2 — Versioning engine.** Gallery-owned versioned storage. Filename-matched batch upload + match/ignore report. Version history + set-as-main. Large-batch handling.
- **Phase 3 — Admin unification.** One admin view replaces `GalleriesView` + `ClientGalleryPortalsView`. Keep PDF/ZIP export.
- **Phase 4 — Cutover.** Verify migration on live data, flip redirects, retire old code paths.

---

## Migration mapping (Phase 0)

| Source field | → Unified |
|---|---|
| legacy `gallery.selections[fn].label` | `feedback.v1.label` (unchanged) |
| legacy `.stars` | `feedback.v1.stars` |
| legacy `.note` | `feedback.v1.note` |
| legacy `.markups` (with `_v`) | `feedback.v1.markups` (verbatim) |
| legacy `.voiceMarkups` | `feedback.v1.voiceMarkups` (verbatim) |
| legacy `password` | `auth.password`, `auth.type='password'` |
| portal `selects[fn].hearted: true` | `feedback.v1.label = 'SELECT'` |
| portal `.note` | `feedback.v1.note` |
| portal `.voiceNote` | `feedback.v1.voiceNote` (verbatim) |
| portal `pin` | `auth.pin`, `auth.type='pin'` |
| portal `downloadsEnabled` | `features.downloads` |
| both: image set | resolved from linked project's non-rejected images = v1 (round 1) |

Anomalies the dry-run flags: gallery `projectId` not found in `projects.json`; selection
filenames that don't exist in the project (orphaned feedback — preserved anyway).
