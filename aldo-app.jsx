/* aldo-app.jsx — main shell, window manager, dock, mobile shell */

const { useState: aUseState, useEffect: aUseEffect, useRef: aUseRef, useMemo: aUseMemo, useCallback: aUseCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#d63e5a",
  "tone": "warm",
  "saturation": 88
}/*EDITMODE-END*/;

const TONES = {
  warm:    { paper: "#f1ede5", paperSoft: "#e9e3d8", rule: "#c8c2b3", ruleSoft: "#ddd6c6", window: "#fbfaf7" },
  cool:    { paper: "#eef0f3", paperSoft: "#e3e6eb", rule: "#bfc4cc", ruleSoft: "#d6dae2", window: "#fafbfc" },
  neutral: { paper: "#f0efeb", paperSoft: "#e5e3dd", rule: "#c5c2ba", ruleSoft: "#d8d5cb", window: "#fbfaf7" },
};

function fmtTime(d) {
  let h = d.getHours(); const m = d.getMinutes().toString().padStart(2,'0');
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ap}`;
}
function fmtDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function useNow() {
  const [n, set] = aUseState(new Date());
  aUseEffect(() => { const t = setInterval(() => set(new Date()), 1000); return () => clearInterval(t); }, []);
  return n;
}

/* ============================================================
   DOCK ICONS — abstract original glyphs (no branded logos)
   ============================================================ */
const DockGlyph = ({ kind, accent }) => {
  const stroke = "var(--ink)";
  switch (kind) {
    case 'portfolio':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="2.5" y="3.5" width="7" height="15" stroke={stroke} strokeWidth="1.2"/>
          <rect x="12.5" y="3.5" width="7" height="9" stroke={stroke} strokeWidth="1.2"/>
          <rect x="12.5" y="14" width="7" height="4.5" stroke={stroke} strokeWidth="1.2"/>
        </svg>
      );
    case 'archive':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="2.5" y="3" width="17" height="3.5" stroke={stroke} strokeWidth="1.2"/>
          <rect x="2.5" y="7.5" width="17" height="3.5" stroke={stroke} strokeWidth="1.2"/>
          <rect x="2.5" y="12" width="17" height="3.5" stroke={stroke} strokeWidth="1.2"/>
          <rect x="2.5" y="16.5" width="17" height="3" stroke={stroke} strokeWidth="1.2"/>
          <line x1="9" y1="4.8" x2="13" y2="4.8" stroke={stroke} strokeWidth="1.2"/>
          <line x1="9" y1="9.3" x2="13" y2="9.3" stroke={stroke} strokeWidth="1.2"/>
          <line x1="9" y1="13.8" x2="13" y2="13.8" stroke={stroke} strokeWidth="1.2"/>
        </svg>
      );
    case 'clients':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <line x1="3" y1="5" x2="19" y2="5" stroke={stroke} strokeWidth="1.2"/>
          <line x1="3" y1="9" x2="19" y2="9" stroke={stroke} strokeWidth="1.2"/>
          <line x1="3" y1="13" x2="14" y2="13" stroke={stroke} strokeWidth="1.2"/>
          <line x1="3" y1="17" x2="16" y2="17" stroke={stroke} strokeWidth="1.2"/>
        </svg>
      );
    case 'about':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="3.5" y="2.5" width="15" height="17" stroke={stroke} strokeWidth="1.2"/>
          <line x1="6" y1="6.5" x2="16" y2="6.5" stroke={stroke} strokeWidth="1.2"/>
          <line x1="6" y1="9.5" x2="16" y2="9.5" stroke={stroke} strokeWidth="1.2"/>
          <line x1="6" y1="12.5" x2="14" y2="12.5" stroke={stroke} strokeWidth="1.2"/>
          <line x1="6" y1="15.5" x2="12" y2="15.5" stroke={stroke} strokeWidth="1.2"/>
        </svg>
      );
    case 'contact':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="2.5" y="5" width="17" height="12" stroke={stroke} strokeWidth="1.2"/>
          <path d="M3 5.5 L11 12 L19 5.5" stroke={stroke} strokeWidth="1.2" fill="none"/>
        </svg>
      );
    case 'services':
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="7" cy="7" r="3" stroke={stroke} strokeWidth="1.2"/>
          <circle cx="15" cy="7" r="3" stroke={stroke} strokeWidth="1.2"/>
          <circle cx="7" cy="15" r="3" stroke={stroke} strokeWidth="1.2"/>
          <circle cx="15" cy="15" r="3" stroke={stroke} strokeWidth="1.2"/>
        </svg>
      );
    default: return null;
  }
};

/* ============================================================
   SIDEBAR GLYPHS
   ============================================================ */
const SbFolder = ({ open }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    {open ? (
      <>
        <path d="M1.5 4.5 L6 4.5 L7 3 L14.5 3 L14.5 13.5 L1.5 13.5 Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="currentColor" fillOpacity="0.18"/>
      </>
    ) : (
      <path d="M1.5 5 L6 5 L7 3.5 L14.5 3.5 L14.5 13 L1.5 13 Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="currentColor" fillOpacity="0.10"/>
    )}
  </svg>
);
const SbFile = () => (
  <svg width="13" height="13" viewBox="0 0 14 16" fill="none">
    <path d="M2.5 1.5 L9 1.5 L11.5 4 L11.5 14.5 L2.5 14.5 Z" stroke="currentColor" strokeWidth="1.1" fill="currentColor" fillOpacity="0.06"/>
    <path d="M9 1.5 L9 4 L11.5 4" stroke="currentColor" strokeWidth="1.1" fill="none"/>
    <line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="0.9"/>
    <line x1="4" y1="9.5" x2="10" y2="9.5" stroke="currentColor" strokeWidth="0.9"/>
    <line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="0.9"/>
  </svg>
);
const SbCabinet = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth="1.1" fill="currentColor" fillOpacity="0.06"/>
    <line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.1"/>
    <line x1="2" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="1.1"/>
    <rect x="6.5" y="3.5" width="3" height="1" fill="currentColor"/>
    <rect x="6.5" y="7.5" width="3" height="1" fill="currentColor"/>
    <rect x="6.5" y="11.5" width="3" height="1" fill="currentColor"/>
  </svg>
);
const SbAddress = () => (
  <svg width="13" height="13" viewBox="0 0 14 16" fill="none">
    <rect x="2.5" y="2" width="9" height="12" stroke="currentColor" strokeWidth="1.1" fill="currentColor" fillOpacity="0.06"/>
    <line x1="1.5" y1="5" x2="3" y2="5" stroke="currentColor" strokeWidth="1.1"/>
    <line x1="1.5" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.1"/>
    <line x1="1.5" y1="11" x2="3" y2="11" stroke="currentColor" strokeWidth="1.1"/>
    <circle cx="7" cy="7" r="1.6" stroke="currentColor" strokeWidth="0.9" fill="none"/>
    <path d="M4.5 11.5 Q7 9 9.5 11.5" stroke="currentColor" strokeWidth="0.9" fill="none"/>
  </svg>
);
const SbServices = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="5" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.1" fill="currentColor" fillOpacity="0.18"/>
    <circle cx="11" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.1" fill="none"/>
    <circle cx="5" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.1" fill="none"/>
    <circle cx="11" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.1" fill="currentColor" fillOpacity="0.18"/>
  </svg>
);
const SbChev = ({ open }) => (
  <svg width="9" height="9" viewBox="0 0 9 9" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 180ms var(--easing)' }} fill="none">
    <path d="M2 3.5 L4.5 6 L7 3.5" stroke="currentColor" strokeWidth="1.2" fill="none"/>
  </svg>
);

/* ============================================================
   SIDEBAR (Finder-style)
   ============================================================ */
function Sidebar({ openWindow, activeKind, archiveFilter, setArchiveFilter, taskList }) {
  const [open, setOpen] = aUseState({ favorites: true, tags: true, years: true, clients: false, recent: true });
  const toggle = (k) => setOpen(o => ({ ...o, [k]: !o[k] }));

  const yearCounts = aUseMemo(() => {
    const m = {};
    ARCHIVE.forEach(a => { m[a.year] = (m[a.year] || 0) + 1; });
    return m;
  }, []);
  const years = aUseMemo(() => Object.keys(yearCounts).sort().reverse(), [yearCounts]);

  const clientCounts = aUseMemo(() => {
    const m = {};
    ARCHIVE.forEach(a => { if (a.client !== 'PERSONAL') m[a.client] = (m[a.client] || 0) + 1; });
    return m;
  }, []);
  const clientList = aUseMemo(() => Object.keys(clientCounts).sort(), [clientCounts]);

  const tags = [
    { name: 'Editorial',   color: 'var(--accent)', filter: { key: 'type', value: 'EDITORIAL' } },
    { name: 'Commercial',  color: 'var(--accent)', filter: { key: 'type', value: 'COMMERCIAL' } },
    { name: 'Personal',    color: 'var(--accent)', filter: { key: 'type', value: 'PERSONAL' } },
    { name: 'Selects',     color: 'var(--accent)', filter: { key: 'tag', value: 'select' } },
  ];

  const totalSize = "18.4 GB";
  const totalFiles = ARCHIVE.length;

  const isActiveKind = (k) => activeKind === k && !archiveFilter;
  const isActiveYear = (y) => archiveFilter && archiveFilter.key === 'year' && archiveFilter.value === y;
  const isActiveClient = (c) => archiveFilter && archiveFilter.key === 'client' && archiveFilter.value === c;
  const isActiveTag  = (t) => archiveFilter && archiveFilter.key === t.filter.key && archiveFilter.value === t.filter.value;

  const goArchive = (filter) => {
    setArchiveFilter(filter);
    openWindow('archive');
  };

  return (
    <aside className="sidebar">
      <div className="sb-head">
        <div className="sb-brand">
          <AldoLogo size={28} fill="var(--accent)"/>
          <div className="sb-brand-text">
            <div className="sb-title">Aldo Carrera</div>
            <div className="sb-sub">Photographer · LA</div>
          </div>
        </div>
      </div>

      <div className={`sb-section ${!open.favorites ? 'collapsed' : ''}`}>
        <div className="sb-section-head" onClick={() => toggle('favorites')}>
          <span>Favorites</span><SbChev open={open.favorites}/>
        </div>
        <div className="sb-items">
          <div className={`sb-item ${isActiveKind('portfolio') ? 'active' : ''}`} onClick={() => { setArchiveFilter(null); openWindow('portfolio'); }}>
            <span className="sb-glyph"><SbFolder open={isActiveKind('portfolio')}/></span>
            <span className="sb-label">Selected Work</span>
            <span className="sb-ct">{PROJECTS.length}</span>
          </div>
          <div className={`sb-item ${isActiveKind('archive') && !archiveFilter ? 'active' : ''}`} onClick={() => goArchive(null)}>
            <span className="sb-glyph"><SbCabinet/></span>
            <span className="sb-label">Archive</span>
            <span className="sb-ct">{totalFiles}</span>
          </div>
          <div className={`sb-item ${isActiveKind('services') ? 'active' : ''}`} onClick={() => { setArchiveFilter(null); openWindow('services'); }}>
            <span className="sb-glyph"><SbServices/></span>
            <span className="sb-label">Services</span>
            <span className="sb-ct">5</span>
          </div>
          <div className={`sb-item ${isActiveKind('clients') ? 'active' : ''}`} onClick={() => { setArchiveFilter(null); openWindow('clients'); }}>
            <span className="sb-glyph"><SbAddress/></span>
            <span className="sb-label">Clients</span>
            <span className="sb-ct">{CLIENTS.length}</span>
          </div>
          <div className={`sb-item ${isActiveKind('about') ? 'active' : ''}`} onClick={() => { setArchiveFilter(null); openWindow('about'); }}>
            <span className="sb-glyph"><SbFile/></span>
            <span className="sb-label">about_me.txt</span>
          </div>
          <div className={`sb-item ${isActiveKind('contact') ? 'active' : ''}`} onClick={() => { setArchiveFilter(null); openWindow('contact'); }}>
            <span className="sb-glyph"><SbFile/></span>
            <span className="sb-label">contact.html</span>
          </div>
        </div>
      </div>

      <div className={`sb-section ${!open.tags ? 'collapsed' : ''}`}>
        <div className="sb-section-head" onClick={() => toggle('tags')}>
          <span>Tags</span><SbChev open={open.tags}/>
        </div>
        <div className="sb-items">
          {tags.map(t => (
            <div
              key={t.name}
              className={`sb-item nested ${isActiveTag(t) ? 'active' : ''}`}
              onClick={() => goArchive(t.filter)}
            >
              <span className="sb-tag-dot"/>
              <span className="sb-label">{t.name}</span>
              <span className="sb-ct">{ARCHIVE.filter(a => t.filter.key === 'type' ? a.type === t.filter.value : a.note === 'select' || (a.note||'').includes('select')).length}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`sb-section ${!open.years ? 'collapsed' : ''}`}>
        <div className="sb-section-head" onClick={() => toggle('years')}>
          <span>Archive · By Year</span><SbChev open={open.years}/>
        </div>
        <div className="sb-items">
          {years.map(y => (
            <div
              key={y}
              className={`sb-item nested ${isActiveYear(y) ? 'active' : ''}`}
              onClick={() => goArchive({ key: 'year', value: y })}
            >
              <span className="sb-glyph"><SbFolder open={isActiveYear(y)}/></span>
              <span className="sb-label">{y}</span>
              <span className="sb-ct">{yearCounts[y]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`sb-section ${!open.clients ? 'collapsed' : ''}`}>
        <div className="sb-section-head" onClick={() => toggle('clients')}>
          <span>Archive · By Client</span><SbChev open={open.clients}/>
        </div>
        <div className="sb-items">
          {clientList.map(c => (
            <div
              key={c}
              className={`sb-item nested ${isActiveClient(c) ? 'active' : ''}`}
              onClick={() => goArchive({ key: 'client', value: c })}
              title={c}
            >
              <span className="sb-glyph"><SbFolder open={isActiveClient(c)}/></span>
              <span className="sb-label">{c.length > 18 ? c.slice(0,17) + '\u2026' : c}</span>
              <span className="sb-ct">{clientCounts[c]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="sb-storage">
        <div className="label">Archive · Storage</div>
        <div className="num">{totalSize} of 50 GB</div>
        <div className="bar"><span style={{ width: '37%' }}/></div>
        <div className="num" style={{ fontSize: 9.5, color: 'var(--ink-muted)' }}>{totalFiles} files · last index 05/17</div>
      </div>

      <div className="sb-footer">
        <a href="mailto:aldo@aldocarrera.com">aldo@aldocarrera.com</a>
        <a href="tel:+16199717182">+1 (619) 971-7182</a>
        <a href="https://instagram.com/aldocarrera" target="_blank" rel="noreferrer">@aldocarrera</a>
        <div style={{marginTop: 6}}>Los Angeles, CA</div>
      </div>
    </aside>
  );
}
function CtxMenu({ x, y, items, onClose }) {
  aUseEffect(() => {
    const f = () => onClose();
    setTimeout(() => window.addEventListener('click', f), 0);
    return () => window.removeEventListener('click', f);
  }, [onClose]);
  return (
    <div className="ctx" style={{ left: x, top: y }}>
      {items.map((it, i) => it === '-' ? (
        <div className="ctx-sep" key={i}/>
      ) : (
        <div key={i} className={`ctx-item ${it.disabled ? 'disabled' : ''}`} onClick={() => !it.disabled && (it.action(), onClose())}>
          <span>{it.label}</span>
          {it.kbd && <span className="kbd">{it.kbd}</span>}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   SELECTION PANEL (floating, To-Go Deck)
   ============================================================ */
function SelectionPanel({ selectedIds, archive, onRemove, onReorder, onClear, onExport, accent }) {
  if (!selectedIds || selectedIds.length === 0) return null;
  const items = selectedIds.map(id => archive.find(a => a.id === id)).filter(Boolean);
  const [dragIdx, setDragIdx] = aUseState(null);
  const [hoverIdx, setHoverIdx] = aUseState(null);

  return (
    <div className="deck-panel">
      <div className="deck-panel-head">
        <span className="deck-pip" style={{ background: accent }}>{items.length}</span>
        <div className="deck-title-block">
          <div className="deck-title">To-Go Deck</div>
          <div className="deck-sub">{items.length} {items.length === 1 ? 'image' : 'images'} selected · drag to reorder</div>
        </div>
        <button className="deck-clear" onClick={onClear} title="Clear selection">clear</button>
      </div>
      <div className="deck-strip">
        {items.map((it, i) => (
          <div
            key={it.id}
            className={`deck-chip ${hoverIdx === i ? 'hover' : ''} ${dragIdx === i ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => { e.preventDefault(); setHoverIdx(i); }}
            onDragLeave={() => setHoverIdx(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIdx != null && dragIdx !== i) onReorder(dragIdx, i);
              setDragIdx(null); setHoverIdx(null);
            }}
            onDragEnd={() => { setDragIdx(null); setHoverIdx(null); }}
          >
            <span className="ord">{i + 1}</span>
            <img src={it.photo} alt={it.name} draggable={false}/>
            <button className="chip-remove" onClick={() => onRemove(it.id)} aria-label="Remove">×</button>
          </div>
        ))}
      </div>
      <div className="deck-actions">
        <span className="deck-hint">Up to 50 images per deck</span>
        <button className="btn" onClick={onExport} disabled={items.length === 0}>
          Export Deck →
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   EXPORT MODAL
   ============================================================ */
