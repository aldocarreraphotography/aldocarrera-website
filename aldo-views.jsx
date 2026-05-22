/* aldo-views.jsx — Portfolio, Archive, Clients, About, Contact */

const { useState: vsUseState, useEffect: vsUseEffect, useMemo: vsUseMemo, useRef: vsUseRef } = React;

const { PROJECTS, ARCHIVE, CLIENTS, PHOTOS, SERVICES, ABOUT, SETTINGS } = window.ALDO;

/* ============================================================
   PORTFOLIO
   ============================================================ */
function FeaturedStrip({ onOpenProject }) {
  const stars = vsUseMemo(() =>
    PROJECTS.flatMap(p =>
      (p.images || [])
        .filter(i => i.highlighted)
        .map(i => ({ ...i, projectName: p.name, client: p.client, project: p }))
    ),
    []
  );

  const [idx, setIdx] = vsUseState(0);

  vsUseEffect(() => {
    if (stars.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % stars.length), 5000);
    return () => clearInterval(t);
  }, [stars.length]);

  if (stars.length === 0) return null;

  const cur = stars[idx];

  return (
    <div className="featured-strip">
      <div className="featured-strip-img">
        {stars.map((s, i) => (
          <img
            key={s.blobPath || i}
            src={s.blobPath}
            alt={s.projectName}
            className={i === idx ? 'on' : ''}
          />
        ))}
      </div>
      <div className="featured-strip-info">
        <div className="featured-strip-label">Featured</div>
        <div className="featured-strip-name">{cur.projectName}</div>
        <div className="featured-strip-client">{cur.client}</div>
        <button
          className="featured-strip-link"
          onClick={() => onOpenProject && onOpenProject(cur.project)}
        >▸ View project</button>
      </div>
      {stars.length > 1 && (
        <div className="featured-strip-dots">
          {stars.map((_, i) => (
            <div
              key={i}
              className={`featured-strip-dot ${i === idx ? 'on' : ''}`}
              onClick={() => setIdx(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Portfolio({ view, onSetView, onOpenProject, onSetCrumb }) {
  return (
    <div className={`portfolio ${view}`}>
      <FeaturedStrip onOpenProject={onOpenProject}/>
      <div className="heading">
        <div>
          <h2>Selected Work</h2>
          <div className="ui-label" style={{marginTop: 6}}>{PROJECTS.length} projects · 2022 – 2024</div>
        </div>
        <div className="lede">
          A curated set of editorial and commercial work across fashion,<br/>
          entertainment, and lifestyle. Open any project for the full record.
        </div>
      </div>

      <div className="projects">
        {PROJECTS.map(p => (
          <article
            key={p.id}
            className="project"
            onClick={() => onOpenProject(p)}
          >
            <div className="photo">
              <img src={p.photo} alt={p.name} loading="lazy"/>
              <span className="tag">{p.type}</span>
            </div>
            {view === 'grid' ? (
              <>
                <div className="info">
                  <div className="name">{p.name}</div>
                  <div className="year">{p.year}</div>
                </div>
                <div className="meta">
                  <span>{p.client}</span>
                  <span>{p.format}</span>
                  <span>{p.count} photographs</span>
                </div>
              </>
            ) : (
              <>
                <div className="name">{p.name}</div>
                <div className="client">{p.client}</div>
                <div className="format">{p.format}</div>
                <div className="year">{p.year}</div>
              </>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   PROJECT WINDOW (single project — real images from NAS)
   ============================================================ */
function _fmtBytes(n) {
  if (!n) return '';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
  return n + ' B';
}

function ProjectDetail({ project, onOpenPhoto, onOpenVideo }) {
  const images = vsUseMemo(() =>
    (project.images || [])
      .filter(i => !i.rejected)
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999)),
    [project.id, project.images]
  );

  const btsVideos = vsUseMemo(() =>
    (window.ALDO?.VIDEOS || []).filter(v => v.projectId && v.projectId === project.id),
    [project.id]
  );

  const toViewerItem = (img) => ({
    id:      img.filename,
    photo:   img.blobPath,
    name:    img.filename,
    client:  project.client || '',
    project: project.id,
    date:    img.exif?.dateTaken || project.month || '',
    dims:    img.exif?.dimensions || '',
    size:    _fmtBytes(img.exif?.fileSize),
    type:    project.type || '',
    year:    String(project.year || ''),
    note:    img.notes || '',
  });

  const viewerList = vsUseMemo(() => images.map(toViewerItem), [images, project.id]);

  const mainContent = (
    <div>
      <div style={{padding: '24px 26px 18px', borderBottom: '1px solid var(--rule)', background: 'var(--window)'}}>
        <div className="ui-label">{project.client} · {project.year} · {project.type}</div>
        <h2 className="headline" style={{fontSize: 26, margin: '8px 0 6px', letterSpacing: '-0.022em'}}>{project.name}</h2>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap: 18, marginTop: 16, fontFamily:'IBM Plex Mono, monospace', fontSize: 11, color: 'var(--ink-soft)'}}>
          <div><span className="ui-label" style={{display:'block', marginBottom:3}}>Format</span>{project.format}</div>
          <div><span className="ui-label" style={{display:'block', marginBottom:3}}>Date</span>{project.month}</div>
          <div><span className="ui-label" style={{display:'block', marginBottom:3}}>Location</span>{project.location}</div>
          {project.crew && <div style={{gridColumn:'1 / -1'}}><span className="ui-label" style={{display:'block', marginBottom:3}}>Credits</span>{project.crew}</div>}
          {project.note && <div style={{gridColumn:'1 / -1', fontStyle:'italic', color:'var(--ink)', fontFamily:'Neue Haas Grotesk Display Pro, Inter, sans-serif', fontSize: 14, lineHeight: 1.5, paddingTop: 10, borderTop:'1px solid var(--rule-soft)'}}>"{project.note}"</div>}
        </div>
      </div>
      {images.length > 0 ? (
        <div className="thumb-grid project-thumb-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '28px', padding: '24px 28px 34px' }}>
          {images.map(img => {
            const it = toViewerItem(img);
            return (
              <div key={img.filename} className="thumb" onClick={() => onOpenPhoto(it, viewerList)}>
                <div className="pic"><img src={img.blobPath} alt={img.filename} loading="lazy"/></div>
                <span className="name">{img.filename}</span>
                <span className="sub">{[it.dims, it.size].filter(Boolean).join(' · ') || 'archive'}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{padding:'60px 24px', textAlign:'center', color:'var(--ink-soft)'}}>
          <div style={{fontSize:32, marginBottom:12}}>∅</div>
          <div>No images in this project yet.</div>
        </div>
      )}
    </div>
  );

  if (btsVideos.length === 0) {
    return mainContent;
  }

  return (
    <div className="project-detail-shell">
      <div className="project-detail-main">{mainContent}</div>
      <BtsPanel videos={btsVideos} onOpenVideo={onOpenVideo}/>
    </div>
  );
}

/* ============================================================
   BTS / REELS SIDEBAR
   - Probes each uploaded video's aspect ratio on mount
   - Vertical videos play INLINE in the sidebar
   - Horizontal videos open in a properly-sized popup window
   ============================================================ */
function BtsPanel({ videos, onOpenVideo }) {
  const API_BASE_V = window.API_BASE || '';
  // orientations[videoId] = { orient: 'vertical'|'horizontal', w, h }
  const [orientations, setOrientations] = vsUseState({});
  const [playingId, setPlayingId] = vsUseState(null);

  vsUseEffect(() => {
    let cancelled = false;
    const probes = [];
    videos.forEach(v => {
      // Embeds: assume horizontal (Vimeo/YouTube BTS are almost always 16:9)
      if (v.embedUrl) {
        setOrientations(o => ({ ...o, [v.id]: { orient: 'horizontal', w: 16, h: 9 } }));
        return;
      }
      const src = videoSrc(v);
      if (!src) return;
      const el = document.createElement('video');
      el.preload = 'metadata';
      el.muted = true;
      el.playsInline = true;
      el.crossOrigin = 'anonymous';
      el.src = src;
      el.onloadedmetadata = () => {
        if (cancelled) return;
        const w = el.videoWidth, h = el.videoHeight;
        const orient = h > w ? 'vertical' : 'horizontal';
        setOrientations(o => ({ ...o, [v.id]: { orient, w, h } }));
      };
      el.onerror = () => {
        if (cancelled) return;
        // Fallback: assume horizontal if probe fails
        setOrientations(o => ({ ...o, [v.id]: { orient: 'horizontal', w: 16, h: 9 } }));
      };
      probes.push(el);
    });
    return () => {
      cancelled = true;
      probes.forEach(el => { el.src = ''; el.removeAttribute('src'); el.load?.(); });
    };
  }, [videos.length, videos.map(v => v.id).join('|')]);

  const handleTileClick = (v) => {
    const meta = orientations[v.id];
    if (meta && meta.orient === 'vertical') {
      setPlayingId(playingId === v.id ? null : v.id);
    } else {
      // Pass dims so the window can size to the actual aspect ratio (no black bars)
      onOpenVideo && onOpenVideo(v, meta ? { w: meta.w, h: meta.h } : null);
    }
  };

  return (
    <div className="project-bts-panel">
      <div className="project-bts-head">
        BTS / REELS
        <span className="bts-count">{videos.length}</span>
      </div>
      {videos.map(v => {
        const posterSrc = v.poster
          ? (v.poster.startsWith('__vidposters/')
              ? `${API_BASE_V}/api/videoposters/${v.poster.slice('__vidposters/'.length)}`
              : v.poster)
          : null;
        const meta = orientations[v.id];
        const isVertical = meta?.orient === 'vertical';
        const isPlaying = playingId === v.id;
        const fileSrc = v.embedUrl ? null : videoSrc(v);

        return (
          <div key={v.id} className={`bts-tile ${isPlaying ? 'is-playing' : ''}`}>
            <div
              className="bts-thumb"
              onClick={() => handleTileClick(v)}
              style={meta ? { aspectRatio: `${meta.w} / ${meta.h}` } : undefined}
            >
              {isPlaying && isVertical && fileSrc ? (
                <video
                  className="bts-inline-video"
                  src={fileSrc}
                  autoPlay
                  controls
                  playsInline
                  loop
                />
              ) : posterSrc ? (
                <>
                  <img src={posterSrc} alt={v.title} loading="lazy"/>
                  <div className="bts-play">▶</div>
                </>
              ) : (
                <div className="bts-thumb-placeholder">▶</div>
              )}
            </div>
            <div className="bts-info" onClick={() => handleTileClick(v)}>
              <div className="bts-title">{v.title}</div>
              <div className="bts-meta">
                {[v.category, v.year].filter(Boolean).join(' · ')}
                {isVertical && <span className="bts-orient-tag"> · vertical</span>}
              </div>
            </div>
            {isPlaying && (
              <button className="bts-close-inline" onClick={() => setPlayingId(null)} aria-label="Stop">
                ×
              </button>
            )}
          </div>
        );
      })}
      <div className="project-bts-footer" onClick={() => handleTileClick(videos[0])}>
        ↗ View all reels
      </div>
    </div>
  );
}

/* ============================================================
   ARCHIVE
   ============================================================ */
function Archive({ onOpenPhoto, onSetCrumb, initialFilter, onFilterChange, selectionMode, setSelectionMode, selectedIds, toggleSelection }) {
  const [showHint, setShowHint] = vsUseState(false);
  vsUseEffect(() => {
    try {
      if (!sessionStorage.getItem('aldoDeckHintSeen')) {
        setShowHint(true);
        const t = setTimeout(() => { setShowHint(false); sessionStorage.setItem('aldoDeckHintSeen', '1'); }, 6500);
        return () => clearTimeout(t);
      }
    } catch (_) {}
  }, []);
  const dismissHint = () => { setShowHint(false); try { sessionStorage.setItem('aldoDeckHintSeen', '1'); } catch (_) {} };
  const [filter, setFilter] = vsUseState(initialFilter || { key: 'all', value: null });
  vsUseEffect(() => {
    // keep internal filter in sync if parent (sidebar) changes it
    if (initialFilter && (initialFilter.key !== filter.key || initialFilter.value !== filter.value)) {
      setFilter(initialFilter);
    }
  }, [initialFilter && initialFilter.key, initialFilter && initialFilter.value]);
  const updateFilter = (f) => {
    setFilter(f);
    onFilterChange && onFilterChange(f && f.key !== 'all' ? f : null);
  };
  const [search, setSearch] = vsUseState('');
  const [sort, setSort] = vsUseState('curated');
  const [view, setView] = vsUseState('thumbs');
  const [selected, setSelected] = vsUseState(null);

  const filtered = vsUseMemo(() => {
    let arr = ARCHIVE;
    if (filter.key === 'year')   arr = arr.filter(a => a.year === filter.value);
    if (filter.key === 'client') arr = arr.filter(a => a.client === filter.value);
    if (filter.key === 'type')   arr = arr.filter(a => a.type === filter.value);
    if (filter.key === 'tag' && filter.value === 'select') {
      arr = arr.filter(a => (a.note || '').toLowerCase().includes('select'));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(a => a.name.toLowerCase().includes(q) || a.client.toLowerCase().includes(q) || (a.project||'').toLowerCase().includes(q));
    }
    const sorted = [...arr];
    if (sort === 'name')        sorted.sort((a,b) => a.name.localeCompare(b.name));
    else if (sort === 'size')   sorted.sort((a,b) => parseFloat(b.size) - parseFloat(a.size));
    else if (sort === 'client') sorted.sort((a,b) => a.client.localeCompare(b.client));
    else if (sort === 'date')   sorted.sort((a,b) => b.date.localeCompare(a.date));
    else {
      // 'curated' — the order Aldo set in admin. Group by project (newest
      // year first, then project id for stability), then by image `order`
      // within the project. When the admin drags an image to a new spot,
      // the Archive re-orders right along with it.
      sorted.sort((a, b) =>
        (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0) ||
        (a.project || '').localeCompare(b.project || '') ||
        (a.order ?? 9999) - (b.order ?? 9999)
      );
    }
    return sorted;
  }, [filter, search, sort]);

  const crumb = filter.key === 'all'
    ? "ARCHIVE / ALL"
    : `ARCHIVE / BY_${filter.key.toUpperCase()} / ${filter.value}`;

  const clearFilter = () => updateFilter({ key: 'all', value: null });

  return (
    <div className="archive-only">
      <div className="toolbar">
        <input
          placeholder="Search by file, client, or project…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search archive"
        />
        <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort by">
          <option value="curated">SORT — curated order</option>
          <option value="date">SORT — date</option>
          <option value="name">SORT — name</option>
          <option value="size">SORT — size</option>
          <option value="client">SORT — client</option>
        </select>
        <button
          className={`select-toggle ${selectionMode ? 'on' : ''}`}
          onClick={() => { setSelectionMode && setSelectionMode(!selectionMode); dismissHint(); }}
          title="Select multiple to export as a To-Go Deck PDF"
        >
          <span className="sq"/>{selectionMode ? 'Done' : 'Select'}
          {showHint && (
            <span className="select-hint" onClick={(e) => { e.stopPropagation(); dismissHint(); }}>
              <span className="arr"/>
              Select multiple images to build a deck →
            </span>
          )}
        </button>
        <div className="view-toggle">
          <button className={view==='thumbs'?'on':''} onClick={() => setView('thumbs')}>Thumb</button>
          <button className={view==='list'?'on':''} onClick={() => setView('list')}>List</button>
        </div>
      </div>
      <div className="crumb-row">
        <span className="mono">{crumb}</span>
        {filter.key !== 'all' && (
          <button className="clear-filter" onClick={clearFilter} title="Clear filter">clear ×</button>
        )}
        <span className="deck-cue mono">select images → export deck</span>
        <span className="count mono">{filtered.length} of {ARCHIVE.length}</span>
      </div>
      <div className="content">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-mark">∅</div>
            <div className="empty-h">No files match.</div>
            <div className="empty-sub">Try a different filter or clear the search.</div>
            <button className="btn ghost" onClick={() => { setSearch(''); clearFilter(); }}>Reset</button>
          </div>
        ) : view === 'thumbs' ? (
          <div className={`thumb-grid ${selectionMode ? 'selection-mode' : ''}`}>
            {filtered.map(it => {
              const isSelected = selectedIds && selectedIds.includes(it.id);
              return (
                <div
                  key={it.id}
                  className={`thumb ${selected === it.id ? 'selected' : ''} ${isSelected ? 'in-deck' : ''}`}
                  onClick={() => {
                    if (selectionMode) {
                      toggleSelection && toggleSelection(it.id);
                    } else {
                      setSelected(it.id);
                      onOpenPhoto(it);
                    }
                  }}
                >
                  <div className="pic">
                    <img src={it.photo} alt={it.name} loading="lazy"/>
                    {selectionMode && (
                      <span className={`select-mark ${isSelected ? 'on' : ''}`}>
                        {isSelected ? selectedIds.indexOf(it.id) + 1 : ''}
                      </span>
                    )}
                  </div>
                  <span className="name">{it.name}</span>
                  <span className="sub">{it.client} · {it.size}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <table className="archive-table">
            <thead>
              <tr>
                <th></th>
                <th onClick={() => setSort('name')} style={{cursor:'pointer'}}>Name</th>
                <th onClick={() => setSort('client')} style={{cursor:'pointer'}}>Client</th>
                <th>Type</th>
                <th onClick={() => setSort('date')} style={{cursor:'pointer'}}>Date</th>
                <th>Dimensions</th>
                <th onClick={() => setSort('size')} style={{cursor:'pointer'}}>Size</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(it => {
                const isSelected = selectedIds && selectedIds.includes(it.id);
                return (
                  <tr
                    key={it.id}
                    className={`${selected === it.id ? 'selected' : ''} ${isSelected ? 'in-deck' : ''}`}
                    onClick={() => {
                      if (selectionMode) toggleSelection && toggleSelection(it.id);
                      else { setSelected(it.id); onOpenPhoto(it); }
                    }}
                  >
                    <td>
                      <span className="swatch"><img src={it.photo} alt=""/></span>
                      {selectionMode && isSelected && <span className="row-pip">{selectedIds.indexOf(it.id) + 1}</span>}
                    </td>
                    <td className="name">{it.name}</td>
                    <td>{it.client}</td>
                    <td>{it.type}</td>
                    <td>{it.date}</td>
                    <td>{it.dims}</td>
                    <td>{it.size}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   PHOTO VIEWER
   ============================================================ */
function PhotoViewer({ photo, list, onPrev, onNext }) {
  if (!photo) return null;
  const idx = list ? list.findIndex(x => x.id === photo.id) : -1;
  return (
    <div className="viewer">
      <div className="stage">
        <div className="stripinfo">
          <b>{photo.client || ''}</b>
          {photo.project && <> &nbsp;·&nbsp; {photo.project}</>}
          {list && idx >= 0 && <> &nbsp;·&nbsp; {String(idx+1).padStart(2,'0')} / {String(list.length).padStart(2,'0')}</>}
        </div>
        {onPrev && <button className="nav prev" onClick={onPrev} aria-label="previous">‹</button>}
        <img src={photo.photo || photo.src} alt={photo.name}/>
        {onNext && <button className="nav next" onClick={onNext} aria-label="next">›</button>}
      </div>
      <div className="info-panel">
        <div>
          <h3>{photo.name}</h3>
          <div className="field"><b>{photo.client}</b> · {photo.type || ''}</div>
        </div>
        <div className="field">
          <b>Date</b> &nbsp;{photo.date || '—'}<br/>
          <b>Dimensions</b> &nbsp;{photo.dims || '—'}<br/>
          <b>Size</b> &nbsp;{photo.size || '—'}<br/>
          {photo.note && <><b>Note</b> &nbsp;{photo.note}</>}
        </div>
        <div className="note">
          {photo.note ? (<>{photo.note}.</>) : (
            <>Use ←  →  to step through. Esc to close.</>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CLIENTS
   ============================================================ */
function Clients() {
  return (
    <div className="clients">
      <h2>Clients</h2>
      <div className="sub">A non-exhaustive list. Working relationships, not one-offs.</div>
      <div className="list">
        {CLIENTS.map((c, i) => (
          <div className="row" key={c.name}>
            <div className="idx">{String(i+1).padStart(2, '0')}</div>
            <div className="name">{c.name}</div>
            <div className="range">{c.range}</div>
            <div className="work">{c.work}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   ABOUT
   ============================================================ */
function About() {
  // Practice list — fall back gracefully if admin hasn't populated it.
  const practice = (ABOUT.practice && ABOUT.practice.length)
    ? ABOUT.practice
    : ['High-end fashion', 'Campaign', 'Lookbook', 'Editorial'];
  // Bio can be either a single block (admin) or two paragraphs (seed).
  const bioParas = [ABOUT.bio, ABOUT.bio2].filter(Boolean);
  // Selected clients line — driven by the same CLIENTS array as /clients.
  const selectedClients = (CLIENTS || []).slice(0, 14).map(c => c.name).join(' · ');

  return (
    <div className="about">
      <div className="about-logo">
        <AldoLogo size={88}/>
      </div>
      <div className="hello">Info · v2026.05</div>
      <h1>Aldo Carrera</h1>
      <div className="based">{ABOUT.role || 'Photographer'} · {ABOUT.location || 'Los Angeles'}</div>

      {bioParas.map((p, i) => <p key={i}>{p}</p>)}
      <p className="sig"><AldoSignature height={56} fill="var(--accent)"/></p>

      <div className="section">
        <div className="label">Practice</div>
        <div className="body">
          {chunkInto(practice, 4).map((row, i) => (
            <span className="line" key={i}>{row.join(' · ')}</span>
          ))}
        </div>
      </div>

      {ABOUT.education && (ABOUT.education.school || ABOUT.education.degree) && (
        <div className="section">
          <div className="label">Education</div>
          <div className="body">
            {ABOUT.education.school && <span className="line">{ABOUT.education.school}</span>}
            {(ABOUT.education.degree || ABOUT.education.year) && (
              <span className="line muted">
                {[ABOUT.education.degree, ABOUT.education.year].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        </div>
      )}

      {selectedClients && (
        <div className="section">
          <div className="label">Selected Clients</div>
          <div className="body" style={{fontFamily:'IBM Plex Mono, monospace', fontSize: 12, lineHeight: 1.7}}>
            {selectedClients}
          </div>
        </div>
      )}

      <div className="section contact">
        <div className="label">Contact</div>
        <div className="body">
          {SETTINGS.contactEmail && (
            <span className="line"><a href={`mailto:${SETTINGS.contactEmail}`}>{SETTINGS.contactEmail}</a></span>
          )}
          {SETTINGS.contactPhone && (
            <span className="line"><a href={`tel:${SETTINGS.contactPhone.replace(/[^+\d]/g, '')}`}>{SETTINGS.contactPhone}</a></span>
          )}
          {SETTINGS.instagram && (
            <span className="line">
              <a href={`https://instagram.com/${SETTINGS.instagram.replace(/^@/, '')}`} target="_blank" rel="noreferrer">{SETTINGS.instagram}</a>
            </span>
          )}
          <span className="line muted">{ABOUT.location || 'Los Angeles'} · available worldwide</span>
        </div>
      </div>
    </div>
  );
}

/* Split an array into rows of N for the Practice line layout. */
function chunkInto(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/* ============================================================
   CONTACT
   ============================================================ */
/* Encode an object as URL-encoded form data, which is what Netlify Forms
   expects when you POST a JS-managed form back to "/". */
function encodeFormData(data) {
  return Object.keys(data)
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k]))
    .join('&');
}

function Contact() {
  const [sent, setSent] = vsUseState(false);
  const [submitting, setSubmitting] = vsUseState(false);
  const [error, setError] = vsUseState(null);
  const [f, setF] = vsUseState({ name: '', email: '', subject: 'editorial', message: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeFormData({ 'form-name': 'contact', ...f }),
      });
      if (!res.ok) throw new Error('submit_failed');
      setSent(true);
    } catch (err) {
      setError("Couldn't send — please email aldo@aldocarrera.com directly.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    return (
      <div className="contact">
        <div className="sent">
          <div className="mark">Sent · {today}</div>
          <div className="headline" style={{fontSize: 22, marginBottom: 8}}>Thanks for reaching out, {f.name.split(' ')[0] || 'friend'}.</div>
          <div style={{color:'var(--ink-soft)'}}>Your message is in. Replies within three working days, usually fewer. Direct line for time-sensitive work: +1 (619) 971-7182.</div>
          <div style={{marginTop: 22, display:'flex', gap:10}}>
            <button className="btn ghost" type="button" onClick={() => { setSent(false); setF({name:'',email:'',subject:'editorial',message:''}); }}>Send another</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="contact">
      <div className="hd">Inquiry · CONTACT.html</div>
      <h2>Get in touch</h2>
      <div className="intro">For new projects, bookings, and creative inquiries. Campaign, editorial, lookbook, casting, and direction work welcome.</div>
      {/* Netlify Forms:
          - name + data-netlify="true" register it with Netlify's form-handler.
          - The hidden <input name="form-name"> is required because we POST via fetch.
          - The honeypot ("bot-field") silently filters spam bots.
          - A matching static form lives in index.html so Netlify's deploy-time
            crawler can detect it (it can't see React-rendered markup). */}
      <form
        name="contact"
        method="POST"
        data-netlify="true"
        netlify-honeypot="bot-field"
        onSubmit={submit}
      >
        <input type="hidden" name="form-name" value="contact"/>
        <p style={{display:'none'}}>
          <label>Don't fill this out if you're human: <input name="bot-field"/></label>
        </p>
        <div className="row">
          <label htmlFor="cn">Name</label>
          <input id="cn" name="name" required value={f.name} onChange={e => setF({...f, name: e.target.value})}/>
        </div>
        <div className="row">
          <label htmlFor="ce">Email</label>
          <input id="ce" name="email" required type="email" value={f.email} onChange={e => setF({...f, email: e.target.value})}/>
        </div>
        <div className="row">
          <label htmlFor="cs">Subject</label>
          <select id="cs" name="subject" value={f.subject} onChange={e => setF({...f, subject: e.target.value})}>
            <option value="editorial">Editorial booking</option>
            <option value="commercial">Commercial / campaign</option>
            <option value="portrait">Portrait / talent day</option>
            <option value="print">Prints &amp; archive</option>
            <option value="press">Press / interview</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="row">
          <label htmlFor="cm">Message</label>
          <textarea id="cm" name="message" required value={f.message} onChange={e => setF({...f, message: e.target.value})}/>
        </div>
        {error && (
          <div style={{color:'#b34', fontSize:13, marginBottom:10, fontFamily:'var(--mono)'}}>
            {error}
          </div>
        )}
        <div className="submit-row">
          <span className="hint">{SETTINGS.contactEmail || 'aldo@aldocarrera.com'}  ·  {SETTINGS.contactPhone || '+1 (619) 971-7182'}</span>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send →'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ============================================================
   SERVICES — creative-partner positioning
   ============================================================ */
function Services() {
  return (
    <div className="services">
      <div className="hello">Services · v2026.05</div>
      <h1>What I offer.</h1>
      <p className="lede">
        A full-service practice — available as a complete creative partnership
        or à la carte. Photography is the spine; everything around it (casting,
        direction, post) is on offer when the project asks for it.
      </p>

      <ol className="services-list">
        {SERVICES.map((s) => (
          <li key={s.n} className="srv">
            <span className="num">{s.n} /</span>
            <div className="srv-body">
              <h3>{s.title}</h3>
              <div className="items">
                {s.items.map((it, i) => (
                  <React.Fragment key={it}>
                    {i > 0 && <span className="sep">·</span>}
                    <span>{it}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="services-foot">
        <div className="mono">— Available as full-service or à la carte.</div>
        <div className="services-cta">
          For booking inquiries, see <span className="under">Contact</span>, or
          write directly to <a href="mailto:aldo@aldocarrera.com">aldo@aldocarrera.com</a>.
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   REELS — video grid
   ============================================================ */
const API_BASE_V = window.API_BASE || '';

function getEmbedSrc(url) {
  if (!url) return '';
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&muted=1&loop=1&background=1&title=0&byline=0&portrait=0`;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1&loop=1&playlist=${yt[1]}&rel=0&controls=0`;
  return url;
}

function getFullEmbedSrc(url) {
  if (!url) return '';
  // Browsers block autoplay-with-sound, but the user just clicked the card so
  // we have a transient autoplay-with-sound permission. Don't force mute=1 here.
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&title=0&byline=0&portrait=0`;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0`;
  return url;
}

function videoSrc(v) {
  if (!v.blobPath) return '';
  const parts = v.blobPath.replace(/^__videos\//, '').split('/');
  return `${API_BASE_V}/api/videos/${parts[0]}/file/${parts.slice(1).join('/')}`;
}

function ReelCard({ video, onOpen }) {
  const [hover, setHover] = vsUseState(false);
  const videoRef = vsUseRef(null);
  const posterSrc = video.poster
    ? (video.poster.startsWith('__vidposters/')
        ? `${API_BASE_V}/api/videoposters/${video.poster.slice('__vidposters/'.length)}`
        : video.poster)
    : null;
  const fileSrc = videoSrc(video);
  const embed   = getEmbedSrc(video.embedUrl);
  const canHoverPreview = !!(fileSrc || embed);

  vsUseEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (hover) { el.play().catch(() => {}); }
    else { el.pause(); try { el.currentTime = 0; } catch (_) {} }
  }, [hover]);

  return (
    <article
      className="reel-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(video)}
    >
      <div className="reel-thumb">
        {/* Layer 1: poster (always rendered, hidden when previewing) */}
        {posterSrc
          ? <img src={posterSrc} alt={video.title} className={`reel-poster ${hover && canHoverPreview ? 'is-hidden' : ''}`}/>
          : <div className={`reel-thumb-placeholder ${hover && canHoverPreview ? 'is-hidden' : ''}`}>▶</div>
        }
        {/* Layer 2: hover preview — self-hosted gets a muted <video>, embed gets an iframe with background=1 */}
        {hover && fileSrc && (
          <video
            ref={videoRef}
            className="reel-preview"
            src={fileSrc}
            muted
            playsInline
            loop
            preload="metadata"
          />
        )}
        {hover && !fileSrc && embed && (
          <iframe className="reel-preview" src={embed} frameBorder="0" allow="autoplay"/>
        )}
        <div className="reel-play-overlay"><span>▶</span></div>
      </div>
      <div className="reel-info">
        <div className="reel-title">{video.title}</div>
        <div className="reel-meta">
          <span className="reel-cat">{video.category}</span>
          {video.client && <><span className="dot">·</span><span>{video.client.toUpperCase()}</span></>}
          <span className="dot">·</span><span>{video.year}</span>
        </div>
      </div>
    </article>
  );
}

function ReelsView({ onOpenVideo }) {
  const { VIDEOS } = window.ALDO;
  if (!VIDEOS || VIDEOS.length === 0) {
    return (
      <div className="reels-empty">
        <div className="reels-empty-icon">▶</div>
        <div className="reels-empty-text">No reels yet.</div>
      </div>
    );
  }
  return (
    <div className="reels-grid">
      {VIDEOS.map(v => <ReelCard key={v.id} video={v} onOpen={onOpenVideo}/>)}
    </div>
  );
}

function VideoPlayer({ video }) {
  const src = videoSrc(video);
  const embed = getFullEmbedSrc(video.embedUrl);
  return (
    <div className="video-player-wrap">
      {embed ? (
        <iframe
          className="video-player-iframe"
          src={embed}
          frameBorder="0"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : src ? (
        <video
          className="video-player-el"
          src={src}
          autoPlay
          controls
          playsInline
          loop
        />
      ) : (
        <div className="video-player-empty">No video source.</div>
      )}
      {video.description && (
        <div className="video-player-desc">{video.description}</div>
      )}
    </div>
  );
}

window.Services = Services;
window.ProjectDetail = ProjectDetail;
window.Archive = Archive;
window.PhotoViewer = PhotoViewer;
window.Clients = Clients;
window.About = About;
window.Contact = Contact;
window.ReelsView = ReelsView;
window.VideoPlayer = VideoPlayer;
