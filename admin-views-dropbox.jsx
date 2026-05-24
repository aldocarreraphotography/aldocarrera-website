/* admin-views-dropbox.jsx — AI-powered Dropbox curation wizard.
 *
 * 3-step flow:
 *   Step 1 — Folder picker: list Dropbox folders, select which to analyze.
 *   Step 2 — Processing:    async job, show live progress.
 *   Step 3 — Review:        Claude's top picks per folder, toggle + edit, import.
 */

const { useState: dbS, useEffect: dbE, useRef: dbRef } = React;

/* ------------------------------------------------------------------ */
/* Injected styles (dbx-* prefix to avoid collisions)                  */
/* ------------------------------------------------------------------ */
(function injectDropboxStyles() {
  if (document.getElementById('dbx-styles')) return;
  const style = document.createElement('style');
  style.id = 'dbx-styles';
  style.textContent = `
/* Step layout */
.dbx-wizard { max-width: 1100px; }
.dbx-step-indicator { display: flex; gap: 0; margin-bottom: 32px; }
.dbx-step { display: flex; align-items: center; gap: 8px; font-size: 11px;
  font-family: var(--font-mono); text-transform: uppercase; letter-spacing: .08em;
  color: var(--text-dim); }
.dbx-step.is-active { color: var(--text); }
.dbx-step.is-done { color: var(--accent); }
.dbx-step-num { width: 22px; height: 22px; border-radius: 50%;
  border: 1px solid currentColor; display: flex; align-items: center;
  justify-content: center; font-size: 10px; flex-shrink: 0; }
.dbx-step.is-active .dbx-step-num { background: var(--accent); border-color: var(--accent);
  color: #fff; }
.dbx-step.is-done .dbx-step-num { background: var(--accent); border-color: var(--accent);
  color: #fff; }
.dbx-step-sep { flex: 1; height: 1px; background: var(--border); margin: 0 12px; }

/* Folder picker */
.dbx-setup-card { background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: 6px; padding: 24px; margin-bottom: 24px; }
.dbx-setup-card h3 { margin: 0 0 8px; font-size: 15px; }
.dbx-setup-card p  { margin: 0 0 12px; color: var(--text-dim); font-size: 13px; line-height: 1.5; }
.dbx-setup-card code { font-family: var(--font-mono); font-size: 12px;
  background: var(--bg-subtle); padding: 2px 6px; border-radius: 3px; }

.dbx-folder-controls { display: flex; align-items: center; gap: 10px;
  margin-bottom: 12px; flex-wrap: wrap; }
.dbx-folder-count { font-family: var(--font-mono); font-size: 11px;
  color: var(--text-dim); margin-left: auto; }

.dbx-folder-table { width: 100%; border-collapse: collapse; }
.dbx-folder-row { border-bottom: 1px solid var(--border); }
.dbx-folder-row:hover { background: var(--bg-raised); }
.dbx-folder-row.is-checked { background: color-mix(in srgb, var(--accent) 6%, transparent); }
.dbx-folder-cell { padding: 10px 12px; font-size: 13px; vertical-align: middle; }
.dbx-folder-cell-check { width: 36px; }
.dbx-folder-name { font-weight: 500; font-family: var(--font-mono); font-size: 12px; }
.dbx-folder-img-count { font-size: 11px; color: var(--text-dim);
  font-family: var(--font-mono); white-space: nowrap; }
.dbx-img-badge { display: inline-block; background: var(--bg-subtle);
  border: 1px solid var(--border); border-radius: 3px;
  padding: 1px 7px; font-size: 11px; font-family: var(--font-mono); }

.dbx-target-row { display: flex; align-items: center; gap: 16px;
  padding: 16px 0; border-top: 1px solid var(--border); margin-top: 12px; }
.dbx-target-label { font-size: 12px; font-family: var(--font-mono); text-transform: uppercase;
  letter-spacing: .07em; color: var(--text-dim); white-space: nowrap; }

/* Progress step */
.dbx-progress-wrap { padding: 40px 0; display: flex; flex-direction: column;
  align-items: center; gap: 20px; }
.dbx-spinner { width: 40px; height: 40px; border: 3px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%; animation: dbx-spin 0.9s linear infinite; }
@keyframes dbx-spin { to { transform: rotate(360deg); } }
.dbx-phase { font-size: 14px; color: var(--text-dim); text-align: center; max-width: 500px; }
.dbx-progress-count { font-family: var(--font-mono); font-size: 12px; color: var(--text-dim); }
.dbx-progress-bar-track { width: 320px; height: 4px; background: var(--border);
  border-radius: 2px; overflow: hidden; }
.dbx-progress-bar-fill { height: 100%; background: var(--accent);
  border-radius: 2px; transition: width .3s ease; }
.dbx-error-box { background: color-mix(in srgb, #e53 15%, transparent);
  border: 1px solid color-mix(in srgb, #e53 40%, transparent);
  border-radius: 6px; padding: 16px 20px; font-size: 13px;
  color: var(--text); max-width: 600px; text-align: center; }

/* Review step */
.dbx-folder-section { margin-bottom: 40px; }
.dbx-folder-head { display: flex; align-items: flex-start; gap: 16px;
  flex-wrap: wrap; margin-bottom: 16px; padding-bottom: 14px;
  border-bottom: 1px solid var(--border); }
.dbx-folder-title { font-size: 16px; font-weight: 600; margin: 0 0 4px; }
.dbx-folder-meta { font-size: 12px; font-family: var(--font-mono); color: var(--text-dim); }
.dbx-folder-fields { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; flex: 1; }
.dbx-field-group { display: flex; flex-direction: column; gap: 4px; }
.dbx-field-label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em;
  font-family: var(--font-mono); color: var(--text-dim); }
.dbx-input { background: var(--bg-raised); border: 1px solid var(--border);
  border-radius: 4px; padding: 6px 10px; font-size: 13px;
  color: var(--text); font-family: inherit; outline: none; }
.dbx-input:focus { border-color: var(--accent); }
.dbx-input-year { width: 72px; }
.dbx-input-name { width: 220px; }

.dbx-gallery { display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px; }
.dbx-thumb-wrap { position: relative; cursor: pointer; border-radius: 4px;
  overflow: hidden; border: 2px solid transparent; transition: border-color .15s, opacity .15s; }
.dbx-thumb-wrap:hover { border-color: var(--accent); }
.dbx-thumb-wrap.is-selected { border-color: var(--accent); }
.dbx-thumb-wrap.is-deselected { opacity: 0.35; border-color: var(--border); }
.dbx-thumb-wrap.is-deselected .dbx-thumb-img { filter: grayscale(60%); }
.dbx-thumb-img { width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; }
.dbx-thumb-img-placeholder { width: 100%; aspect-ratio: 4/3;
  background: var(--bg-subtle); display: flex; align-items: center;
  justify-content: center; color: var(--text-dim); font-size: 11px; }
.dbx-score-badge { position: absolute; top: 6px; right: 6px;
  font-size: 10px; font-family: var(--font-mono); font-weight: 600;
  padding: 2px 6px; border-radius: 3px; line-height: 1.4; }
.dbx-score-badge.score-hi  { background: #16a34a; color: #fff; }
.dbx-score-badge.score-mid { background: #2563eb; color: #fff; }
.dbx-score-badge.score-lo  { background: var(--bg-subtle); color: var(--text-dim);
  border: 1px solid var(--border); }
.dbx-deselect-x { position: absolute; top: 6px; left: 6px;
  width: 18px; height: 18px; background: rgba(0,0,0,.55); border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: #fff; line-height: 1; }
.dbx-thumb-reason { padding: 6px 8px; font-size: 11px; color: var(--text-dim);
  line-height: 1.4; background: var(--bg-raised); border-top: 1px solid var(--border); }
.dbx-thumb-reason.is-deselected { text-decoration: line-through; }

/* Sticky bottom bar */
.dbx-sticky-bar { position: sticky; bottom: 0; background: var(--bg);
  border-top: 1px solid var(--border); padding: 14px 0;
  display: flex; align-items: center; gap: 16px; z-index: 100; margin-top: 32px; }
.dbx-sticky-count { font-size: 13px; color: var(--text-dim);
  font-family: var(--font-mono); }
.dbx-sticky-count strong { color: var(--text); }

/* Import progress overlay */
.dbx-import-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6);
  display: flex; align-items: center; justify-content: center; z-index: 999; }
.dbx-import-box { background: var(--bg); border-radius: 8px; padding: 32px 40px;
  min-width: 340px; text-align: center; }
.dbx-import-box h3 { margin: 0 0 16px; font-size: 16px; }
.dbx-import-msg { font-size: 13px; color: var(--text-dim); margin-bottom: 16px; }

/* Responsive */
@media (max-width: 640px) {
  .dbx-gallery { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  .dbx-folder-fields { flex-direction: column; }
}
  `;
  document.head.appendChild(style);
})();

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function scoreTone(score) {
  if (score >= 9) return 'score-hi';
  if (score >= 7) return 'score-mid';
  return 'score-lo';
}