function ExportModal({ count, onCancel, onGenerate }) {
  const [meta, setMeta] = aUseState({ title: 'Selected Work', recipient: '', note: '', layout: 'caption' });
  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <AldoLogo size={24} fill="var(--accent)"/>
          <div>
            <div className="modal-eyebrow">Export · To-Go Deck · PDF</div>
            <div className="modal-h">{count} {count === 1 ? 'image' : 'images'} → portable deck</div>
          </div>
          <button className="modal-x" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <div className="modal-row">
            <label>Deck title</label>
            <input value={meta.title} onChange={e => setMeta({...meta, title: e.target.value})} placeholder="Selected Work"/>
          </div>
          <div className="modal-row">
            <label>For / recipient <span className="opt">optional</span></label>
            <input value={meta.recipient} onChange={e => setMeta({...meta, recipient: e.target.value})} placeholder="e.g. Halston SS25 team"/>
          </div>
          <div className="modal-row">
            <label>Note <span className="opt">optional</span></label>
            <textarea value={meta.note} onChange={e => setMeta({...meta, note: e.target.value})} placeholder="A short note on the cover page."/>
          </div>
          <div className="modal-row">
            <label>Layout</label>
            <div className="layout-picker">
              {[
                { v: 'full',    label: 'Full-bleed',    sub: 'one image / page' },
                { v: 'caption', label: 'With caption',  sub: 'metadata below' },
                { v: 'duo',     label: 'Gallery 2-up',  sub: 'two / page' },
              ].map(opt => (
                <button
                  key={opt.v}
                  className={`lp ${meta.layout === opt.v ? 'on' : ''}`}
                  onClick={() => setMeta({...meta, layout: opt.v})}
                  type="button"
                >
                  <span className={`lp-glyph lp-${opt.v}`} aria-hidden/>
                  <span className="lp-label">{opt.label}</span>
                  <span className="lp-sub">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <span className="modal-hint">Logo & contact appear on every page.</span>
          <div className="modal-actions">
            <button className="btn ghost" onClick={onCancel}>Cancel</button>
            <button className="btn" onClick={() => onGenerate(meta)}>Generate PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   DECK OVERLAY — full-screen branded PDF view, in-place
   (replaces opening a new window since the preview tab is token-gated)
   ============================================================ */
function DeckOverlay({ deck, onClose }) {
  if (!deck) return null;
  const { meta, items } = deck;
  const totalPages = meta.layout === 'duo'
    ? Math.ceil(items.length / 2) + 2
    : items.length + 2;

  const pagesRef = aUseRef(null);
  const shellRef = aUseRef(null);
  const [exportStatus, setExportStatus] = aUseState({ state: 'idle', current: 0, total: 0 });

  // Fetch all cross-origin images as data URLs before html2canvas runs.
  // Data URLs are same-origin so html2canvas never hits CORS at render time.
  const buildDataUrlMap = async (root) => {
    const sources = new Set();
    root.querySelectorAll('img[src]').forEach(img => sources.add(img.src));
    root.querySelectorAll('[style*="background-image"]').forEach(el => {
      const m = (el.style.backgroundImage || '').match(/url\(["']?([^"')]+)["']?\)/);
      if (m && m[1]) sources.add(m[1]);
    });
    const map = new Map();
    await Promise.all(Array.from(sources).map(async src => {
      try {
        const resp = await fetch(src, { mode: 'cors', cache: 'no-store' });
        const blob = await resp.blob();
        const dataUrl = await new Promise(res => {
          const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob);
        });
        map.set(src, dataUrl);
      } catch (_) { /* keep original on failure */ }
    }));
    return map;
  };

  const swapSrcs = (root, map, reverse = false) => {
    const fwd = (orig) => reverse ? [...map.entries()].find(([,v]) => v === orig)?.[0] ?? orig : (map.get(orig) ?? orig);
    root.querySelectorAll('img[src]').forEach(img => { img.src = fwd(img.src); });
    root.querySelectorAll('[style*="background-image"]').forEach(el => {
      const m = (el.style.backgroundImage || '').match(/url\(["']?([^"')]+)["']?\)/);
      if (m && m[1]) el.style.backgroundImage = `url("${fwd(m[1])}")`;
    });
  };

  const downloadPDF = async () => {
    if (!pagesRef.current) return;
    if (typeof window.html2canvas !== 'function' || !window.jspdf) {
      alert('PDF engine still loading — please try again in a moment.');
      return;
    }

    const pages = Array.from(pagesRef.current.querySelectorAll('.dk-page'));
    setExportStatus({ state: 'preparing', current: 0, total: pages.length });

    // Convert all images to data URLs so html2canvas never hits CORS
    const dataUrlMap = await buildDataUrlMap(pagesRef.current);
    swapSrcs(pagesRef.current, dataUrlMap);
    await new Promise(r => requestAnimationFrame(() => r()));

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
    const PAGE_W = 612, PAGE_H = 792;

    shellRef.current && shellRef.current.classList.add('dk-exporting');

    try {
      for (let i = 0; i < pages.length; i++) {
        setExportStatus({ state: 'rendering', current: i + 1, total: pages.length });
        const canvas = await window.html2canvas(pages[i], {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: false,
          allowTaint: true,
          logging: false,
          imageTimeout: 0,
          width: pages[i].offsetWidth,
          height: pages[i].offsetHeight,
        });
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        if (i > 0) pdf.addPage('letter', 'portrait');
        pdf.addImage(dataUrl, 'JPEG', 0, 0, PAGE_W, PAGE_H, undefined, 'FAST');
        await new Promise(r => setTimeout(r, 0));
      }

      const today = new Date().toISOString().slice(0, 10);
      pdf.save(`Aldo_Carrera_SelectedWork_${today}.pdf`);
      setExportStatus({ state: 'done', current: pages.length, total: pages.length });
      setTimeout(() => setExportStatus({ state: 'idle', current: 0, total: 0 }), 1800);
    } catch (err) {
      console.error('PDF export failed', err);
      alert('Sorry — PDF export failed. ' + (err && err.message ? err.message : ''));
      setExportStatus({ state: 'idle', current: 0, total: 0 });
    } finally {
      swapSrcs(pagesRef.current, dataUrlMap, true);
      shellRef.current && shellRef.current.classList.remove('dk-exporting');
    }
  };

  const PageChrome = ({ pageNum }) => (
    <>
      <div className="dk-page-header">
        <div className="dk-page-logo"><AldoLogo size={18}/> <span>Aldo Carrera</span></div>
        <div className="dk-page-deck-label">{meta.title}</div>
      </div>
      <div className="dk-page-footer">
        <span className="dk-contact"><b>aldo@aldocarrera.com</b> &nbsp;·&nbsp; +1 (619) 971-7182 &nbsp;·&nbsp; @aldocarrera</span>
        <span>{pageNum} / {totalPages}</span>
      </div>
    </>
  );

  let imagePages = [];
  if (meta.layout === 'duo') {
    for (let i = 0; i < items.length; i += 2) {
      const a = items[i]; const b = items[i + 1];
      imagePages.push(
        <div key={i} className="dk-page dk-layout-duo">
          <PageChrome pageNum={2 + i / 2}/>
          <div className="dk-duo-wrap">
            <div className="dk-slot" style={{ backgroundImage: `url("${a.photo}")` }} role="img" aria-label={a.name}>
              <div className="dk-meta-strip"><b>{a.client}</b> · {a.name}</div>
            </div>
            {b ? (
              <div className="dk-slot" style={{ backgroundImage: `url("${b.photo}")` }} role="img" aria-label={b.name}>
                <div className="dk-meta-strip"><b>{b.client}</b> · {b.name}</div>
              </div>
            ) : <div className="dk-slot dk-slot-empty"/>}
          </div>
        </div>
      );
    }
  } else if (meta.layout === 'full') {
    imagePages = items.map((it, idx) => (
      <div key={it.id} className="dk-page dk-layout-full">
        <PageChrome pageNum={idx + 2}/>
        <div
          className="dk-image-wrap dk-full"
          style={{ backgroundImage: `url("${it.photo}")` }}
          role="img"
          aria-label={it.name}
        />
      </div>
    ));
  } else {
    imagePages = items.map((it, idx) => (
      <div key={it.id} className="dk-page dk-layout-caption">
        <PageChrome pageNum={idx + 2}/>
        <div className="dk-cap-stack">
          <div
            className="dk-image-wrap dk-cap"
            style={{ backgroundImage: `url("${it.photo}")` }}
            role="img"
            aria-label={it.name}
          />
          <div className="dk-caption">
            <div className="dk-cap-block">
              <div className="dk-cap-label">Project</div>
              <div className="dk-cap-v dk-cap-title">{it.client}</div>
              <div className="dk-cap-v dk-cap-sub">{it.project || ''}</div>
            </div>
            <div className="dk-cap-block">
              <div className="dk-cap-label">Frame</div>
              <div className="dk-cap-v dk-cap-mono">{it.name}</div>
              <div className="dk-cap-v dk-cap-sub">{it.dims || ''} · {it.size || ''}</div>
            </div>
            <div className="dk-cap-block">
              <div className="dk-cap-label">Date</div>
              <div className="dk-cap-v dk-cap-mono">{it.date || '—'}</div>
              <div className="dk-cap-v dk-cap-sub">{it.type || ''}</div>
            </div>
          </div>
        </div>
      </div>
    ));
  }

  return (
    <div className="dk-shell" ref={shellRef}>
      <div className="dk-controls">
        <span className="dk-controls-label">To-Go Deck · preview</span>
        <span className="dk-controls-meta"><b>{meta.title}</b> · {items.length} images · {totalPages} pages</span>
        <span className="dk-controls-spacer"/>
        {exportStatus.state !== 'idle' && exportStatus.state !== 'done' && (
          <span className="dk-export-progress">
            <span className="dk-export-spinner"/>
            {exportStatus.state === 'preparing'
              ? 'Preparing images…'
              : `Rendering ${exportStatus.current} / ${exportStatus.total}`}
          </span>
        )}
        {exportStatus.state === 'done' && (
          <span className="dk-export-progress dk-export-done">PDF downloaded ✓</span>
        )}
        <button className="dk-btn dk-btn-ghost" onClick={onClose} disabled={exportStatus.state === 'rendering' || exportStatus.state === 'preparing'}>← Back to Archive</button>
        <button className="dk-btn" onClick={downloadPDF} disabled={exportStatus.state === 'rendering' || exportStatus.state === 'preparing'}>
          {exportStatus.state === 'rendering' || exportStatus.state === 'preparing' ? 'Generating PDF…' : 'Download PDF'}
        </button>
      </div>
      <div className="dk-pages" ref={pagesRef}>
        {/* COVER */}
        <div className="dk-page dk-cover">
          <div className="dk-cover-top">
            <div className="dk-stamp"><b>Aldo Carrera</b> &nbsp;·&nbsp; To-Go Deck</div>
            <div className="dk-stamp dk-r">{totalPages} pages · {items.length} images</div>
          </div>
          <div className="dk-cover-mid">
            <div className="dk-cover-logo"><AldoLogo size={58}/></div>
            <div>
              <div className="dk-cover-eyebrow">Selected, {meta.date}</div>
              <h1 className="dk-cover-title">{meta.title}</h1>
              {meta.recipient && <div className="dk-cover-recipient">for <em>{meta.recipient}</em></div>}
              {meta.note && <div className="dk-cover-note">{meta.note}</div>}
            </div>
          </div>
          <div className="dk-cover-foot">
            <div className="dk-cf-col">
              <div className="dk-cf-label">Studio</div>
              <div className="dk-cf-v">Aldo Carrera</div>
              <div className="dk-cf-v dk-cf-muted">Photographer · LA</div>
            </div>
            <div className="dk-cf-col">
              <div className="dk-cf-label">Contact</div>
              <div className="dk-cf-v">aldo@aldocarrera.com</div>
              <div className="dk-cf-v dk-cf-muted">@aldocarrera</div>
            </div>
            <div className="dk-cf-col">
              <div className="dk-cf-label">This deck</div>
              <div className="dk-cf-v">{meta.date}</div>
              <div className="dk-cf-v dk-cf-muted">{items.length} {items.length === 1 ? 'image' : 'images'}</div>
            </div>
          </div>
        </div>

        {/* IMAGE PAGES */}
        {imagePages}

        {/* BACK COVER */}
        <div className="dk-page dk-back">
          <div className="dk-back-top">
            <span>End of deck</span>
            <span>{items.length} {items.length === 1 ? 'image' : 'images'} · {meta.date}</span>
          </div>
          <div className="dk-back-center">
            <div className="dk-back-logo"><AldoLogo size={80}/></div>
            <div className="dk-back-name">Aldo Carrera</div>
            <div className="dk-back-role">Photographer · Los Angeles</div>
            <div className="dk-back-contact">
              <div>
                <div className="dk-cf-label">Contact</div>
                <div className="dk-cf-v">aldo@aldocarrera.com</div>
                <div className="dk-cf-v">+1 (619) 971-7182</div>
              </div>
              <div>
                <div className="dk-cf-label">Web</div>
                <div className="dk-cf-v">aldocarrera.com</div>
                <div className="dk-cf-v">@aldocarrera</div>
              </div>
            </div>
          </div>
          <div/>
          <div className="dk-back-bottom">© 2026 Aldo Carrera · All Rights Reserved</div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MENUBAR — functional dropdowns
   ============================================================ */
function MenuBar({ openWindow, taskList, focused, focus, minimize, close, archiveSetSelectionMode, view, setView, fmtDate, fmtTime }) {
  const now = useNow();
  const [open, setOpen] = aUseState(null); // 'file' | 'edit' | 'view' | 'window' | 'help'
  const [helpOpen, setHelpOpen] = aUseState(false);
  const [aboutSiteOpen, setAboutSiteOpen] = aUseState(false);

  aUseEffect(() => {
    const onDoc = (e) => {
      if (!e.target.closest('.menubar')) setOpen(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  /* keyboard shortcuts */
  aUseEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      const map = { 1: 'portfolio', 2: 'archive', 3: 'services', 4: 'clients', 5: 'about', 6: 'contact' };
      if (map[e.key]) { e.preventDefault(); openWindow(map[e.key]); return; }
      if (k === 'f') {
        e.preventDefault();
        openWindow('archive');
        setTimeout(() => {
          const input = document.querySelector('.archive-only > .toolbar input');
          if (input) input.focus();
        }, 60);
      }
      if (k === '/') { e.preventDefault(); setHelpOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openWindow]);

  const click = (k) => setOpen(open === k ? null : k);
  const choose = (fn) => { fn(); setOpen(null); };

  const visibleWins = taskList.filter(w => w && w.mounted);

  return (
    <div className="menubar" onClick={(e) => e.stopPropagation()}>
      <span className="brand"><AldoLogo size={14} fill="currentColor"/> Aldo Carrera</span>
      <div className="menus">
        <span className={`menu-item ${open === 'file' ? 'on' : ''}`} onClick={() => click('file')}>File</span>
        <span className={`menu-item ${open === 'edit' ? 'on' : ''}`} onClick={() => click('edit')}>Edit</span>
        <span className={`menu-item ${open === 'view' ? 'on' : ''}`} onClick={() => click('view')}>View</span>
        <span className={`menu-item ${open === 'window' ? 'on' : ''}`} onClick={() => click('window')}>Window</span>
        <span className={`menu-item ${open === 'help' ? 'on' : ''}`} onClick={() => click('help')}>Help</span>
      </div>
      <span className="spacer"/>
      <div className="tray">
        <span>Photographer · Los Angeles</span>
        <span><b>{fmtDate(now)}</b> &nbsp;{fmtTime(now)}</span>
      </div>

      {open === 'file' && (
        <div className="dropdown" style={{ left: 160 }}>
          <div className="dd-item" onClick={() => choose(() => openWindow('portfolio'))}><span>Open Portfolio</span><span className="kbd">⌘1</span></div>
          <div className="dd-item" onClick={() => choose(() => openWindow('archive'))}><span>Open Archive</span><span className="kbd">⌘2</span></div>
          <div className="dd-item" onClick={() => choose(() => openWindow('services'))}><span>Open Services</span><span className="kbd">⌘3</span></div>
          <div className="dd-item" onClick={() => choose(() => openWindow('clients'))}><span>Open Clients</span><span className="kbd">⌘4</span></div>
          <div className="dd-item" onClick={() => choose(() => openWindow('about'))}><span>Open About</span><span className="kbd">⌘5</span></div>
          <div className="dd-sep"/>
          <div className="dd-item" onClick={() => choose(() => openWindow('contact'))}><span>Open Contact</span><span className="kbd">⌘6</span></div>
        </div>
      )}

      {open === 'edit' && (
        <div className="dropdown" style={{ left: 200 }}>
          <div className="dd-item" onClick={() => choose(() => {
            openWindow('archive');
            setTimeout(() => {
              const input = document.querySelector('.archive-only > .toolbar input');
              if (input) input.focus();
            }, 60);
          })}><span>Find…</span><span className="kbd">⌘F</span></div>
          <div className="dd-item" onClick={() => choose(() => {
            openWindow('archive');
            archiveSetSelectionMode && archiveSetSelectionMode(true);
          })}><span>Enter Select Mode</span><span className="kbd">S</span></div>
          <div className="dd-sep"/>
          <div className="dd-item disabled"><span>Cut</span><span className="kbd">⌘X</span></div>
          <div className="dd-item disabled"><span>Copy</span><span className="kbd">⌘C</span></div>
          <div className="dd-item disabled"><span>Paste</span><span className="kbd">⌘V</span></div>
        </div>
      )}

      {open === 'view' && (
        <div className="dropdown" style={{ left: 240 }}>
          <div className={`dd-item ${view === 'grid' ? 'check' : ''}`} onClick={() => choose(() => setView('grid'))}>
            <span>{view === 'grid' ? '✓ ' : '   '}Portfolio · Grid</span><span className="kbd">⌘G</span>
          </div>
          <div className={`dd-item ${view === 'list' ? 'check' : ''}`} onClick={() => choose(() => setView('list'))}>
            <span>{view === 'list' ? '✓ ' : '   '}Portfolio · List</span><span className="kbd">⌘L</span>
          </div>
          <div className="dd-sep"/>
          <div className="dd-item disabled"><span>Zoom In</span><span className="kbd">⌘+</span></div>
          <div className="dd-item disabled"><span>Zoom Out</span><span className="kbd">⌘−</span></div>
          <div className="dd-item disabled"><span>Actual Size</span><span className="kbd">⌘0</span></div>
        </div>
      )}

      {open === 'window' && (
        <div className="dropdown" style={{ left: 280 }}>
          {visibleWins.length === 0 ? (
            <div className="dd-item disabled"><span>No windows open</span></div>
          ) : (
            visibleWins.map(w => (
              <div
                key={w.id}
                className={`dd-item ${focused === w.id ? 'check' : ''}`}
                onClick={() => choose(() => focus(w.id))}
              >
                <span>{focused === w.id ? '✓ ' : '   '}{w.taskLabel || w.title}</span>
                <span className="kbd">{w.minimized ? '⤓' : ''}</span>
              </div>
            ))
          )}
          <div className="dd-sep"/>
          <div className="dd-item" onClick={() => choose(() => visibleWins.forEach(w => minimize(w.id)))}><span>Minimize All</span></div>
          <div className="dd-item" onClick={() => choose(() => visibleWins.forEach(w => close(w.id)))}><span>Close All</span></div>
        </div>
      )}

      {open === 'help' && (
        <div className="dropdown" style={{ left: 330 }}>
          <div className="dd-item" onClick={() => choose(() => setHelpOpen(true))}><span>Keyboard Shortcuts</span><span className="kbd">⌘/</span></div>
          <div className="dd-item" onClick={() => choose(() => setAboutSiteOpen(true))}><span>About this site</span></div>
        </div>
      )}

      {helpOpen && <ShortcutsModal onClose={() => setHelpOpen(false)}/>}
      {aboutSiteOpen && <AboutSiteModal onClose={() => setAboutSiteOpen(false)}/>}
    </div>
  );
}

function ShortcutsModal({ onClose }) {
  const rows = [
    ['Open Portfolio',  '⌘1'],
    ['Open Archive',    '⌘2'],
    ['Open Services',   '⌘3'],
    ['Open Clients',    '⌘4'],
    ['Open About',      '⌘5'],
    ['Open Contact',    '⌘6'],
    ['Find / focus search', '⌘F'],
    ['Keyboard shortcuts', '⌘/'],
    ['Previous / next photo (viewer)', '← →'],
    ['Close window / dismiss viewer', 'Esc'],
    ['Right-click on desktop', '— context menu'],
  ];
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <AldoLogo size={20} fill="var(--accent)"/>
          <div>
            <div className="modal-eyebrow">Help · Shortcuts</div>
            <div className="modal-h">Keyboard reference</div>
          </div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="shortcuts">
            {rows.map(([l, k]) => (
              <div className="sc-row" key={l}>
                <span className="sc-label">{l}</span>
                <span className="sc-kbd">{k}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <span className="modal-hint">Cmd on Mac · Ctrl on Windows</span>
          <button className="btn" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}

function AboutSiteModal({ onClose }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <AldoLogo size={20} fill="var(--accent)"/>
          <div>
            <div className="modal-eyebrow">Help · About this site</div>
            <div className="modal-h">How the archive works</div>
          </div>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="about-site">
            <p>This archive is organized like a working desktop&mdash;files, folders, and projects you can explore.</p>
            <p>Select multiple images to build and export a deck. Share with your team, save for reference, or keep for inspiration.</p>
            <p>Everything is here: the full record, including rejected frames.</p>
          </div>
        </div>
        <div className="modal-foot">
          <span className="modal-hint">v2026.05 &middot; built for browsing &amp; export</span>
          <button className="btn" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ARCHIVE APP
   ============================================================ */
const INITIAL_WINDOWS = {
  about:     { id:'about',     kind:'about',     title:'about_me.txt',     path:'~/info',          x:  30, y: 30,  w: 460, h: 600, z: 4, minimized: false, mounted: true },
  portfolio: { id:'portfolio', kind:'portfolio', title:'Selected Work',    path:'~/portfolio',     x: 200, y: 60,  w: 760, h: 590, z: 7, minimized: false, mounted: true },
  clients:   { id:'clients',   kind:'clients',   title:'Clients.txt',      path:'~/about/clients', x: 760, y: 30,  w: 400, h: 540, z: 5, minimized: false, mounted: true },
};

function ArchiveApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [windows, setWindows] = aUseState(INITIAL_WINDOWS);
  const [order, setOrder] = aUseState(['about', 'clients', 'portfolio']);
  const [focused, setFocused] = aUseState('portfolio');
  const [ctx, setCtx] = aUseState(null);
  const [openPhoto, setOpenPhoto] = aUseState(null); // { photo, list }
  const [viewerWin, setViewerWin] = aUseState({ x: null, y: null, w: 1040, h: 720 });
  const [view, setView] = aUseState('grid');
  const [activeMobileTab, setActiveMobileTab] = aUseState('portfolio');
  const [mobileProject, setMobileProject] = aUseState(null);
  const [mobileFolders, setMobileFolders] = aUseState({});
  const [archiveFilter, setArchiveFilter] = aUseState(null);

  /* ============================================================
     TO-GO DECK SELECTION STATE
     ============================================================ */
  const [selectionMode, setSelectionMode] = aUseState(false);
  const [selectedIds, setSelectedIds] = aUseState([]);
  const [showExport, setShowExport] = aUseState(false);
  const [deck, setDeck] = aUseState(null); // when set, deck overlay is shown

  const toggleSelection = aUseCallback((id) => {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }, []);
  const removeFromSelection = aUseCallback((id) => {
    setSelectedIds(ids => ids.filter(x => x !== id));
  }, []);
  const clearSelection = aUseCallback(() => setSelectedIds([]), []);
  const reorderSelection = aUseCallback((fromIdx, toIdx) => {
    setSelectedIds(ids => {
      const next = [...ids];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, []);

  const generateDeck = aUseCallback((meta) => {
    const items = selectedIds
      .map(id => ARCHIVE.find(a => a.id === id))
      .filter(Boolean);
    setDeck({
      meta: {
        title: meta.title || 'Selected Work',
        recipient: meta.recipient || '',
        note: meta.note || '',
        layout: meta.layout || 'caption',
        date: new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }),
      },
      items,
    });
    // also stash in sessionStorage for users opening To-Go Deck.html directly
    try {
      sessionStorage.setItem('aldoDeck', JSON.stringify({
        meta: {
          title: meta.title || 'Selected Work',
          recipient: meta.recipient || '',
          note: meta.note || '',
          layout: meta.layout || 'caption',
          date: new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }),
        },
        items: items.map(it => ({
          id: it.id, name: it.name, client: it.client, type: it.type,
          date: it.date, dims: it.dims, size: it.size, photo: it.photo,
          note: it.note, project: it.project,
        })),
        accent: t ? t.accent : '#d63e5a',
      }));
    } catch (_) {}
  }, [selectedIds, t]);

  // when deck overlay is shown, mark <body> so the print stylesheet knows to
  // hide everything except the deck pages
  aUseEffect(() => {
    if (deck) document.body.classList.add('printing-deck');
    else document.body.classList.remove('printing-deck');
    return () => document.body.classList.remove('printing-deck');
  }, [deck]);

  /* hash routing — for embedding in mobile preview (?mode=mobile&section=portfolio) */
  aUseEffect(() => {
    const applyHash = () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const section = params.get('section');
      if (section && ['portfolio','archive','clients','about','contact'].includes(section)) {
        setActiveMobileTab(section);
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  /* apply tweaks */
  aUseEffect(() => {
    const tone = TONES[t.tone] || TONES.warm;
    const root = document.documentElement;
    root.style.setProperty('--paper', tone.paper);
    root.style.setProperty('--paper-soft', tone.paperSoft);
    root.style.setProperty('--rule', tone.rule);
    root.style.setProperty('--rule-soft', tone.ruleSoft);
    root.style.setProperty('--window', tone.window);
    root.style.setProperty('--accent', t.accent);
  }, [t.tone, t.accent]);

  aUseEffect(() => {
    const sat = (t.saturation / 100).toFixed(2);
    const css = `.portfolio .project .photo img, .thumb .pic img, .archive-table td .swatch img, .viewer .stage img, .mp-project .photo img, .m-viewer .stage img { filter: saturate(${sat}) contrast(1.02); }`;
    let el = document.getElementById('aldo-sat-style');
    if (!el) { el = document.createElement('style'); el.id = 'aldo-sat-style'; document.head.appendChild(el); }
    el.textContent = css;
  }, [t.saturation]);

  const focus = aUseCallback((id) => {
    setFocused(id);
    setOrder(o => [...o.filter(x => x !== id), id]);
  }, []);
  const move = aUseCallback((id, x, y) => setWindows(w => ({ ...w, [id]: { ...w[id], x, y } })), []);
  const resize = aUseCallback((id, w, h) => setWindows(ws => ({ ...ws, [id]: { ...ws[id], w, h } })), []);
  const minimize = aUseCallback((id) => setWindows(w => ({ ...w, [id]: { ...w[id], minimized: true } })), []);
  const close = aUseCallback((id) => setWindows(w => ({ ...w, [id]: { ...w[id], mounted: false, minimized: false } })), []);
  const maximize = aUseCallback((id) => setWindows(w => {
    const win = w[id];
    if (win._restore) return { ...w, [id]: { ...win, ...win._restore, _restore: null } };
    return { ...w, [id]: { ...win, _restore: { x: win.x, y: win.y, w: win.w, h: win.h }, x: 20, y: 50, w: window.innerWidth - 40, h: window.innerHeight - 100 } };
  }), []);

  const openWindow = aUseCallback((kind, opts = {}) => {
    const existing = Object.values(windows).find(w => w.kind === kind && w.mounted && (!opts.project || w.project === opts.project));
    if (existing) {
      setWindows(ws => ({ ...ws, [existing.id]: { ...ws[existing.id], minimized: false, mounted: true } }));
      focus(existing.id);
      return;
    }
    const id = kind + '_' + Date.now();
    const presets = {
      portfolio: { title:'Selected Work',        path: '~/portfolio',                       w: 760, h: 590 },
      archive:   { title:'ARCHIVE',              path: '~/archive',                         w: 940, h: 580 },
      services:  { title:'Services.txt',         path: '~/services',                        w: 520, h: 620 },
      clients:   { title:'Clients.txt',          path: '~/about/clients',                   w: 400, h: 540 },
      about:     { title:'about_me.txt',         path: '~/info',                            w: 460, h: 620 },
      contact:   { title:'Inquiry · contact.html', path:'~/contact',                        w: 480, h: 540 },
      project:   { title: opts.project ? opts.project.name : 'Project', path: opts.project ? `~/portfolio/${opts.project.id}` : '~/portfolio', w: 760, h: 600 },
    };
    const p = presets[kind] || { title: kind, w: 500, h: 400 };
    setWindows(ws => ({
      ...ws,
      [id]: {
        id, kind, mounted: true, minimized: false,
        x: Math.min(window.innerWidth - p.w - 40, 200 + Object.keys(ws).length * 28),
        y: Math.min(window.innerHeight - p.h - 60, 70 + Object.keys(ws).length * 28),
        w: p.w, h: p.h, z: 10,
        title: p.title, path: p.path,
        project: opts.project || null,
      },
    }));
    setOrder(o => [...o, id]);
    setFocused(id);
  }, [windows, focus]);

  const openPhotoViewer = aUseCallback((photo, list) => {
    setOpenPhoto({ photo, list: list || null });
  }, []);

  /* keyboard nav */
  aUseEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (openPhoto) {
        if (e.key === 'Escape') { setOpenPhoto(null); return; }
        const list = openPhoto.list || ARCHIVE;
        const i = list.findIndex(x => x.id === openPhoto.photo.id);
        if (e.key === 'ArrowRight' && i < list.length - 1) setOpenPhoto({ ...openPhoto, photo: list[i+1] });
        if (e.key === 'ArrowLeft' && i > 0) setOpenPhoto({ ...openPhoto, photo: list[i-1] });
        return;
      }
      if (e.key === 'Escape' && focused) close(focused);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openPhoto, focused, close]);

  const taskList = order.map(id => windows[id]).filter(w => w && w.mounted);
  const now = useNow();

  /* context menu on desktop */
  const onDesktopCtx = (e) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, items: [
      { label: 'Open — Portfolio',  kbd: '⌘1', action: () => openWindow('portfolio') },
      { label: 'Open — Archive',    kbd: '⌘2', action: () => openWindow('archive') },
      { label: 'Open — Clients',    kbd: '⌘3', action: () => openWindow('clients') },
      { label: 'Open — About',      kbd: '⌘4', action: () => openWindow('about') },
      { label: 'Open — Contact',    kbd: '⌘5', action: () => openWindow('contact') },
      '-',
      { label: 'Arrange by — Date', disabled: true },
      { label: 'Arrange by — Client', disabled: true },
    ]});
  };

  return (
    <>
    <div className="no-mobile" style={{height: '100%'}}>
      <MenuBar
        openWindow={openWindow}
        taskList={taskList}
        focused={focused}
        focus={focus}
        minimize={minimize}
        close={close}
        archiveSetSelectionMode={setSelectionMode}
        view={view}
        setView={setView}
        fmtDate={fmtDate}
        fmtTime={fmtTime}
      />

      <Sidebar
        openWindow={openWindow}
        activeKind={focused && windows[focused] ? windows[focused].kind : null}
        archiveFilter={archiveFilter}
        setArchiveFilter={setArchiveFilter}
        taskList={taskList}
      />

      <div className="desktop" onContextMenu={onDesktopCtx} onClick={() => setCtx(null)}>
        {/* WINDOWS */}
        {taskList.map(w => (
          <WindowHost
            key={w.id}
            win={w}
            z={order.indexOf(w.id) + 10}
            focused={focused === w.id}
            minimized={w.minimized}
            onMove={move} onResize={resize} onFocus={focus}
            onClose={close} onMinimize={minimize} onMaximize={maximize}
            onOpenPhoto={openPhotoViewer}
            onOpenProject={(p) => openWindow('project', { project: p })}
            view={view} setView={setView}
            archiveFilter={archiveFilter}
            setArchiveFilter={setArchiveFilter}
            selectionMode={selectionMode}
            setSelectionMode={setSelectionMode}
            selectedIds={selectedIds}
            toggleSelection={toggleSelection}
          />
        ))}

        {/* Photo viewer (modal on top) */}
        {openPhoto && (
          <AWin
            id="__viewer"
            title={openPhoto.photo.name || 'Photo'}
            path={openPhoto.photo.client}
            x={viewerWin.x != null ? viewerWin.x : Math.max(40, (window.innerWidth - Math.min(1040, window.innerWidth - 60))/2)}
            y={viewerWin.y != null ? viewerWin.y : 50}
            w={Math.min(viewerWin.w, window.innerWidth - 40)}
            h={Math.min(viewerWin.h, window.innerHeight - 90)}
            z={9100}
            focused={true}
            minimized={false}
            onMove={(_, x, y) => setViewerWin(v => ({ ...v, x, y }))}
            onResize={(_, w, h) => setViewerWin(v => ({ ...v, w, h }))}
            onFocus={() => {}}
            onClose={() => { setOpenPhoto(null); setViewerWin({ x: null, y: null, w: 1040, h: 720 }); }}
            onMinimize={() => { setOpenPhoto(null); setViewerWin({ x: null, y: null, w: 1040, h: 720 }); }}
            onMaximize={() => setViewerWin(v => ({ x: 20, y: 50, w: window.innerWidth - 40, h: window.innerHeight - 100 }))}
          >
            <PhotoViewer
              photo={openPhoto.photo}
              list={openPhoto.list || ARCHIVE}
              onPrev={() => {
                const list = openPhoto.list || ARCHIVE;
                const i = list.findIndex(x => x.id === openPhoto.photo.id);
                if (i > 0) setOpenPhoto({ ...openPhoto, photo: list[i-1] });
              }}
              onNext={() => {
                const list = openPhoto.list || ARCHIVE;
                const i = list.findIndex(x => x.id === openPhoto.photo.id);
                if (i >= 0 && i < list.length - 1) setOpenPhoto({ ...openPhoto, photo: list[i+1] });
              }}
            />
          </AWin>
        )}

        {ctx && <CtxMenu {...ctx} onClose={() => setCtx(null)}/>}

        {/* DOCK */}
        <div className="dock">
          {[
            { k: 'portfolio', g: 'portfolio', l: 'Portfolio' },
            { k: 'archive',   g: 'archive',   l: 'Archive'   },
            { k: 'services',  g: 'services',  l: 'Services'  },
            { k: 'clients',   g: 'clients',   l: 'Clients'   },
            { k: 'about',     g: 'about',     l: 'About'     },
            { k: 'contact',   g: 'contact',   l: 'Contact'   },
          ].map(d => {
            const open = taskList.some(w => w.kind === d.k && !w.minimized);
            return (
              <button key={d.k} className={`dock-item ${open ? 'active' : ''}`} onClick={() => openWindow(d.k)}>
                <DockGlyph kind={d.g}/>
                <span className="label-tip">{d.l}</span>
                {open && <span className="open-dot"/>}
              </button>
            );
          })}
        </div>
      </div>
    </div>

    {/* MOBILE */}
    <MobileShell
      active={activeMobileTab}
      setActive={setActiveMobileTab}
      project={mobileProject}
      setProject={setMobileProject}
      folders={mobileFolders}
      setFolders={setMobileFolders}
      openPhoto={openPhoto}
      setOpenPhoto={setOpenPhoto}
    />

    {/* SELECTION PANEL + EXPORT MODAL */}
    <SelectionPanel
      selectedIds={selectedIds}
      archive={ARCHIVE}
      onRemove={removeFromSelection}
      onReorder={reorderSelection}
      onClear={() => { clearSelection(); setSelectionMode(false); }}
      onExport={() => setShowExport(true)}
      accent={t.accent}
    />
    {showExport && (
      <ExportModal
        count={selectedIds.length}
        onCancel={() => setShowExport(false)}
        onGenerate={(meta) => { setShowExport(false); generateDeck(meta); }}
      />
    )}
    {deck && <DeckOverlay deck={deck} onClose={() => setDeck(null)}/>}

    {/* TWEAKS */}
    <TweaksPanel>
      <TweakSection label="Tone"/>
      <TweakRadio
        label="Background"
        value={t.tone}
        options={['warm','cool','neutral']}
        onChange={(v) => setTweak('tone', v)}
      />
      <TweakSection label="Accent"/>
      <TweakColor
        label="Coral pink"
        value={t.accent}
        options={['#d63e5a', '#b84a5c', '#c25068', '#a93d55']}
        onChange={(v) => setTweak('accent', v)}
      />
      <TweakSection label="Photographs"/>
      <TweakSlider
        label="Saturation"
        value={t.saturation}
        min={60} max={110} unit="%"
        onChange={(v) => setTweak('saturation', v)}
      />
    </TweaksPanel>
    </>
  );
}

/* ============================================================
   WINDOW HOST — content router
   ============================================================ */
function WindowHost({ win, z, focused, minimized, onMove, onResize, onFocus, onClose, onMinimize, onMaximize, onOpenPhoto, onOpenProject, view, setView, archiveFilter, setArchiveFilter, selectionMode, setSelectionMode, selectedIds, toggleSelection }) {
  let content, toolbar, statusbar;
  const baseCrumb = (parts) => (
    <div className="crumbs">
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="sep">/</span>}
          <span className={i === parts.length - 1 ? 'here' : ''}>{p}</span>
        </React.Fragment>
      ))}
    </div>
  );

  if (win.kind === 'portfolio') {
    toolbar = (
      <div className="window-toolbar">
        {baseCrumb(['~', 'portfolio', `${PROJECTS.length} projects`])}
        <div className="view-toggle">
          <button className={view==='grid' ? 'on' : ''} onClick={() => setView('grid')}>Grid</button>
          <button className={view==='list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
        </div>
      </div>
    );
    content = <Portfolio view={view} onOpenProject={onOpenProject}/>;
    statusbar = (
      <div className="window-statusbar">
        <span className="col"><b>{PROJECTS.length}</b> projects</span>
        <span className="col"><b>{PROJECTS.reduce((s,p) => s + p.count, 0)}</b> photographs</span>
        <span className="col"><b>2022 – 2024</b></span>
        <span className="spacer"/>
        <span>indexed today, 09:12</span>
      </div>
    );
  } else if (win.kind === 'archive') {
    content = <Archive
                key={archiveFilter ? `${archiveFilter.key}-${archiveFilter.value}` : 'all'}
                onOpenPhoto={onOpenPhoto}
                initialFilter={archiveFilter}
                onFilterChange={setArchiveFilter}
                selectionMode={selectionMode}
                setSelectionMode={setSelectionMode}
                selectedIds={selectedIds}
                toggleSelection={toggleSelection}
              />;
    statusbar = (
      <div className="window-statusbar">
        <span className="col"><b>{ARCHIVE.length}</b> files</span>
        <span className="col">≈18.4 GB indexed</span>
        <span className="spacer"/>
        <span>↑↓ list · ⏎ open · ⎋ close</span>
      </div>
    );
  } else if (win.kind === 'about') {
    toolbar = <div className="window-toolbar">{baseCrumb(['~', 'info', 'about_me.txt'])}</div>;
    content = <About/>;
    statusbar = (
      <div className="window-statusbar">
        <span className="col">utf-8 · plain</span>
        <span className="col">last edit · 05/17/2026</span>
        <span className="spacer"/>
        <span>1 / 1</span>
      </div>
    );
  } else if (win.kind === 'clients') {
    toolbar = <div className="window-toolbar">{baseCrumb(['~', 'about', 'clients.txt'])}</div>;
    content = <Clients/>;
  } else if (win.kind === 'services') {
    toolbar = <div className="window-toolbar">{baseCrumb(['~', 'services', 'services.txt'])}</div>;
    content = <Services/>;
  } else if (win.kind === 'contact') {
    toolbar = <div className="window-toolbar">{baseCrumb(['~', 'contact', 'inquiry.html'])}</div>;
    content = <Contact/>;
  } else if (win.kind === 'project') {
    toolbar = (
      <div className="window-toolbar">
        {baseCrumb(['~', 'portfolio', win.project.year, win.project.id])}
      </div>
    );
    content = <ProjectDetail project={win.project} onOpenPhoto={(p) => onOpenPhoto(p, ARCHIVE.filter(a => a.project === win.project.id))}/>;
    statusbar = (
      <div className="window-statusbar">
        <span className="col"><b>{win.project.client}</b></span>
        <span className="col">{win.project.count} photographs</span>
        <span className="col">{win.project.format}</span>
        <span className="spacer"/>
        <span>{win.project.month}</span>
      </div>
    );
  } else {
    content = <div style={{padding: 24}} className="mono">empty.</div>;
  }

  return (
    <AWin
      id={win.id}
      title={win.title}
      path={win.path}
      x={win.x} y={win.y} w={win.w} h={win.h}
      z={z}
      focused={focused} minimized={minimized}
      onMove={onMove} onResize={onResize} onFocus={onFocus}
      onClose={onClose} onMinimize={onMinimize} onMaximize={onMaximize}
      toolbar={toolbar}
      statusbar={statusbar}
    >
      {content}
    </AWin>
  );
}

/* ============================================================
   MOBILE SHELL
   ============================================================ */
function MobileShell({ active, setActive, project, setProject, folders, setFolders, openPhoto, setOpenPhoto }) {
  const tabs = [
    { k: 'portfolio', l: 'Portfolio' },
    { k: 'archive',   l: 'Archive'   },
    { k: 'services',  l: 'Services'  },
    { k: 'clients',   l: 'Clients'   },
    { k: 'about',     l: 'About'     },
    { k: 'contact',   l: 'Contact'   },
  ];

  const toggleFolder = (y) => setFolders(f => ({ ...f, [y]: !f[y] }));
  const years = [...new Set(ARCHIVE.map(a => a.year))].sort().reverse();

  let body;
  if (project) {
    const projectImages = ARCHIVE.filter(a => a.project === project.id);
    body = (
      <div className="mobile-page portfolio">
        <button className="btn ghost" onClick={() => setProject(null)} style={{marginBottom: 16}}>← back</button>
        <h2 className="headline" style={{fontSize: 24, margin: '0 0 4px'}}>{project.name}</h2>
        <div className="ui-label" style={{marginBottom:14}}>{project.client} · {project.year} · {project.type}</div>
        {project.note && <p style={{fontSize:14, color:'var(--ink-soft)', marginBottom:18, fontStyle:'italic'}}>"{project.note}"</p>}
        {projectImages.map((img) => (
          <div key={img.id} className="mp-project" onClick={() => setOpenPhoto({ photo: img, list: projectImages })}>
            <div className="photo"><img src={img.photo} alt={img.name}/></div>
            <div className="info"><div className="name">{img.name}</div><div className="year">{img.date ? img.date.slice(0,7) : project.month}</div></div>
          </div>
        ))}
      </div>
    );
  } else if (active === 'portfolio') {
    body = (
      <div className="mobile-page portfolio">
        {PROJECTS.map(p => (
          <div key={p.id} className="mp-project" onClick={() => setProject(p)}>
            <div className="photo"><img src={p.photo} alt={p.name}/></div>
            <div className="info">
              <div className="name">{p.name}</div>
              <div className="year">{p.year}</div>
            </div>
            <div className="meta">{p.client} · {p.format} · {p.count} photographs</div>
          </div>
        ))}
      </div>
    );
  } else if (active === 'archive') {
    body = (
      <div className="mobile-page archive">
        {years.map(y => {
          const items = ARCHIVE.filter(a => a.year === y);
          const collapsed = folders[y];
          return (
            <div key={y} className={`m-folder ${collapsed ? 'collapsed' : ''}`}>
              <div className="fhead" onClick={() => toggleFolder(y)}>
                <span className="yr">{y}</span>
                <span className="ct">{items.length} files {collapsed ? '+' : '−'}</span>
              </div>
              <div className="fbody">
                {items.map(it => (
                  <div key={it.id} className="thumb" onClick={() => setOpenPhoto({ photo: it, list: items })}>
                    <div className="pic"><img src={it.photo} alt={it.name}/></div>
                    <span className="name">{it.name}</span>
                    <span className="sub">{it.client} · {it.size}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (active === 'clients') {
    body = (
      <div className="mobile-page clients">
        <div className="m-clients">
          {CLIENTS.map(c => (
            <div key={c.name} className="row">
              <div className="name">{c.name}</div>
              <div className="range">{c.range}</div>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (active === 'services') {
    body = <div className="mobile-page services"><Services/></div>;
  } else if (active === 'about') {
    body = <div className="mobile-page about"><About/></div>;
  } else if (active === 'contact') {
    body = <div className="mobile-page contact"><Contact/></div>;
  }

  return (
    <div className="mobile-shell no-desktop">
      <div className="mobile-head">
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <AldoLogo size={26} fill="var(--accent)"/>
          <div>
            <h1>Aldo Carrera</h1>
            <div className="sub">Photographer · Los Angeles</div>
          </div>
        </div>
        <div className="mobile-tabs">
          {tabs.map(t => (
            <button key={t.k} className={`tab ${active === t.k && !project ? 'on' : ''}`} onClick={() => { setActive(t.k); setProject(null); }}>{t.l}</button>
          ))}
        </div>
      </div>
      {body}
      {openPhoto && (
        <div className="m-viewer">
          <div className="topbar">
            <span>{openPhoto.photo.client || ''}</span>
            <span onClick={() => setOpenPhoto(null)} style={{cursor:'pointer'}}>CLOSE ×</span>
          </div>
          <div className="stage" onClick={() => setOpenPhoto(null)}>
            <img src={openPhoto.photo.photo || openPhoto.photo.src} alt={openPhoto.photo.name}/>
          </div>
          <div className="info">
            <h3>{openPhoto.photo.name}</h3>
            <b>{openPhoto.photo.client}</b> · {openPhoto.photo.type || ''}<br/>
            {openPhoto.photo.date} · {openPhoto.photo.dims} · {openPhoto.photo.size}
            {openPhoto.photo.note && <><br/><span style={{color:'var(--ink-muted)'}}>"{openPhoto.photo.note}"</span></>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   LIVE DATA PROVIDER

   aldo-data.jsx fires an `aldo-ready` event when its initial API fetch
   has either succeeded, fallen back to localStorage, or timed out — at
   which point window.ALDO holds the freshest data we can muster. We BLOCK
   the first render until that's true so visitors don't see the hardcoded
   seed flash before being replaced by the API response.

   After that, `aldo-data-updated` fires on every refresh (tab focus,
   storage event, manual probe). We bump a key to remount the whole tree
   so memoized counts re-derive from the new ALDO arrays.
   ============================================================ */
function LiveDataProvider() {
  const [ready, setReady] = aUseState(!!window.__aldoReady);
  const [tick, setTick]   = aUseState(0);

  aUseEffect(() => {
    if (ready) return;
    const onReady = () => setReady(true);
    window.addEventListener('aldo-ready', onReady);
    // Safety: if the event already fired before our listener attached,
    // pick it up from the flag.
    if (window.__aldoReady) setReady(true);
    return () => window.removeEventListener('aldo-ready', onReady);
  }, [ready]);

  aUseEffect(() => {
    const onUpdate = () => setTick(t => t + 1);
    window.addEventListener('aldo-data-updated', onUpdate);
    return () => window.removeEventListener('aldo-data-updated', onUpdate);
  }, []);

  if (!ready) {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'grid', placeItems: 'center',
        background: 'var(--paper, #f1ede5)',
        color: 'var(--ink-soft, #7a7468)',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>
        <div style={{ textAlign: 'center', opacity: 0.7 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Aldo Carrera</div>
          <div>Loading archive…</div>
        </div>
      </div>
    );
  }
  return <ArchiveApp key={tick}/>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<LiveDataProvider/>);
