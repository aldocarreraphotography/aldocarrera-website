/* aldo-views.jsx — Portfolio, Archive, Clients, About, Contact */

const { useState: vsUseState, useEffect: vsUseEffect, useMemo: vsUseMemo, useRef: vsUseRef } = React;

const { PROJECTS, ARCHIVE, CLIENTS, PHOTOS, SERVICES, ABOUT, SETTINGS } = window.ALDO;

/* ============================================================
   PORTFOLIO
   ============================================================ */
function Portfolio({ view, onSetView, onOpenProject, onSetCrumb }) {
  return (
    <div className={`portfolio ${view}`}>
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
   PROJECT WINDOW (single project archive)
   ============================================================ */
function ProjectDetail({ project, onOpenPhoto }) {
  const items = vsUseMemo(() => ARCHIVE.filter(a => a.project === project.id), [project.id]);
  return (
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
      {items.length > 0 ? (
        <div className="thumb-grid">
          {items.map(it => (
            <div key={it.id} className="thumb" onClick={() => onOpenPhoto(it)}>
              <div className="pic"><img src={it.photo} alt={it.name} loading="lazy"/></div>
              <span className="name">{it.name}</span>
              <span className="sub">{it.size} · {it.note || 'archive'}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="thumb-grid">
          {Array.from({length: project.count}).map((_, i) => (
            <div key={i} className="thumb" onClick={() => onOpenPhoto({ photo: project.photo, name: `${project.id}_F${(i+1).toString().padStart(2,'0')}.jpg`, size: "—", date: project.month, client: project.client, dims: "—" })}>
              <div className="pic">
                {i < project.count - 2 ? (
                  <img src={project.photo} alt="" loading="lazy"/>
                ) : (
                  <div className="placeholder">reserved<br/>frame {i+1}</div>
                )}
              </div>
              <span className="name">{project.id}_F{(i+1).toString().padStart(2,'0')}.jpg</span>
              <span className="sub">7.{i+1} MB · select</span>
            </div>
          ))}
        </div>
      )}
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
      <h1>What I make.</h1>
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

window.Services = Services;
window.ProjectDetail = ProjectDetail;
window.Archive = Archive;
window.PhotoViewer = PhotoViewer;
window.Clients = Clients;
window.About = About;
window.Contact = Contact;
