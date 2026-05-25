/* admin-views-prints.jsx — Print catalog management.
 *
 * Workflow:
 *   1. Click "Add print" → pick an image from any existing project
 *   2. Set sizes (8×10, 11×14, 16×20) with per-size price + Stripe Payment Link
 *   3. Set edition total (default 50)
 *   4. Toggle active = visible in public print shop
 *
 * Stripe Payment Links are created manually in Stripe dashboard and pasted
 * into each size field. v1: manual fulfillment via WHCC/Whitewall.
 */

const { useState: prS, useEffect: prE, useMemo: prM } = React;

const DEFAULT_SIZES = [
  { label: '8×10',  dims: '8 × 10 inches',  price: 75,  paymentLink: '' },
  { label: '11×14', dims: '11 × 14 inches', price: 125, paymentLink: '' },
  { label: '16×20', dims: '16 × 20 inches', price: 250, paymentLink: '' },
];

function PrintsListView({ navigate }) {
  window.useStoreSubscribe();
  const [prints, setPrints] = prS([]);
  const [loading, setLoading] = prS(true);
  const [picking, setPicking] = prS(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await window.AdminStore.apiFetch('/api/prints');
      setPrints(res.prints || []);
    } catch (err) {
      toast('Failed to load prints: ' + (err?.message || 'unknown'), 'error');
    } finally {
      setLoading(false);
    }
  };

  prE(() => { load(); }, []);

  const onPicked = async (image, project) => {
    setPicking(false);
    try {
      const res = await window.AdminStore.apiFetch('/api/prints', {
        method: 'POST',
        body: JSON.stringify({
          title: `${project.name} — ${image.filename}`,
          sourceProjectId: project.id,
          sourceFilename:  image.filename,
          blobPath:        image.blobPath,
          description:     '',
          editionTotal:    50,
          editionsSold:    0,
          sizes:           DEFAULT_SIZES,
          active:          false, // start inactive until prices are set
        }),
      });
      toast(`Added "${res.title}" to catalog. Set prices + Stripe links to publish.`, 'ok');
      load();
    } catch (err) {
      toast('Failed to add print: ' + (err?.message || 'unknown'), 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Print shop"
        crumbs={[
          { label: 'Admin', href: '#/dashboard' },
          { label: 'Prints' },
        ]}
        actions={
          <Btn onClick={() => setPicking(true)} icon="+">Add print</Btn>
        }
      />

      <Card padding="lg">
        <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--ink-muted)', fontFamily: '"IBM Plex Mono", monospace', lineHeight: 1.6 }}>
          Each print has up to three sizes (8×10, 11×14, 16×20), a price per size, and
          a Stripe Payment Link per size that you generate in your Stripe dashboard.
          Edition counts are tracked manually — increment "Editions sold" each time
          you fulfill an order. A print is only visible on the public shop when
          marked active AND has at least one size with a price + link filled in.
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>Loading…</div>
        ) : prints.length === 0 ? (
          <Empty
            title="No prints in catalog yet"
            sub="Click 'Add print' to pick an image from any project."
            action={<Btn onClick={() => setPicking(true)} icon="+">Add your first print</Btn>}
          />
        ) : (
          <div className="ad-print-grid">
            {prints.map(p => (
              <PrintRow key={p.id} print={p} onChanged={load}/>
            ))}
          </div>
        )}
      </Card>

      {picking && <ImagePicker onPicked={onPicked} onClose={() => setPicking(false)}/>}
    </>
  );
}

