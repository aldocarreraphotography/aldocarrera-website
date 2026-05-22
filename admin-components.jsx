/* admin-components.jsx — primitive controls used throughout the admin.
   Style language matches the public site: mono-uppercase labels, hairline
   rules, ink-on-paper, accent-coral only for focus + primary actions. */

const { useState: uS, useEffect: uE, useRef: uR, useMemo: uM, useCallback: uCb } = React;

/* ------------------------------------------------------------------ */
/* Button                                                             */
/* ------------------------------------------------------------------ */
function Btn({ children, variant = 'primary', size = 'md', icon, disabled, onClick, type, title }) {
  const cls = ['ad-btn', `ad-btn-${variant}`, `ad-btn-${size}`].join(' ');
  return (
    <button className={cls} type={type || 'button'} disabled={disabled} onClick={onClick} title={title}>
      {icon && <span className="ad-btn-icon">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Field — labeled wrapper for inputs                                 */
/* ------------------------------------------------------------------ */
function Field({ label, hint, children, error, wide, inline }) {
  return (
    <label className={`ad-field ${wide ? 'ad-field-wide' : ''} ${inline ? 'ad-field-inline' : ''}`}>
      <span className="ad-field-label">{label}</span>
      <div className="ad-field-control">{children}</div>
      {hint && !error && <span className="ad-field-hint">{hint}</span>}
      {error && <span className="ad-field-error">{error}</span>}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, type, autoFocus, disabled }) {
  return (
    <input
      className="ad-input"
      type={type || 'text'}
      value={value ?? ''}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      onChange={(e) => onChange && onChange(e.target.value)}
    />
  );
}
function TextArea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea
      className="ad-input ad-textarea"
      rows={rows}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange && onChange(e.target.value)}
    />
  );
}
function Select({ value, onChange, options, placeholder }) {
  return (
    <div className="ad-select-wrap">
      <select
        className="ad-input ad-select"
        value={value ?? ''}
        onChange={(e) => onChange && onChange(e.target.value)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => {
          const v = typeof opt === 'string' ? opt : opt.value;
          const l = typeof opt === 'string' ? opt : opt.label;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
      <span className="ad-select-chev" aria-hidden>▾</span>
    </div>
  );
}
function Radio({ value, onChange, options, name }) {
  return (
    <div className="ad-radio-row" role="radiogroup">
      {options.map(opt => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const l = typeof opt === 'string' ? opt : opt.label;
        return (
          <label key={v} className={`ad-radio ${value === v ? 'on' : ''}`}>
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
            <span>{l}</span>
          </label>
        );
      })}
    </div>
  );
}
function Toggle({ value, onChange, label }) {
  return (
    <button type="button" className={`ad-toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}>
      <span className="ad-toggle-track"><span className="ad-toggle-knob"/></span>
      {label && <span className="ad-toggle-label">{label}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Card / Section                                                     */
/* ------------------------------------------------------------------ */
function Card({ children, padding = 'lg', className }) {
  return <div className={`ad-card ad-card-pad-${padding} ${className || ''}`}>{children}</div>;
}
function SectionHead({ eyebrow, title, sub, actions }) {
  return (
    <div className="ad-section-head">
      <div className="ad-section-head-text">
        {eyebrow && <div className="ad-eyebrow">{eyebrow}</div>}
        <h1 className="ad-section-title">{title}</h1>
        {sub && <div className="ad-section-sub">{sub}</div>}
      </div>
      {actions && <div className="ad-section-actions">{actions}</div>}
    </div>
  );
}
function PageHeader({ crumbs, title, eyebrow, actions }) {
  return (
    <header className="ad-page-header">
      <div className="ad-crumbs">
        {(crumbs || []).map((c, i) => (
          <React.Fragment key={i}>
            {c.href
              ? <a className="ad-crumb" href={c.href}>{c.label}</a>
              : <span className="ad-crumb ad-crumb-here">{c.label}</span>}
            {i < crumbs.length - 1 && <span className="ad-crumb-sep">/</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="ad-page-title-row">
        <div>
          {eyebrow && <div className="ad-eyebrow">{eyebrow}</div>}
          <h1 className="ad-page-title">{title}</h1>
        </div>
        {actions && <div className="ad-section-actions">{actions}</div>}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Status pill / Empty / Loading                                      */
/* ------------------------------------------------------------------ */
function Pill({ tone, children }) {
  return <span className={`ad-pill ad-pill-${tone || 'neutral'}`}>{children}</span>;
}
function Empty({ title, sub, action }) {
  return (
    <div className="ad-empty">
      <div className="ad-empty-mark">∅</div>
      <div className="ad-empty-title">{title}</div>
      {sub && <div className="ad-empty-sub">{sub}</div>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                              */
/* ------------------------------------------------------------------ */
function Modal({ open, onClose, title, eyebrow, children, footer, width = 480 }) {
  uE(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="ad-modal-scrim" onMouseDown={onClose}>
      <div className="ad-modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <header className="ad-modal-head">
          <div>
            {eyebrow && <div className="ad-eyebrow">{eyebrow}</div>}
            <div className="ad-modal-title">{title}</div>
          </div>
          <button className="ad-modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="ad-modal-body">{children}</div>
        {footer && <footer className="ad-modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dropzone                                                           */
/* ------------------------------------------------------------------ */
function Dropzone({ onFiles, accept = 'image/*', multiple = true, label, hint }) {
  const [drag, setDrag] = uS(false);
  const inputRef = uR(null);
  const handle = (files) => {
    if (!files || !files.length) return;
    const arr = Array.from(files).filter(f => !accept || accept === '*' || f.type.match(accept.replace('*', '.*')));
    if (arr.length) onFiles(arr);
  };
  return (
    <div
      className={`ad-dropzone ${drag ? 'ad-dropzone-active' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
      onClick={() => inputRef.current && inputRef.current.click()}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={(e) => handle(e.target.files)}
      />
      <div className="ad-dropzone-mark">↑</div>
      <div className="ad-dropzone-label">{label || 'Drop photos here, or click to browse'}</div>
      {hint && <div className="ad-dropzone-hint">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Image thumb (resolves blobPath → URL via useImageURL hook)         */
/* ------------------------------------------------------------------ */
function Thumb({ blobPath, alt, aspect = '4/5', placeholder, focalX, focalY }) {
  const url = window.useImageURL(blobPath);
  const focalStyle = (focalX != null && focalY != null)
    ? { objectPosition: `${focalX}% ${focalY}%` }
    : undefined;
  return (
    <div className="ad-thumb" style={{ aspectRatio: aspect }}>
      {url
        ? <img src={url} alt={alt || ''} loading="lazy" style={focalStyle}/>
        : <div className="ad-thumb-placeholder">{placeholder || '◌'}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reorderable list (simple drag-handle approach)                      */
/* ------------------------------------------------------------------ */
function ReorderList({ items, onReorder, renderItem, keyFn }) {
  const [dragId, setDragId] = uS(null);
  const [overId, setOverId] = uS(null);

  const handleDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (id !== dragId) setOverId(id);
  };
  const handleDrop = () => {
    if (dragId == null || overId == null || dragId === overId) {
      setDragId(null); setOverId(null);
      return;
    }
    const idx = items.findIndex(x => keyFn(x) === dragId);
    const tIdx = items.findIndex(x => keyFn(x) === overId);
    const next = items.slice();
    const [moved] = next.splice(idx, 1);
    next.splice(tIdx, 0, moved);
    onReorder(next);
    setDragId(null); setOverId(null);
  };

  return (
    <div className="ad-reorder">
      {items.map((it) => {
        const id = keyFn(it);
        return (
          <div
            key={id}
            className={`ad-reorder-row ${overId === id ? 'over' : ''} ${dragId === id ? 'dragging' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, id)}
            onDragOver={(e) => handleDragOver(e, id)}
            onDrop={handleDrop}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
          >
            <span className="ad-reorder-grip" aria-hidden>⋮⋮</span>
            <div style={{ flex: 1 }}>{renderItem(it)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toast                                                              */
/* ------------------------------------------------------------------ */
let toastId = 0;
const toastListeners = new Set();
function toast(message, tone = 'info') {
  const id = ++toastId;
  toastListeners.forEach(fn => fn({ id, message, tone, action: 'add' }));
  setTimeout(() => toastListeners.forEach(fn => fn({ id, action: 'remove' })), 3200);
}
function ToastHost() {
  const [items, setItems] = uS([]);
  uE(() => {
    const fn = (evt) => {
      if (evt.action === 'add') setItems(prev => [...prev, evt]);
      if (evt.action === 'remove') setItems(prev => prev.filter(x => x.id !== evt.id));
    };
    toastListeners.add(fn);
    return () => toastListeners.delete(fn);
  }, []);
  return (
    <div className="ad-toast-host">
      {items.map(t => (
        <div key={t.id} className={`ad-toast ad-toast-${t.tone}`}>{t.message}</div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function formatBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function formatDate(iso, opts) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', opts || { year:'numeric', month:'short', day:'numeric' }); }
  catch (_) { return iso; }
}
function formatRel(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff/86400)}d ago`;
  return formatDate(iso, { month: 'short', day: 'numeric' });
}

Object.assign(window, {
  Btn, Field, TextInput, TextArea, Select, Radio, Toggle,
  Card, SectionHead, PageHeader, Pill, Empty,
  Modal, Dropzone, Thumb, ReorderList, ToastHost, toast,
  formatBytes, formatDate, formatRel,
});