function guessYear(folderName) {
  const m = (folderName || '').match(/\b(20\d{2})\b/);
  if (m) return parseInt(m[1], 10);
  return new Date().getFullYear();
}

function guessProjectName(folderName) {
  return (folderName || '')
    .replace(/_/g, ' ')
    .replace(/\b(20\d{2})\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/* Step indicators                                                     */
/* ------------------------------------------------------------------ */
function StepIndicator({ current }) {
  const steps = [
    { n: 1, label: 'Select folders' },
    { n: 2, label: 'Analyzing' },
    { n: 3, label: 'Review & import' },
  ];
  return (
    <div className="dbx-step-indicator">
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className={`dbx-step ${current === s.n ? 'is-active' : ''} ${current > s.n ? 'is-done' : ''}`}>
            <div className="dbx-step-num">{current > s.n ? '✓' : s.n}</div>
            <span>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className="dbx-step-sep" />}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 1 — Folder picker                                             */
/* ------------------------------------------------------------------ */
function FolderPicker({ onAnalyze }) {
  const [folders, setFolders]       = dbS(null);    // null = loading
  const [loadErr, setLoadErr]       = dbS(null);
  const [checked, setChecked]       = dbS(new Set());
  const [targetCount, setTarget]    = dbS(15);
  const [analyzing, setAnalyzing]   = dbS(false);
  const [noToken, setNoToken]       = dbS(false);

  dbE(() => {
    window.AdminStore.apiFetch('/api/dropbox/folders')
      .then(res => {
        if (res.error === 'DROPBOX_ACCESS_TOKEN not configured') {
          setNoToken(true);
          setFolders([]);
        } else {
          setFolders(res.folders || []);
        }
      })
      .catch(err => {
        setLoadErr(err?.message || 'Failed to load folders');
        setFolders([]);
      });
  }, []);

  const toggleFolder = (path) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const selectAll = () => {
    if (folders) setChecked(new Set(folders.map(f => f.path)));
  };

  const deselectAll = () => setChecked(new Set());

  const handleAnalyze = async () => {
    if (checked.size === 0) return;
    setAnalyzing(true);
    try {
      const res = await window.AdminStore.apiFetch('/api/dropbox/curate', {
        method: 'POST',
        body: JSON.stringify({ folders: Array.from(checked), targetCount }),
      });
      if (res.jobId) {
        onAnalyze(res.jobId);
      } else {
        toast.error('Failed to start job: ' + (res.error || 'unknown'));
        setAnalyzing(false);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to start curation job');
      setAnalyzing(false);
    }
  };

  if (noToken) {
    return (
      <div>
        <StepIndicator current={1} />
        <div className="dbx-setup-card">
          <h3>Dropbox not connected</h3>
          <p>
            To use AI Import, add your Dropbox access token to the NAS server environment variables.
          </p>
          <p>
            1. Go to <strong>dropbox.com/developers</strong> and create an app (Full Dropbox, Scoped Access).<br/>
            2. Under Permissions, enable: <code>files.metadata.read</code>, <code>files.content.read</code>.<br/>
            3. Generate an access token under Settings.<br/>
            4. Add to <code>nas-server/.env</code>:<br/>
            &nbsp;&nbsp;<code>DROPBOX_ACCESS_TOKEN=sl.your_token_here</code><br/>
            5. Rebuild the Docker container: <code>sudo docker-compose up -d --build</code>
          </p>
        </div>
      </div>
    );
  }

  if (folders === null) {
    return (
      <div>
        <StepIndicator current={1} />
        <div className="dbx-progress-wrap">
          <div className="dbx-spinner" />
          <div className="dbx-phase">Loading Dropbox folders…</div>
        </div>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div>
        <StepIndicator current={1} />
        <div className="dbx-error-box">{loadErr}</div>
      </div>
    );
  }

  if (folders.length === 0) {
    return (
      <div>
        <StepIndicator current={1} />
        <Empty title="No folders found" sub="Your Dropbox root has no folders, or the token lacks access." />
      </div>
    );
  }

  const foldersWithImages = folders.filter(f => f.imageCount > 0);
  const totalImages = foldersWithImages.reduce((s, f) => s + f.imageCount, 0);

  return (
    <div className="dbx-wizard">
      <StepIndicator current={1} />

      <div className="dbx-folder-controls">
        <Btn variant="ghost" size="sm" onClick={selectAll}>Select all</Btn>
        <Btn variant="ghost" size="sm" onClick={deselectAll}>Deselect all</Btn>
        <span className="dbx-folder-count">
          {folders.length} folders · {totalImages.toLocaleString()} images total
        </span>
      </div>

      <table className="dbx-folder-table">
        <tbody>
          {folders.map(folder => (
            <tr
              key={folder.path}
              className={`dbx-folder-row ${checked.has(folder.path) ? 'is-checked' : ''}`}
              onClick={() => toggleFolder(folder.path)}
              style={{ cursor: 'pointer' }}
            >
              <td className="dbx-folder-cell dbx-folder-cell-check">
                <input
                  type="checkbox"
                  checked={checked.has(folder.path)}
                  onChange={() => {}}
                  onClick={e => e.stopPropagation()}
                  style={{ cursor: 'pointer' }}
                />
              </td>
              <td className="dbx-folder-cell">
                <div className="dbx-folder-name">{folder.name}</div>
              </td>
              <td className="dbx-folder-cell" style={{ textAlign: 'right' }}>
                <span className="dbx-img-badge">{folder.imageCount} images</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="dbx-target-row">
        <span className="dbx-target-label">Target picks per folder:</span>
        <Radio
          name="targetCount"
          value={String(targetCount)}
          onChange={v => setTarget(Number(v))}
          options={[
            { value: '10', label: '10' },
            { value: '15', label: '15' },
            { value: '20', label: '20' },
          ]}
        />
        <div style={{ marginLeft: 'auto' }}>
          <Btn
            onClick={handleAnalyze}
            disabled={checked.size === 0 || analyzing}
            icon={analyzing ? '…' : '✦'}
          >
            {analyzing
              ? 'Starting…'
              : `Analyze ${checked.size} folder${checked.size !== 1 ? 's' : ''} with Claude`}
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2 — Processing                                                 */
/* ------------------------------------------------------------------ */
function ProcessingView({ jobId, onDone }) {
  const [job, setJob] = dbS(null);
  const pollRef = dbRef(null);

  dbE(() => {
    const poll = async () => {
      try {
        const j = await window.AdminStore.apiFetch(`/api/dropbox/curate/${jobId}`);
        setJob(j);
        if (j.status === 'done') {
          clearInterval(pollRef.current);
          onDone(j);
        } else if (j.status === 'error') {
          clearInterval(pollRef.current);
        }
      } catch (err) {
        // keep polling on transient errors
        console.warn('[poll]', err?.message);
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  const pct = job && job.foldersTotal > 0
    ? Math.round((job.foldersDone / job.foldersTotal) * 100)
    : 0;

  return (
    <div className="dbx-wizard">
      <StepIndicator current={2} />

      <div className="dbx-progress-wrap">
        {job?.status === 'error' ? (
          <div className="dbx-error-box">
            <strong>Analysis failed</strong><br />
            {job.error || 'Unknown error'}
          </div>
        ) : (
          <>
            <div className="dbx-spinner" />
            <div className="dbx-phase">{job?.phase || 'Starting…'}</div>
            {job && (
              <>
                <div className="dbx-progress-count">
                  {job.foldersDone} / {job.foldersTotal} folders analyzed
                </div>
                <div className="dbx-progress-bar-track">
                  <div className="dbx-progress-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3 — Review grid                                               */
/* ------------------------------------------------------------------ */
function ReviewView({ job }) {
  // Per-folder state: projectName, year, selected image paths
  const initFolderState = () => {
    const state = {};
    for (const result of (job.results || [])) {
      const selectedPaths = new Set(result.selected.map(s => s.dropboxPath));
      state[result.folderPath] = {
        projectName: guessProjectName(result.folderName),
        year: guessYear(result.folderName),
        selected: selectedPaths,
      };
    }
    return state;
  };

  const [folderState, setFolderState] = dbS(initFolderState);
  const [importing, setImporting]     = dbS(false);
  const [importMsg, setImportMsg]     = dbS('');

  const totalSelected = Object.values(folderState)
    .reduce((s, f) => s + f.selected.size, 0);

  const updateFolder = (folderPath, key, value) => {
    setFolderState(prev => ({
      ...prev,
      [folderPath]: { ...prev[folderPath], [key]: value },
    }));
  };

  const toggleImage = (folderPath, dropboxPath) => {
    setFolderState(prev => {
      const fs = prev[folderPath];
      const next = new Set(fs.selected);
      next.has(dropboxPath) ? next.delete(dropboxPath) : next.add(dropboxPath);
      return { ...prev, [folderPath]: { ...fs, selected: next } };
    });
  };

  const reselectAll = (folderPath, result) => {
    const all = new Set(result.selected.map(s => s.dropboxPath));
    updateFolder(folderPath, 'selected', all);
  };

  const handleImport = async () => {
    if (totalSelected === 0) return;
    setImporting(true);
    setImportMsg('Preparing import…');

    const foldersToImport = (job.results || [])
      .map(result => {
        const fs = folderState[result.folderPath];
        if (!fs || fs.selected.size === 0) return null;
        return {
          folderPath: result.folderPath,
          projectName: fs.projectName || result.folderName,
          year: fs.year || new Date().getFullYear(),
          imageDropboxPaths: result.selected
            .filter(s => fs.selected.has(s.dropboxPath))
            .map(s => s.dropboxPath),
        };
      })
      .filter(Boolean);

    if (foldersToImport.length === 0) {
      setImporting(false);
      return;
    }

    const totalCount = foldersToImport.reduce((s, f) => s + f.imageDropboxPaths.length, 0);
    setImportMsg(`Downloading and importing ${totalCount} images… This may take a few minutes.`);

    try {
      const res = await window.AdminStore.apiFetch('/api/dropbox/import', {
        method: 'POST',
        body: JSON.stringify({ foldersToImport }),
      });

      if (res.projects) {
        const names = res.projects.map(p => p.name).join(', ');
        toast.success(`Created ${res.projects.length} project${res.projects.length !== 1 ? 's' : ''}: ${names}. ${res.totalImages} images imported.`);
        // Navigate to projects
        window.location.hash = '#/projects';
      } else {
        toast.error('Import failed: ' + (res.error || res.message || 'unknown error'));
      }
    } catch (err) {
      toast.error('Import failed: ' + (err?.message || 'unknown'));
    } finally {
      setImporting(false);
      setImportMsg('');
    }
  };

  return (
    <div className="dbx-wizard">
      <StepIndicator current={3} />

      {(job.results || []).map(result => {
        const fs = folderState[result.folderPath];
        if (!fs) return null;

        const selectedCount = fs.selected.size;

        return (
          <div key={result.folderPath} className="dbx-folder-section">
            <div className="dbx-folder-head">
              <div>
                <div className="dbx-folder-title">{result.folderName}</div>
                <div className="dbx-folder-meta">
                  {selectedCount} selected / {result.total} total
                  {result.total > 0 && ` · Claude picked ${result.selected.length}`}
                </div>
              </div>
              <div className="dbx-folder-fields">
                <div className="dbx-field-group">
                  <span className="dbx-field-label">Project name</span>
                  <input
                    className="dbx-input dbx-input-name"
                    value={fs.projectName}
                    onChange={e => updateFolder(result.folderPath, 'projectName', e.target.value)}
                    placeholder="Project name"
                  />
                </div>
                <div className="dbx-field-group">
                  <span className="dbx-field-label">Year</span>
                  <input
                    className="dbx-input dbx-input-year"
                    type="number"
                    min="2000"
                    max="2099"
                    value={fs.year}
                    onChange={e => updateFolder(result.folderPath, 'year', e.target.value)}
                  />
                </div>
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => reselectAll(result.folderPath, result)}
                >
                  Re-select all
                </Btn>
              </div>
            </div>

            {result.selected.length === 0 ? (
              <Empty
                title="No images selected"
                sub="Claude could not fetch thumbnails for this folder."
              />
            ) : (
              <div className="dbx-gallery">
                {result.selected.map(img => {
                  const isOn = fs.selected.has(img.dropboxPath);
                  return (
                    <div
                      key={img.dropboxPath}
                      className={`dbx-thumb-wrap ${isOn ? 'is-selected' : 'is-deselected'}`}
                      onClick={() => toggleImage(result.folderPath, img.dropboxPath)}
                      title={img.reason}
                    >
                      {img.thumbnailDataUrl ? (
                        <img
                          className="dbx-thumb-img"
                          src={img.thumbnailDataUrl}
                          alt={img.filename}
                          loading="lazy"
                        />
                      ) : (
                        <div className="dbx-thumb-img-placeholder">{img.filename}</div>
                      )}

                      <span className={`dbx-score-badge ${scoreTone(img.score)}`}>
                        {img.score}/10
                      </span>

                      {!isOn && (
                        <span className="dbx-deselect-x" aria-label="Deselected">✕</span>
                      )}

                      {img.reason && (
                        <div className={`dbx-thumb-reason ${isOn ? '' : 'is-deselected'}`}>
                          {img.reason}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Sticky bottom bar */}
      <div className="dbx-sticky-bar">
        <span className="dbx-sticky-count">
          <strong>{totalSelected}</strong> image{totalSelected !== 1 ? 's' : ''} selected across{' '}
          <strong>{(job.results || []).length}</strong> folder{(job.results || []).length !== 1 ? 's' : ''}
        </span>
        <Btn
          onClick={handleImport}
          disabled={totalSelected === 0 || importing}
          icon={importing ? '…' : '↑'}
        >
          {importing ? 'Importing…' : 'Create projects & upload to site'}
        </Btn>
      </div>

      {importing && (
        <div className="dbx-import-overlay">
          <div className="dbx-import-box">
            <h3>Importing images</h3>
            <div className="dbx-progress-wrap" style={{ padding: '0 0 16px' }}>
              <div className="dbx-spinner" />
            </div>
            <div className="dbx-import-msg">{importMsg}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              Full-resolution images are being downloaded from Dropbox and processed.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
function DropboxImportView({ navigate }) {
  const [step, setStep]   = dbS(1);
  const [jobId, setJobId] = dbS(null);
  const [job,   setJob]   = dbS(null);

  const handleAnalyze = (id) => {
    setJobId(id);
    setStep(2);
  };

  const handleDone = (completedJob) => {
    setJob(completedJob);
    setStep(3);
  };

  return (
    <>
      <PageHeader
        eyebrow="AI Import"
        title="Dropbox Curation"
        crumbs={[
          { label: 'Admin', href: '#/dashboard' },
          { label: 'AI Import' },
        ]}
        actions={
          step > 1 && (
            <Btn variant="ghost" onClick={() => { setStep(1); setJobId(null); setJob(null); }}>
              ← Start over
            </Btn>
          )
        }
      />

      {step === 1 && <FolderPicker onAnalyze={handleAnalyze} />}
      {step === 2 && jobId && <ProcessingView jobId={jobId} onDone={handleDone} />}
      {step === 3 && job   && <ReviewView job={job} />}
    </>
  );
}

window.DropboxImportView = DropboxImportView;