function PrintRow({ print, onChanged }) {
  const [editing, setEditing] = prS(false);
  const [draft, setDraft] = prS(print);

  prE(() => setDraft(print), [print.id, print.updatedAt]);

  const save = async () => {
    try {
      await window.AdminStore.apiFetch(`/api/prints/${print.id}`, {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
      toast('Print saved', 'ok');
      setEditing(false);
      onChanged();
    } catch (err) {
      toast('Save failed: ' + (err?.message || 'unknown'), 'error');
    }
  };

  const remove = async () => {
    if (!confirm(`Remove "${print.title}" from the catalog? Editions sold will be lost.`)) return;
    try {
      await window.AdminStore.apiFetch(`/api/prints/${print.id}`, { method: 'DELETE' });
      toast('Print removed', 'ok');
      onChanged();
    } catch (err) {
      toast('Delete failed: ' + (err?.message || 'unknown'), 'error');
    }
  };

  const toggleActive = async () => {
    try {
      await window.AdminStore.apiFetch(`/api/prints/${print.id}`, {
        method: 'PUT',
        body: JSON.stringify({ active: !print.active }),
      });
      onChanged();
    } catch (err) {
      toast('Toggle failed: ' + (err?.message || 'unknown'), 'error');
    }
  };

  const editionsLeft = (draft.editionTotal || 0) - (draft.editionsSold || 0);
  const ready = draft.sizes.some(s => s.price > 0 && s.paymentLink);

  return (
    <div className={`ad-print-row ${print.active ? 'is-active' : 'is-inactive'}`}>
      <div className="ad-print-thumb">
        <Thumb blobPath={print.blobPath} aspect="4/5" placeholder="◯"/>
      </div>
      <div className="ad-print-body">
        {!editing ? (
          <>
            <div className="ad-print-title">{print.title}</div>
            <div className="ad-print-meta">
              {print.sourceProjectId} · {editionsLeft} of {print.editionTotal} editions remaining
            </div>
            <div className="ad-print-sizes">
              {print.sizes.map(s => (
                <span key={s.label} className={`ad-print-size ${s.paymentLink && s.price ? '' : 'is-pending'}`}>
                  {s.label} {s.price ? `· $${s.price}` : '· no price'}
                  {!s.paymentLink && ' · no link'}
                </span>
              ))}
            </div>
            <div className="ad-print-actions">
              <Btn size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Btn>
              <Btn size="sm" variant="ghost" onClick={toggleActive} disabled={!ready}>
                {print.active ? 'Set inactive' : (ready ? 'Set active' : 'Fill in prices first')}
              </Btn>
              <Btn size="sm" variant="ghost" onClick={remove}>Delete</Btn>
              <span className={`ad-print-status ${print.active ? 'on' : 'off'}`}>
                {print.active ? '● Public' : '○ Hidden'}
              </span>
            </div>
          </>
        ) : (
          <>
            <Field label="Title">
              <TextInput value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })}/>
            </Field>
            <Field label="Description (optional)" hint="Shown on the print's public detail page.">
              <TextArea value={draft.description} rows={2} onChange={(v) => setDraft({ ...draft, description: v })}/>
            </Field>
            <div className="ad-form-grid" style={{ gap: 14 }}>
              <Field label="Edition total">
                <TextInput type="number" value={draft.editionTotal} onChange={(v) => setDraft({ ...draft, editionTotal: parseInt(v) || 0 })}/>
              </Field>
              <Field label="Editions sold">
                <TextInput type="number" value={draft.editionsSold} onChange={(v) => setDraft({ ...draft, editionsSold: parseInt(v) || 0 })}/>
              </Field>
            </div>

            <div style={{ marginTop: 18 }}>
              <div className="ad-form-section-label" style={{ marginBottom: 12 }}>Sizes & pricing</div>
              {draft.sizes.map((s, i) => (
                <div key={i} className="ad-print-size-edit">
                  <div className="ad-print-size-label">{s.label}</div>
                  <div className="ad-print-size-dims">{s.dims}</div>
                  <Field label="Price (USD)">
                    <TextInput type="number" value={s.price} onChange={(v) => {
                      const sizes = [...draft.sizes];
                      sizes[i] = { ...s, price: parseInt(v) || 0 };
                      setDraft({ ...draft, sizes });
                    }}/>
                  </Field>
                  <Field label="Stripe Payment Link" hint="Create in Stripe dashboard → Payment Links">
                    <TextInput value={s.paymentLink} placeholder="https://buy.stripe.com/..." onChange={(v) => {
                      const sizes = [...draft.sizes];
                      sizes[i] = { ...s, paymentLink: v };
                      setDraft({ ...draft, sizes });
                    }}/>
                  </Field>
                </div>
              ))}
            </div>

            <div className="ad-print-actions" style={{ marginTop: 18 }}>
              <Btn onClick={save}>Save changes</Btn>
              <Btn variant="ghost" onClick={() => { setDraft(print); setEditing(false); }}>Cancel</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* Image picker modal — browse all project images and pick one */
function ImagePicker({ onPicked, onClose }) {
  window.useStoreSubscribe();
  const projects = window.AdminStore.getProjects();
  const allImages = prM(() =>
    projects.flatMap(p =>
      (p.images || [])
        .filter(i => !i.rejected && i.blobPath)
        .map(i => ({ image: i, project: p }))
    ),
    [projects]
  );

  const [filter, setFilter] = prS('');
  const filtered = filter
    ? allImages.filter(x => x.project.name.toLowerCase().includes(filter.toLowerCase()) || x.image.filename.toLowerCase().includes(filter.toLowerCase()))
    : allImages;

  return (
    <div className="ad-modal-backdrop" onClick={onClose}>
      <div className="ad-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 1000, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--rule)' }}>
          <div className="ad-form-section-label" style={{ marginBottom: 10 }}>Pick an image for print</div>
          <TextInput value={filter} onChange={setFilter} placeholder="Filter by project name or filename…"/>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div className="ad-pick-grid">
            {filtered.map(({ image, project }) => (
              <div
                key={`${project.id}/${image.filename}`}
                className="ad-pick-tile"
                onClick={() => onPicked(image, project)}
                title={`${project.name} — ${image.filename}`}
              >
                <Thumb blobPath={image.blobPath} aspect="1/1"/>
                <div className="ad-pick-tile-name">{project.name}</div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--ink-muted)' }}>
                No matches.
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: 14, borderTop: '1px solid var(--rule)', textAlign: 'right' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

window.PrintsListView = PrintsListView;
