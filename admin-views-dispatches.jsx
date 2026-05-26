/* admin-views-dispatches.jsx — write & manage dispatches (the /notes section) */

const { useState: dS, useEffect: dE } = React;

/* ── Helpers ──────────────────────────────── */
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* ================================================================
   DISPATCH LIST
   ================================================================ */
function DispatchesView({ navigate }) {
  const [dispatches, setDispatches] = dS(null);
  const [busy, setBusy]             = dS(false);

  const load = async () => {
    try {
      const r = await window.AdminStore.apiFetch('/api/admin/dispatches');
      setDispatches(r.dispatches || []);
    } catch (_) { setDispatches([]); }
  };

  dE(() => { load(); }, []);

  const deleteDispatch = async (id) => {
    if (!confirm('Delete this dispatch?')) return;
    setBusy(true);
    try {
      await window.AdminStore.apiFetch(`/api/dispatches/${id}`, { method: 'DELETE' });
      setDispatches(d => d.filter(x => x.id !== id));
      toast('Deleted', 'ok');
    } catch (_) { toast('Delete failed', 'error'); }
    setBusy(false);
  };

  const togglePublish = async (dispatch) => {
    const updated = { ...dispatch, published: !dispatch.published };
    try {
      await window.AdminStore.apiFetch(`/api/dispatches/${dispatch.id}`, {
        method: 'PUT',
        body: JSON.stringify(updated),
      });
      setDispatches(ds => ds.map(d => d.id === dispatch.id ? updated : d));
      toast(updated.published ? 'Published' : 'Unpublished', 'ok');
    } catch (_) { toast('Failed', 'error'); }
  };

  return (
    <div className="ad-page">
      <div className="ad-page-head">
        <div>
          <div className="ad-page-title">Notes / Dispatch</div>
          <div className="ad-page-sub">
            Irregular writing at <a href="/notes" target="_blank" style={{color:'inherit',opacity:0.6}}>/notes</a>
          </div>
        </div>
        <Btn onClick={() => navigate('#/dispatches/new')}>+ New dispatch</Btn>
      </div>

      {dispatches === null && <div style={{padding:'3rem 0',opacity:0.4,fontSize:'0.8rem'}}>Loading…</div>}

      {dispatches !== null && dispatches.length === 0 && (
        <Card style={{padding:'3rem',textAlign:'center',opacity:0.5}}>
          <div style={{fontSize:'0.8rem'}}>No dispatches yet. Write something.</div>
        </Card>
      )}

      {dispatches !== null && dispatches.length > 0 && (
        <Card>
          {dispatches.map((d, i) => (
            <div key={d.id} className="ad-list-row" style={{
              display:'flex', alignItems:'flex-start', justifyContent:'space-between',
              padding:'1rem 1.25rem',
              borderTop: i === 0 ? 'none' : '1px solid var(--rule-soft)',
            }}>
              <div style={{flex:1, minWidth:0, cursor:'pointer'}} onClick={() => navigate(`#/dispatches/${d.id}`)}>
                <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'0.3rem'}}>
                  <span style={{
                    fontSize:'0.6rem',letterSpacing:'0.12em',textTransform:'uppercase',
                    background: d.published ? 'var(--accent-soft)' : 'var(--paper-soft)',
                    color: d.published ? 'var(--accent)' : 'var(--ink-muted)',
                    padding:'0.2rem 0.5rem', borderRadius:3,
                  }}>
                    {d.published ? 'live' : 'draft'}
                  </span>
                  <span style={{fontSize:'0.65rem',opacity:0.45}}>{formatDate(d.date)}</span>
                </div>
                <div style={{fontWeight:500,fontSize:'0.85rem',marginBottom:'0.25rem'}}>
                  {d.title || <em style={{opacity:0.4}}>untitled</em>}
                </div>
                <div style={{fontSize:'0.75rem',opacity:0.45,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {(d.body || '').slice(0, 100)}{(d.body || '').length > 100 ? '…' : ''}
                </div>
              </div>
              <div style={{display:'flex',gap:'0.5rem',marginLeft:'1rem',flexShrink:0,alignItems:'center'}}>
                <Btn variant="ghost" onClick={() => togglePublish(d)} disabled={busy}>
                  {d.published ? 'Unpublish' : 'Publish'}
                </Btn>
                <Btn variant="ghost" onClick={() => navigate(`#/dispatches/${d.id}`)}>Edit</Btn>
                <Btn variant="ghost" onClick={() => deleteDispatch(d.id)} disabled={busy}>Delete</Btn>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* ================================================================
   DISPATCH EDITOR
   ================================================================ */
function DispatchEditorView({ dispatchId, navigate }) {
  const isNew = dispatchId === 'new';
  const today = new Date().toISOString().slice(0, 10);

  const [draft, setDraft] = dS({
    title: '', body: '', date: today, published: false,
  });
  const [saving, setSaving] = dS(false);
  const [loaded, setLoaded] = dS(isNew);

  dE(() => {
    if (isNew) return;
    window.AdminStore.apiFetch(`/api/admin/dispatches`)
      .then(r => {
        const found = (r.dispatches || []).find(d => d.id === dispatchId);
        if (found) { setDraft(found); setLoaded(true); }
        else navigate('#/dispatches');
      })
      .catch(() => navigate('#/dispatches'));
  }, [dispatchId]);

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const save = async () => {
    if (!draft.body.trim()) { toast('Body is required', 'error'); return; }
    setSaving(true);
    try {
      if (isNew) {
        await window.AdminStore.apiFetch('/api/dispatches', {
          method: 'POST',
          body: JSON.stringify(draft),
        });
      } else {
        await window.AdminStore.apiFetch(`/api/dispatches/${dispatchId}`, {
          method: 'PUT',
          body: JSON.stringify(draft),
        });
      }
      toast(isNew ? 'Dispatch created' : 'Saved', 'ok');
      navigate('#/dispatches');
    } catch (_) { toast('Save failed', 'error'); }
    setSaving(false);
  };

  if (!loaded) return <div style={{padding:'3rem 0',opacity:0.4,fontSize:'0.8rem'}}>Loading…</div>;

  return (
    <div className="ad-page">
      <div className="ad-page-head">
        <div className="ad-page-title">{isNew ? 'New dispatch' : 'Edit dispatch'}</div>
        <div style={{display:'flex',gap:'0.5rem'}}>
          <Btn variant="ghost" onClick={() => navigate('#/dispatches')}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
        </div>
      </div>

      <Card style={{padding:'1.5rem',display:'flex',flexDirection:'column',gap:'1.25rem'}}>

        {/* Date */}
        <div>
          <label className="ad-label">Date</label>
          <input
            type="date"
            value={draft.date || today}
            onChange={e => set('date', e.target.value)}
            className="ad-input"
            style={{width:'12rem'}}
          />
        </div>

        {/* Title (optional) */}
        <div>
          <label className="ad-label">Title <span style={{opacity:0.45,fontWeight:400}}>· optional</span></label>
          <input
            type="text"
            value={draft.title || ''}
            onChange={e => set('title', e.target.value)}
            className="ad-input"
            placeholder="On shooting in February in Paris…"
          />
        </div>

        {/* Body */}
        <div>
          <label className="ad-label">Body</label>
          <textarea
            value={draft.body || ''}
            onChange={e => set('body', e.target.value)}
            className="ad-input"
            rows={18}
            placeholder="Write plainly. No formatting needed. 200 words is plenty."
            style={{resize:'vertical',fontFamily:'inherit',lineHeight:1.7}}
          />
          <div style={{fontSize:'0.65rem',opacity:0.4,marginTop:'0.4rem'}}>
            {(draft.body || '').split(/\s+/).filter(Boolean).length} words
          </div>
        </div>

        {/* Published */}
        <label style={{display:'flex',alignItems:'center',gap:'0.6rem',cursor:'pointer',userSelect:'none'}}>
          <input
            type="checkbox"
            checked={!!draft.published}
            onChange={e => set('published', e.target.checked)}
          />
          <span style={{fontSize:'0.8rem'}}>Published — visible at <span style={{opacity:0.6}}>/notes</span></span>
        </label>

      </Card>
    </div>
  );
}
