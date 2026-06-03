/* unified-gallery.jsx — client app for the unified gallery system.
 * Served at /ug/:token. Talks to /api/ug/*.
 *
 * Two modes:
 *   review   — SELECT/ALT/KILL labels, 1–5 stars, notes, markups (canvas
 *              drawing: freehand/rect/ellipse/arrow), submit. Version-aware
 *              (client always sees the MAIN version; feedback lands on it).
 *   delivery — clean download grid + lightbox.
 *
 * The canvas markup engine (coordinate math + draw + shape build/finalize)
 * is ported verbatim from the legacy gallery.html, using the corrected
 * _v:2 coordinate system (bounds account for the canvas→image offset).
 */

const { useState, useEffect, useRef, useCallback, useMemo } = React;

const API = (typeof window !== 'undefined' && window.UG_API) ? window.UG_API.replace(/\/$/, '') : '';

const TOOLS  = [
  { id: 'freehand', label: '✏', title: 'Freehand' },
  { id: 'ellipse',  label: '⬭', title: 'Circle' },
  { id: 'arrow',    label: '↗', title: 'Arrow' },
  { id: 'rect',     label: '▭', title: 'Rectangle' },
  { id: 'voice',    label: '🎤', title: 'Voice note — click image to record' },
];
const VOICE_MAX_SECONDS = 120;
const COLORS = ['#d63e5a', '#e85d5d', '#4fca7e', '#f5c842', '#ffffff'];

