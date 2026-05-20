/* admin-views-galleries.jsx — Gallery link management */

const { useState: gS, useEffect: gE, useMemo: gM, useRef: gRef, useCallback: gCB } = React;

/* ============================================================
   MARKUP DRAWING — ported from gallery.html
   ============================================================ */
function _normToCanvas(nx, ny, b) {
  return { x: b.ox + nx * b.rw, y: b.oy + ny * b.rh };
}

function _getImgBounds(imgEl) {
  const { naturalWidth: nw, naturalHeight: nh } = imgEl;
  const { width: cw, height: ch } = imgEl.getBoundingClientRect();
  if (!nw || !nh || !cw || !ch) return null;
  const scale = Math.min(cw / nw, ch / nh);
  const rw = nw * scale, rh = nh * scale;
  return { ox: (cw - rw) / 2, oy: (ch - rh) / 2, rw, rh };
}

function _drawShape(ctx, b, tool, shape, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = lw || 2;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  if (tool === 'freehand' && shape?.points?.length > 1) {
    ctx.beginPath();
    const p0 = _normToCanvas(shape.points[0][0], shape.points[0][1], b);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < shape.points.length; i++) {
      const p = _normToCanvas(shape.points[i][0], shape.points[i][1], b);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  } else if (tool === 'ellipse' && shape) {
    const c = _normToCanvas(shape.cx, shape.cy, b);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, shape.rx * b.rw, shape.ry * b.rh, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (tool === 'arrow' && shape) {
    const s = _normToCanvas(shape.x1, shape.y1, b);
    const e = _normToCanvas(shape.x2, shape.y2, b);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    const angle = Math.atan2(e.y - s.y, e.x - s.x);
    const len   = 12;
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x - len * Math.cos(angle - 0.4), e.y - len * Math.sin(angle - 0.4));
    ctx.lineTo(e.x - len * Math.cos(angle + 0.4), e.y - len * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  } else if (tool === 'rect' && shape) {
    const origin = _normToCanvas(shape.x, shape.y, b);
    ctx.beginPath();
    ctx.rect(origin.x, origin.y, shape.w * b.rw, shape.h * b.rh);
    ctx.stroke();
  }
  ctx.restore();
}

/* Small thumbnail markup overlay (inside gallery grid cards) */
function MarkupOverlay({ markups, imgRef, canvasRef }) {
  gE(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !markups?.length) return;

    function draw() {
      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const b = _getImgBounds(img);
      if (!b) return;
      for (const mk of markups) _drawShape(ctx, b, mk.tool, mk.shape, mk.color, 1.5);
    }

    if (img.complete && img.naturalWidth) draw();
    else img.addEventListener('load', draw, { once: true });
    const ro = new ResizeObserver(draw);
    ro.observe(img);
    return () => ro.disconnect();
  }, [markups]);

  if (!markups?.length) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}

