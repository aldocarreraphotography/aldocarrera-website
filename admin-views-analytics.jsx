/* admin-views-analytics.jsx — Studio Analytics Dashboard */

const { useState: anS, useEffect: anE, useMemo: anM } = React;

/* ── Formatters ─────────────────────────────────────────────────── */
function anFmtBytes(n) {
  if (!n) return '0 B';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB';
  return n + ' B';
}
function anFmtNum(n) { return n == null ? '—' : Number(n).toLocaleString(); }
function anPct(a, b) { return (!b || b === 0) ? '—' : Math.round((a / b) * 100) + '%'; }
function anFmtMonth(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mo,10)-1] + ' ' + y.slice(2);
}

/* ── Horizontal bar row ─────────────────────────────────────────── */
function AnBarRow({ label, value, max, sub, color, onClick }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className={`an-bar-row ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="an-bar-label" title={label}>{label.length > 22 ? label.slice(0,21)+'…' : label}</div>
      <div className="an-bar-track">
        <div className="an-bar-fill" style={{ width: w + '%', background: color || 'var(--accent)' }}/>
      </div>
      <div className="an-bar-val">{anFmtNum(value)}{sub && <span className="an-bar-sub"> {sub}</span>}</div>
    </div>
  );
}

/* ── Vertical column chart (upload activity) ────────────────────── */
function AnColChart({ data }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="an-col-chart">
      {data.map(d => (
        <div key={d.month} className="an-col-item" title={`${anFmtMonth(d.month)}: ${d.count} images`}>
          <div className="an-col-bar-wrap">
            <div
              className="an-col-bar"
              style={{ height: max > 0 ? Math.max(2, (d.count / max) * 100) + '%' : '2%' }}
            />
          </div>
          <div className="an-col-label">{d.month ? d.month.slice(5) : ''}</div>
          {d.count > 0 && <div className="an-col-val">{d.count}</div>}
        </div>
      ))}
    </div>
  );
}

/* ── Segmented bar (type / status breakdown) ────────────────────── */
function AnSegBar({ items, total }) {
  const hasData = items.some(i => i.value > 0);
  return (
    <div>
      <div className="an-seg-bar">
        {hasData ? items.filter(i => i.value > 0).map((it, i) => (
          <div
            key={i}
            className="an-seg"
            style={{ width: total > 0 ? (it.value / total) * 100 + '%' : 0, background: it.color }}
            title={`${it.label}: ${anFmtNum(it.value)} (${anPct(it.value, total)})`}
          />
        )) : <div className="an-seg" style={{ width: '100%', background: 'var(--rule)' }}/>}
      </div>
      <div className="an-seg-legend">
        {items.map((it, i) => (
          <div key={i} className="an-seg-item">
            <span className="an-seg-dot" style={{ background: it.color }}/>
            <span className="an-seg-label">{it.label}</span>
            <span className="an-seg-n">{anFmtNum(it.value)}</span>
            <span className="an-seg-pct">{anPct(it.value, total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Big stat card ──────────────────────────────────────────────── */
function AnStat({ label, value, sub, accent, warn }) {
  return (
    <div className="an-stat">
      <div className="an-stat-label">{label}</div>
      <div
        className="an-stat-value"
        style={accent ? { color: 'var(--accent)' } : warn ? { color: '#b84242' } : {}}
      >{value}</div>
      {sub && <div className="an-stat-sub">{sub}</div>}
    </div>
  );
}

/* ── Small metric tile ──────────────────────────────────────────── */
function AnMetric({ label, value, sub }) {
  return (
    <div className="an-metric">
      <div className="an-metric-val">{value}</div>
      <div className="an-metric-label">{label}</div>
      {sub && <div className="an-metric-sub">{sub}</div>}
    </div>
  );
}

/* ── Funnel row ─────────────────────────────────────────────────── */
function AnFunnelRow({ label, value, total, color }) {
  const w = total > 0 ? Math.max(4, (value / total) * 100) : 4;
  return (
    <div className="an-funnel-row">
      <div className="an-funnel-label">{label}</div>
      <div className="an-funnel-track">
        <div className="an-funnel-bar" style={{ width: w + '%', background: color }}/>
      </div>
      <div className="an-funnel-val">
        {anFmtNum(value)}
        {total > 0 && value !== total && (
          <span className="an-funnel-pct"> · {anPct(value, total)}</span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   ANALYTICS VIEW
   ============================================================ */
/* ── Client-side analytics computation ─────────────────────────────
   Permanent fix: do not depend on a /api/analytics endpoint. Compute
   everything from data we already have access to:
     • projects   — from AdminStore (in-memory, always available)
     • galleries  — from /api/galleries (existing endpoint)
     • videos     — from /api/videos    (existing endpoint)
   If galleries or videos fail to fetch, we still show the projects
   sections so the page is never blank.
─────────────────────────────────────────────────────────────────── */
function _computeAnalytics(projects, galleries, videos) {
  let totalImages = 0, totalStorage = 0, totalSelected = 0;
  let totalFavorite = 0, totalRejected = 0, totalCover = 0;
  const byYear = {}, byType = {}, projectsByClient = {}, byMonth = {};

  for (const p of (projects || [])) {
    const imgs = p.images || [];
    totalImages += imgs.length;
    projectsByClient[p.client || 'Unknown'] = (projectsByClient[p.client || 'Unknown'] || 0) + 1;
    byYear[String(p.year || 'Unknown')]       = (byYear[String(p.year || 'Unknown')] || 0) + imgs.length;
    byType[(p.type || 'Other').toUpperCase()] = (byType[(p.type || 'Other').toUpperCase()] || 0) + imgs.length;

    for (const img of imgs) {
      totalStorage += img.exif?.fileSize || 0;
      if (img.selected) totalSelected++;
      if (img.favorite) totalFavorite++;
      if (img.rejected) totalRejected++;
      if (img.cover)    totalCover++;
      const dt = img.exif?.dateTaken || img.createdAt;
      if (dt) {
        const m = dt.slice(0, 7);
        byMonth[m] = (byMonth[m] || 0) + 1;
      }
    }
  }

  let totalViews = 0, neverOpened = 0, galSubmitted = 0, galArchived = 0;
  let totalSelects = 0, totalAlts = 0, totalKills = 0, totalReviewed = 0;
  let totalTurnaroundDays = 0, turnaroundCount = 0;

  const galleryRows = (galleries || []).map(g => {
    const sels = g.selections || {};
    const vals = Object.values(sels);
    const sel  = vals.filter(s => s.label === 'SELECT').length;
    const alt  = vals.filter(s => s.label === 'ALT').length;
    const kill = vals.filter(s => s.label === 'KILL').length;
    const rev  = vals.filter(s => s.label).length;
    totalViews    += (g.viewCount || 0);
    totalSelects  += sel;
    totalAlts     += alt;
    totalKills    += kill;
    totalReviewed += rev;
    if (!g.viewCount) neverOpened++;
    if (g.status === 'submitted') {
      galSubmitted++;
      if (g.createdAt && g.submittedAt) {
        const days = (new Date(g.submittedAt) - new Date(g.createdAt)) / 86400000;
        if (days >= 0 && days < 365) { totalTurnaroundDays += days; turnaroundCount++; }
      }
    }
    if (g.status === 'archived') galArchived++;
    return {
      token: g.token, title: g.title, clientName: g.clientName,
      status: g.status || 'open',
      viewCount: g.viewCount || 0, lastViewedAt: g.lastViewedAt || null,
      selects: sel, alts: alt, kills: kill, reviewed: rev,
      createdAt: g.createdAt || null, submittedAt: g.submittedAt || null,
    };
  });

  const topByViews = galleryRows.slice().sort((a, b) => b.viewCount - a.viewCount).slice(0, 5);
  const avgTurnaround = turnaroundCount > 0 ? Math.round(totalTurnaroundDays / turnaroundCount) : null;

  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return d.toISOString().slice(0, 7);
  });
  const uploadsByMonth = months.map(m => ({ month: m, count: byMonth[m] || 0 }));

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      totalProjects:  (projects || []).length,
      publicProjects: (projects || []).filter(p => p.public !== false).length,
      totalImages, totalStorage, totalSelected, totalFavorite,
      totalRejected, totalCover,
      totalVideos:  (videos || []).length,
      publicVideos: (videos || []).filter(v => v.public !== false).length,
    },
    projects: {
      byYear:   Object.entries(byYear).sort((a,b) => b[0].localeCompare(a[0])).map(([year, count]) => ({ year, count })),
      byType:   Object.entries(byType).sort((a,b) => b[1] - a[1]).map(([type, count]) => ({ type, count })),
      byClient: Object.entries(projectsByClient).sort((a,b) => b[1] - a[1]).slice(0, 12).map(([client, count]) => ({ client, count })),
    },
    galleries: {
      total:        (galleries || []).length,
      open:         (galleries || []).length - galSubmitted - galArchived,
      submitted:    galSubmitted,
      archived:     galArchived,
      totalViews, neverOpened, totalSelects, totalAlts, totalKills, totalReviewed,
      avgTurnaroundDays: avgTurnaround,
      topByViews,
    },
    activity: { uploadsByMonth },
  };
}

function AnalyticsView({ navigate }) {
  window.useStoreSubscribe();
  const [data,    setData]    = anS(null);
  const [loading, setLoading] = anS(true);
  const [warning, setWarning] = anS(null);
  const [refreshed, setRefreshed] = anS(null);

  const load = async () => {
    setLoading(true);
    setWarning(null);

    // Projects come from the in-memory store — always available.
    const projects = window.AdminStore.getProjects() || [];

    // Galleries + videos come from the API. Tolerate failure for each.
    const fails = [];
    const [galRes, vidRes] = await Promise.all([
      window.AdminStore.apiFetch('/api/galleries').then(d => d.galleries || d || [])
        .catch(e => { fails.push('galleries'); console.warn('[analytics] galleries fetch failed:', e?.message); return []; }),
      window.AdminStore.apiFetch('/api/videos').then(d => d.videos || d || [])
        .catch(e => { fails.push('videos'); console.warn('[analytics] videos fetch failed:', e?.message); return []; }),
    ]);

    setData(_computeAnalytics(projects, galRes, vidRes));
    if (fails.length) setWarning(`Could not reach ${fails.join(' + ')} API — showing project data only.`);
    setRefreshed(new Date());
    setLoading(false);
  };

  anE(() => { load(); }, []);

  if (loading && !data) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink-muted)' }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>◌</div>
      Computing analytics…
    </div>
  );
  if (!data) return null;

  const { overview, projects, galleries, activity } = data;

  const maxYear        = Math.max(...(projects.byYear   || []).map(r => r.count), 1);
  const maxClient      = Math.max(...(projects.byClient || []).map(r => r.count), 1);
  const maxViews       = Math.max(...(galleries.topByViews || []).map(g => g.viewCount), 1);
  const totalTypeImgs  = (projects.byType || []).reduce((s, r) => s + r.count, 0);
  const selectRate     = galleries.totalReviewed > 0 ? Math.round((galleries.totalSelects / galleries.totalReviewed) * 100) : 0;
  const openRate       = galleries.total > 0 ? Math.round(((galleries.total - galleries.neverOpened) / galleries.total) * 100) : 0;
  const avgImgPerProj  = overview.totalProjects > 0 ? Math.round(overview.totalImages / overview.totalProjects) : 0;
  const typeColors     = ['var(--accent)', '#3a70a8', '#7a6a8a', '#5a8a6a', '#8a6a3a'];

  return (
    <>
      <PageHeader
        eyebrow="Studio"
        title="Analytics"
        crumbs={[{ label: 'Admin', href: '#/dashboard' }, { label: 'Analytics' }]}
        actions={
          <>
            {refreshed && (
              <span className="ad-muted" style={{ fontSize: 12, alignSelf: 'center' }}>
                {refreshed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            <Btn variant="ghost" onClick={load} disabled={loading}>↺ Refresh</Btn>
          </>
        }
      />

      {warning && (
        <div style={{
          padding: '10px 14px', marginBottom: 16,
          background: '#fff4d6', border: '1px solid #e6c46a', borderRadius: 8,
          fontSize: 12, color: '#6a5310',
        }}>⚠ {warning}</div>
      )}

      {/* ── Overview strip ─────────────────────────────────────────── */}
      <div className="an-overview-grid">
        <AnStat
          label="Projects"
          value={anFmtNum(overview.totalProjects)}
          sub={`${overview.publicProjects} public · ${overview.totalProjects - overview.publicProjects} private`}
        />
        <AnStat
          label="Images"
          value={anFmtNum(overview.totalImages)}
          sub={`avg ${anFmtNum(avgImgPerProj)} / project`}
        />
        <AnStat
          label="Archive size"
          value={anFmtBytes(overview.totalStorage)}
          sub="original files on NAS"
        />
        <AnStat
          label="Gallery views"
          value={anFmtNum(galleries.totalViews)}
          sub={`${openRate}% link open rate`}
          accent
        />
        <AnStat
          label="Client selects"
          value={anFmtNum(galleries.totalSelects)}
          sub={`+ ${anFmtNum(galleries.totalAlts)} ALT picked`}
          accent
        />
        <AnStat
          label="Videos"
          value={anFmtNum(overview.totalVideos)}
          sub={`${overview.publicVideos} public in reels`}
        />
      </div>

      {/* ── Image status quick strip ───────────────────────────────── */}
      <div className="an-image-strip">
        <div className="an-img-pill">
          <span className="an-img-pill-val" style={{ color: '#2a7a4f' }}>{anFmtNum(overview.totalSelected)}</span>
          <span className="an-img-pill-label">Marked select</span>
        </div>
        <div className="an-img-pill">
          <span className="an-img-pill-val" style={{ color: '#c89b3c' }}>{anFmtNum(overview.totalFavorite)}</span>
          <span className="an-img-pill-label">Favorited</span>
        </div>
        <div className="an-img-pill">
          <span className="an-img-pill-val" style={{ color: '#b84242' }}>{anFmtNum(overview.totalRejected)}</span>
          <span className="an-img-pill-label">Rejected</span>
        </div>
        <div className="an-img-pill">
          <span className="an-img-pill-val">{anFmtNum(overview.totalCover)}</span>
          <span className="an-img-pill-label">Cover images set</span>
        </div>
        <div className="an-img-pill">
          <span className="an-img-pill-val">{anFmtNum(galleries.totalKills)}</span>
          <span className="an-img-pill-label">KILL by clients</span>
        </div>
        <div className="an-img-pill">
          <span className="an-img-pill-val">{anFmtNum(galleries.submitted)}</span>
          <span className="an-img-pill-label">Galleries submitted</span>
        </div>
      </div>

      <div className="an-grid-2">

        {/* ── Upload activity ─────────────────────────────────────── */}
        <Card padding="lg" className="an-span-2">
          <SectionHead
            eyebrow="Activity"
            title="Uploads per month"
            sub="Images added to projects over the last 12 months"
          />
          <AnColChart data={activity.uploadsByMonth}/>
        </Card>

        {/* ── Projects by year ─────────────────────────────────────── */}
        <Card padding="lg">
          <SectionHead eyebrow="Archive" title="Images by year" sub="Total frames per shoot year"/>
          <div className="an-bar-list">
            {projects.byYear.map(r => (
              <AnBarRow key={r.year} label={r.year} value={r.count} max={maxYear} sub="images"/>
            ))}
            {projects.byYear.length === 0 && <div className="ad-muted">No data yet.</div>}
          </div>
        </Card>

        {/* ── Project type breakdown ───────────────────────────────── */}
        <Card padding="lg">
          <SectionHead eyebrow="Projects" title="By shoot type"/>
          <AnSegBar
            total={totalTypeImgs}
            items={(projects.byType || []).map((r, i) => ({
              label: r.type,
              value: r.count,
              color: typeColors[i % typeColors.length],
            }))}
          />

          <div style={{ marginTop: 28 }}>
            <SectionHead eyebrow="Images" title="Active vs rejected"/>
            <AnSegBar
              total={overview.totalImages}
              items={[
                { label: 'Active',   value: overview.totalImages - overview.totalRejected, color: '#2a7a4f' },
                { label: 'Rejected', value: overview.totalRejected, color: '#b84242' },
              ]}
            />
          </div>

          <div style={{ marginTop: 28 }}>
            <SectionHead eyebrow="Images" title="Select vs favorite"/>
            <AnSegBar
              total={overview.totalImages}
              items={[
                { label: 'Select',      value: overview.totalSelected, color: 'var(--accent)' },
                { label: 'Favorite',    value: overview.totalFavorite, color: '#c89b3c' },
                { label: 'Untagged',    value: Math.max(0, overview.totalImages - overview.totalSelected - overview.totalFavorite - overview.totalRejected), color: 'var(--rule)' },
              ]}
            />
          </div>
        </Card>

        {/* ── Top clients ─────────────────────────────────────────── */}
        <Card padding="lg">
          <SectionHead eyebrow="Clients" title="Projects per client" sub="Ranked by number of shoots"/>
          <div className="an-bar-list">
            {projects.byClient.slice(0, 10).map(r => (
              <AnBarRow
                key={r.client}
                label={r.client}
                value={r.count}
                max={maxClient}
                sub={r.count === 1 ? 'project' : 'projects'}
                color="#3a70a8"
              />
            ))}
            {projects.byClient.length === 0 && <div className="ad-muted">No data yet.</div>}
          </div>
        </Card>

        {/* ── Gallery funnel ───────────────────────────────────────── */}
        <Card padding="lg">
          <SectionHead eyebrow="Galleries" title="Review funnel" sub="Client journey from link creation to submission"/>
          <div className="an-funnel-list">
            <AnFunnelRow label="Created"   value={galleries.total}                                color="#5a8fc8" total={galleries.total}/>
            <AnFunnelRow label="Opened"    value={galleries.total - galleries.neverOpened}         color="#3a70a8" total={galleries.total}/>
            <AnFunnelRow label="Reviewed"  value={galleries.totalReviewed > 0 ? Math.min(galleries.total, galleries.submitted + (galleries.total - galleries.neverOpened)) : 0} color="#7a6a9a" total={galleries.total}/>
            <AnFunnelRow label="Submitted" value={galleries.submitted}                             color="#2a7a4f" total={galleries.total}/>
          </div>

          <div className="an-metric-grid" style={{ marginTop: 24 }}>
            <AnMetric label="Select rate"   value={selectRate + '%'} sub="of reviewed images"/>
            <AnMetric label="Open rate"     value={openRate + '%'}   sub="of gallery links"/>
            <AnMetric label="Submit rate"   value={anPct(galleries.submitted, galleries.total)} sub="fully reviewed"/>
            <AnMetric
              label="Avg turnaround"
              value={galleries.avgTurnaroundDays != null ? galleries.avgTurnaroundDays + 'd' : '—'}
              sub="creation → submit"
            />
          </div>
        </Card>

        {/* ── Selection breakdown ─────────────────────────────────── */}
        <Card padding="lg">
          <SectionHead eyebrow="Galleries" title="What clients choose" sub="Labels applied across all gallery reviews"/>
          <AnSegBar
            total={(galleries.totalSelects + galleries.totalAlts + galleries.totalKills) || 1}
            items={[
              { label: 'SELECT', value: galleries.totalSelects, color: '#2a7a4f' },
              { label: 'ALT',    value: galleries.totalAlts,    color: '#3a70a8' },
              { label: 'KILL',   value: galleries.totalKills,   color: '#b84242' },
            ]}
          />
          <div style={{ marginTop: 28 }}>
            <SectionHead eyebrow="Galleries" title="Status breakdown"/>
            <AnSegBar
              total={galleries.total || 1}
              items={[
                { label: 'Open',      value: galleries.open,      color: '#3a70a8' },
                { label: 'Submitted', value: galleries.submitted, color: '#2a7a4f' },
                { label: 'Archived',  value: galleries.archived,  color: 'var(--ink-muted)' },
              ]}
            />
          </div>
          <div className="an-metric-grid" style={{ marginTop: 24 }}>
            <AnMetric label="Total selects"  value={anFmtNum(galleries.totalSelects)} sub="across all galleries"/>
            <AnMetric label="Total ALT"      value={anFmtNum(galleries.totalAlts)}    sub="alternate picks"/>
            <AnMetric label="Total KILL"     value={anFmtNum(galleries.totalKills)}   sub="client rejections"/>
            <AnMetric label="Never opened"   value={anFmtNum(galleries.neverOpened)}  sub="links unseen"/>
          </div>
        </Card>

        {/* ── Top galleries by views ───────────────────────────────── */}
        <Card padding="lg">
          <SectionHead eyebrow="Galleries" title="Most viewed links" sub="Client gallery links ranked by total opens"/>
          {galleries.topByViews.length === 0 ? (
            <div className="ad-muted" style={{ padding: '24px 0' }}>No gallery views recorded yet.</div>
          ) : (
            <div className="an-gallery-list">
              {galleries.topByViews.map(g => (
                <div key={g.token} className="an-gallery-row">
                  <div className="an-gallery-info">
                    <div className="an-gallery-title">{g.title}</div>
                    {g.clientName && <div className="an-gallery-client">{g.clientName}</div>}
                    {g.lastViewedAt && (
                      <div className="an-gallery-last">Last: {new Date(g.lastViewedAt).toLocaleDateString()}</div>
                    )}
                  </div>
                  <div className="an-gallery-right">
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <span className={`ad-badge ${g.status === 'submitted' ? 'ad-badge-green' : g.status === 'archived' ? 'ad-badge-muted' : 'ad-badge-blue'}`}>
                        {g.status}
                      </span>
                      <span className="an-gallery-views">{anFmtNum(g.viewCount)} views</span>
                      <span className="ad-muted" style={{ fontSize: 11 }}>· {g.selects} sel</span>
                    </div>
                    <div className="an-mini-bar-track">
                      <div className="an-mini-bar" style={{ width: maxViews > 0 ? (g.viewCount / maxViews * 100) + '%' : '0%' }}/>
                    </div>
                    <button className="ad-link" style={{ fontSize: 11, marginTop: 4 }} onClick={() => navigate(`#/galleries/${g.token}`)}>Review →</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

      </div>
    </>
  );
}

Object.assign(window, { AnalyticsView });