/* ── token + session key ──────────────────────────────── */
function getToken() {
  const m = window.location.pathname.match(/\/ug\/([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];
  return new URLSearchParams(window.location.search).get('token') || '';
}
const keyStore = {
  get: (t) => { try { return sessionStorage.getItem(`ug_key_${t}`) || ''; } catch { return ''; } },
  set: (t, k) => { try { sessionStorage.setItem(`ug_key_${t}`, k); } catch {} },
};

/* Add a ?w=N query to a src so the server serves a resized JPEG.
   Handles both unified-owned URLs (already have ?v=…) and migrated
   project URLs (often have no query). Resized images are aggressively
   cached server-side + at the CDN — each size renders once, then it's
   instant for everyone forever. */
function srcAtWidth(src, w) {
  if (!src || !w) return src;
  return src + (src.includes('?') ? '&' : '?') + 'w=' + w;
}

async function ugFetch(method, path, key, body) {
  const sep = path.includes('?') ? '&' : '?';
  const url = API + path + (key ? `${sep}key=${encodeURIComponent(key)}` : '');
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
  return r.status === 204 ? null : r.json();
}

/* ════════════════════════════════════════════════════════
   CANVAS COORDINATE MATH (ported from gallery.html, _v:2)
   ════════════════════════════════════════════════════════ */
function getImgBounds(imgEl) {
  const { naturalWidth: nw, naturalHeight: nh } = imgEl;
  const { width: cw, height: ch } = imgEl.getBoundingClientRect();
  if (!nw || !nh || !cw || !ch) return null;
  const scale = Math.min(cw / nw, ch / nh);
  const rw = nw * scale, rh = nh * scale;
  return { ox: (cw - rw) / 2, oy: (ch - rh) / 2, rw, rh };
}
function getImgBoundsV2(imgEl, canvas) {
  const v1 = getImgBounds(imgEl);
  if (!v1) return null;
  const cRect = canvas.getBoundingClientRect();
  const iRect = imgEl.getBoundingClientRect();
  return { ox: v1.ox + (iRect.left - cRect.left), oy: v1.oy + (iRect.top - cRect.top), rw: v1.rw, rh: v1.rh };
}
function clientToNorm(e, canvas, imgEl) {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
  const cy = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
  const b = getImgBoundsV2(imgEl, canvas);
  if (!b) return null;
  return { x: (cx - b.ox) / b.rw, y: (cy - b.oy) / b.rh };
}
function normToCanvas(nx, ny, b) { return { x: b.ox + nx * b.rw, y: b.oy + ny * b.rh }; }

function drawShape(ctx, b, tool, shape, color, highlight) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = highlight ? 2.5 : 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (highlight) { ctx.shadowBlur = 6; ctx.shadowColor = color; }
  if (tool === 'freehand' && shape?.points?.length > 1) {
    ctx.beginPath();
    const p0 = normToCanvas(shape.points[0][0], shape.points[0][1], b);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < shape.points.length; i++) { const p = normToCanvas(shape.points[i][0], shape.points[i][1], b); ctx.lineTo(p.x, p.y); }
    ctx.stroke();
  } else if (tool === 'ellipse' && shape) {
    const c = normToCanvas(shape.cx, shape.cy, b);
    ctx.beginPath(); ctx.ellipse(c.x, c.y, shape.rx * b.rw, shape.ry * b.rh, 0, 0, Math.PI * 2); ctx.stroke();
  } else if (tool === 'arrow' && shape) {
    const s = normToCanvas(shape.x1, shape.y1, b), e = normToCanvas(shape.x2, shape.y2, b);
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
    const a = Math.atan2(e.y - s.y, e.x - s.x), len = 14;
    ctx.beginPath(); ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x - len * Math.cos(a - 0.4), e.y - len * Math.sin(a - 0.4));
    ctx.lineTo(e.x - len * Math.cos(a + 0.4), e.y - len * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
  } else if (tool === 'rect' && shape) {
    const o = normToCanvas(shape.x, shape.y, b);
    ctx.beginPath(); ctx.rect(o.x, o.y, shape.w * b.rw, shape.h * b.rh); ctx.stroke();
  }
  ctx.restore();
}
function drawVoicePin(ctx, b, vm, isActive, isPending) {
  const pt = normToCanvas(vm.x, vm.y, b);
  const r  = isActive ? 14 : 11;
  ctx.save();
  if (isActive || isPending) {
    ctx.beginPath(); ctx.arc(pt.x, pt.y, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(246,194,207,0.25)'; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  ctx.fillStyle = isPending ? 'rgba(232,154,170,0.95)' : isActive ? 'rgba(246,194,207,0.95)' : 'rgba(246,194,207,0.80)';
  ctx.fill();
  ctx.strokeStyle = isPending ? '#c84a6a' : '#e89aaa';
  ctx.lineWidth = 2; ctx.stroke();
  // microphone glyph
  ctx.fillStyle = '#1a1714'; ctx.font = `${r}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🎤', pt.x, pt.y + 1);
  ctx.restore();
}

function buildPreviewShape(tool, start, current, pt) {
  if (tool === 'freehand') return { points: current.map(p => [p.x, p.y]) };
  if (tool === 'ellipse')  return { cx: (start.x + pt.x) / 2, cy: (start.y + pt.y) / 2, rx: Math.abs(pt.x - start.x) / 2, ry: Math.abs(pt.y - start.y) / 2 };
  if (tool === 'arrow')    return { x1: start.x, y1: start.y, x2: pt.x, y2: pt.y };
  if (tool === 'rect')     return { x: Math.min(start.x, pt.x), y: Math.min(start.y, pt.y), w: Math.abs(pt.x - start.x), h: Math.abs(pt.y - start.y) };
  return null;
}
function finalizeShape(tool, start, pt, current) {
  if (!start) return null;
  if (tool === 'freehand') { if (current.length < 3) return null; return { points: current.map(p => [p.x, p.y]) }; }
  if (tool === 'ellipse')  { const rx = Math.abs(pt.x - start.x) / 2, ry = Math.abs(pt.y - start.y) / 2; if (rx < 0.01 && ry < 0.01) return null; return { cx: (start.x + pt.x) / 2, cy: (start.y + pt.y) / 2, rx, ry }; }
  if (tool === 'arrow')    { const dx = pt.x - start.x, dy = pt.y - start.y; if (Math.hypot(dx, dy) < 0.02) return null; return { x1: start.x, y1: start.y, x2: pt.x, y2: pt.y }; }
  if (tool === 'rect')     { const w = Math.abs(pt.x - start.x), h = Math.abs(pt.y - start.y); if (w < 0.02 || h < 0.02) return null; return { x: Math.min(start.x, pt.x), y: Math.min(start.y, pt.y), w, h }; }
  return null;
}

/* ════════════════════════════════════════════════════════
   MARKUP CANVAS  (ref-based imperative drawing in React)
   ════════════════════════════════════════════════════════ */
function MarkupCanvas({ imgUrl, markups, voiceMarkups, activeVoiceId, pendingVoicePt, tool, color, onAdd, onVoiceClick, onVoiceTap, readOnly }) {
  const wrapRef = useRef(null), imgRef = useRef(null), canvasRef = useRef(null);
  const draw = useRef({ active: false, start: null, current: [] });
  // live refs so native listeners always see current props
  const toolRef = useRef(tool), colorRef = useRef(color), markupsRef = useRef(markups);
  const vmRef = useRef(voiceMarkups), avRef = useRef(activeVoiceId), pvRef = useRef(pendingVoicePt);
  toolRef.current = tool; colorRef.current = color; markupsRef.current = markups;
  vmRef.current = voiceMarkups; avRef.current = activeVoiceId; pvRef.current = pendingVoicePt;

  const redraw = useCallback((preview) => {
    const canvas = canvasRef.current, imgEl = imgRef.current;
    if (!canvas || !imgEl) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const b = getImgBoundsV2(imgEl, canvas);
    if (!b) return;
    for (const mk of (markupsRef.current || [])) drawShape(ctx, b, mk.tool, mk.shape, mk.color, false);
    if (preview) drawShape(ctx, b, toolRef.current, preview, colorRef.current, true);
    // Voice pins on top
    for (const vm of (vmRef.current || [])) drawVoicePin(ctx, b, vm, vm.id === avRef.current, false);
    if (pvRef.current) drawVoicePin(ctx, b, pvRef.current, false, true);
  }, []);

  // Redraw when markups / voice pins / image change
  useEffect(() => { redraw(); }, [markups, voiceMarkups, activeVoiceId, pendingVoicePt, imgUrl, redraw]);
  useEffect(() => {
    const imgEl = imgRef.current, wrap = wrapRef.current;
    if (!imgEl || !wrap) return;
    const onLoad = () => redraw();
    imgEl.addEventListener('load', onLoad);
    if (imgEl.complete && imgEl.naturalWidth) redraw();
    const ro = new ResizeObserver(() => redraw());
    ro.observe(wrap);
    return () => { imgEl.removeEventListener('load', onLoad); ro.disconnect(); };
  }, [redraw]);

  // Drawing handlers
  useEffect(() => {
    if (readOnly) return;
    const canvas = canvasRef.current, imgEl = imgRef.current;
    if (!canvas || !imgEl) return;
    const pt = (e) => clientToNorm(e, canvas, imgEl);

    const down = (e) => {
      const p = pt(e); if (!p) return;
      // Voice tool: tap the image to drop a pin + start recording (no drag).
      if (toolRef.current === 'voice') {
        if (onVoiceClick) onVoiceClick(p);
        return;
      }
      // Tapping an existing voice pin? (within ~22px) Let the caller play it.
      const canvas = canvasRef.current, imgEl = imgRef.current;
      const b = getImgBoundsV2(imgEl, canvas);
      if (b && onVoiceTap) {
        for (const vm of (vmRef.current || [])) {
          const c = normToCanvas(vm.x, vm.y, b);
          const r = e.clientX - canvas.getBoundingClientRect().left;
          const s = e.clientY - canvas.getBoundingClientRect().top;
          if (Math.hypot(c.x - r, c.y - s) < 16) { onVoiceTap(vm); return; }
        }
      }
      draw.current = { active: true, start: p, current: [p] };
    };
    const move = (e) => {
      if (!draw.current.active) return;
      const p = pt(e); if (!p) return;
      draw.current.current.push(p);
      redraw(buildPreviewShape(toolRef.current, draw.current.start, draw.current.current, p));
    };
    const up = (e) => {
      if (!draw.current.active) return;
      draw.current.active = false;
      const p = pt(e) || draw.current.current[draw.current.current.length - 1];
      const shape = finalizeShape(toolRef.current, draw.current.start, p, draw.current.current);
      draw.current.start = null; draw.current.current = [];
      if (shape) onAdd({ tool: toolRef.current, color: colorRef.current, shape });
      else redraw();
    };
    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', up);
    canvas.addEventListener('mouseleave', up);
    const ts = (e) => { e.preventDefault(); canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY })); };
    const tm = (e) => { e.preventDefault(); canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY })); };
    const te = (e) => { e.preventDefault(); canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY })); };
    canvas.addEventListener('touchstart', ts, { passive: false });
    canvas.addEventListener('touchmove', tm, { passive: false });
    canvas.addEventListener('touchend', te, { passive: false });
    return () => {
      canvas.removeEventListener('mousedown', down); canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mouseup', up); canvas.removeEventListener('mouseleave', up);
      canvas.removeEventListener('touchstart', ts); canvas.removeEventListener('touchmove', tm); canvas.removeEventListener('touchend', te);
    };
  }, [readOnly, onAdd, onVoiceClick, onVoiceTap, redraw]);

  return (
    <div className="gl-lb-img-wrap" ref={wrapRef}>
      <img className="gl-lb-img" src={imgUrl} alt="" draggable="false" ref={imgRef}/>
      <canvas className={`gl-lb-canvas ${readOnly ? 'read-only' : ''}`} ref={canvasRef}/>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   REVIEW LIGHTBOX
   ════════════════════════════════════════════════════════ */
function ReviewLightbox({ token, sessionKey, images, idx, setIdx, onClose, onFeedback, onMarkupAdd, onMarkupDelete, onMarkupComment, onVoiceAdded, onVoiceDeleted, showToast }) {
  const [tool, setTool]   = useState('rect');
  const [color, setColor] = useState(COLORS[0]);
  const [recState, setRecState] = useState(null); // null | 'recording' | 'uploading'
  const [pendingPt, setPendingPt] = useState(null);
  const [recSec, setRecSec] = useState(0);
  const [activeVoiceId, setActiveVoiceId] = useState(null);
  const recRef = useRef(null); // { mr, stream, chunks, x, y, timer }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && idx < images.length - 1) setIdx(idx + 1);
      if (e.key === 'ArrowLeft'  && idx > 0) setIdx(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, images.length, onClose, setIdx]);

  // Cleanup recording on image change / close
  useEffect(() => {
    return () => {
      if (recRef.current?.mr?.state === 'recording') recRef.current.mr.stop();
      if (recRef.current?.stream) recRef.current.stream.getTracks().forEach(t => t.stop());
      if (recRef.current?.timer) clearInterval(recRef.current.timer);
      recRef.current = null;
    };
  }, [idx]);

  const img = images[idx];
  if (!img) return null;
  const fb = img.feedback || { label: null, stars: 0, note: '', markups: [], voiceMarkups: [] };
  const voiceMarkups = fb.voiceMarkups || [];

  const startRecording = async (pt) => {
    if (recRef.current?.mr?.state === 'recording') return;
    setPendingPt(pt);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mr = new MediaRecorder(stream, { mimeType: mime });
      const chunks = [];
      mr.ondataavailable = (ev) => { if (ev.data?.size) chunks.push(ev.data); };
      mr.onstop = async () => {
        const rec = recRef.current; recRef.current = null;
        if (!rec) return;
        clearInterval(rec.timer);
        rec.stream.getTracks().forEach(t => t.stop());
        setRecState('uploading'); setRecSec(0);
        try {
          const blob = new Blob(chunks, { type: mr.mimeType || mime });
          const fd = new FormData();
          fd.append('audio', blob, `note.${mime.includes('mp4') ? 'm4a' : 'webm'}`);
          fd.append('x', String(rec.x)); fd.append('y', String(rec.y));
          const r = await fetch(`${API}/api/ug/${token}/feedback/${encodeURIComponent(img.filename)}/voice?key=${encodeURIComponent(sessionKey)}`, { method: 'POST', body: fd });
          if (!r.ok) throw new Error('upload_failed');
          const { voiceMarkup } = await r.json();
          onVoiceAdded(img.filename, voiceMarkup);
          setActiveVoiceId(voiceMarkup.id);
        } catch (e) { showToast && showToast('Upload failed'); }
        finally { setRecState(null); setPendingPt(null); }
      };
      recRef.current = { mr, stream, chunks, x: pt.x, y: pt.y };
      recRef.current.timer = setInterval(() => {
        setRecSec(s => {
          const n = s + 1;
          if (n >= VOICE_MAX_SECONDS && recRef.current?.mr?.state === 'recording') recRef.current.mr.stop();
          return n;
        });
      }, 1000);
      mr.start();
      setRecState('recording'); setRecSec(0);
    } catch (e) {
      setPendingPt(null);
      showToast && showToast('Microphone access denied');
    }
  };
  const stopRecording = () => { if (recRef.current?.mr?.state === 'recording') recRef.current.mr.stop(); };
  const deleteVoice = async (vmId) => {
    try { await ugFetch('DELETE', `/api/ug/${token}/feedback/${encodeURIComponent(img.filename)}/voice/${vmId}`, sessionKey); onVoiceDeleted(img.filename, vmId); if (activeVoiceId === vmId) setActiveVoiceId(null); }
    catch (e) { showToast && showToast('Delete failed'); }
  };

  return (
    <div className="gl-lightbox">
      <div className="gl-lb-top">
        <div className="gl-lb-name mono">{img.filename}{img.versionCount > 1 ? ` · ${img.versionId} of ${img.versionCount}` : ''}</div>
        <div className="gl-lb-counter mono">{idx + 1} / {images.length}</div>
        <button className="gl-lb-close" onClick={onClose}>×</button>
      </div>
      <div className="gl-lb-body">
        {/* left: tools */}
        <div className="gl-lb-palette">
          {TOOLS.map(t => (
            <button key={t.id} className={`gl-tool-btn ${tool === t.id ? 'active' : ''}`} title={t.title} onClick={() => setTool(t.id)}>{t.label}</button>
          ))}
          <div className="gl-palette-divider"/>
          {COLORS.map(c => (
            <button key={c} className={`gl-color-swatch ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)}/>
          ))}
        </div>
        {/* center: canvas */}
        <MarkupCanvas
          key={`${img.filename}:${img.versionId}`}
          imgUrl={srcAtWidth(img.src, 1600)}
          markups={fb.markups || []}
          voiceMarkups={voiceMarkups}
          activeVoiceId={activeVoiceId}
          pendingVoicePt={pendingPt}
          tool={tool} color={color}
          onAdd={(mk) => onMarkupAdd(img.filename, mk)}
          onVoiceClick={(pt) => { if (recState !== 'recording') startRecording(pt); }}
          onVoiceTap={(vm) => setActiveVoiceId(vm.id)}
          readOnly={false}
        />
        {/* right: panel */}
        <div className="gl-lb-panel">
          <div className="gl-lb-label-row">
            {['SELECT', 'ALT', 'KILL'].map(lbl => (
              <button key={lbl} className={`gl-lb-label-btn ${fb.label === lbl ? 'active-' + lbl : ''}`}
                onClick={() => onFeedback(img.filename, { label: fb.label === lbl ? null : lbl })}>{lbl}</button>
            ))}
          </div>
          <div className="gl-panel-stars">
            {[1,2,3,4,5].map(i => (
              <span key={i} className={`gl-star ${i <= (fb.stars || 0) ? 'filled' : ''}`}
                onClick={() => onFeedback(img.filename, { stars: fb.stars === i ? 0 : i })} style={{ cursor: 'pointer' }}>★</span>
            ))}
          </div>
          <textarea className="gl-panel-note" placeholder="Add a note…" defaultValue={fb.note || ''}
            onBlur={(e) => onFeedback(img.filename, { note: e.target.value })}
            style={{ width: '100%', minHeight: 70, marginTop: 12, fontFamily: 'inherit', padding: 8 }}/>
          <div className="gl-markup-list" style={{ marginTop: 12 }}>
            {(fb.markups || []).length === 0
              ? <div className="gl-markup-empty">Draw on the image to add markup.</div>
              : (fb.markups || []).map(mk => (
                <div key={mk.id} className="gl-markup-row" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                  <span className="gl-markup-dot" style={{ background: mk.color, width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }}/>
                  <input
                    className="gl-markup-input"
                    type="text"
                    defaultValue={mk.comment || ''}
                    placeholder="Add a note…"
                    onBlur={(e) => { if (e.target.value !== (mk.comment || '')) onMarkupComment(img.filename, mk.id, e.target.value); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                    style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', color: 'inherit', fontFamily: 'inherit', fontSize: 12, padding: '2px 0', outline: 'none' }}
                  />
                  <button className="gl-markup-del" onClick={() => onMarkupDelete(img.filename, mk.id)} style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.5, cursor: 'pointer', padding: '0 4px', fontSize: 14 }}>×</button>
                </div>
              ))}
          </div>
          {/* Recording status */}
          {recState === 'recording' && (
            <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(246,194,207,0.18)', border: '1px solid #e89aaa', borderRadius: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#c84a6a' }}/>
              <span>Recording · {Math.floor(recSec/60)}:{String(recSec%60).padStart(2,'0')}</span>
              <button onClick={stopRecording} style={{ marginLeft: 'auto', background: '#1a1714', color: '#fff', border: 'none', padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 3 }}>Stop</button>
            </div>
          )}
          {recState === 'uploading' && <div style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>Uploading & transcribing…</div>}
          {tool === 'voice' && !recState && voiceMarkups.length === 0 && (
            <div className="gl-markup-empty" style={{ marginTop: 12 }}>Tap the image to record a voice note at that spot.</div>
          )}
          {/* Voice markup list */}
          {voiceMarkups.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--rule, #555)', paddingTop: 12 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.5, marginBottom: 6 }}>Voice notes</div>
              {voiceMarkups.map(vm => (
                <div key={vm.id} style={{ marginBottom: 8, padding: 8, background: activeVoiceId === vm.id ? 'rgba(246,194,207,0.18)' : 'transparent', borderRadius: 4 }}>
                  <audio controls preload="none" style={{ width: '100%', height: 32 }}
                    src={`${API}/api/ug/${token}/feedback/${encodeURIComponent(img.filename)}/voice/${vm.id}?key=${encodeURIComponent(sessionKey)}`}/>
                  {vm.transcript && <div style={{ fontSize: 12, fontStyle: 'italic', marginTop: 4, opacity: 0.8 }}>"{vm.transcript}"</div>}
                  <button onClick={() => deleteVoice(vm.id)} style={{ marginTop: 4, fontSize: 10, background: 'none', border: 'none', color: '#c84a6a', cursor: 'pointer', padding: 0 }}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   DELIVERY LIGHTBOX (image + download only)
   ════════════════════════════════════════════════════════ */
function DeliveryLightbox({ img, onClose, onDownload }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="ug-deliver-lb" onClick={onClose}>
      <button className="ug-deliver-close" onClick={onClose}>× close</button>
      <img src={srcAtWidth(img.src, 1600)} alt={img.filename} onClick={(e) => e.stopPropagation()}/>
      <button className="ug-btn" style={{ position: 'absolute', bottom: '1.5rem' }}
        onClick={(e) => { e.stopPropagation(); onDownload(img.filename); }}>↓ Download</button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   UNLOCK
   ════════════════════════════════════════════════════════ */
function UnlockScreen({ token, onUnlocked }) {
  const [authType, setAuthType] = useState(null); // null | 'pin' | 'password'
  const [digits, setDigits] = useState(['', '', '', '']);
  const [pw, setPw]       = useState('');
  const [err, setErr]     = useState(null);
  const [busy, setBusy]   = useState(false);
  const refs = [useRef(), useRef(), useRef(), useRef()];

  // Peek to discover auth type. If open, auto-unlock.
  useEffect(() => {
    (async () => {
      try {
        const peek = await ugFetch('GET', `/api/ug/${token}/peek`, '');
        if (peek.authType === 'open') {
          const r = await ugFetch('POST', `/api/ug/${token}/unlock`, '', {});
          if (r?.ok) onUnlocked(r);
        } else {
          setAuthType(peek.authType);
        }
      } catch (_) { setAuthType('pin'); /* fallback */ }
    })();
  }, [token]);

  const submitPin = async (pin) => {
    setBusy(true); setErr(null);
    try { onUnlocked(await ugFetch('POST', `/api/ug/${token}/unlock`, '', { pin })); }
    catch (e) { setErr('Incorrect — try again'); setDigits(['','','','']); setTimeout(() => refs[0].current?.focus(), 50); }
    finally { setBusy(false); }
  };
  const submitPw = async (e) => {
    e?.preventDefault?.();
    if (!pw.trim()) return;
    setBusy(true); setErr(null);
    try { onUnlocked(await ugFetch('POST', `/api/ug/${token}/unlock`, '', { password: pw })); }
    catch (e2) { setErr('Incorrect — try again'); setPw(''); }
    finally { setBusy(false); }
  };

  const onDigit = (i, v) => {
    if (!/^\d?$/.test(v)) return;
    const next = [...digits]; next[i] = v; setDigits(next);
    if (v && i < 3) refs[i + 1].current?.focus();
    if (next.every(d => d) && next.join('').length === 4) submitPin(next.join(''));
  };

  useEffect(() => { if (authType === 'pin') refs[0].current?.focus(); }, [authType]);

  if (!authType) return <div className="ug-loading">—</div>;

  return (
    <div className="ug-unlock-wrap">
      <div className="ug-unlock-card">
        <div className="ug-unlock-eyebrow">Aldo Carrera · Private</div>
        <div className="ug-unlock-title">Gallery Access</div>
        {authType === 'pin' ? (
          <>
            <div className="ug-pin-inputs">
              {digits.map((d, i) => (
                <input key={i} ref={refs[i]} value={d} inputMode="numeric" maxLength={1}
                  onChange={(e) => onDigit(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Backspace' && !d && i > 0) refs[i - 1].current?.focus(); }}
                  disabled={busy}/>
              ))}
            </div>
            <div style={{ fontSize: '.58rem', letterSpacing: '.1em', textTransform: 'uppercase', opacity: .4 }}>
              Enter the 4-digit PIN
            </div>
          </>
        ) : (
          <form onSubmit={submitPw}>
            <input type="password" className="ug-pw-input" value={pw} autoFocus
              onChange={(e) => setPw(e.target.value)} placeholder="Password" disabled={busy}/>
            <button className="ug-btn" type="submit" disabled={busy || !pw.trim()} style={{ width: '100%' }}>
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
          </form>
        )}
        {err && <div className="ug-unlock-err">{err}</div>}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   ROOT
   ════════════════════════════════════════════════════════ */
function UnifiedGalleryApp() {
  const token = getToken();
  const [session, setSession] = useState(null); // { key, title, mode, features }
  const [images, setImages] = useState(null);
  const [lbIdx, setLbIdx] = useState(null);
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [zipping, setZipping] = useState(false);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  // Resume an existing session key
  useEffect(() => {
    const k = keyStore.get(token);
    if (!k) return;
    ugFetch('GET', `/api/ug/${token}/view`, k)
      .then(d => { setSession({ key: k, title: d.title, mode: d.mode, features: d.features }); setImages(d.images); })
      .catch(() => keyStore.set(token, '')); // stale key → fall back to unlock
  }, [token]);

  const onUnlocked = useCallback(async (r) => {
    keyStore.set(token, r.key);
    const d = await ugFetch('GET', `/api/ug/${token}/view`, r.key);
    setSession({ key: r.key, title: d.title, mode: d.mode, features: d.features });
    setImages(d.images);
  }, [token]);

  const onFeedback = useCallback(async (filename, patch) => {
    setImages(prev => prev.map(im => im.filename === filename ? { ...im, feedback: { ...(im.feedback || {}), ...patch } } : im));
    try { await ugFetch('PATCH', `/api/ug/${token}/feedback/${encodeURIComponent(filename)}`, session.key, patch); }
    catch (e) { showToast('Save failed'); }
  }, [token, session]);

  const onMarkupAdd = useCallback(async (filename, mk) => {
    try {
      const r = await ugFetch('POST', `/api/ug/${token}/feedback/${encodeURIComponent(filename)}/markup`, session.key, { markup: mk });
      setImages(prev => prev.map(im => im.filename === filename
        ? { ...im, feedback: { ...(im.feedback || {}), markups: [ ...((im.feedback || {}).markups || []), r.markup ] } }
        : im));
    } catch (e) { showToast('Markup failed'); }
  }, [token, session]);

  const onMarkupDelete = useCallback(async (filename, markupId) => {
    setImages(prev => prev.map(im => im.filename === filename
      ? { ...im, feedback: { ...(im.feedback || {}), markups: ((im.feedback || {}).markups || []).filter(m => m.id !== markupId) } }
      : im));
    try { await ugFetch('DELETE', `/api/ug/${token}/feedback/${encodeURIComponent(filename)}/markup/${markupId}`, session.key); }
    catch (e) { showToast('Delete failed'); }
  }, [token, session]);

  const onMarkupComment = useCallback(async (filename, markupId, comment) => {
    setImages(prev => prev.map(im => im.filename === filename
      ? { ...im, feedback: { ...(im.feedback || {}), markups: ((im.feedback || {}).markups || []).map(m => m.id === markupId ? { ...m, comment } : m) } }
      : im));
    try { await ugFetch('PATCH', `/api/ug/${token}/feedback/${encodeURIComponent(filename)}/markup/${markupId}`, session.key, { comment }); }
    catch (e) { showToast('Comment save failed'); }
  }, [token, session]);

  const onVoiceAdded = useCallback((filename, vm) => {
    setImages(prev => prev.map(im => im.filename === filename
      ? { ...im, feedback: { ...(im.feedback || {}), voiceMarkups: [ ...((im.feedback || {}).voiceMarkups || []), vm ] } }
      : im));
  }, []);
  const onVoiceDeleted = useCallback((filename, vmId) => {
    setImages(prev => prev.map(im => im.filename === filename
      ? { ...im, feedback: { ...(im.feedback || {}), voiceMarkups: ((im.feedback || {}).voiceMarkups || []).filter(v => v.id !== vmId) } }
      : im));
  }, []);

  const downloadOne = useCallback((filename) => {
    const a = document.createElement('a');
    a.href = `${API}/api/ug/${token}/download/${encodeURIComponent(filename)}?key=${encodeURIComponent(session.key)}`;
    a.download = filename; a.click();
  }, [token, session]);

  const downloadZip = useCallback(() => {
    setZipping(true); showToast('Preparing ZIP…');
    const a = document.createElement('a');
    a.href = `${API}/api/ug/${token}/download-zip?key=${encodeURIComponent(session.key)}`;
    a.click();
    setTimeout(() => { setZipping(false); setToast(null); }, 1500);
  }, [token, session]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try { await ugFetch('POST', `/api/ug/${token}/submit`, session.key, {}); showToast('Sent ✓'); }
    catch (e) { showToast('Something went wrong'); }
    finally { setSubmitting(false); }
  }, [token, session]);

  if (!token) return <div className="ug-loading">No gallery token.</div>;
  if (!session) return <><div className="ug-topbar"><span className="ug-brand">Aldo Carrera</span></div><UnlockScreen token={token} onUnlocked={onUnlocked}/></>;
  if (!images) return <div className="ug-loading">Loading…</div>;

  const isDelivery = session.mode === 'delivery';
  const labeledCount = images.filter(i => i.feedback?.label).length;

  return (
    <>
      {toast && <div className="ug-toast">{toast}</div>}
      <div className="ug-topbar">
        <span className="ug-brand">Aldo Carrera</span>
        {session.title && <span className="ug-title">{session.title}</span>}
      </div>
      <div className="ug-bar">
        <span className="ug-count">{images.length} images{!isDelivery && labeledCount ? ` · ${labeledCount} tagged` : ''}</span>
        <div className="ug-bar-actions">
          {session.features?.downloads && images.length > 0 && (
            <button className="ug-btn ghost" onClick={downloadZip} disabled={zipping}>{zipping ? 'Preparing…' : '↓ Download all'}</button>
          )}
          {!isDelivery && labeledCount > 0 && (
            <button className="ug-btn" onClick={submit} disabled={submitting}>{submitting ? 'Sending…' : `Submit ${labeledCount} selection${labeledCount !== 1 ? 's' : ''}`}</button>
          )}
        </div>
      </div>

      {images.length === 0
        ? <div className="ug-empty">No images yet.</div>
        : (
          <div className="ug-grid">
            {images.map((img, i) => (
              <div key={img.filename} className="ug-card" onClick={() => setLbIdx(i)}>
                <img src={srcAtWidth(img.src, 600)} alt={img.filename} loading="lazy"/>
                {!isDelivery && img.feedback?.label && <span className={`ug-card-badge ${img.feedback.label}`}>{img.feedback.label}</span>}
                {img.versionCount > 1 && <span className="ug-card-ver">{img.versionId}/{img.versionCount}</span>}
                {isDelivery && session.features?.downloads && (
                  <button className="ug-card-dl" title="Download" onClick={(e) => { e.stopPropagation(); downloadOne(img.filename); }}>↓</button>
                )}
              </div>
            ))}
          </div>
        )}

      {lbIdx !== null && !isDelivery && (
        <ReviewLightbox token={token} sessionKey={session.key} images={images} idx={lbIdx} setIdx={setLbIdx}
          onClose={() => setLbIdx(null)} onFeedback={onFeedback} onMarkupAdd={onMarkupAdd} onMarkupDelete={onMarkupDelete}
          onMarkupComment={onMarkupComment} onVoiceAdded={onVoiceAdded} onVoiceDeleted={onVoiceDeleted} showToast={showToast}/>
      )}
      {lbIdx !== null && isDelivery && (
        <DeliveryLightbox img={images[lbIdx]} onClose={() => setLbIdx(null)} onDownload={downloadOne}/>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('ug-root')).render(<UnifiedGalleryApp/>);
