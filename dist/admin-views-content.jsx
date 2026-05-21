/* admin-views-content.jsx — About, Services, Clients, Settings editors */

const { useState: cS, useEffect: cE, useMemo: cM, useRef: cR } = React;

/* ============================================================
   ABOUT EDITOR
   ============================================================ */
function AboutEditorView({ navigate }) {
  window.useStoreSubscribe();
  const initial = window.AdminStore.getAbout();
  const [draft, setDraft] = cS(initial);
  const [newPractice, setNewPractice] = cS('');
  const [saving, setSaving] = cS(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  // Pull latest from API on mount so we always show what's live
  cE(() => {
    window.AdminStore.pullFromAPI().then(() => {
      const fresh = window.AdminStore.getAbout();
      setDraft(fresh);
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    window.AdminStore.setAbout(draft);
    try { await window.AdminStore.forceSync(); } catch (_) {}
    setSaving(false);
    toast('About saved', 'ok');
  };
  const reset = () => setDraft(window.AdminStore.getAbout());

  const setEdu = (k, v) => setDraft(d => ({ ...d, education: { ...d.education, [k]: v } }));

  const addPractice = () => {
    if (!newPractice.trim()) return;
    setDraft(d => ({ ...d, practice: [...d.practice, newPractice.trim()] }));
    setNewPractice('');
  };
  const movePractice = (next) => setDraft(d => ({ ...d, practice: next }));
  const removePractice = (item) => setDraft(d => ({ ...d, practice: d.practice.filter(x => x !== item) }));

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="About"
        crumbs={[{ label: 'Admin', href: '#/dashboard' }, { label: 'About' }]}
        actions={
          <>
            {dirty && !saving && <Btn variant="ghost" onClick={reset}>Discard</Btn>}
            <Btn onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</Btn>
          </>
        }
      />

      <Card padding="lg">
        <SectionHead eyebrow="Bio" title="The story" sub="Appears on the public About window."/>
        <Field label="Bio" wide hint="2–3 short paragraphs. Pretty-wrap is on.">
          <TextArea value={draft.bio} onChange={(v) => setDraft(d => ({ ...d, bio: v }))} rows={9}/>
        </Field>
        <Field label="Location" hint="City, state — appears below the name.">
          <TextInput value={draft.location} onChange={(v) => setDraft(d => ({ ...d, location: v }))} placeholder="Los Angeles"/>
        </Field>
      </Card>

      <Card padding="lg" className="ad-mt-md">
        <SectionHead eyebrow="Background" title="Education"/>
        <div className="ad-form-grid">
          <Field label="School" wide>
            <TextInput value={draft.education.school} onChange={(v) => setEdu('school', v)}/>
          </Field>
          <Field label="Degree" wide>
            <TextInput value={draft.education.degree} onChange={(v) => setEdu('degree', v)}/>
          </Field>
          <Field label="Year">
            <TextInput type="number" value={draft.education.year} onChange={(v) => setEdu('year', parseInt(v) || '')}/>
          </Field>
        </div>
      </Card>

      <Card padding="lg" className="ad-mt-md">
        <SectionHead eyebrow="Practice" title="What you do" sub="Drag rows to reorder. Shows in the About window's 'Practice' section."/>
        <ReorderList
          items={draft.practice}
          onReorder={movePractice}
          keyFn={(x) => x}
          renderItem={(item) => (
            <div className="ad-list-item">
              <span className="ad-list-item-name">{item}</span>
              <button className="ad-link ad-link-quiet" onClick={() => removePractice(item)}>Remove</button>
            </div>
          )}
        />
        <div className="ad-add-row">
          <TextInput value={newPractice} onChange={setNewPractice} placeholder="New practice area…"/>
          <Btn variant="ghost" onClick={addPractice} disabled={!newPractice.trim()}>+ Add</Btn>
        </div>
      </Card>
    </>
  );
}

/* ============================================================
   SERVICES EDITOR
   ============================================================ */
function ServicesEditorView({ navigate }) {
  window.useStoreSubscribe();
  const services = window.AdminStore.getServices();
  const [editing, setEditing] = cS(null); // { id, title, description } | { id: 'new', ... }

  const startNew = () => setEditing({ id: 'new', title: '', description: '' });
  const startEdit = (s) => setEditing({ ...s });

  const save = () => {
    if (!editing.title.trim()) { toast('Title required', 'warn'); return; }
    if (editing.id === 'new') {
      window.AdminStore.addService({ title: editing.title, description: editing.description });
      toast('Service added', 'ok');
    } else {
      window.AdminStore.updateService(editing.id, { title: editing.title, description: editing.description });
      toast('Service updated', 'ok');
    }
    setEditing(null);
  };
  const remove = (id) => {
    if (!confirm('Delete this service?')) return;
    window.AdminStore.deleteService(id);
    toast('Service deleted', 'ok');
  };
  const reorder = (next) => {
    window.AdminStore.reorderServices(next.map(s => s.id));
  };

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Services"
        crumbs={[{ label: 'Admin', href: '#/dashboard' }, { label: 'Services' }]}
        actions={<Btn onClick={startNew} icon="+">New service</Btn>}
      />
      <Card padding="lg">
        <SectionHead eyebrow="Services list" title="Drag to reorder" sub="Order shown here is the order shown on the public site."/>
        {services.length === 0
          ? <Empty title="No services yet" action={<Btn onClick={startNew}>New service</Btn>}/>
          : (
            <ReorderList
              items={services}
              onReorder={reorder}
              keyFn={(s) => s.id}
              renderItem={(s) => (
                <div className="ad-svc-row">
                  <div className="ad-svc-num">{String(s.order).padStart(2, '0')}</div>
                  <div className="ad-svc-mid">
                    <div className="ad-svc-title">{s.title}</div>
                    <div className="ad-svc-desc">{s.description}</div>
                  </div>
                  <div className="ad-svc-actions">
                    <Btn variant="ghost" size="sm" onClick={() => startEdit(s)}>Edit</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => remove(s.id)}>Delete</Btn>
                  </div>
                </div>
              )}
            />
          )
        }
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        eyebrow={editing?.id === 'new' ? 'New' : `Editing #${editing?.id}`}
        title={editing?.id === 'new' ? 'Add a service' : 'Edit service'}
        width={520}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
            <Btn onClick={save}>{editing?.id === 'new' ? 'Add' : 'Save'}</Btn>
          </>
        }
      >
        {editing && (
          <>
            <Field label="Title" wide>
              <TextInput value={editing.title} onChange={(v) => setEditing(e => ({ ...e, title: v }))} placeholder="Photography" autoFocus/>
            </Field>
            <Field label="Description" wide hint="One short line. Shown under the title on the public site.">
              <TextArea value={editing.description} onChange={(v) => setEditing(e => ({ ...e, description: v }))} rows={4}/>
            </Field>
          </>
        )}
      </Modal>
    </>
  );
}

