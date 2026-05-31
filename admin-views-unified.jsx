/* admin-views-unified.jsx — admin management for the unified gallery system.
 * Replaces ClientGalleryPortalsView + GalleriesView at cutover. Talks to /api/ug/*.
 *
 *   UnifiedGalleriesView      — list + create modal
 *   UnifiedGalleryDetailView  — upload (initial / version w/ match preview),
 *                               version history + set-as-main, feedback review
 *
 * Reuses shared admin components (PageHeader, Card, Btn, Field, Modal, Dropzone,
 * toast, …) and MarkupOverlay (defined in admin-views-galleries.jsx, same global
 * scope) to render client markups on the main-version thumbnails.
 */

const { useState: ugS, useEffect: ugE, useRef: ugR, useMemo: ugM } = React;

const _ugApi   = () => (window.API_BASE || '');
const _ugToken = () => localStorage.getItem('aldo_admin_token');

/* Chunked multipart upload — keeps a big batch from becoming one giant request.
   mode: 'initial' | 'version'. onProgress(done, total). Returns merged report. */
async function _ugUpload(token, files, mode, onProgress) {
  const CHUNK = 8;
  const merged = { matched: [], ignored: [], added: [] };
  let done = 0;
  for (let i = 0; i < files.length; i += CHUNK) {
    const slice = files.slice(i, i + CHUNK);
    const fd = new FormData();
    for (const f of slice) fd.append('files', f, f.name);
    const r = await fetch(`${_ugApi()}/api/ug/${token}/upload?mode=${mode}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${_ugToken()}` },
      body: fd,
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || e.error || `HTTP ${r.status}`); }
    const d = await r.json();
    if (d.matched) merged.matched.push(...d.matched);
    if (d.ignored) merged.ignored.push(...d.ignored);
    if (d.added)   merged.added.push(...d.added);
    done += slice.length;
    onProgress && onProgress(done, files.length);
  }
  return merged;
}

/* ════════════════════════════════════════════════════════
   LIST
   ════════════════════════════════════════════════════════ */
