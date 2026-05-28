/* client-gallery.jsx
 * Standalone React SPA for the client gallery portal.
 * Served at /g/:token  (or /g?token=...)
 * All API calls go to https://api.aldocarrera.com/api/gallery-portals/:token/*
 */

const { useState, useEffect, useRef, useCallback, useMemo } = React;

/* ── Helpers ─────────────────────────────────────────────── */
function getToken() {
  // Try /g/TOKEN path first, then ?token= param
  const path = window.location.pathname;
  const match = path.match(/\/g\/([A-Z0-9]{4,12})/i);
  if (match) return match[1].toUpperCase();
  return new URLSearchParams(window.location.search).get('token') || '';
}

function getStoredKey(token) {
  try { return sessionStorage.getItem(`cg_key_${token}`) || ''; } catch (_) { return ''; }
}
function storeKey(token, key) {
  try { sessionStorage.setItem(`cg_key_${token}`, key); } catch (_) {}
}

const GALLERY_API = (typeof window !== 'undefined' && window.GALLERY_API) ? window.GALLERY_API.replace(/\/$/, '') : '';

async function apiFetch(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(GALLERY_API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error || `HTTP ${res.status}`), { status: res.status });
  }
  return res.json();
}

/* ── Debounce hook ───────────────────────────────────────── */
function useDebounce(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

/* ── PIN SCREEN ──────────────────────────────────────────── */
function PinScreen({ token, onUnlocked }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const refs = [useRef(), useRef(), useRef(), useRef()];

  const pin = digits.join('');

  const handleDigit = (i, val) => {
    const v = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    setError('');
    if (v && i < 3) refs[i + 1].current?.focus();
    // Auto-submit when last digit entered
    if (v && i === 3) {
      const fullPin = [...next].join('');
      if (fullPin.length === 4) setTimeout(() => submit(fullPin), 0);
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs[i - 1].current?.focus();
    }
    if (e.key === 'Enter' && pin.length === 4) submit(pin);
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', ''];
    for (let j = 0; j < pasted.length; j++) next[j] = pasted[j];
    setDigits(next);
    if (pasted.length === 4) setTimeout(() => submit(pasted), 0);
    else refs[pasted.length]?.current?.focus();
  };

  const submit = async (p = pin) => {
    if (p.length !== 4 || loading) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('POST', `/api/gallery-portals/${token}/unlock`, { pin: p });
      storeKey(token, data.key);
      onUnlocked({ key: data.key, title: data.title, imageCount: data.imageCount });
    } catch (err) {
      setError(err.status === 403 ? 'Incorrect PIN — please try again.' : 'Something went wrong.');
      setDigits(['', '', '', '']);
      setTimeout(() => refs[0].current?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refs[0].current?.focus(); }, []);

  return (
    <div className="cg-pin-wrap">
      <div className="cg-pin-card">
        <div className="cg-pin-eyebrow">Aldo Carrera · Private Preview</div>
        <div className="cg-pin-heading">Gallery Access</div>
        <div className="cg-pin-inputs" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              className={`cg-pin-digit ${d ? 'has-val' : ''}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              autoComplete="one-time-code"
            />
          ))}
        </div>
        <button
          className="cg-pin-btn"
          onClick={() => submit()}
          disabled={pin.length !== 4 || loading}
        >
          {loading ? 'Checking…' : 'Unlock →'}
        </button>
        {error && <div className="cg-pin-error">{error}</div>}
      </div>
    </div>
  );
}

/* ── HEART BUTTON ────────────────────────────────────────── */
function HeartBtn({ hearted, onClick, big }) {
  return (
    <button
      className={`${big ? 'cg-lb-heart-big' : 'cg-heart-btn'} ${hearted ? 'on' : ''}`}
      onClick={onClick}
      title={hearted ? 'Remove heart' : 'Heart this image'}
    >
      {hearted ? '♥' : '♡'}
    </button>
  );
}

/* ── LIGHTBOX ────────────────────────────────────────────── */
/* ── VoiceRecorder — per-image client voice feedback ───── */
const VOICE_MAX_SECONDS = 60;

function VoiceRecorder({ token, sessionKey, filename, voiceNote, onChange }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed]     = useState(0);
  const [err, setErr]             = useState(null);
  const mrRef    = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mrRef.current?.state === 'recording') mrRef.current.stop();
  }, []);

  const start = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size > 0) await upload(blob);
      };
      mr.start();
      mrRef.current = mr;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          const next = prev + 1;
          if (next >= VOICE_MAX_SECONDS && mrRef.current?.state === 'recording') {
            mrRef.current.stop();
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      setErr(e.name === 'NotAllowedError' ? 'Microphone access denied.' : `Couldn't start recording: ${e.message}`);
    }
  };

  const stop = () => {
    if (mrRef.current?.state === 'recording') mrRef.current.stop();
  };

  const upload = async (blob) => {
    setUploading(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append('audio', blob, 'note.' + (blob.type.includes('mp4') ? 'm4a' : 'webm'));
      const r = await fetch(
        `${GALLERY_API}/api/gallery-portals/${token}/voice/${encodeURIComponent(filename)}?key=${encodeURIComponent(sessionKey)}`,
        { method: 'POST', body: form }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      onChange(data.voiceNote);
    } catch (e) {
      console.error('[voice] upload failed:', e);
      setErr('Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!confirm('Delete this voice note?')) return;
    try {
      await fetch(
        `${GALLERY_API}/api/gallery-portals/${token}/voice/${encodeURIComponent(filename)}?key=${encodeURIComponent(sessionKey)}`,
        { method: 'DELETE' }
      );
      onChange(null);
    } catch (e) {
      console.error('[voice] delete failed:', e);
    }
  };

  if (uploading) {
    return <div className="cg-voice cg-voice-state">Uploading & transcribing…</div>;
  }

  if (recording) {
    return (
      <div className="cg-voice cg-voice-recording">
        <button className="cg-voice-stop" onClick={stop} type="button">
          <span className="cg-voice-dot"/> Stop · {elapsed}s
        </button>
        <span className="cg-voice-hint">tap to finish (auto-stops at {VOICE_MAX_SECONDS}s)</span>
      </div>
    );
  }

  if (voiceNote) {
    const audioSrc = `${GALLERY_API}/api/gallery-portals/${token}/voice/${encodeURIComponent(filename)}?key=${encodeURIComponent(sessionKey)}&v=${encodeURIComponent(voiceNote.recordedAt || '')}`;
    return (
      <div className="cg-voice cg-voice-has">
        <audio controls src={audioSrc} preload="metadata"/>
        {voiceNote.transcript && (
          <div className="cg-voice-transcript">"{voiceNote.transcript}"</div>
        )}
        <div className="cg-voice-actions">
          <button className="cg-voice-btn" onClick={start} type="button">Re-record</button>
          <button className="cg-voice-btn cg-voice-del" onClick={remove} type="button">Delete</button>
        </div>
      </div>
    );
  }

  return (
    <div className="cg-voice">
      <button className="cg-voice-record" onClick={start} type="button">
        <span className="cg-voice-mic">●</span> Record voice note
      </button>
      {err && <div className="cg-voice-err">{err}</div>}
    </div>
  );
}

function Lightbox({ images, idx, selects, token, sessionKey, onClose, onNav, onHeart, onNote, onVoice }) {
  const img = images[idx];
  const sel = selects[img?.filename] || {};
  const [note, setNote] = useState(sel.note || '');
  const saveNote = useDebounce(
    useCallback((fn, val) => onNote(fn, val), [onNote]),
    800
  );

  useEffect(() => {
    setNote((selects[img?.filename] || {}).note || '');
  }, [img?.filename]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft'  && idx > 0)               onNav(idx - 1);
      if (e.key === 'ArrowRight' && idx < images.length - 1) onNav(idx + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, images.length, onClose, onNav]);

  if (!img) return null;

  const handleNote = (val) => {
    setNote(val);
    saveNote(img.filename, val);
  };

  return (
    <div className="cg-lb-scrim">
      <div className="cg-lb-top">
        <div className="cg-lb-filename">{img.filename}</div>
        {img.dims && (
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>{img.dims}</span>
        )}
        <button className="cg-lb-close" onClick={onClose}>×</button>
      </div>
      <div className="cg-lb-stage">
        <img src={img.src} alt={img.filename}/>
        {idx > 0 && (
          <button className="cg-lb-nav cg-lb-prev" onClick={() => onNav(idx - 1)}>‹</button>
        )}
        {idx < images.length - 1 && (
          <button className="cg-lb-nav cg-lb-next" onClick={() => onNav(idx + 1)}>›</button>
        )}
      </div>
      <div className="cg-lb-bottom">
        <HeartBtn
          big
          hearted={sel.hearted}
          onClick={() => onHeart(img.filename, !sel.hearted)}
        />
        <div className="cg-lb-feedback">
          <textarea
            className="cg-lb-note"
            placeholder="Leave a note…"
            value={note}
            onChange={e => handleNote(e.target.value)}
            rows={2}
          />
          <VoiceRecorder
            token={token}
            sessionKey={sessionKey}
            filename={img.filename}
            voiceNote={sel.voiceNote || null}
            onChange={(vn) => onVoice(img.filename, vn)}
          />
        </div>
      </div>
    </div>
  );
}

/* ── GALLERY VIEW ────────────────────────────────────────── */
function GalleryView({ token, sessionKey, title }) {
  const [images, setImages]       = useState([]);
  const [selects, setSelects]     = useState({});
  const [loading, setLoading]     = useState(true);
  const [lbIdx, setLbIdx]         = useState(null); // null = closed
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]           = useState(null); // null | string
  const [downloadsEnabled, setDownloadsEnabled] = useState(false);
  const [zipping, setZipping]       = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('GET', `/api/gallery-portals/${token}/images?key=${encodeURIComponent(sessionKey)}`);
        setImages(data.images || []);
        setDownloadsEnabled(!!data.downloadsEnabled);
        // (submitted state handled via toast only)
        // hydrate selects map from returned per-image select data
        const sels = {};
        for (const img of (data.images || [])) sels[img.filename] = img.select || {};
        setSelects(sels);
      } catch (err) {
        console.error('[client-gallery] load error', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, sessionKey]);

  const downloadAllZip = useCallback(async () => {
    if (zipping) return;
    setZipping(true);
    showToast('Preparing ZIP…');
    try {
      const url = `${GALLERY_API}/api/gallery-portals/${token}/download-zip?key=${encodeURIComponent(sessionKey)}`;
      // Use anchor click so the browser handles the download stream
      const a = document.createElement('a');
      a.href = url;
      a.rel  = 'noopener';
      a.click();
      try { window.plausible && window.plausible('Gallery Download Zip', { props: { gallery: token || '' } }); } catch (_) {}
      setTimeout(() => { setZipping(false); setToast(null); }, 1500);
    } catch (err) {
      console.error('[client-gallery] zip error', err);
      showToast('Download failed — try again');
      setZipping(false);
    }
  }, [token, sessionKey, zipping]);

  const downloadOne = useCallback((filename) => {
    const url = `${GALLERY_API}/api/gallery-portals/${token}/download/${encodeURIComponent(filename)}?key=${encodeURIComponent(sessionKey)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel  = 'noopener';
    a.click();
    try { window.plausible && window.plausible('Gallery Download One', { props: { gallery: token || '' } }); } catch (_) {}
  }, [token, sessionKey]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await apiFetch('POST', `/api/gallery-portals/${token}/submit?key=${encodeURIComponent(sessionKey)}`);
      try { window.plausible && window.plausible('Gallery Submit', { props: { gallery: token || '' } }); } catch (_) {}
      showToast('Sent ✓');
    } catch (err) {
      console.error('[client-gallery] submit error', err);
      showToast('Something went wrong — try again');
    } finally {
      setSubmitting(false);
    }
  }, [token, sessionKey, submitting]);

  const heartedCount = useMemo(
    () => Object.values(selects).filter(s => s.hearted).length,
    [selects]
  );

  const patchSelect = useCallback(async (filename, patch) => {
    // Optimistic update
    setSelects(prev => ({ ...prev, [filename]: { ...prev[filename], ...patch } }));
    try {
      await apiFetch(
        'PATCH',
        `/api/gallery-portals/${token}/select/${encodeURIComponent(filename)}?key=${encodeURIComponent(sessionKey)}`,
        patch
      );
    } catch (err) {
      console.error('[client-gallery] patch error', err);
      // Revert on failure
      setSelects(prev => ({ ...prev, [filename]: { ...prev[filename] } }));
    }
  }, [token, sessionKey]);

  const handleHeart = (filename, val) => {
    patchSelect(filename, { hearted: val });
  };

  /* Voice note updates come back from VoiceRecorder after the audio is
     uploaded — we just mirror the result into local selects so the UI
     reflects it without a round-trip. Set to null on delete. */
  const handleVoice = useCallback((filename, voiceNote) => {
    setSelects(prev => {
      const next = { ...(prev[filename] || {}) };
      if (voiceNote) next.voiceNote = voiceNote;
      else           delete next.voiceNote;
      return { ...prev, [filename]: next };
    });
  }, []);

  const saveNote = useCallback((filename, note) => {
    patchSelect(filename, { note });
  }, [patchSelect]);

  if (loading) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', color: 'var(--ink-muted)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, letterSpacing: '0.1em' }}>
        Loading…
      </div>
    );
  }

  return (
    <>
      {toast && <div className="cg-toast">{toast}</div>}
      <div className="cg-gallery-wrap">
        <div className="cg-gallery-header">
          <div className="cg-gallery-title">{title}</div>
          <div className="cg-gallery-header-right">
            <div className="cg-gallery-count">
              {images.length} images{heartedCount > 0 ? ` · ${heartedCount} hearted` : ''}
            </div>
            {downloadsEnabled && images.length > 0 && (
              <button
                className="cg-download-all-btn"
                onClick={downloadAllZip}
                disabled={zipping}
                title="Download all images as a ZIP"
              >
                {zipping ? 'Preparing…' : '↓ Download all'}
              </button>
            )}
            {heartedCount > 0 && (
              <button
                className="cg-submit-btn"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {`Submit ${heartedCount} selection${heartedCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
        {images.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--ink-muted)' }}>
            No images available.
          </div>
        ) : (
          <div className="cg-grid">
            {images.map((img, i) => {
              const sel = selects[img.filename] || {};
              return (
                <div key={img.filename} className="cg-card">
                  <img
                    src={img.src}
                    alt={img.filename}
                    loading="lazy"
                    onClick={() => setLbIdx(i)}
                  />
                  <HeartBtn
                    hearted={sel.hearted}
                    onClick={(e) => { e.stopPropagation(); handleHeart(img.filename, !sel.hearted); }}
                  />
                  {downloadsEnabled && (
                    <button
                      className="cg-download-btn"
                      onClick={(e) => { e.stopPropagation(); downloadOne(img.filename); }}
                      title={`Download ${img.filename}`}
                      aria-label="Download image"
                    >
                      ↓
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lbIdx !== null && (
        <Lightbox
          images={images}
          idx={lbIdx}
          selects={selects}
          token={token}
          sessionKey={sessionKey}
          onClose={() => setLbIdx(null)}
          onNav={setLbIdx}
          onHeart={handleHeart}
          onNote={saveNote}
          onVoice={handleVoice}
        />
      )}
    </>
  );
}

/* ── ROOT APP ────────────────────────────────────────────── */
function ClientGalleryApp() {
  const token = getToken();
  const storedKey = token ? getStoredKey(token) : '';
  const [session, setSession] = useState(
    storedKey ? { key: storedKey, title: '', imageCount: 0 } : null
  );
  const [title, setTitle] = useState('');

  if (!token) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center', color: 'var(--ink-muted)' }}>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, letterSpacing: '0.1em' }}>
          No gallery token found.
        </div>
      </div>
    );
  }

  const handleUnlocked = (data) => {
    setSession(data);
    setTitle(data.title);
  };

  const displayTitle = title || session?.title || '';

  return (
    <>
      <div className="cg-topbar">
        <div className="cg-topbar-brand">Aldo Carrera</div>
        {session && displayTitle && (
          <div className="cg-topbar-title">{displayTitle}</div>
        )}
      </div>
      {!session
        ? <PinScreen token={token} onUnlocked={handleUnlocked}/>
        : <GalleryView token={token} sessionKey={session.key} title={displayTitle}/>
      }
    </>
  );
}

/* Mount */
const root = ReactDOM.createRoot(document.getElementById('cg-root'));
root.render(React.createElement(ClientGalleryApp));