/* Full-size image lightbox with markup canvas */
function GalleryLightbox({ img, sel, allImages, allSels, onClose }) {
  const [current, setCurrent] = gS(img);
  const imgRef    = gRef(null);
  const canvasRef = gRef(null);

  const idx = allImages.findIndex(i => i.filename === current.filename);
  const curSel = allSels[current.filename] || {};
  const markups = curSel.markups || [];

  gE(() => {
    const onKey = (e) => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowRight' && idx < allImages.length - 1) setCurrent(allImages[idx + 1]);
      if (e.key === 'ArrowLeft'  && idx > 0)                   setCurrent(allImages[idx - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, allImages, onClose]);

  gE(() => {
    const canvas = canvasRef.current;
    const image  = imgRef.current;
    if (!canvas || !image) return;

    function draw() {
      const dpr  = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      canvas.width  = rect.width  * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const b = _getImgBounds(image);
      if (!b) return;
      for (const mk of markups) _drawShape(ctx, b, mk.tool, mk.shape, mk.color, 2);
    }

    if (image.complete && image.naturalWidth) draw();
    else image.addEventListener('load', draw, { once: true });
    const ro = new ResizeObserver(draw);
    ro.observe(image);
    return () => ro.disconnect();
  }, [current.filename, markups]);

  return (
    <div className="gl-lightbox-admin" onClick={onClose}>
      <div className="gl-lb-admin-inner" onClick={e => e.stopPropagation()}>
        <div className="gl-lb-admin-top">
          <div>
            <span className="ad-mono" style={{ fontSize: 12 }}>{current.filename}</span>
            {curSel.label && <span className={`ad-badge ad-badge-${curSel.label === 'SELECT' ? 'green' : curSel.label === 'ALT' ? 'blue' : 'muted'}`} style={{ marginLeft: 8 }}>{curSel.label}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {curSel.stars > 0 && <span style={{ color: '#c89b3c' }}>{'★'.repeat(curSel.stars)}</span>}
            <span className="ad-muted" style={{ fontSize: 12 }}>{idx + 1} / {allImages.length}</span>
            <button className="ad-btn-icon" onClick={onClose} style={{ fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        </div>

        <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#0e0d0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            ref={imgRef}
            src={current.blobPath}
            alt={current.filename}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
          />
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          />
          {idx > 0 && (
            <button className="gl-lb-admin-nav gl-lb-admin-prev" onClick={() => setCurrent(allImages[idx - 1])}>‹</button>
          )}
          {idx < allImages.length - 1 && (
            <button className="gl-lb-admin-nav gl-lb-admin-next" onClick={() => setCurrent(allImages[idx + 1])}>›</button>
          )}
        </div>

        {curSel.note && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--ad-rule)', fontSize: 13, color: 'var(--ink-muted)' }}>
            <span className="ad-eyebrow" style={{ marginRight: 8 }}>Note:</span>{curSel.note}
          </div>
        )}
        {markups.length > 0 && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--ad-rule)', display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
            {markups.map(mk => (
              <span key={mk.id} style={{ background: mk.color + '22', border: `1px solid ${mk.color}`, borderRadius: 4, padding: '2px 6px', color: mk.color, fontFamily: 'monospace' }}>
                {mk.tool}{mk.comment ? ` — ${mk.comment}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Single gallery image card with markup overlay */
function GalleryImageCard({ img, sel, onClick }) {
  const imgRef    = gRef(null);
  const canvasRef = gRef(null);
  const markups   = sel?.markups || [];

  return (
    <div
      className={`ad-gallery-card ${sel?.label ? 'has-label label-' + sel.label : ''}`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <div className="ad-gallery-thumb-wrap" style={{ position: 'relative' }}>
        <img ref={imgRef} src={img.blobPath} alt={img.filename} className="ad-gallery-thumb" loading="lazy"/>
        {sel?.label && <span className={`ad-gallery-badge badge-${sel.label}`}>{sel.label}</span>}
        <MarkupOverlay markups={markups} imgRef={imgRef} canvasRef={canvasRef}/>
      </div>
      <div className="ad-gallery-card-body">
        <div className="ad-mono ad-muted" style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.filename}</div>
        {sel?.stars > 0 && <div style={{ color: '#c89b3c', fontSize: 12 }}>{'★'.repeat(sel.stars)}</div>}
        {markups.length > 0 && (
          <div style={{ fontSize: 11, color: '#5a6fa8', marginTop: 2 }}>✎ {markups.length} markup{markups.length === 1 ? '' : 's'}</div>
        )}
        {sel?.note && <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{sel.note}</div>}
      </div>
    </div>
  );
}

/* ============================================================
   GALLERIES LIST VIEW
   ============================================================ */
function GalleriesView({ navigate }) {
  window.useStoreSubscribe();
  const [galleries, setGalleries] = gS([]);
  const [loading, setLoading]     = gS(true);
  const [creating, setCreating]   = gS(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await window.AdminStore.apiFetch('/api/galleries');
      setGalleries(data.galleries || []);
    } catch (e) {
      toast('Failed to load galleries: ' + (e.message || 'error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  gE(() => { load(); }, []);

  const deleteGallery = async (token, title) => {
    if (!confirm(`Delete gallery "${title}"? This can't be undone.`)) return;
    try {
      await window.AdminStore.apiFetch(`/api/galleries/${token}`, { method: 'DELETE' });
      setGalleries(gs => gs.filter(g => g.token !== token));
      toast('Gallery deleted', 'ok');
    } catch (e) {
      toast('Delete failed: ' + (e.message || 'error'), 'error');
    }
  };

  const archiveGallery = async (token) => {
    try {
      await window.AdminStore.apiFetch(`/api/galleries/${token}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'archived' }),
      });
      setGalleries(gs => gs.map(g => g.token === token ? { ...g, status: 'archived' } : g));
      toast('Gallery archived', 'ok');
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  };

  const copyLink = (token) => {
    const url = `${window.location.origin}/gallery.html?token=${token}`;
    navigator.clipboard.writeText(url).then(() => toast('Link copied', 'ok')).catch(() => toast(url, 'ok'));
  };

  const statusBadge = (g) => {
    if (g.status === 'submitted') return <span className="ad-badge ad-badge-green">Submitted</span>;
    if (g.status === 'archived')  return <span className="ad-badge ad-badge-muted">Archived</span>;
    if (g.expiresAt && new Date(g.expiresAt) < new Date())
      return <span className="ad-badge ad-badge-muted">Expired</span>;
    return <span className="ad-badge ad-badge-blue">Open</span>;
  };

  const progress = (g) => {
    const c = g._counts || {};
    if (!c.total) return '—';
    const pct = Math.round((c.reviewed / c.total) * 100);
    return `${c.reviewed}/${c.total} reviewed (${pct}%)`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Client Galleries"
        crumbs={[{ label: 'Admin', href: '#/dashboard' }, { label: 'Galleries' }]}
        actions={<Btn onClick={() => setCreating(true)} icon="+">New gallery</Btn>}
      />

      <Card padding="lg">
        <SectionHead
          eyebrow={`${galleries.length} ${galleries.length === 1 ? 'gallery' : 'galleries'}`}
          title="Review links"
          sub="Share a private link with your client so they can mark selects."
        />

        {loading ? (
          <div className="ad-loading-row">Loading…</div>
        ) : galleries.length === 0 ? (
          <Empty
            title="No galleries yet"
            sub="Create a link to share images with a client for review."
            action={<Btn onClick={() => setCreating(true)}>New gallery</Btn>}
          />
        ) : (
          <table className="ad-table">
            <thead>
              <tr>
                <th>Title / Client</th>
                <th>Project</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Selects</th>
                <th>Views</th>
                <th>Created</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {galleries.map(g => (
                <tr key={g.token}>
                  <td>
                    <div><b>{g.title}</b></div>
                    {g.clientName && <div className="ad-muted" style={{ fontSize: 12 }}>{g.clientName}</div>}
                  </td>
                  <td className="ad-mono ad-muted">{g.projectId}</td>
                  <td>{statusBadge(g)}</td>
                  <td className="ad-muted" style={{ fontSize: 12 }}>{progress(g)}</td>
                  <td>
                    {g._counts?.selected > 0
                      ? <span style={{ color: 'var(--select, #2a7a4f)', fontWeight: 600 }}>{g._counts.selected} SELECT</span>
                      : <span className="ad-muted">—</span>
                    }
                    {g._counts?.alted > 0 && <span className="ad-muted" style={{ marginLeft: 6, fontSize: 12 }}>{g._counts.alted} ALT</span>}
                  </td>
                  <td className="ad-muted" style={{ fontSize: 12 }}>
                    {g.viewCount > 0
                      ? <span title={g.lastViewedAt ? `Last: ${new Date(g.lastViewedAt).toLocaleString()}` : ''}>{g.viewCount} view{g.viewCount === 1 ? '' : 's'}</span>
                      : '—'
                    }
                  </td>
                  <td className="ad-mono ad-muted" style={{ fontSize: 12 }}>{g.createdAt ? new Date(g.createdAt).toLocaleDateString() : '—'}</td>
                  <td>
                    <div className="ad-row-actions">
                      <button className="ad-link" onClick={() => copyLink(g.token)}>Copy link</button>
                      <button className="ad-link" onClick={() => navigate(`#/galleries/${g.token}`)}>Review</button>
                      {g.status === 'open' && <button className="ad-link ad-link-quiet" onClick={() => archiveGallery(g.token)}>Archive</button>}
                      <button className="ad-link ad-link-quiet" onClick={() => deleteGallery(g.token, g.title)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <GalleryCreateModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(g) => {
          setGalleries(gs => [g, ...gs]);
          setCreating(false);
          toast('Gallery created — link copied to clipboard', 'ok');
          const url = `${window.location.origin}/gallery.html?token=${g.token}`;
          navigator.clipboard.writeText(url).catch(() => {});
        }}
      />
    </>
  );
}

/* ============================================================
   CREATE MODAL
   ============================================================ */
function GalleryCreateModal({ open, onClose, onCreated, prefill }) {
  window.useStoreSubscribe();
  const projects = window.AdminStore.getProjects();
  const [form, setForm] = gS({ projectId: prefill?.projectId || '', clientName: prefill?.clientName || '', title: prefill?.title || '', expiresAt: '', password: '' });
  const [saving, setSaving] = gS(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const onProjectChange = (id) => {
    const p = projects.find(x => x.id === id);
    set('projectId', id);
    if (p && !form.title) set('title', p.name + ' — Selects');
  };

  const submit = async () => {
    if (!form.projectId) { toast('Select a project', 'warn'); return; }
    setSaving(true);
    try {
      const body = {
        projectId:  form.projectId,
        clientName: form.clientName || '',
        title:      form.title || '',
        expiresAt:  form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        password:   form.password || null,
      };
      const g = await window.AdminStore.apiFetch('/api/galleries', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onCreated(g);
      setForm({ projectId: '', clientName: '', title: '', expiresAt: '', password: '' });
    } catch (e) {
      toast('Error: ' + (e.message || 'failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="New"
      title="Create gallery link"
      width={520}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={saving || !form.projectId}>
            {saving ? 'Creating…' : 'Create & copy link'}
          </Btn>
        </>
      }
    >
      <Field label="Project" wide>
        <select
          className="ad-select"
          value={form.projectId}
          onChange={e => onProjectChange(e.target.value)}
        >
          <option value="">Select a project…</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.year})</option>
          ))}
        </select>
      </Field>
      <Field label="Client name" wide hint="Who you're sending this to — shown in the gallery header.">
        <TextInput
          value={form.clientName}
          onChange={v => set('clientName', v)}
          placeholder="e.g. BAPE Studio"
        />
      </Field>
      <Field label="Gallery title" wide hint="Appears at the top of the client page.">
        <TextInput
          value={form.title}
          onChange={v => set('title', v)}
          placeholder="e.g. BAPE FW24 — Final Selects"
        />
      </Field>
      <div className="ad-form-grid">
        <Field label="Expires" hint="Leave blank = no expiry.">
          <TextInput type="date" value={form.expiresAt} onChange={v => set('expiresAt', v)}/>
        </Field>
        <Field label="Password" hint="Optional. Client must enter this to view.">
          <TextInput value={form.password} onChange={v => set('password', v)} placeholder="Leave blank = open"/>
        </Field>
      </div>
    </Modal>
  );
}

/* ============================================================
   PDF EXPORT — gallery selects
   ============================================================ */
async function exportGallerySelectsPDF(gallery, images, sels) {
  if (!window.jspdf) { toast('PDF engine still loading — try again in a moment.', 'warn'); return; }

  const selImages = images.filter(img => {
    const label = sels[img.filename]?.label;
    return label === 'SELECT' || label === 'ALT';
  });
  if (selImages.length === 0) { toast('No selects or alts to export.', 'warn'); return; }

  toast(`Generating PDF for ${selImages.length} images…`, 'ok');

  const PW = 816, PH = 1056, SC = 2;
  const PAPER = '#f5f2ee', INK = '#1a1714', SOFT = '#7a7675', RULE = '#cdc8c2';
  const PL = 48, PT = 52;

  const toDataUrl = async (src) => {
    try {
      const r = await fetch(src, { mode: 'cors', cache: 'no-store' });
      const blob = await r.blob();
      return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    } catch (_) { return src; }
  };

  const loadImg = (src) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

  const drawContain = (ctx, img, x, y, w, h) => {
    ctx.fillStyle = PAPER; ctx.fillRect(x, y, w, h);
    if (!img) return;
    const ia = img.naturalWidth / img.naturalHeight;
    const sa = w / h;
    let dw, dh, dx, dy;
    if (ia > sa) { dw = w; dh = w / ia; dx = x; dy = y + (h - dh) / 2; }
    else         { dh = h; dw = h * ia; dy = y; dx = x + (w - dw) / 2; }
    ctx.drawImage(img, dx, dy, dw, dh);
  };

  await document.fonts.ready;

  const makePage = async (imgObj, selObj, pageNum, total) => {
    const cv = document.createElement('canvas');
    cv.width = PW * SC; cv.height = PH * SC;
    const ctx = cv.getContext('2d');
    ctx.scale(SC, SC);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, PW, PH);

    // Header
    ctx.fillStyle = SOFT; ctx.font = '9px "IBM Plex Mono", monospace';
    ctx.fillText(`${gallery.title || 'Gallery'} — ${gallery.clientName || ''}`.toUpperCase(), PL, PT);
    const pgLabel = `${pageNum} / ${total}`;
    ctx.fillText(pgLabel, PW - PL - ctx.measureText(pgLabel).width, PT);
    ctx.strokeStyle = RULE; ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.moveTo(PL, PT + 10); ctx.lineTo(PW - PL, PT + 10); ctx.stroke();

    // Image
    const dataUrl = await toDataUrl(imgObj.blobPath);
    const img     = await loadImg(dataUrl);
    const imgArea = { x: PL, y: PT + 22, w: PW - PL * 2, h: 820 };
    drawContain(ctx, img, imgArea.x, imgArea.y, imgArea.w, imgArea.h);

    // Caption strip
    const capY = imgArea.y + imgArea.h + 14;
    ctx.strokeStyle = RULE; ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.moveTo(PL, capY); ctx.lineTo(PW - PL, capY); ctx.stroke();

    const labelColor = selObj.label === 'SELECT' ? '#2a7a4f' : '#2a5a8a';
    ctx.fillStyle = labelColor; ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillText(selObj.label || '', PL, capY + 20);

    ctx.fillStyle = INK; ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillText(imgObj.filename, PL + 70, capY + 20);

    if (selObj.stars > 0) {
      ctx.fillStyle = '#c89b3c'; ctx.font = '12px serif';
      ctx.fillText('★'.repeat(selObj.stars), PW - PL - selObj.stars * 14, capY + 20);
    }

    if (selObj.note) {
      ctx.fillStyle = SOFT; ctx.font = '10px Inter, sans-serif';
      ctx.fillText(selObj.note.slice(0, 120), PL, capY + 36);
    }

    return cv;
  };

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
    const PW2 = 612, PH2 = 792;

    for (let i = 0; i < selImages.length; i++) {
      const imgObj = selImages[i];
      const selObj = sels[imgObj.filename] || {};
      const cv = await makePage(imgObj, selObj, i + 1, selImages.length);
      if (i > 0) pdf.addPage('letter', 'portrait');
      pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, PW2, PH2, undefined, 'FAST');
      await new Promise(r => setTimeout(r, 0));
    }

    const today = new Date().toISOString().slice(0, 10);
    const safeName = (gallery.title || 'Gallery').replace(/[^a-zA-Z0-9]/g, '_');
    pdf.save(`${safeName}_Selects_${today}.pdf`);
    toast(`PDF exported — ${selImages.length} images`, 'ok');
  } catch (err) {
    console.error('[gallery-pdf]', err);
    toast('PDF export failed: ' + (err?.message || 'unknown'), 'error');
  }
}

/* ============================================================
   GALLERY DETAIL VIEW (admin reviewing client selections)
   ============================================================ */
function GalleryDetailView({ token, navigate }) {
  const [gallery, setGallery]   = gS(null);
  const [loading, setLoading]   = gS(true);
  const [filter, setFilter]     = gS('ALL');
  const [lightbox, setLightbox] = gS(null); // img object | null
  const [exporting, setExporting] = gS(false);
  const [showRound, setShowRound] = gS(false);

  gE(() => {
    (async () => {
      try {
        const data = await window.AdminStore.apiFetch(`/api/galleries/${token}`);
        setGallery(data);
      } catch (e) {
        toast('Failed to load: ' + e.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>Loading…</div>;
  if (!gallery) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>Not found.</div>;

  const sels   = gallery.selections || {};
  const images = gallery.images || [];

  const counts = { ALL: images.length, SELECT: 0, ALT: 0, KILL: 0, UNTAGGED: 0 };
  for (const img of images) {
    const l = sels[img.filename]?.label;
    if (l === 'SELECT') counts.SELECT++;
    else if (l === 'ALT') counts.ALT++;
    else if (l === 'KILL') counts.KILL++;
    else counts.UNTAGGED++;
  }

  const visible = images.filter(img => {
    if (filter === 'ALL')      return true;
    if (filter === 'UNTAGGED') return !sels[img.filename]?.label;
    return sels[img.filename]?.label === filter;
  });

  const statusText = gallery.status === 'submitted'
    ? `Submitted ${gallery.submittedAt ? new Date(gallery.submittedAt).toLocaleDateString() : ''}`
    : gallery.status === 'archived' ? 'Archived' : 'Open';

  const copyLink = () => {
    const url = `${window.location.origin}/gallery.html?token=${gallery.token}`;
    navigator.clipboard.writeText(url).then(() => toast('Link copied', 'ok')).catch(() => toast(url, 'ok'));
  };

  const nextRoundTitle = () => {
    const m = gallery.title.match(/\(Round (\d+)\)$/);
    const n = m ? parseInt(m[1], 10) + 1 : 2;
    return m ? gallery.title.replace(/\(Round \d+\)$/, `(Round ${n})`) : `${gallery.title} (Round 2)`;
  };

  const doExportPDF = async () => {
    setExporting(true);
    try {
      await exportGallerySelectsPDF(gallery, images, sels);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Galleries"
        title={gallery.title}
        crumbs={[{ label: 'Admin', href: '#/dashboard' }, { label: 'Galleries', href: '#/galleries' }, { label: gallery.clientName || gallery.token }]}
        actions={
          <>
            <Btn variant="ghost" onClick={doExportPDF} disabled={exporting || counts.SELECT + counts.ALT === 0}>
              {exporting ? 'Exporting…' : `Export PDF (${counts.SELECT + counts.ALT})`}
            </Btn>
            <Btn variant="ghost" onClick={copyLink}>Copy client link</Btn>
            <Btn variant="ghost" onClick={() => setShowRound(true)} title="Create a new gallery for a retouching round">+ New round</Btn>
            <Btn variant="ghost" onClick={() => navigate('#/galleries')}>← Back</Btn>
          </>
        }
      />

      <div className="ad-stat-grid">
        <StatCard label="Status"    value={statusText}               sub={gallery.clientName || '—'} />
        <StatCard label="SELECT"    value={counts.SELECT}            sub="client picks" />
        <StatCard label="ALT"       value={counts.ALT}               sub="alternates" />
        <StatCard label="Views"     value={gallery.viewCount || 0}   sub={gallery.lastViewedAt ? `last ${new Date(gallery.lastViewedAt).toLocaleDateString()}` : 'not yet opened'} />
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, padding: '0 0 16px', flexWrap: 'wrap' }}>
        {['ALL', 'SELECT', 'ALT', 'KILL', 'UNTAGGED'].map(f => (
          <button
            key={f}
            className={`ad-pill ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f} <span className="ad-pill-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      <div className="ad-gallery-grid">
        {visible.length === 0 && <div className="ad-muted" style={{ padding: '40px 0', textAlign: 'center' }}>No images match this filter.</div>}
        {visible.map(img => (
          <GalleryImageCard
            key={img.filename}
            img={img}
            sel={sels[img.filename] || {}}
            onClick={() => setLightbox(img)}
          />
        ))}
      </div>

      {lightbox && (
        <GalleryLightbox
          img={lightbox}
          sel={sels[lightbox.filename] || {}}
          allImages={visible}
          allSels={sels}
          onClose={() => setLightbox(null)}
        />
      )}

      {showRound && (
        <GalleryCreateModal
          open={showRound}
          prefill={{ projectId: gallery.projectId, clientName: gallery.clientName || '', title: nextRoundTitle() }}
          onClose={() => setShowRound(false)}
          onCreated={(g) => {
            setShowRound(false);
            toast(`Round created — ${g.token}`, 'ok');
            navigate(`#/galleries/${g.token}`);
          }}
        />
      )}
    </>
  );
}

Object.assign(window, {
  GalleriesView,
  GalleryDetailView,
});
