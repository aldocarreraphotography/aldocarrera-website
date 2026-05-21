/* admin-views-videos.jsx — Video management */

const { useState: vS, useEffect: vE } = React;

const VIDEO_CATEGORIES = ['Reel', 'Commercial', 'Narrative', 'Music Video', 'Documentary'];
const CURRENT_YEAR = new Date().getFullYear();

/* ============================================================
   VIDEOS LIST VIEW
   ============================================================ */
function VideosView({ navigate }) {
  window.useStoreSubscribe();
  const [videos, setVideos]     = vS([]);
  const [loading, setLoading]   = vS(true);
  const [creating, setCreating] = vS(false);
  const [editing, setEditing]   = vS(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await window.AdminStore.apiFetch('/api/videos');
      setVideos(data.videos || data || []);
    } catch (e) {
      toast('Failed to load videos: ' + (e.message || 'error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  vE(() => { load(); }, []);

  const deleteVideo = async (id, title) => {
    if (!confirm(`Delete video "${title}"? This can't be undone.`)) return;
    try {
      await window.AdminStore.apiFetch(`/api/videos/${id}`, { method: 'DELETE' });
      setVideos(vs => vs.filter(v => v.id !== id));
      toast('Video deleted', 'ok');
    } catch (e) {
      toast('Delete failed: ' + (e.message || 'error'), 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Videos"
        crumbs={[{ label: 'Admin', href: '#/dashboard' }, { label: 'Videos' }]}
        actions={<Btn onClick={() => setCreating(true)} icon="+">New video</Btn>}
      />

      <Card padding="lg">
        <SectionHead
          eyebrow={`${videos.length} ${videos.length === 1 ? 'video' : 'videos'}`}
          title="Video library"
          sub="Manage embedded and uploaded videos for your portfolio."
        />

        {loading ? (
          <div className="ad-loading-row">Loading…</div>
        ) : videos.length === 0 ? (
          <Empty
            title="No videos yet"
            sub="Add a video by embedding a Vimeo or YouTube URL, or uploading an MP4 file."
            action={<Btn onClick={() => setCreating(true)}>New video</Btn>}
          />
        ) : (
          <table className="ad-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Client</th>
                <th>Year</th>
                <th>Category</th>
                <th>Type</th>
                <th>Public</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {videos.map(v => (
                <tr key={v.id}>
                  <td><b>{v.title}</b></td>
                  <td className="ad-muted">{v.client || '—'}</td>
                  <td className="ad-mono ad-muted">{v.year || '—'}</td>
                  <td>{v.category || '—'}</td>
                  <td>
                    {v.embedUrl
                      ? <span className="ad-badge ad-badge-blue">Embed</span>
                      : <span className="ad-badge ad-badge-muted">File</span>
                    }
                  </td>
                  <td>
                    {v.public
                      ? <span className="ad-badge ad-badge-green">Public</span>
                      : <span className="ad-badge ad-badge-muted">Hidden</span>
                    }
                  </td>
                  <td>
                    <div className="ad-row-actions">
                      <button className="ad-link" onClick={() => setEditing(v)}>Edit</button>
                      <button className="ad-link ad-link-quiet" onClick={() => deleteVideo(v.id, v.title)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <VideoCreateModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(v) => {
          setVideos(vs => [v, ...vs]);
          setCreating(false);
        }}
      />

      <VideoEditModal
        open={!!editing}
        video={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          setVideos(vs => vs.map(v => v.id === updated.id ? updated : v));
          setEditing(null);
        }}
      />
    </>
  );
}

/* ============================================================
   SHARED FORM FIELDS FRAGMENT
   ============================================================ */
function VideoFormFields({ form, set, sourceType, setSourceType }) {
  return (
    <>
      <Field label="Title" wide>
        <TextInput
          value={form.title}
          onChange={v => set('title', v)}
          placeholder="e.g. BAPE FW24 Campaign"
        />
      </Field>

      <div className="ad-form-grid">
        <Field label="Client">
          <TextInput
            value={form.client}
            onChange={v => set('client', v)}
            placeholder="e.g. BAPE Studio"
          />
        </Field>
        <Field label="Year">
          <TextInput
            type="number"
            value={form.year}
            onChange={v => set('year', v)}
            placeholder={String(CURRENT_YEAR)}
          />
        </Field>
      </div>

      <Field label="Category" wide>
        <select
          className="ad-select"
          value={form.category}
          onChange={e => set('category', e.target.value)}
        >
          {VIDEO_CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>

      <Field label="Description" wide>
        <textarea
          className="ad-textarea"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          rows={3}
          placeholder="Brief description of the video…"
        />
      </Field>

      <Field label="Visibility" wide>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.public}
            onChange={e => set('public', e.target.checked)}
          />
          <span>Public — visible on portfolio</span>
        </label>
      </Field>

      <Field label="Video source" wide>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="sourceType"
              value="embed"
              checked={sourceType === 'embed'}
              onChange={() => setSourceType('embed')}
            />
            <span>Embed URL (Vimeo / YouTube)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="sourceType"
              value="file"
              checked={sourceType === 'file'}
              onChange={() => setSourceType('file')}
            />
            <span>Upload file (.mp4)</span>
          </label>
        </div>
      </Field>

      {sourceType === 'embed' && (
        <Field label="Embed URL" wide>
          <TextInput
            value={form.embedUrl}
            onChange={v => set('embedUrl', v)}
            placeholder="https://vimeo.com/123456789"
          />
        </Field>
      )}

      {sourceType === 'file' && (
        <Field label="Video file" wide hint="Accepts .mp4 and other video formats.">
          <input
            type="file"
            accept="video/*"
            className="ad-file-input"
            onChange={e => set('videoFile', e.target.files[0] || null)}
          />
        </Field>
      )}

      <Field label="Poster image" wide hint="Optional thumbnail image shown before the video plays.">
        <input
          type="file"
          accept="image/*"
          className="ad-file-input"
          onChange={e => set('posterFile', e.target.files[0] || null)}
        />
      </Field>
    </>
  );
}

/* ============================================================
   CREATE MODAL
   ============================================================ */
function VideoCreateModal({ open, onClose, onCreated }) {
  const blankForm = {
    title: '', client: '', year: CURRENT_YEAR, category: 'Reel',
    description: '', public: true, embedUrl: '',
    videoFile: null, posterFile: null,
  };

  const [form, setForm]           = vS(blankForm);
  const [sourceType, setSourceType] = vS('embed');
  const [saving, setSaving]       = vS(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const reset = () => {
    setForm(blankForm);
    setSourceType('embed');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (!form.title.trim()) { toast('Title is required', 'warn'); return; }
    if (sourceType === 'embed' && !form.embedUrl.trim()) { toast('Embed URL is required', 'warn'); return; }

    setSaving(true);
    try {
      const body = {
        title:       form.title.trim(),
        client:      form.client.trim() || null,
        year:        form.year ? Number(form.year) : null,
        category:    form.category,
        description: form.description.trim() || null,
        public:      form.public,
        embedUrl:    sourceType === 'embed' ? form.embedUrl.trim() : null,
      };

      const created = await window.AdminStore.apiFetch('/api/videos', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      // Upload video file if provided
      if (sourceType === 'file' && form.videoFile) {
        const fd = new FormData();
        fd.append('file', form.videoFile);
        await window.AdminStore.apiUpload(`/api/videos/${created.id}/upload`, fd);
      }

      // Upload poster if provided
      if (form.posterFile) {
        const fd = new FormData();
        fd.append('file', form.posterFile);
        await window.AdminStore.apiUpload(`/api/videos/${created.id}/poster`, fd);
      }

      toast('Video created', 'ok');
      onCreated(created);
      reset();
    } catch (e) {
      toast('Error: ' + (e.message || 'failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      eyebrow="New"
      title="Add video"
      width={560}
      footer={
        <>
          <Btn variant="ghost" onClick={handleClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={saving || !form.title.trim()}>
            {saving ? 'Saving…' : 'Create video'}
          </Btn>
        </>
      }
    >
      <VideoFormFields
        form={form}
        set={set}
        sourceType={sourceType}
        setSourceType={setSourceType}
      />
    </Modal>
  );
}

/* ============================================================
   EDIT MODAL
   ============================================================ */
function VideoEditModal({ open, video, onClose, onSaved }) {
  const [form, setForm]           = vS(null);
  const [sourceType, setSourceType] = vS('embed');
  const [saving, setSaving]       = vS(false);

  // Sync form when video prop changes
  vE(() => {
    if (video) {
      setForm({
        title:       video.title || '',
        client:      video.client || '',
        year:        video.year || CURRENT_YEAR,
        category:    video.category || 'Reel',
        description: video.description || '',
        public:      video.public !== false,
        embedUrl:    video.embedUrl || '',
        videoFile:   null,
        posterFile:  null,
      });
      setSourceType(video.embedUrl ? 'embed' : 'file');
    }
  }, [video]);

  if (!form) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) { toast('Title is required', 'warn'); return; }

    setSaving(true);
    try {
      const body = {
        title:       form.title.trim(),
        client:      form.client.trim() || null,
        year:        form.year ? Number(form.year) : null,
        category:    form.category,
        description: form.description.trim() || null,
        public:      form.public,
        embedUrl:    sourceType === 'embed' ? form.embedUrl.trim() : null,
      };

      const updated = await window.AdminStore.apiFetch(`/api/videos/${video.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });

      // Upload new video file if provided
      if (sourceType === 'file' && form.videoFile) {
        const fd = new FormData();
        fd.append('file', form.videoFile);
        await window.AdminStore.apiUpload(`/api/videos/${video.id}/upload`, fd);
      }

      // Upload new poster if provided
      if (form.posterFile) {
        const fd = new FormData();
        fd.append('file', form.posterFile);
        await window.AdminStore.apiUpload(`/api/videos/${video.id}/poster`, fd);
      }

      toast('Video saved', 'ok');
      onSaved(updated);
    } catch (e) {
      toast('Error: ' + (e.message || 'failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Edit"
      title="Edit video"
      width={560}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={saving || !form.title.trim()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Btn>
        </>
      }
    >
      <VideoFormFields
        form={form}
        set={set}
        sourceType={sourceType}
        setSourceType={setSourceType}
      />
      {sourceType === 'file' && (
        <div className="ad-muted" style={{ fontSize: 12, marginTop: -8 }}>
          Leave file inputs empty to keep the existing video and poster.
        </div>
      )}
    </Modal>
  );
}

window.VideosView = VideosView;
