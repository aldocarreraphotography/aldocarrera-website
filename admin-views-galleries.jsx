/* admin-views-galleries.jsx — Gallery link management */

const { useState: gS, useEffect: gE, useMemo: gM } = React;

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
function GalleryCreateModal({ open, onClose, onCreated }) {
  window.useStoreSubscribe();
  const projects = window.AdminStore.getProjects();
  const [form, setForm] = gS({ projectId: '', clientName: '', title: '', expiresAt: '', password: '' });
  const [saving, setSaving] = gS(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Auto-fill title when project changes
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
   GALLERY DETAIL VIEW (admin reviewing client selections)
   ============================================================ */
function GalleryDetailView({ token, navigate }) {
  const [gallery, setGallery]   = gS(null);
  const [loading, setLoading]   = gS(true);
  const [filter, setFilter]     = gS('ALL');

  gE(() => {
    (async () => {
      try {
        const data = await window.AdminStore.apiFetch(`/api/galleries/${token}`);
        // Re-fetch the full project images from admin store
        const store = window.AdminStore.getProjects();
        const proj  = store.find(p => p.id === data.projectId);
        setGallery({ ...data, _project: proj });
      } catch (e) {
        toast('Failed to load: ' + e.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>Loading…</div>;
  if (!gallery) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>Not found.</div>;

  const sels = gallery.selections || {};
  const proj = gallery._project;
  const images = proj
    ? proj.images.filter(i => !i.rejected).sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
    : [];

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

  return (
    <>
      <PageHeader
        eyebrow="Galleries"
        title={gallery.title}
        crumbs={[{ label: 'Admin', href: '#/dashboard' }, { label: 'Galleries', href: '#/galleries' }, { label: gallery.clientName || gallery.token }]}
        actions={
          <>
            <Btn variant="ghost" onClick={copyLink}>Copy client link</Btn>
            <Btn variant="ghost" onClick={() => navigate('#/galleries')}>← Back</Btn>
          </>
        }
      />

      <div className="ad-stat-grid">
        <StatCard label="Status"    value={statusText}               sub={gallery.clientName || '—'} />
        <StatCard label="SELECT"    value={counts.SELECT}            sub="client picks" />
        <StatCard label="ALT"       value={counts.ALT}               sub="alternates" />
        <StatCard label="Reviewed"  value={`${counts.SELECT + counts.ALT + counts.KILL}/${counts.ALL}`} sub="of total frames" />
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
        {visible.map(img => {
          const s = sels[img.filename] || {};
          return (
            <div key={img.filename} className={`ad-gallery-card ${s.label ? 'has-label label-' + s.label : ''}`}>
              <div className="ad-gallery-thumb-wrap">
                <img src={img.blobPath} alt={img.filename} className="ad-gallery-thumb" loading="lazy"/>
                {s.label && <span className={`ad-gallery-badge badge-${s.label}`}>{s.label}</span>}
              </div>
              <div className="ad-gallery-card-body">
                <div className="ad-mono ad-muted" style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.filename}</div>
                {s.stars > 0 && <div style={{ color: '#c89b3c', fontSize: 12 }}>{'★'.repeat(s.stars)}</div>}
                {s.note && <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{s.note}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

Object.assign(window, {
  GalleriesView,
  GalleryDetailView,
});