function UnifiedGalleriesView({ navigate }) {
  const [galleries, setGalleries] = ugS(null);
  const [creating, setCreating]   = ugS(false);

  const load = async () => {
    try {
      const d = await window.AdminStore.apiFetch('/api/ug');
      setGalleries(d.galleries || []);
    } catch (e) { toast('Failed to load galleries: ' + (e.message || ''), 'error'); setGalleries([]); }
  };
  ugE(() => { load(); }, []);

  const copyLink = (token) => {
    const url = `${window.location.origin}/ug/${token}`;
    navigator.clipboard.writeText(url).then(() => toast('Link copied', 'ok')).catch(() => toast(url, 'ok'));
  };
  const del = async (token, title) => {
    if (!confirm(`Delete gallery "${title}"? This removes its uploaded images too.`)) return;
    try { await window.AdminStore.apiFetch(`/api/ug/${token}`, { method: 'DELETE' });
      setGalleries(g => g.filter(x => x.token !== token)); toast('Deleted', 'ok'); }
    catch (e) { toast('Delete failed', 'error'); }
  };

  return (
    <>
      <PageHeader eyebrow="Workspace" title="Galleries"
        crumbs={[{ label: 'Admin', href: '#/dashboard' }, { label: 'Galleries' }]}
        actions={<Btn onClick={() => setCreating(true)} icon="+">New gallery</Btn>}/>

      <Card padding="lg">
        <SectionHead eyebrow={`${galleries?.length || 0} galleries`} title="Review & delivery"
          sub="One gallery system. Review = client labels/stars/markups/notes. Delivery = downloads. Versioned by re-upload (filename-matched)."/>

        {galleries === null ? <div className="ad-loading-row">Loading…</div>
          : galleries.length === 0 ? <Empty title="No galleries yet" sub="Create one, then upload its first round of images." action={<Btn onClick={() => setCreating(true)}>New gallery</Btn>}/>
          : (
            <table className="ad-table">
              <thead><tr>
                <th>Title</th><th>Mode</th><th>Client</th><th>Images</th><th>Rounds</th>
                <th>Feedback</th><th>Status</th><th>PIN</th><th>Link</th><th style={{ width: 1 }}></th>
              </tr></thead>
              <tbody>
                {galleries.map(g => (
                  <tr key={g.token}>
                    <td><b style={{ cursor: 'pointer' }} onClick={() => navigate(`#/ug/${g.token}`)}>{g.title || '(untitled)'}</b></td>
                    <td><Pill tone={g.mode === 'delivery' ? 'neutral' : 'ok'}>{g.mode}</Pill></td>
                    <td className="ad-muted">{g.clientName || '—'}</td>
                    <td className="ad-mono">{g.imageCount}</td>
                    <td className="ad-mono">{g.rounds}</td>
                    <td className="ad-mono">{g.feedbackCount ? `${g.feedbackCount}${g.markupCount ? ` · ${g.markupCount}✎` : ''}` : '—'}</td>
                    <td>{g.submitted ? <Pill tone="ok">Submitted</Pill> : <Pill tone="neutral">Open</Pill>}</td>
                    <td className="ad-mono ad-muted">{g.pin || '—'}</td>
                    <td><button className="ad-link" onClick={() => copyLink(g.token)}>Copy</button> · <a className="ad-link" href={`/ug/${g.token}`} target="_blank" rel="noopener">Open ↗</a></td>
                    <td><div className="ad-row-actions">
                      <button className="ad-link" onClick={() => navigate(`#/ug/${g.token}`)}>Manage</button>
                      <button className="ad-link ad-link-quiet" onClick={() => del(g.token, g.title)}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      {creating && <UnifiedCreateModal onClose={() => setCreating(false)} onCreated={(g) => { setCreating(false); navigate(`#/ug/${g.token}`); }}/>}
    </>
  );
}

/* ── Create modal ─────────────────────────────────────── */
function UnifiedCreateModal({ onClose, onCreated }) {
  const [mode, setMode]       = ugS('review');
  const [title, setTitle]     = ugS('');
  const [client, setClient]   = ugS('');
  const [pin, setPin]         = ugS('');
  const [downloads, setDl]    = ugS(false);
  const [busy, setBusy]       = ugS(false);

  const create = async () => {
    if (pin && !/^\d{4}$/.test(pin)) { toast('PIN must be 4 digits', 'error'); return; }
    setBusy(true);
    try {
      const features = mode === 'delivery'
        ? { labels: false, stars: false, markups: false, notes: false, voice: false, downloads: true }
        : { labels: true, stars: true, markups: true, notes: true, voice: true, downloads };
      const g = await window.AdminStore.apiFetch('/api/ug', {
        method: 'POST',
        body: JSON.stringify({ mode, title, clientName: client, pin: pin || null, features }),
      });
      toast('Gallery created', 'ok');
      onCreated(g);
    } catch (e) { toast('Create failed: ' + (e.message || ''), 'error'); setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} eyebrow="New" title="Create gallery" width={460}
      footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create'}</Btn></>}>
      <Field label="Mode">
        <Radio name="ugmode" value={mode} onChange={setMode}
          options={[{ value: 'review', label: 'Review — labels, stars, markups, notes' }, { value: 'delivery', label: 'Delivery — downloads only' }]}/>
      </Field>
      <Field label="Title" hint="Shown to the client.">
        <TextInput value={title} onChange={setTitle} placeholder="BAPE SS24 — Round 1" autoFocus/>
      </Field>
      <Field label="Client name" hint="Internal — for your list.">
        <TextInput value={client} onChange={setClient} placeholder="BAPE"/>
      </Field>
      <Field label="PIN" hint="4 digits. Leave blank for an open link (no PIN).">
        <TextInput value={pin} onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))} placeholder="1234"/>
      </Field>
      {mode === 'review' && <Field label="Downloads"><Toggle value={downloads} onChange={setDl} label="Let the client download originals"/></Field>}
    </Modal>
  );
}

/* ════════════════════════════════════════════════════════
   DETAIL / MANAGE
   ════════════════════════════════════════════════════════ */
function UnifiedGalleryDetailView({ token, navigate }) {
  const [g, setG]           = ugS(null);
  const [uploadMode, setUM] = ugS('initial'); // 'initial' | 'version'
  const [pending, setPending] = ugS(null);    // { files, matched, ignored } awaiting confirm (version)
  const [progress, setProgress] = ugS(null);  // { done, total }
  const [busy, setBusy]     = ugS(false);

  const load = async () => {
    try { const d = await window.AdminStore.apiFetch(`/api/ug/${token}`); setG(d); }
    catch (e) { toast('Load failed', 'error'); navigate('#/ug'); }
  };
  ugE(() => { load(); }, [token]);

  const existingNames = ugM(() => new Set(Object.keys(g?.images || {})), [g]);

  const onFiles = (files) => {
    if (uploadMode === 'version') {
      const matched = files.filter(f => existingNames.has(f.name));
      const ignored = files.filter(f => !existingNames.has(f.name));
      setPending({ files, matched, ignored });
    } else {
      doUpload(files, 'initial');
    }
  };

  const doUpload = async (files, mode) => {
    setBusy(true); setPending(null); setProgress({ done: 0, total: mode === 'version' ? files.filter(f => existingNames.has(f.name)).length : files.length });
    try {
      const toSend = mode === 'version' ? files.filter(f => existingNames.has(f.name)) : files;
      if (!toSend.length) { toast('Nothing to upload', 'error'); setBusy(false); setProgress(null); return; }
      const rep = await _ugUpload(token, toSend, mode, (done, total) => setProgress({ done, total }));
      toast(mode === 'version'
        ? `${rep.matched.length} layered as new versions${rep.ignored.length ? ` · ${rep.ignored.length} ignored` : ''}`
        : `${rep.added.length} images added`, 'ok');
      await load();
    } catch (e) { toast('Upload failed: ' + (e.message || ''), 'error'); }
    finally { setBusy(false); setProgress(null); }
  };

  const setMain = async (filename, versionId) => {
    try {
      await window.AdminStore.apiFetch(`/api/ug/${token}/images/${encodeURIComponent(filename)}/set-main`, { method: 'POST', body: JSON.stringify({ versionId }) });
      await load(); toast('Main version set', 'ok');
    } catch (e) { toast('Failed', 'error'); }
  };

  const toggleDownloads = async () => {
    const next = { ...g.features, downloads: !g.features.downloads };
    setG({ ...g, features: next });
    try { await window.AdminStore.apiFetch(`/api/ug/${token}`, { method: 'PATCH', body: JSON.stringify({ features: next }) }); }
    catch (e) { toast('Failed', 'error'); load(); }
  };

  if (!g) return <div className="ad-loading-row">Loading…</div>;

  const images = Object.values(g.images || {});

  return (
    <>
      <PageHeader eyebrow={`${g.mode} gallery`} title={g.title || '(untitled)'}
        crumbs={[{ label: 'Admin', href: '#/dashboard' }, { label: 'Galleries', href: '#/ug' }, { label: g.title || token }]}
        actions={<>
          <a className="ad-link" href={`/ug/${token}`} target="_blank" rel="noopener">Open ↗</a>
          <Btn variant="ghost" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/ug/${token}`); toast('Link copied', 'ok'); }}>Copy link</Btn>
        </>}/>

      <Card padding="lg">
        <SectionHead title="Gallery"
          sub={`${images.length} images · ${(g.rounds || []).length} round${(g.rounds || []).length !== 1 ? 's' : ''} · PIN ${g.auth?.pin || '— (open)'} · ${g.submitted ? 'submitted' : 'open'}`}/>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Toggle value={!!g.features?.downloads} onChange={toggleDownloads} label="Client downloads"/>
          <span className="ad-muted ad-mono" style={{ fontSize: 12 }}>Mode: {g.mode}</span>
        </div>
      </Card>

      {/* Upload */}
      <Card padding="lg" className="ad-mt-md">
        <SectionHead title="Add images"
          sub="Initial round adds everything. New version matches by filename — only matching files layer on as new versions; the rest are ignored."/>
        <div style={{ marginBottom: 12 }}>
          <Radio name="ugupload" value={uploadMode} onChange={setUM}
            options={images.length === 0
              ? [{ value: 'initial', label: 'Initial round (add all)' }]
              : [
                  { value: 'initial', label: 'Add more (round, all new)' },
                  { value: 'version', label: 'New version (filename-matched)' },
                ]}/>
        </div>

        {progress
          ? <div className="ad-loading-row">Uploading {progress.done}/{progress.total}…</div>
          : <Dropzone onFiles={onFiles}
              label={uploadMode === 'version' ? 'Drop the re-edited images (same filenames)' : 'Drop the first round of images, or click to browse'}
              hint={uploadMode === 'version' ? 'Filenames must match existing images to layer as new versions.' : 'No limit — large batches upload in chunks.'}/>}

        {pending && (
          <div style={{ marginTop: 16, padding: 16, border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--paper-soft)' }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Confirm version upload</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              <b>{pending.matched.length}</b> will layer as new versions:
              <span className="ad-mono ad-muted"> {pending.matched.slice(0, 6).map(f => f.name).join(', ')}{pending.matched.length > 6 ? ` +${pending.matched.length - 6}` : ''}</span>
            </div>
            {pending.ignored.length > 0 && (
              <div style={{ fontSize: 13, marginBottom: 10, color: 'var(--ink-muted)' }}>
                <b>{pending.ignored.length}</b> ignored (no matching image):
                <span className="ad-mono"> {pending.ignored.slice(0, 6).map(f => f.name).join(', ')}{pending.ignored.length > 6 ? ` +${pending.ignored.length - 6}` : ''}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={() => doUpload(pending.files, 'version')} disabled={busy || pending.matched.length === 0}>
                Layer {pending.matched.length} version{pending.matched.length !== 1 ? 's' : ''}
              </Btn>
              <Btn variant="ghost" onClick={() => setPending(null)}>Cancel</Btn>
            </div>
          </div>
        )}
      </Card>

      {/* Images + version history + feedback */}
      <Card padding="lg" className="ad-mt-md">
        <SectionHead title="Images" sub="Each image's version history. Click a version chip to make it the main (what the client sees + downloads)."/>
        {images.length === 0 ? <Empty title="No images yet" sub="Upload the first round above."/>
          : (
            <div className="ad-ug-images">
              {images.map(img => <UnifiedImageRow key={img.filename} token={token} img={img} onSetMain={setMain}/>)}
            </div>
          )}
      </Card>
    </>
  );
}

/* One image: main-version thumb (with markup overlay) + version chips + feedback summary. */
function UnifiedImageRow({ token, img, onSetMain }) {
  const main = (img.versions || []).find(v => v.isMain) || (img.versions || [])[img.versions.length - 1];
  const fb   = img.feedback?.[main?.versionId] || {};
  const imgRef = ugR(null), canvasRef = ugR(null);
  const mainUrl = `${_ugApi()}/api/ug/${token}/image/${encodeURIComponent(img.filename)}?v=${main?.versionId}`;

  return (
    <div className="ad-ug-image-row" style={{ display: 'flex', gap: 16, padding: '14px 0', borderTop: '1px solid var(--rule-soft)' }}>
      <div style={{ position: 'relative', width: 120, flexShrink: 0 }}>
        <div style={{ position: 'relative', aspectRatio: '4/5', overflow: 'hidden', background: 'var(--paper-soft)' }}>
          <img ref={imgRef} src={mainUrl} alt={img.filename} crossOrigin="anonymous"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}/>
          {typeof MarkupOverlay === 'function' && (fb.markups || []).length > 0 &&
            <MarkupOverlay markups={fb.markups} imgRef={imgRef} canvasRef={canvasRef}/>}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ad-mono" style={{ fontSize: 13, marginBottom: 4 }}>{img.filename}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
          {fb.label && <Pill tone={fb.label === 'SELECT' ? 'ok' : 'neutral'}>{fb.label}</Pill>}
          {fb.stars > 0 && <span style={{ color: '#c89b3c' }}>{'★'.repeat(fb.stars)}</span>}
          {(fb.markups || []).length > 0 && <span className="ad-muted ad-mono" style={{ fontSize: 12 }}>{fb.markups.length} markup{fb.markups.length !== 1 ? 's' : ''}</span>}
          {!fb.label && !fb.stars && !(fb.markups || []).length && !fb.note && <span className="ad-muted" style={{ fontSize: 12 }}>No feedback yet</span>}
        </div>
        {fb.note && <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>"{fb.note}"</div>}
        <div className="ug-vstrip" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(img.versions || []).map(v => (
            <button key={v.versionId}
              className="ad-link"
              onClick={() => !v.isMain && onSetMain(img.filename, v.versionId)}
              title={v.isMain ? 'Current main' : 'Set as main'}
              style={{
                fontSize: 11, fontFamily: 'monospace', padding: '3px 8px', borderRadius: 3,
                border: '1px solid var(--rule)', cursor: v.isMain ? 'default' : 'pointer',
                background: v.isMain ? 'var(--ink)' : 'transparent', color: v.isMain ? 'var(--paper)' : 'var(--ink)',
              }}>
              {v.versionId}{v.isMain ? ' · main' : ''} <span style={{ opacity: .6 }}>R{v.round}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { UnifiedGalleriesView, UnifiedGalleryDetailView });