/* ============================================================
   CLIENTS EDITOR
   ============================================================ */
function ClientsEditorView({ navigate }) {
  window.useStoreSubscribe();
  const clients = window.AdminStore.getClients();
  const [editing, setEditing] = cS(null);
  const [newYears, setNewYears] = cS('');

  const startNew  = () => { setEditing({ slug: 'new', name: '', yearsActive: [] }); setNewYears(''); };
  const startEdit = (c) => { setEditing({ ...c }); setNewYears(c.yearsActive.join(', ')); };

  const save = () => {
    if (!editing.name.trim()) { toast('Client name required', 'warn'); return; }
    const years = newYears.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)).sort((a,b) => a-b);
    if (editing.slug === 'new') {
      window.AdminStore.addClient({ name: editing.name, yearsActive: years });
      toast('Client added', 'ok');
    } else {
      window.AdminStore.updateClient(editing.slug, { name: editing.name, yearsActive: years });
      toast('Client updated', 'ok');
    }
    setEditing(null);
  };
  const remove = (slug) => {
    if (!confirm('Delete this client?')) return;
    window.AdminStore.deleteClient(slug);
    toast('Client deleted', 'ok');
  };

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title="Clients"
        crumbs={[{ label: 'Admin', href: '#/dashboard' }, { label: 'Clients' }]}
        actions={<Btn onClick={startNew} icon="+">New client</Btn>}
      />
      <Card padding="lg">
        <SectionHead
          eyebrow={`${clients.length} ${clients.length === 1 ? 'client' : 'clients'}`}
          title="Clients"
          sub="Select clients and collaborators."
        />
        {clients.length === 0
          ? <Empty title="No clients yet" action={<Btn onClick={startNew}>New client</Btn>}/>
          : (
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Years active</th>
                  <th style={{ width: 1 }}></th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.slug}>
                    <td><b>{c.name}</b></td>
                    <td className="ad-mono ad-muted">{c.slug}</td>
                    <td className="ad-mono">{c.yearsActive.length ? c.yearsActive.join(' · ') : <span className="ad-muted">—</span>}</td>
                    <td>
                      <div className="ad-row-actions">
                        <button className="ad-link" onClick={() => startEdit(c)}>Edit</button>
                        <button className="ad-link ad-link-quiet" onClick={() => remove(c.slug)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        eyebrow={editing?.slug === 'new' ? 'New' : editing?.slug}
        title={editing?.slug === 'new' ? 'Add a client' : 'Edit client'}
        width={520}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
            <Btn onClick={save}>{editing?.slug === 'new' ? 'Add' : 'Save'}</Btn>
          </>
        }
      >
        {editing && (
          <>
            <Field label="Name" wide>
              <TextInput value={editing.name} onChange={(v) => setEditing(e => ({ ...e, name: v }))} placeholder="BAPE" autoFocus/>
            </Field>
            <Field label="Years active" wide hint="Comma-separated, e.g. 2023, 2024">
              <TextInput value={newYears} onChange={setNewYears} placeholder="2024, 2025"/>
            </Field>
          </>
        )}
      </Modal>
    </>
  );
}

