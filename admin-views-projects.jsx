/* admin-views-projects.jsx — Dashboard + Project list / edit / images / upload.
   These four screens flow into each other; keeping them in one file lets them
   share the slimmer pieces without an export dance. */

const { useState: vS, useEffect: vE, useMemo: vM, useRef: vR } = React;

/* ============================================================
   DASHBOARD
   ============================================================ */
function DashboardView({ navigate }) {
  window.useStoreSubscribe();
  const projects = window.AdminStore.getProjects();
  const history  = window.AdminStore.getUploadHistory();
  const years = useMemoGroup(projects, p => p.year);

  const totalImages = projects.reduce((s, p) => s + p.images.length, 0);
  const totalSelected = projects.reduce((s, p) => s + p.images.filter(i => i.selected).length, 0);

  return (
    <>
      <PageHeader
        eyebrow="Studio"
        title="Dashboard"
        crumbs={[{ label: 'Admin' }]}
        actions={
          <>
            <Btn variant="ghost" onClick={() => navigate('#/about')}>Edit About</Btn>
            <Btn onClick={() => navigate('#/projects/new')} icon="+">New project</Btn>
          </>
        }
      />

      <div className="ad-stat-grid">
        <StatCard label="Projects"     value={projects.length}        sub="across all years" />
        <StatCard label="Total frames" value={totalImages.toLocaleString()}    sub={`${totalSelected} marked select`} />
        <StatCard label="This year"    value={projects.filter(p => p.year === new Date().getFullYear()).length} sub="new shoots" />
        <StatCard label="Last upload"  value={history[0] ? formatRel(history[0].when) : '—'} sub={history[0] ? history[0].projectId : 'no uploads yet'} />
      </div>

      <div className="ad-grid-2col">
        <Card padding="lg">
          <SectionHead eyebrow="Quick actions" title="Get to work"/>
          <div className="ad-quick-grid">
            <QuickAction onClick={() => navigate('#/projects/new')} eyebrow="01" title="New project" sub="Add a new shoot folder"/>
            <QuickAction onClick={() => navigate('#/about')}         eyebrow="02" title="Edit about" sub="Bio, education, practice"/>
            <QuickAction onClick={() => navigate('#/clients')}       eyebrow="03" title="Manage clients" sub="Add / edit / archive"/>
            <QuickAction onClick={() => navigate('#/services')}      eyebrow="04" title="Manage services" sub="Reorder, edit copy"/>
          </div>
        </Card>

        <Card padding="lg">
          <SectionHead eyebrow="Recent" title="Upload history"/>
          {history.length === 0 ? (
            <Empty title="No uploads yet" sub="Files you drop in projects appear here."/>
          ) : (
            <ul className="ad-history">
              {history.slice(0, 6).map(h => (
                <li key={h.id} className="ad-history-row" onClick={() => navigate(`#/projects/${encodeURIComponent(h.projectId)}/images`)}>
                  <div className="ad-history-when">{formatRel(h.when)}</div>
                  <div className="ad-history-mid">
                    <b>{h.projectId}</b>
                    <span className="ad-history-sub">{h.count} {h.count === 1 ? 'file' : 'files'} · {formatBytes(h.totalBytes)}</span>
                  </div>
                  <span className="ad-history-chev">→</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card padding="lg" className="ad-mt-md">
        <SectionHead
          eyebrow="Archive"
          title="Projects by year"
          actions={<Btn variant="ghost" size="sm" onClick={() => navigate('#/projects')}>View all →</Btn>}
        />
        {Object.keys(years).length === 0
          ? <Empty title="No projects yet" sub="Create your first shoot to get started." action={<Btn onClick={() => navigate('#/projects/new')}>New project</Btn>}/>
          : Object.keys(years).sort((a,b) => b - a).map(year => (
              <YearGroup key={year} year={year} projects={years[year]} navigate={navigate}/>
            ))
        }
      </Card>
    </>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="ad-stat-card">
      <div className="ad-eyebrow">{label}</div>
      <div className="ad-stat-value">{value}</div>
      <div className="ad-stat-sub">{sub}</div>
    </div>
  );
}
function QuickAction({ eyebrow, title, sub, onClick }) {
  return (
    <button className="ad-quick" onClick={onClick}>
      <div className="ad-quick-eyebrow">{eyebrow}</div>
      <div className="ad-quick-title">{title}</div>
      <div className="ad-quick-sub">{sub}</div>
      <span className="ad-quick-chev">→</span>
    </button>
  );
}

function YearGroup({ year, projects, navigate }) {
  const [open, setOpen] = vS(true);
  return (
    <div className={`ad-year-group ${open ? '' : 'collapsed'}`}>
      <button className="ad-year-head" onClick={() => setOpen(!open)}>
        <span className="ad-year-chev">{open ? '▾' : '▸'}</span>
        <span className="ad-year-num">{year}</span>
        <span className="ad-year-count">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span>
      </button>
      {open && (
        <div className="ad-project-list">
          {projects.map(p => <ProjectRow key={p.id} project={p} navigate={navigate}/>)}
        </div>
      )}
    </div>
  );
}
function ProjectRow({ project, navigate }) {
  const sel     = project.images.filter(i => i.selected).length;
  const fav     = project.images.filter(i => i.favorite).length;
  const rej     = project.images.filter(i => i.rejected).length;
  const isPublic = project.public !== false;
  const togglePublic = (e) => {
    e.stopPropagation();
    window.AdminStore.updateProject(project.id, { public: !isPublic });
  };
  return (
    <div className={`ad-project-row ${isPublic ? '' : 'is-private'}`}>
      <div className="ad-project-mark"><Thumb blobPath={project.images[0]?.blobPath} aspect="1/1" placeholder={project.id.slice(0,2)}/></div>
      <div className="ad-project-mid">
        <div className="ad-project-id">{project.id}</div>
        <div className="ad-project-name">{project.name}</div>
        <div className="ad-project-meta">
          <span>{project.client}</span>
          <span className="dot">·</span>
          <span>{project.type}</span>
          <span className="dot">·</span>
          <span>{project.month} {project.year}</span>
        </div>
      </div>
      <div className="ad-project-counts">
        <Pill tone="accent">{project.images.length} frames</Pill>
        {sel > 0 && <Pill tone="ok">{sel} select</Pill>}
        {fav > 0 && <Pill tone="warn">{fav} fav</Pill>}
        {rej > 0 && <Pill tone="muted">{rej} rejected</Pill>}
      </div>
      <div className="ad-project-actions">
        <button className={`ad-visibility-btn ${isPublic ? 'pub' : 'priv'}`} onClick={togglePublic} title={isPublic ? 'Public — click to make private' : 'Private — click to make public'}>
          {isPublic ? '● Public' : '○ Private'}
        </button>
        <Btn variant="ghost" size="sm" onClick={() => navigate(`#/projects/${encodeURIComponent(project.id)}/images`)}>View</Btn>
        <Btn variant="ghost" size="sm" onClick={() => navigate(`#/projects/${encodeURIComponent(project.id)}/edit`)}>Edit</Btn>
        <Btn variant="ghost" size="sm" onClick={() => navigate(`#/projects/${encodeURIComponent(project.id)}/upload`)}>Upload</Btn>
      </div>
    </div>
  );
}

/* ============================================================
   PROJECT LIST (full)
   ============================================================ */
function ProjectsListView({ navigate }) {
  window.useStoreSubscribe();
  const settings  = window.AdminStore.getSettings();
  const sortMode  = settings.projectSort || 'year';
  const [q, setQ] = vS('');
  const [dragFrom, setDragFrom] = vS(null);
  const [dragOver, setDragOver] = vS(null);

  const setSortMode = (mode) => {
    window.AdminStore.setSettings({ projectSort: mode });
  };

  const all = window.AdminStore.getProjects();
  const filtered = all.filter(p => {
    if (!q) return true;
    const s = q.toLowerCase();
    return p.name.toLowerCase().includes(s)
        || p.client.toLowerCase().includes(s)
        || p.id.toLowerCase().includes(s);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === 'manual') return (a.order ?? 9999) - (b.order ?? 9999);
    if (sortMode === 'client') return (a.client || '').localeCompare(b.client || '');
    return Number(b.year || 0) - Number(a.year || 0);
  });

  const onDragStart = (id) => (e) => {
    if (sortMode !== 'manual') return;
    setDragFrom(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch (_) {}
  };
  const onDragOver = (id) => (e) => {
    if (sortMode !== 'manual' || !dragFrom) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== id) setDragOver(id);
  };
  const onDragLeave = () => setDragOver(null);
  const onDrop = (id) => (e) => {
    if (sortMode !== 'manual' || !dragFrom) return;
    e.preventDefault();
    if (dragFrom === id) { setDragFrom(null); setDragOver(null); return; }
    const ids = sorted.map(p => p.id);
    const from = ids.indexOf(dragFrom);
    const to   = ids.indexOf(id);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragFrom);
    window.AdminStore.reorderProjects(ids);
    setDragFrom(null);
    setDragOver(null);
    toast('Order saved', 'ok');
  };

  const years = useMemoGroup(sorted, p => p.year);
  const showAsGroups = sortMode === 'year';

  return (
    <>
      <PageHeader
        eyebrow="Studio"
        title="Projects"
        crumbs={[{ label: 'Admin', href: '#/dashboard' }, { label: 'Projects' }]}
        actions={<Btn onClick={() => navigate('#/projects/new')} icon="+">New project</Btn>}
      />
      <Card padding="md">
        <div className="ad-search-row" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            className="ad-input ad-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects, clients, or IDs…"
            style={{ flex: 1 }}
          />
          <div className="ad-sort-control">
            <label className="ad-sort-label">Sort:</label>
            <select className="ad-select ad-sort-select" value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
              <option value="year">By year (newest)</option>
              <option value="client">By client (A–Z)</option>
              <option value="manual">Manual order</option>
            </select>
          </div>
        </div>
        {sortMode === 'manual' && (
          <div className="ad-sort-hint">Drag any row to reorder. New projects appear at the bottom.</div>
        )}
        {sorted.length === 0
          ? <Empty title="No projects match" sub="Try a different search."/>
          : showAsGroups
            ? Object.keys(years).sort((a,b) => b - a).map(y => (
                <YearGroup key={y} year={y} projects={years[y]} navigate={navigate}/>
              ))
            : (
              <div className="ad-project-list">
                {sorted.map(p => (
                  <div
                    key={p.id}
                    draggable={sortMode === 'manual'}
                    onDragStart={onDragStart(p.id)}
                    onDragOver={onDragOver(p.id)}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop(p.id)}
                    className={`${sortMode === 'manual' ? 'is-draggable' : ''} ${dragOver === p.id ? 'is-drag-over' : ''} ${dragFrom === p.id ? 'is-dragging' : ''}`}
                  >
                    <ProjectRow project={p} navigate={navigate}/>
                  </div>
                ))}
              </div>
            )
        }
      </Card>
    </>
  );
}

/* ============================================================
   PROJECT EDITOR (new + edit)
   ============================================================ */
const PROJECT_TYPES = ['Editorial', 'Commercial', 'Lookbook', 'Campaign', 'Portrait'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function ProjectEditorView({ projectId, navigate }) {
  window.useStoreSubscribe();
  const existing = projectId && projectId !== 'new' ? window.AdminStore.getProject(projectId) : null;
  const isNew = !existing;

  const [draft, setDraft] = vS(existing || {
    id: '',
    name: '',
    client: '',
    type: 'Editorial',
    year: new Date().getFullYear(),
    month: '',
    description: '',
    location: '',
    public: true,
  });
  const [err, setErr] = vS({});

  const clientOptions = useMemoClients();
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const [saving, setSaving] = vS(false);
  const save = async () => {
    const e = {};
    if (!draft.name) e.name = 'Required';
    if (!draft.client) e.client = 'Required';
    if (isNew && !draft.id) e.id = 'Required';
    setErr(e);
    if (Object.keys(e).length) return;
    // Auto-save client name to clients list if it's new
    try {
      const existingClients = window.AdminStore.getClients().map(c => c.name.toLowerCase());
      if (draft.client && !existingClients.includes(draft.client.toLowerCase())) {
        const slug = draft.client.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        window.AdminStore.addClient({ name: draft.client, slug, note: '' });
      }
    } catch (_) { /* non-fatal — project save continues regardless */ }

    if (isNew) {
      const id = draft.id.toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
      setSaving(true);
      await window.AdminStore.createProject({ ...draft, id });
      setSaving(false);
      toast(`Project ${id} created`, 'ok');
      navigate(`#/projects/${encodeURIComponent(id)}/upload`);
    } else {
      window.AdminStore.updateProject(existing.id, draft);
      toast('Project saved', 'ok');
      navigate(`#/projects/${encodeURIComponent(existing.id)}/images`);
    }
  };
  const remove = () => {
    if (!confirm(`Delete ${existing.name}? This removes all ${existing.images.length} images.`)) return;
    window.AdminStore.deleteProject(existing.id);
    toast('Project deleted', 'ok');
    navigate('#/projects');
  };

  return (
    <>
      <PageHeader
        eyebrow={isNew ? 'New' : existing.id}
        title={isNew ? 'Create project' : `Edit ${existing.name}`}
        crumbs={[
          { label: 'Admin', href: '#/dashboard' },
          { label: 'Projects', href: '#/projects' },
          { label: isNew ? 'New' : existing.name },
        ]}
        actions={
          <>
            <Btn variant="ghost" onClick={() => navigate(isNew ? '#/projects' : `#/projects/${encodeURIComponent(existing.id)}/images`)}>Cancel</Btn>
            <Btn onClick={save} disabled={saving}>{saving ? 'Creating…' : (isNew ? 'Create + add photos' : 'Save changes')}</Btn>
          </>
        }
      />

      <Card padding="lg">
        <div className="ad-form-grid">
          {isNew && (
            <Field label="Project ID" hint="Short slug. Used in URLs + filenames. Uppercase, no spaces." error={err.id}>
              <TextInput value={draft.id} onChange={(v) => set('id', v.toUpperCase().replace(/[^A-Z0-9_]+/g, '_'))} placeholder="BAPE_SS25"/>
            </Field>
          )}
          <Field label="Project name" wide error={err.name}>
            <TextInput value={draft.name} onChange={(v) => set('name', v)} placeholder="BAPE — SS25 Editorial"/>
          </Field>
          <Field label="Client" error={err.client}>
            <ClientCombobox value={draft.client} onChange={(v) => set('client', v)} options={clientOptions}/>
          </Field>
          <Field label="Type">
            <Select value={draft.type} onChange={(v) => set('type', v)} options={PROJECT_TYPES}/>
          </Field>
          <Field label="Month">
            <Select value={draft.month} onChange={(v) => set('month', v)} options={[{ value: '', label: '— auto (from EXIF) —' }, ...MONTHS]}/>
          </Field>
          <Field label="Year">
            <TextInput type="number" value={draft.year} onChange={(v) => set('year', parseInt(v) || new Date().getFullYear())}/>
          </Field>
          <Field label="Location" wide>
            <TextInput value={draft.location} onChange={(v) => set('location', v)} placeholder="Hong Kong — Sheung Wan"/>
          </Field>
          <Field label="Visibility" hint={draft.public !== false ? 'Visible on the public archive.' : 'Hidden from the public archive.'}>
            <div className="ad-toggle-row">
              <button
                type="button"
                className={`ad-visibility-btn ${draft.public !== false ? 'pub' : 'priv'}`}
                onClick={() => set('public', draft.public === false ? true : false)}
              >
                {draft.public !== false ? '● Public' : '○ Private'}
              </button>
            </div>
          </Field>
          <Field label="Description" wide hint="Internal notes + the blurb that appears on the project page.">
            <TextArea value={draft.description} onChange={(v) => set('description', v)} rows={4}/>
          </Field>
        </div>

        {!isNew && (
          <div className="ad-form-footer">
            <Btn variant="ghost" onClick={remove}>Delete project</Btn>
          </div>
        )}
      </Card>
    </>
  );
}

function ClientCombobox({ value, onChange, options }) {
  return (
    <div className="ad-combo">
      <TextInput value={value} onChange={onChange} placeholder="BAPE"/>
      <div className="ad-combo-list">
        {options.filter(o => !value || o.toLowerCase().includes(value.toLowerCase())).slice(0, 6).map(o => (
          <button key={o} className="ad-combo-item" onClick={() => onChange(o)} type="button">{o}</button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   UPLOAD IMAGES
   ============================================================ */
function ProjectUploadView({ projectId, navigate }) {
  window.useStoreSubscribe();
  const project = window.AdminStore.getProject(projectId);
  const [queue, setQueue] = vS([]); // [{ file, exif, status }]
  const [busy,  setBusy]  = vS(false);
  const [progress, setProgress] = vS(null);

  if (!project) return <Empty title="Project not found" sub={projectId} action={<Btn onClick={() => navigate('#/projects')}>Back to projects</Btn>}/>;

  const onFiles = async (files) => {
    const enqueued = files.map(f => ({ file: f, exif: null, status: 'reading' }));
    setQueue(prev => [...prev, ...enqueued]);
    // Parse EXIF for each one
    for (let i = 0; i < enqueued.length; i++) {
      const item = enqueued[i];
      try {
        item.exif = await window.parseExif(item.file);
        item.file.__exif = item.exif;
        item.status = 'ready';
      } catch (_) {
        item.status = 'ready';
      }
      setQueue(prev => prev.slice());
    }
  };

  const clear = () => setQueue([]);

  const commit = async () => {
    if (queue.length === 0) return;
    setBusy(true);
    setProgress({ index: 0, total: queue.length });
    const files = queue.map(q => q.file);
    let failed = false;
    try {
      await window.AdminStore.uploadImages(project.id, files, (p) => setProgress(p));
      toast(`${files.length} ${files.length === 1 ? 'file' : 'files'} added to ${project.id}`, 'ok');
      navigate(`#/projects/${encodeURIComponent(project.id)}/images`);
    } catch (err) {
      failed = true;
      console.error('[upload] commit failed:', err);
      toast(`Upload failed: ${err?.message || 'unknown error'}`, 'error');
    } finally {
      setBusy(false);
      setProgress(null);
      if (!failed) setQueue([]); // keep queue on failure so user can retry
    }
  };

  const totalBytes = queue.reduce((s, q) => s + q.file.size, 0);
  const exifDates = queue.map(q => q.exif?.dateTaken).filter(Boolean);
  const exifInfo = exifDates.length ? `${exifDates.length} of ${queue.length} have EXIF dates` : null;
  // HEIC/AVIF can't be compressed by Canvas — warn if they're over the limit.
  const oversized = queue.filter(q =>
    q.file.size > 5 * 1024 * 1024 &&
    !q.file.type.match(/^image\/(jpeg|jpg|png|webp)$/) &&
    !q.file.name.match(/\.(jpe?g|png|webp)$/i)
  );

  return (
    <>
      <PageHeader
        eyebrow={project.id}
        title="Upload images"
        crumbs={[
          { label: 'Admin', href: '#/dashboard' },
          { label: 'Projects', href: '#/projects' },
          { label: project.name, href: `#/projects/${encodeURIComponent(project.id)}/images` },
          { label: 'Upload' },
        ]}
        actions={
          <>
            <Btn variant="ghost" onClick={() => navigate(`#/projects/${encodeURIComponent(project.id)}/images`)}>Back to project</Btn>
            <Btn onClick={commit} disabled={queue.length === 0 || busy || queue.some(q => q.status === 'reading')}>
              {busy ? `Uploading ${progress?.index}/${progress?.total}…` : `Upload ${queue.length} ${queue.length === 1 ? 'file' : 'files'}`}
            </Btn>
          </>
        }
      />

      <Card padding="lg">
        <Dropzone
          onFiles={onFiles}
          label="Drop photos here, or click to browse"
          hint="JPEG / PNG / HEIC · EXIF date auto-detected"
        />

        {queue.length > 0 && (
          <>
            <div className="ad-queue-summary">
              <div>
                <b>{queue.length}</b> {queue.length === 1 ? 'file' : 'files'} queued · {formatBytes(totalBytes)}
              </div>
              <div className="ad-queue-meta">
                {exifInfo && <span>{exifInfo}</span>}
                <button className="ad-link" onClick={clear}>Clear queue</button>
              </div>
            </div>
            {oversized.length > 0 && (
              <div className="ad-warn">
                {oversized.length} file{oversized.length > 1 ? 's' : ''} {oversized.length > 1 ? 'are' : 'is'} HEIC/AVIF and over 5 MB — convert to JPEG before uploading.
              </div>
            )}
            <div className="ad-queue-list">
              {queue.map((q, i) => (
                <div key={i} className={`ad-queue-row ad-queue-${q.status}`}>
                  <span className="ad-queue-num">{String(i+1).padStart(2,'0')}</span>
                  <span className="ad-queue-name">{q.file.name}</span>
                  <span className="ad-queue-size">{formatBytes(q.file.size)}</span>
                  <span className="ad-queue-dims">{q.exif?.dimensions || ''}</span>
                  <span className="ad-queue-date">{q.exif?.dateTaken ? formatDate(q.exif.dateTaken, { year:'numeric', month:'short', day:'numeric' }) : <span className="muted">no EXIF</span>}</span>
                  <span className="ad-queue-status">{q.status === 'reading' ? 'reading…' : 'ready'}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </>
  );
}

/* ============================================================
   PROJECT IMAGES (manage / tag)
   ============================================================ */
function ProjectImagesView({ projectId, navigate }) {
  window.useStoreSubscribe();
  const project = window.AdminStore.getProject(projectId);
  const [filter, setFilter] = vS('all');
  const [selectedIds, setSelectedIds] = vS([]);
  const [showMeta, setShowMeta] = vS(true);
  const [viewer, setViewer] = vS(null);
  const [dragFrom, setDragFrom] = vS(null);
  const [dragOver, setDragOver] = vS(null);
  const [deckModal, setDeckModal] = vS(false);

  if (!project) return <Empty title="Project not found" sub={projectId} action={<Btn onClick={() => navigate('#/projects')}>Back to projects</Btn>}/>;

  const items = project.images.filter(i => {
    if (filter === 'selected') return i.selected;
    if (filter === 'favorite') return i.favorite;
    if (filter === 'rejected') return i.rejected;
    if (filter === 'untagged') return !i.selected && !i.favorite && !i.rejected;
    return true;
  });

  /* Reorder is only meaningful when we can see the full curated set. */
  const canReorder = filter === 'all';

  const onDragStart = (filename) => (e) => {
    if (!canReorder) return;
    setDragFrom(filename);
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox to actually start the drag.
    try { e.dataTransfer.setData('text/plain', filename); } catch (_) {}
  };
  const onDragOver = (filename) => (e) => {
    if (!canReorder || !dragFrom) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== filename) setDragOver(filename);
  };
  const onDragLeave = () => setDragOver(null);
  const onDrop = (filename) => (e) => {
    if (!canReorder || !dragFrom) return;
    e.preventDefault();
    if (dragFrom === filename) { setDragFrom(null); setDragOver(null); return; }
    const order = items.map(i => i.filename);
    const from = order.indexOf(dragFrom);
    const to   = order.indexOf(filename);
    if (from === -1 || to === -1) return;
    order.splice(from, 1);
    order.splice(to, 0, dragFrom);
    window.AdminStore.reorderImages(project.id, order);
    setDragFrom(null);
    setDragOver(null);
    toast('Order saved', 'ok');
  };
  const onDragEnd = () => { setDragFrom(null); setDragOver(null); };

  const toggleSel = (filename) => {
    setSelectedIds(prev => prev.includes(filename) ? prev.filter(x => x !== filename) : [...prev, filename]);
  };
  const selectAll = () => setSelectedIds(items.map(i => i.filename));
  const selectNone = () => setSelectedIds([]);

  const bulk = (patch) => {
    selectedIds.forEach(fn => window.AdminStore.updateImage(project.id, fn, patch));
    toast(`${selectedIds.length} image(s) updated`, 'ok');
  };
  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} image(s)?`)) return;
    for (const fn of selectedIds) await window.AdminStore.deleteImage(project.id, fn);
    setSelectedIds([]);
    toast('Images deleted', 'ok');
  };

  const counts = {
    all: project.images.length,
    selected: project.images.filter(i => i.selected).length,
    favorite: project.images.filter(i => i.favorite).length,
    rejected: project.images.filter(i => i.rejected).length,
    untagged: project.images.filter(i => !i.selected && !i.favorite && !i.rejected).length,
  };

  return (
    <>
      <PageHeader
        eyebrow={project.id}
        title={project.name}
        crumbs={[
          { label: 'Admin', href: '#/dashboard' },
          { label: 'Projects', href: '#/projects' },
          { label: project.name },
        ]}
        actions={
          <>
            <Btn variant="ghost" onClick={() => setDeckModal(true)}>Share deck ↗</Btn>
            <Btn variant="ghost" onClick={() => navigate(`#/projects/${encodeURIComponent(project.id)}/edit`)}>Edit project</Btn>
            <Btn onClick={() => navigate(`#/projects/${encodeURIComponent(project.id)}/upload`)} icon="↑">Upload images</Btn>
          </>
        }
      />
      <ShareDeckModal project={project} open={deckModal} onClose={() => setDeckModal(false)}/>

      <Card padding="md">
        <div className="ad-images-toolbar">
          <div className="ad-filter-tabs">
            {[
              ['all',      'All'],
              ['selected', 'Select'],
              ['favorite', 'Favorite'],
              ['rejected', 'Rejected'],
              ['untagged', 'Untagged'],
            ].map(([k, l]) => (
              <button key={k} className={`ad-filter-tab ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
                {l} <span className="ad-filter-ct">{counts[k]}</span>
              </button>
            ))}
          </div>
          <span className="ad-spacer"/>
          <label className="ad-checkrow"><input type="checkbox" checked={showMeta} onChange={(e) => setShowMeta(e.target.checked)}/><span>Show metadata</span></label>
          {selectedIds.length > 0
            ? (
              <div className="ad-bulk-bar">
                <span className="ad-bulk-count">{selectedIds.length} selected</span>
                <Btn variant="ghost" size="sm" onClick={() => bulk({ selected: true })}>Mark Select</Btn>
                <Btn variant="ghost" size="sm" onClick={() => bulk({ favorite: true })}>Favorite</Btn>
                <Btn variant="ghost" size="sm" onClick={() => bulk({ rejected: true })}>Reject</Btn>
                <Btn variant="ghost" size="sm" onClick={() => bulk({ selected: false, favorite: false, rejected: false })}>Clear tags</Btn>
                <Btn variant="ghost" size="sm" onClick={bulkDelete}>Delete</Btn>
                <Btn variant="ghost" size="sm" onClick={selectNone}>Deselect</Btn>
              </div>
            )
            : (
              <Btn variant="ghost" size="sm" onClick={selectAll} disabled={items.length === 0}>Select all</Btn>
            )
          }
        </div>

        {items.length === 0
          ? <Empty title="No images in this filter" sub={filter === 'all' ? 'Drop your first photos to get started.' : `No images marked as ${filter}.`} action={filter === 'all' ? <Btn onClick={() => navigate(`#/projects/${encodeURIComponent(project.id)}/upload`)}>Upload images</Btn> : null}/>
          : (
            <>
              {canReorder && (
                <div className="ad-reorder-hint">
                  Drag any image to reorder. The Portfolio and Archive on the public site will display images in this order.
                </div>
              )}
              <div className="ad-image-grid">
                {items.map((img, idx) => (
                  <ImageCard
                    key={img.filename}
                    img={img}
                    project={project}
                    showMeta={showMeta}
                    selected={selectedIds.includes(img.filename)}
                    onToggleSelect={() => toggleSel(img.filename)}
                    onOpen={() => setViewer(img)}
                    draggable={canReorder}
                    isDragging={dragFrom === img.filename}
                    isDragOver={dragOver === img.filename && dragFrom !== img.filename}
                    onDragStart={onDragStart(img.filename)}
                    onDragOver={onDragOver(img.filename)}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop(img.filename)}
                    onDragEnd={onDragEnd}
                    position={idx + 1}
                  />
                ))}
              </div>
            </>
          )
        }
      </Card>

      {viewer && (
        <ImageViewer
          image={viewer}
          project={project}
          onClose={() => setViewer(null)}
          onPrev={() => {
            const idx = items.findIndex(x => x.filename === viewer.filename);
            if (idx > 0) setViewer(items[idx - 1]);
          }}
          onNext={() => {
            const idx = items.findIndex(x => x.filename === viewer.filename);
            if (idx < items.length - 1) setViewer(items[idx + 1]);
          }}
        />
      )}
    </>
  );
}

function ImageCard({ img, project, showMeta, selected, onToggleSelect, onOpen,
                    draggable, isDragging, isDragOver, position,
                    onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }) {
  const cycle = (k) => window.AdminStore.updateImage(project.id, img.filename, { [k]: !img[k] });
  const setCover = () => window.AdminStore.setCoverImage(project.id, img.filename);
  const toggleHighlight = (e) => {
    e.stopPropagation();
    window.AdminStore.updateImage(project.id, img.filename, { highlighted: !img.highlighted });
  };
  const cls = [
    'ad-image-card',
    img.cover  ? 'is-cover'      : '',
    selected   ? 'is-selected'   : '',
    isDragging ? 'is-dragging'   : '',
    isDragOver ? 'is-drag-over'  : '',
    draggable  ? 'is-draggable'  : '',
  ].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {draggable && (
        <div className="ad-image-order" title="Drag to reorder">
          <span className="ad-image-order-grip">⋮⋮</span>
          <span className="ad-image-order-num">{String(position).padStart(2, '0')}</span>
        </div>
      )}
      <div className="ad-image-card-top">
        <label className="ad-image-check" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect}/>
        </label>
        <div className="ad-image-tag-stack">
          {img.selected && <Pill tone="ok">SELECT</Pill>}
          {img.favorite && <Pill tone="accent">FAV</Pill>}
          {img.rejected && <Pill tone="muted">REJECT</Pill>}
        </div>
      </div>
      <div className="ad-image-frame" onClick={onOpen}>
        <Thumb blobPath={img.blobPath} aspect="4/5"/>
      </div>
      {showMeta && (
        <div className="ad-image-meta">
          <div className="ad-image-name" title={img.filename}>{img.filename}</div>
          <div className="ad-image-sub">
            <span>{img.exif?.dimensions || '—'}</span>
            <span className="dot">·</span>
            <span>{formatBytes(img.exif?.fileSize)}</span>
            <span className="dot">·</span>
            <span>{img.exif?.dateTaken ? formatDate(img.exif.dateTaken, { month:'short', day:'numeric', year:'numeric' }) : '—'}</span>
          </div>
        </div>
      )}
      <div className="ad-image-actions">
        <button className={`ad-img-act ${img.selected ? 'on ok' : ''}`}     onClick={() => cycle('selected')}>SELECT</button>
        <button className={`ad-img-act ${img.favorite ? 'on accent' : ''}`} onClick={() => cycle('favorite')}>FAV</button>
        <button className={`ad-img-act ${img.rejected ? 'on mute' : ''}`}   onClick={() => cycle('rejected')}>REJECT</button>
        <button className={`ad-img-act ad-img-act-star ${img.highlighted ? 'on gold' : ''}`} onClick={toggleHighlight} title="Feature on homepage">✦ HIGHLIGHT</button>
        <button className={`ad-img-act ad-img-act-cover ${img.cover ? 'on cover' : ''}`} onClick={setCover}>COVER</button>
      </div>
    </div>
  );
}

function ImageViewer({ image, project, onClose, onPrev, onNext }) {
  const url = window.useImageURL(image.blobPath);
  const [notes, setNotes] = vS(image.notes || '');
  vE(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);
  vE(() => { setNotes(image.notes || ''); }, [image.filename]);

  const saveNotes = () => {
    window.AdminStore.updateImage(project.id, image.filename, { notes });
    toast('Notes saved', 'ok');
  };

  return (
    <div className="ad-viewer-scrim" onClick={onClose}>
      <div className="ad-viewer" onClick={(e) => e.stopPropagation()}>
        <header className="ad-viewer-head">
          <div className="ad-viewer-eyebrow">{project.id} · {image.filename}</div>
          <button className="ad-modal-close" onClick={onClose}>×</button>
        </header>
        <div className="ad-viewer-body">
          <div className="ad-viewer-stage">
            {url ? <img src={url} alt={image.filename}/> : <div className="ad-thumb-placeholder">◌</div>}
            <button className="ad-viewer-nav ad-viewer-prev" onClick={onPrev}>‹</button>
            <button className="ad-viewer-nav ad-viewer-next" onClick={onNext}>›</button>
          </div>
          <aside className="ad-viewer-side">
            <div className="ad-eyebrow">Tag</div>
            <div className="ad-viewer-tags">
              <button className={`ad-img-act ${image.selected ? 'on ok' : ''}`}     onClick={() => window.AdminStore.updateImage(project.id, image.filename, { selected: !image.selected })}>SELECT</button>
              <button className={`ad-img-act ${image.favorite ? 'on accent' : ''}`} onClick={() => window.AdminStore.updateImage(project.id, image.filename, { favorite: !image.favorite })}>FAVORITE</button>
              <button className={`ad-img-act ${image.rejected ? 'on mute' : ''}`}   onClick={() => window.AdminStore.updateImage(project.id, image.filename, { rejected: !image.rejected })}>REJECT</button>
            </div>
            <div className="ad-eyebrow ad-mt-md">File</div>
            <dl className="ad-meta-dl">
              <dt>Filename</dt><dd>{image.filename}</dd>
              <dt>Dimensions</dt><dd>{image.exif?.dimensions || '—'}</dd>
              <dt>File size</dt><dd>{formatBytes(image.exif?.fileSize)}</dd>
              <dt>Date taken</dt><dd>{image.exif?.dateTaken ? formatDate(image.exif.dateTaken, { year:'numeric', month:'long', day:'numeric' }) : '—'}</dd>
            </dl>
            <div className="ad-eyebrow ad-mt-md">Notes</div>
            <TextArea value={notes} onChange={setNotes} rows={6} placeholder="Internal notes — visible only in the admin."/>
            <Btn size="sm" onClick={saveNotes} disabled={notes === (image.notes || '')}>Save notes</Btn>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Helpers
   ============================================================ */
function useMemoGroup(items, keyFn) {
  return vM(() => {
    const out = {};
    items.forEach(it => {
      const k = keyFn(it);
      (out[k] = out[k] || []).push(it);
    });
    return out;
  }, [items, keyFn]);
}
function useMemoClients() {
  window.useStoreSubscribe();
  return vM(() => window.AdminStore.getClients().map(c => c.name), []);
}

/* ============================================================
   SHARE DECK MODAL
   ============================================================ */
function ShareDeckModal({ project, open, onClose }) {
  const [decks, setDecks]     = vS([]);
  const [creating, setCreating] = vS(false);
  const [form, setForm]       = vS({ title: '', imagesFilter: 'selected', expiresAt: '' });
  const [loading, setLoading] = vS(false);

  vE(() => {
    if (!open) return;
    // Pre-fill title
    setForm(f => ({ ...f, title: project.name + ' — To-Go Deck' }));
    // Load existing deck links for this project
    setLoading(true);
    window.AdminStore.apiFetch('/api/decks')
      .then(d => setDecks((d.decks || []).filter(dk => dk.projectId === project.id)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, project.id]);

  const deckURL = (token) => `${window.location.origin}/deck.html?token=${token}`;

  const copy = (token) => {
    navigator.clipboard.writeText(deckURL(token))
      .then(() => toast('Link copied', 'ok'))
      .catch(() => toast(deckURL(token), 'ok'));
  };

  const create = async () => {
    setCreating(true);
    try {
      const dk = await window.AdminStore.apiFetch('/api/decks', {
        method: 'POST',
        body: JSON.stringify({
          projectId:    project.id,
          title:        form.title || project.name,
          imagesFilter: form.imagesFilter,
          expiresAt:    form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        }),
      });
      setDecks(prev => [dk, ...prev]);
      copy(dk.token);
      toast('Deck link created — URL copied', 'ok');
    } catch (e) {
      toast('Error: ' + (e.message || 'failed'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (token) => {
    if (!confirm('Delete this deck link?')) return;
    try {
      await window.AdminStore.apiFetch(`/api/decks/${token}`, { method: 'DELETE' });
      setDecks(prev => prev.filter(d => d.token !== token));
      toast('Deck link deleted', 'ok');
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  };

  const selectedCount = project.images.filter(i => i.selected || i.favorite).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Share"
      title="To-Go Deck link"
      width={540}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
          <Btn onClick={create} disabled={creating}>{creating ? 'Creating…' : 'Create & copy link'}</Btn>
        </>
      }
    >
      <Field label="Deck title" wide>
        <TextInput value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder={project.name}/>
      </Field>

      <Field label="Images" wide hint={`Project has ${selectedCount} selected/favorite images.`}>
        <select className="ad-select" value={form.imagesFilter} onChange={e => setForm(f => ({ ...f, imagesFilter: e.target.value }))}>
          <option value="selected">Selected & favorite only ({selectedCount} images)</option>
          <option value="all">All images ({project.images.filter(i => !i.rejected).length} images)</option>
        </select>
      </Field>

      <Field label="Expires" hint="Leave blank for no expiry.">
        <TextInput type="date" value={form.expiresAt} onChange={v => setForm(f => ({ ...f, expiresAt: v }))}/>
      </Field>

      {decks.length > 0 && (
        <>
          <div style={{ height: 1, background: 'var(--rule)', margin: '8px 0 16px' }}/>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: 10 }}>Existing links</div>
          {loading
            ? <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Loading…</div>
            : decks.map(dk => (
              <div key={dk.token} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--rule)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dk.title || project.name}</div>
                  <div className="ad-mono ad-muted" style={{ fontSize: 11 }}>
                    {dk.imagesFilter} · {dk.views || 0} views · {new Date(dk.createdAt).toLocaleDateString()}
                    {dk.expiresAt && ` · expires ${new Date(dk.expiresAt).toLocaleDateString()}`}
                  </div>
                </div>
                <button className="ad-link" onClick={() => copy(dk.token)}>Copy</button>
                <a className="ad-link" href={deckURL(dk.token)} target="_blank" rel="noopener">Open ↗</a>
                <button className="ad-link ad-link-quiet" onClick={() => remove(dk.token)}>Delete</button>
              </div>
            ))
          }
        </>
      )}
    </Modal>
  );
}

Object.assign(window, {
  DashboardView,
  ProjectsListView,
  ProjectEditorView,
  ProjectUploadView,
  ProjectImagesView,
});
