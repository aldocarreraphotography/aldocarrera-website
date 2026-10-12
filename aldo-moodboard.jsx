/* aldo-moodboard.jsx — visitors heart photos into a moodboard.
 *
 * The board lives in the visitor's browser (localStorage). "Share" saves a
 * copy on the NAS (POST /api/moodboards) and copies a link
 * (aldocarrera.com/#moodboard/<token>) that opens it read-only for anyone;
 * "Send with inquiry" opens the contact form with that link attached, so
 * Aldo sees exactly which references a client is drawn to.
 */

const { useState: mbS, useEffect: mbE } = React;

const MB_KEY = 'aldo-moodboard';
const _mbRead = () => { try { return JSON.parse(localStorage.getItem(MB_KEY) || '[]'); } catch (_) { return []; } };
const _mbWrite = (items) => {
  try { localStorage.setItem(MB_KEY, JSON.stringify(items)); } catch (_) {}
  window.dispatchEvent(new CustomEvent('aldo-moodboard-changed'));
};

/* item: { project, name, photo, client, projectName } — key = project/name */
window.AldoMoodboard = {
  items: _mbRead,
  has: (project, name) => _mbRead().some(i => i.project === project && i.name === name),
  toggle(item) {
    const items = _mbRead();
    const i = items.findIndex(x => x.project === item.project && x.name === item.name);
    if (i >= 0) items.splice(i, 1); else items.unshift(item);
    _mbWrite(items.slice(0, 60));
    return i < 0;
  },
  remove(project, name) { _mbWrite(_mbRead().filter(x => !(x.project === project && x.name === name))); },
  clear() { _mbWrite([]); },
  /* Save a shareable copy; resolves to the public link. */
  async share(title = '') {
    const items = _mbRead();
    const r = await fetch(`${window.API_BASE || ''}/api/moodboards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, items: items.map(i => ({ project: i.project, name: i.name })) }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || 'Could not save the moodboard');
    return `${location.origin}/#moodboard/${data.token}`;
  },
};

function useMoodboard() {
  const [items, setItems] = mbS(_mbRead);
  mbE(() => {
    const h = () => setItems(_mbRead());
    window.addEventListener('aldo-moodboard-changed', h);
    window.addEventListener('storage', h);
    return () => { window.removeEventListener('aldo-moodboard-changed', h); window.removeEventListener('storage', h); };
  }, []);
  return items;
}

/* ♥ toggle for any photo. `item` needs project + name + photo. */
function HeartButton({ item, className = '' }) {
  const items = useMoodboard();
  const on = items.some(i => i.project === item.project && i.name === item.name);
  const [pop, setPop] = mbS(false);
  return (
    <button
      type="button"
      className={`mb-heart ${on ? 'on' : ''} ${pop ? 'pop' : ''} ${className}`}
      aria-label={on ? 'Remove from moodboard' : 'Add to moodboard'}
      title={on ? 'Remove from moodboard' : 'Add to moodboard'}
      onClick={(e) => {
        e.stopPropagation();
        const added = window.AldoMoodboard.toggle(item);
        if (added) { setPop(true); setTimeout(() => setPop(false), 400); }
      }}
    >{on ? '♥' : '♡'}</button>
  );
}

/* Moodboard window. With `token` it shows a shared board read-only. */
function MoodboardView({ token, onOpenPhoto, onOpenContact }) {
  const mine = useMoodboard();
  const [shared, setShared] = mbS(null);
  const [err, setErr] = mbS(null);
  const [link, setLink] = mbS('');
  const [busy, setBusy] = mbS(false);

  mbE(() => {
    if (!token) return;
    fetch(`${window.API_BASE || ''}/api/moodboards/${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('This moodboard link is no longer available.')))
      .then(d => setShared({ ...d, items: d.items.map(i => ({ ...i, photo: i.blobPath })) }))
      .catch(e => setErr(e.message));
  }, [token]);

  const items = token ? (shared ? shared.items : []) : mine;
  const viewerList = items.map(i => ({ id: `${i.project}/${i.name}`, photo: i.photo, name: i.name, client: (i.client || '').toUpperCase(), project: i.project }));

  const doShare = async () => {
    setBusy(true); setErr(null);
    try {
      const url = await window.AldoMoodboard.share();
      setLink(url);
      try { await navigator.clipboard.writeText(url); } catch (_) {}
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const doInquiry = async () => {
    setBusy(true); setErr(null);
    try {
      const url = link || await window.AldoMoodboard.share();
      setLink(url);
      window.__aldoInquiryMoodboard = { url, count: mine.length };
      onOpenContact && onOpenContact();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const keepShared = () => {
    shared.items.slice().reverse().forEach(i => { if (!window.AldoMoodboard.has(i.project, i.name)) window.AldoMoodboard.toggle({ project: i.project, name: i.name, photo: i.photo, client: i.client, projectName: i.projectName }); });
  };

  return (
    <div className="mb-view">
      <header className="mb-head">
        <div>
          <div className="mb-title">{token ? (shared?.title || 'Shared moodboard') : 'Your moodboard'}</div>
          <div className="mb-sub">
            {token ? `${items.length} photograph${items.length !== 1 ? 's' : ''} · shared with you`
                   : items.length ? `${items.length} saved · tap ♡ on any photo to add` : 'Tap ♡ on any photo to start a moodboard.'}
          </div>
        </div>
        {!token && items.length > 0 && (
          <div className="mb-actions">
            <button className="btn ghost" onClick={doShare} disabled={busy}>{link ? 'Link copied ✓' : 'Share link'}</button>
            <button className="btn" onClick={doInquiry} disabled={busy}>Send with inquiry →</button>
          </div>
        )}
        {token && shared && items.length > 0 && (
          <div className="mb-actions"><button className="btn ghost" onClick={keepShared}>Save to my moodboard</button></div>
        )}
      </header>
      {link && !token && <div className="mb-link"><span>Share:</span> <a href={link} onClick={e => e.preventDefault()}>{link}</a></div>}
      {err && <div className="mb-err">{err}</div>}
      {items.length === 0 ? (
        <div className="mb-empty">
          <div className="mb-empty-heart">♡</div>
          <div>{token ? (err ? '' : 'Loading…') : 'Hearts you add in the Archive, projects and the photo viewer collect here.'}</div>
        </div>
      ) : (
        <div className="mb-grid">
          {items.map((i, idx) => (
            <figure key={`${i.project}/${i.name}`} className="mb-item" onClick={() => onOpenPhoto && onOpenPhoto(viewerList[idx], viewerList)}>
              <img src={window.aldoSized(i.photo, 360)} srcSet={window.aldoSrcSet(i.photo)} sizes="(max-width: 820px) 50vw, 300px" alt={i.projectName || i.name} loading="lazy" decoding="async"/>
              {!token && <button className="mb-remove" aria-label="Remove" onClick={(e) => { e.stopPropagation(); window.AldoMoodboard.remove(i.project, i.name); }}>×</button>}
              <figcaption>{i.projectName || ((window.ALDO.PROJECTS || []).find(p => p.id === i.project) || {}).name || i.project}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

window.HeartButton = HeartButton;
window.MoodboardView = MoodboardView;
window.useMoodboard = useMoodboard;