/* ============================================================
   SETTINGS
   ============================================================ */
function SettingsEditorView({ navigate }) {
  window.useStoreSubscribe();
  const initial = window.AdminStore.getSettings();
  const [draft, setDraft] = cS(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const save = () => {
    window.AdminStore.setSettings(draft);
    toast('Settings saved', 'ok');
  };

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Settings"
        crumbs={[{ label: 'Admin', href: '#/dashboard' }, { label: 'Settings' }]}
        actions={
          <>
            {dirty && <Btn variant="ghost" onClick={() => setDraft(initial)}>Discard</Btn>}
            <Btn onClick={save} disabled={!dirty}>Save changes</Btn>
          </>
        }
      />

      <Card padding="lg">
        <SectionHead eyebrow="Contact" title="What appears on the public site"/>
        <div className="ad-form-grid">
          <Field label="Email" wide>
            <TextInput type="email" value={draft.contactEmail} onChange={(v) => set('contactEmail', v)}/>
          </Field>
          <Field label="Phone" wide>
            <TextInput value={draft.contactPhone} onChange={(v) => set('contactPhone', v)}/>
          </Field>
          <Field label="Instagram" wide>
            <TextInput value={draft.instagram} onChange={(v) => set('instagram', v)}/>
          </Field>
        </div>
      </Card>

      <Card padding="lg" className="ad-mt-md">
        <SectionHead eyebrow="Brand" title="Accent color" sub="Used across the public site for highlights, hovers, the logo tint, and select CTAs."/>
        <div className="ad-color-row">
          {['#d63e5a', '#b8425e', '#7e4f8a', '#3d5a80', '#2a9d8f', '#16140f'].map(c => (
            <button key={c}
              className={`ad-swatch ${draft.accentColor.toLowerCase() === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => set('accentColor', c)}
              title={c}
            />
          ))}
          <div className="ad-color-custom">
            <span className="ad-eyebrow">Custom</span>
            <input type="color" className="ad-color-picker" value={draft.accentColor} onChange={(e) => set('accentColor', e.target.value)}/>
            <span className="ad-mono">{draft.accentColor.toUpperCase()}</span>
          </div>
        </div>
      </Card>

      <Card padding="lg" className="ad-mt-md">
        <SectionHead eyebrow="Danger zone" title="Reset prototype data" sub="Wipes everything in localStorage and re-seeds with the original sample projects. Useful when testing flows."/>
        <Btn variant="ghost" onClick={() => {
          if (!confirm('Reset all admin data to seed? This cannot be undone.')) return;
          window.AdminStore.reseed();
          toast('Reset complete', 'ok');
          setDraft(window.AdminStore.getSettings());
        }}>Reset prototype data</Btn>
      </Card>
    </>
  );
}

Object.assign(window, {
  AboutEditorView,
  ServicesEditorView,
  ClientsEditorView,
  SettingsEditorView,
});
