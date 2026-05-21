/* admin-views-analytics.jsx — Studio Analytics Dashboard */

const { useState: anS, useEffect: anE, useMemo: anM } = React;

/* ── Google Analytics 4 config ──────────────────────────────────
   Measurement ID is hard-coded to match what's installed in
   index.html, gallery.html, deck.html, and 404.html. */
const GA_MEASUREMENT_ID = 'G-EJNJGESZT6';
const GA_PROPERTY_NAME  = 'aldocarrera.com';
const GA_HOME           = 'https://analytics.google.com/';
const GA_REALTIME       = 'https://analytics.google.com/analytics/web/#/realtime/overview';
const GA_REPORTS        = 'https://analytics.google.com/analytics/web/#/reports/reportinghub';

/* ── GA4 helper: format seconds as m:ss ─────────────────────────── */
function anFmtDur(sec) {
  if (!sec && sec !== 0) return '—';
  const s = Math.round(sec);
  if (s < 60) return s + 's';
  return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
}

/* ── Public Site Traffic section — with inline GA4 Data API metrics ─
   • Fetches /api/ga-analytics from the NAS (requires GA_PROPERTY_ID
     and GA_CREDENTIALS_JSON env vars to be set on the NAS).
   • Falls back to install-check + quick-links if credentials aren't
     configured yet (503 from the NAS endpoint).
   • Always verifies the gtag install from the live homepage.        */
function GAPublicTrafficCard() {
  const [installStatus, setInstallStatus] = anS('checking');
  const [installDetail, setInstallDetail] = anS('');
  const [gaData,        setGaData]        = anS(null);   // null = loading, false = not configured, obj = data
  const [gaError,       setGaError]       = anS(null);
  const [gaLoading,     setGaLoading]     = anS(true);

  /* ── Verify gtag install ── */
  anE(() => {
    let cancelled = false;
    (async () => {
      try {
        const r    = await fetch('/', { cache: 'no-store', credentials: 'omit' });
        const html = await r.text();
        const hasScript = html.includes('googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID);
        const hasConfig = html.includes(`gtag('config', '${GA_MEASUREMENT_ID}'`);
        if (cancelled) return;
        if (hasScript && hasConfig) {
          setInstallStatus('ok');
          setInstallDetail('gtag.js active — sending hits to GA4.');
        } else if (hasScript) {
          setInstallStatus('partial');
          setInstallDetail('Script loaded but config call not found.');
        } else {
          setInstallStatus('missing');
          setInstallDetail('No gtag script found in the live HTML. Run a deploy.');
        }
      } catch (e) {
        if (cancelled) return;
        setInstallStatus('unknown');
        setInstallDetail('Could not fetch homepage to verify (CORS or offline).');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Fetch live GA4 metrics from NAS ── */
  anE(() => {
    let cancelled = false;
    (async () => {
      setGaLoading(true);
      try {
        const d = await window.AdminStore.apiFetch('/api/ga-analytics');
        if (cancelled) return;
        setGaData(d);
      } catch (e) {
        if (cancelled) return;
        const is503 = e?.status === 503 || e?.message?.includes('503') ||
                      e?.message?.includes('not_configured') ||
                      (e?.error === 'not_configured');
        if (is503) {
          setGaData(false);   // not configured — show setup guide
        } else {
          setGaError(e?.message || 'Unknown error');
          setGaData(false);
        }
      } finally {
        if (!cancelled) setGaLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dotColor =
    installStatus === 'ok'      ? '#2a7a4f' :
    installStatus === 'partial' ? '#c89b3c' :
    installStatus === 'missing' ? '#b84242' :
    installStatus === 'unknown' ? '#7a7675' : '#7a7675';
  const dotLabel =
    installStatus === 'ok'      ? 'TRACKING ACTIVE' :
    installStatus === 'partial' ? 'PARTIAL INSTALL'  :
    installStatus === 'missing' ? 'NOT INSTALLED'    :
    installStatus === 'unknown' ? 'STATUS UNKNOWN'   : 'CHECKING…';

  const reports = [
    { label: 'Realtime',         desc: 'Who is on the site right now',                 href: GA_REALTIME, accent: true },
    { label: 'Reports overview', desc: 'High-level snapshot of the last 28 days',      href: GA_REPORTS },
    { label: 'Acquisition',      desc: 'Where visitors came from (search, social, …)', href: 'https://analytics.google.com/analytics/web/#/reports/acquisition-traffic-acquisition' },
    { label: 'Pages & screens',  desc: 'Which pages get the most attention',           href: 'https://analytics.google.com/analytics/web/#/reports/engagement-pages-and-screens' },
    { label: 'Demographics',     desc: 'Country, language, device, browser',           href: 'https://analytics.google.com/analytics/web/#/reports/demographics-details' },
    { label: 'Events',           desc: 'Page views, scrolls, outbound clicks, video',  href: 'https://analytics.google.com/analytics/web/#/reports/engagement-events' },
    { label: 'Tech',             desc: 'Mobile vs desktop, screen size, OS',           href: 'https://analytics.google.com/analytics/web/#/reports/tech-details' },
    { label: 'Conversions',      desc: 'Goal completions (lead-gen objective)',        href: 'https://analytics.google.com/analytics/web/#/reports/key-events' },
  ];

  /* ── Device colors ── */
  const deviceColors = { mobile: '#3a70a8', desktop: '#2a7a4f', tablet: '#c89b3c' };

  return (
    <Card padding="lg" className="an-span-2">
      <SectionHead
        eyebrow="Public site"
        title="Google Analytics 4"
        sub={`Traffic for ${GA_PROPERTY_NAME} · live data via GA4 Data API`}
      />

      {/* Install status + tracking ID */}
      <div className="ga-status-row">
        <div className="ga-status-pill">
          <span className="ga-status-dot" style={{ background: dotColor }}/>
          <span className="ga-status-label">{dotLabel}</span>
        </div>
        <div className="ga-status-meta">
          <div className="ga-meta-row">
            <span className="ga-meta-k">Measurement ID</span>
            <span className="ga-meta-v mono">{GA_MEASUREMENT_ID}</span>
          </div>
          <div className="ga-meta-row">
            <span className="ga-meta-k">Property</span>
            <span className="ga-meta-v">{GA_PROPERTY_NAME}</span>
          </div>
          <div className="ga-meta-row">
            <span className="ga-meta-k">Tracking on</span>
            <span className="ga-meta-v">Public site · Client galleries · To-go deck</span>
          </div>
          {installDetail && <div className="ga-meta-detail">{installDetail}</div>}
        </div>
      </div>

      {/* ── Inline metrics (when GA4 Data API is wired up) ── */}
      {gaLoading && (
        <div className="ga-data-loading">◌ Loading live metrics…</div>
      )}

      {!gaLoading && gaData && (
        <>
          {/* Realtime pulse */}
          <div className="ga-realtime-bar">
            <div className="ga-realtime-pulse"/>
            <strong className="ga-realtime-num">{anFmtNum(gaData.realtime?.activeUsers ?? 0)}</strong>
            <span className="ga-realtime-label"> active right now</span>
            <span className="ga-realtime-period">  ·  Last 28 days ↓</span>
          </div>

          {/* 28-day overview strip */}
          <div className="ga-metric-strip">
            <div className="ga-metric-tile">
              <div className="ga-metric-val">{anFmtNum(gaData.overview.users)}</div>
              <div className="ga-metric-lbl">Users</div>
            </div>
            <div className="ga-metric-tile">
              <div className="ga-metric-val">{anFmtNum(gaData.overview.newUsers)}</div>
              <div className="ga-metric-lbl">New users</div>
            </div>
            <div className="ga-metric-tile">
              <div className="ga-metric-val">{anFmtNum(gaData.overview.sessions)}</div>
              <div className="ga-metric-lbl">Sessions</div>
            </div>
            <div className="ga-metric-tile">
              <div className="ga-metric-val">{anFmtNum(gaData.overview.pageViews)}</div>
              <div className="ga-metric-lbl">Page views</div>
            </div>
            <div className="ga-metric-tile">
              <div className="ga-metric-val">{anFmtDur(gaData.overview.avgSessionDur)}</div>
              <div className="ga-metric-lbl">Avg session</div>
            </div>
            <div className="ga-metric-tile">
              <div className="ga-metric-val">{gaData.overview.bounceRate ? Math.round(gaData.overview.bounceRate * 100) + '%' : '—'}</div>
              <div className="ga-metric-lbl">Bounce rate</div>
            </div>
          </div>

          {/* 3-column detail: top pages · acquisition · devices + countries */}
          <div className="ga-detail-grid">

            {/* Top pages */}
            <div className="ga-detail-col">
              <div className="ga-detail-head">Top pages</div>
              {(() => {
                const maxV = Math.max(...(gaData.topPages || []).map(p => p.views), 1);
                return (gaData.topPages || []).map((p, i) => (
                  <AnBarRow
                    key={i}
                    label={p.path === '/' ? 'Home' : p.path}
                    value={p.views}
                    max={maxV}
                    sub="views"
                    color="var(--accent)"
                  />
                ));
              })()}
            </div>

            {/* Traffic sources */}
            <div className="ga-detail-col">
              <div className="ga-detail-head">Traffic sources</div>
              {(() => {
                const maxS = Math.max(...(gaData.acquisition || []).map(a => a.sessions), 1);
                const srcColors = ['#3a70a8','#2a7a4f','#c89b3c','#8a6a9a','#5a8a6a','#b84242','#7a7675','#4a90a8'];
                return (gaData.acquisition || []).map((a, i) => (
                  <AnBarRow
                    key={i}
                    label={a.channel}
                    value={a.sessions}
                    max={maxS}
                    sub="sessions"
                    color={srcColors[i % srcColors.length]}
                  />
                ));
              })()}
            </div>

            {/* Devices + Countries */}
            <div className="ga-detail-col">
              <div className="ga-detail-head">Devices</div>
              {(() => {
                const totalD = (gaData.devices || []).reduce((s, d) => s + d.sessions, 0) || 1;
                return (gaData.devices || []).map((d, i) => (
                  <AnBarRow
                    key={i}
                    label={d.device.charAt(0).toUpperCase() + d.device.slice(1)}
                    value={d.sessions}
                    max={totalD}
                    sub={`${Math.round((d.sessions / totalD) * 100)}%`}
                    color={deviceColors[d.device.toLowerCase()] || '#7a7675'}
                  />
                ));
              })()}

              <div className="ga-detail-head" style={{ marginTop: 20 }}>Top countries</div>
              {(() => {
                const maxC = Math.max(...(gaData.countries || []).map(c => c.sessions), 1);
                return (gaData.countries || []).map((c, i) => (
                  <AnBarRow
                    key={i}
                    label={c.country}
                    value={c.sessions}
                    max={maxC}
                    sub="sessions"
                    color="#7a6a9a"
                  />
                ));
              })()}
            </div>
          </div>

          <div className="ga-footer-note" style={{ marginTop: 12 }}>
            <div className="ga-footer-line">
              <strong>Data lag:</strong> GA4 standard reports refresh every ~24 hours. Realtime is instant.
              &nbsp;·&nbsp; <span className="ad-muted">Fetched: {gaData.generatedAt ? new Date(gaData.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</span>
            </div>
          </div>
        </>
      )}

      {/* ── Setup instructions (GA4 Data API not yet configured) ── */}
      {!gaLoading && gaData === false && (
        <div className="ga-setup-box">
          {gaError ? (
            <div className="ga-setup-error">⚠ GA4 API error: {gaError}</div>
          ) : (
            <>
              <div className="ga-setup-title">One more step — add GA4 credentials to the NAS</div>
              <div className="ga-setup-body">
                The service account and credentials JSON are already set up. You just need to add three lines to the NAS <code>.env</code> file and rebuild the container.
              </div>
              <ol className="ga-setup-steps">
                <li>SSH into the NAS: <code>ssh aldocarrera@YOUR_NAS_IP</code></li>
                <li>Copy your credentials JSON to the NAS if not done yet:<br/>
                  <code>scp ~/Downloads/aldocarrera-analytics-586e5e10dd71.json aldocarrera@YOUR_NAS_IP:/var/services/homes/aldocarrera/ga4-credentials.json</code>
                </li>
                <li>Edit the <code>.env</code> file: <code>vi /path/to/aldocarrera/nas-server/.env</code><br/>
                  Add these three lines:
                  <pre className="ga-setup-pre">{`GA_PROPERTY_ID=538429297
GA_CREDENTIALS_FILE=/credentials/ga4.json
GA_CREDENTIALS_HOST_PATH=/var/services/homes/aldocarrera/ga4-credentials.json`}</pre>
                </li>
                <li>Rebuild and restart:<br/>
                  <code>cd /path/to/nas-server && sudo docker-compose up -d --force-recreate</code>
                </li>
              </ol>
              <div className="ga-setup-body" style={{ marginTop: 10, fontStyle: 'italic' }}>
                Once the container restarts, refresh this page — live visitor counts will replace this message.
              </div>
            </>
          )}
        </div>
      )}

      {/* Report quick-links grid */}
      <div style={{ marginTop: gaData ? 20 : 0 }}>
        <div className="ga-detail-head" style={{ marginBottom: 10 }}>GA Dashboard quick links</div>
        <div className="ga-report-grid">
          {reports.map(r => (
            <a
              key={r.label}
              href={r.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`ga-report-tile ${r.accent ? 'is-accent' : ''}`}
            >
              <div className="ga-report-label">{r.label}</div>
              <div className="ga-report-desc">{r.desc}</div>
              <div className="ga-report-arrow">↗</div>
            </a>
          ))}
        </div>
      </div>
    </Card>
  );
}

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

/* ── Section separator (thin rule + small label) ────────────────── */
function AnSep({ title }) {
  return (
    <div className="an-sep">
      {title && <span className="an-sep-label">{title}</span>}
      <div className="an-sep-rule"/>
    </div>
  );
}

/* ── Insight tile (notable pattern callouts) ────────────────────── */
function AnInsight({ eyebrow, value, sub, accent }) {
  return (
    <div className={`an-insight ${accent ? 'is-accent' : ''}`}>
      <div className="an-insight-eyebrow">{eyebrow}</div>
      <div className="an-insight-value" title={value}>{value}</div>
      {sub && <div className="an-insight-sub">{sub}</div>}
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

  /* ── Derived metrics ─────────────────────────────────────────── */
  const maxYear        = Math.max(...(projects.byYear   || []).map(r => r.count), 1);
  const maxClient      = Math.max(...(projects.byClient || []).map(r => r.count), 1);
  const maxViews       = Math.max(...(galleries.topByViews || []).map(g => g.viewCount), 1);
  const totalTypeImgs  = (projects.byType || []).reduce((s, r) => s + r.count, 0);
  const selectRate     = galleries.totalReviewed > 0 ? Math.round((galleries.totalSelects / galleries.totalReviewed) * 100) : 0;
  const openRate       = galleries.total > 0 ? Math.round(((galleries.total - galleries.neverOpened) / galleries.total) * 100) : 0;
  const avgImgPerProj  = overview.totalProjects > 0 ? Math.round(overview.totalImages / overview.totalProjects) : 0;
  const avgImgPerGal   = galleries.total > 0 ? Math.round(galleries.totalReviewed / galleries.total) : 0;
  const totalClients   = (projects.byClient || []).length;
  const untagged       = Math.max(0, overview.totalImages - overview.totalSelected - overview.totalFavorite - overview.totalRejected);

  /* Brand palette — pink + powder blue + warm neutrals */
  const C_PINK   = 'var(--accent)';
  const C_BLUE   = 'var(--accent2)';
  const C_INK    = 'var(--ink)';
  const C_GREEN  = '#7a9a7e';
  const C_GOLD   = '#c89b3c';
  const C_RED    = '#b84242';
  const C_PLUM   = '#7a6a8a';
  const typeColors = [C_PINK, C_BLUE, C_PLUM, C_GREEN, C_GOLD, '#a88670'];

  /* ── Insights (derived patterns) ────────────────────────────── */
  const rawProjects = window.AdminStore.getProjects() || [];

  // Most prolific client (by total images, not just project count)
  const clientImgs = {};
  for (const p of rawProjects) {
    const c = p.client || 'Unknown';
    clientImgs[c] = (clientImgs[c] || 0) + (p.images || []).length;
  }
  const topClientByImgs = Object.entries(clientImgs).sort((a,b) => b[1]-a[1])[0];

  // Largest project (most images)
  const largestProj = rawProjects.slice().sort((a,b) =>
    (b.images?.length || 0) - (a.images?.length || 0)
  )[0];

  // Quickest gallery turnaround
  const quickest = (galleries.topByViews || []).slice().filter(g =>
    g.submittedAt && g.createdAt
  ).map(g => ({
    title: g.title,
    days: Math.max(0, Math.round((new Date(g.submittedAt) - new Date(g.createdAt)) / 86400000)),
  })).sort((a,b) => a.days - b.days)[0];

  // Highest engagement gallery (most views per day since creation)
  const hottest = (galleries.topByViews || []).slice().filter(g => g.viewCount > 0)
    .sort((a,b) => b.viewCount - a.viewCount)[0];

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
                Refreshed {refreshed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
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

      <GAPublicTrafficCard/>

      <div className="an-overview-grid an-overview-4" style={{ marginTop: 32 }}>
        <AnStat
          label="Total images"
          value={anFmtNum(overview.totalImages)}
          sub={`${anFmtNum(avgImgPerProj)} per project · ${anFmtNum(totalClients)} clients`}
          accent
        />
        <AnStat
          label="Archive size"
          value={anFmtBytes(overview.totalStorage)}
          sub="originals on NAS storage"
        />
        <AnStat
          label="Projects"
          value={anFmtNum(overview.totalProjects)}
          sub={`${overview.publicProjects} public · ${overview.totalProjects - overview.publicProjects} private`}
        />
        <AnStat
          label="Reels videos"
          value={anFmtNum(overview.totalVideos)}
          sub={`${overview.publicVideos} live in mobile reels`}
        />
      </div>

      {/* Image status quick strip */}
      <div className="an-image-strip">
        <div className="an-img-pill">
          <span className="an-img-pill-val" style={{ color: C_PINK }}>{anFmtNum(overview.totalSelected)}</span>
          <span className="an-img-pill-label">Marked select</span>
        </div>
        <div className="an-img-pill">
          <span className="an-img-pill-val" style={{ color: C_GOLD }}>{anFmtNum(overview.totalFavorite)}</span>
          <span className="an-img-pill-label">Favorited</span>
        </div>
        <div className="an-img-pill">
          <span className="an-img-pill-val" style={{ color: C_RED }}>{anFmtNum(overview.totalRejected)}</span>
          <span className="an-img-pill-label">Rejected</span>
        </div>
        <div className="an-img-pill">
          <span className="an-img-pill-val" style={{ color: C_BLUE }}>{anFmtNum(overview.totalCover)}</span>
          <span className="an-img-pill-label">Cover frames</span>
        </div>
        <div className="an-img-pill">
          <span className="an-img-pill-val" style={{ color: 'var(--ink-muted)' }}>{anFmtNum(untagged)}</span>
          <span className="an-img-pill-label">Untagged</span>
        </div>
        <div className="an-img-pill">
          <span className="an-img-pill-val">{anPct(overview.totalSelected, overview.totalImages)}</span>
          <span className="an-img-pill-label">Selection ratio</span>
        </div>
      </div>

      <div className="an-grid-2">

        {/* ── Upload activity (full width) ────────────────────────── */}
        <Card padding="lg" className="an-span-2">
          <SectionHead
            eyebrow="Activity"
            title="Upload cadence"
            sub="Images added to projects over the last 12 months"
          />
          <AnColChart data={activity.uploadsByMonth}/>
        </Card>

        {/* ── Images by year ──────────────────────────────────────── */}
        <Card padding="lg">
          <SectionHead eyebrow="By year" title="Frames per shoot year"/>
          <div className="an-bar-list">
            {projects.byYear.map(r => (
              <AnBarRow key={r.year} label={r.year} value={r.count} max={maxYear} sub="frames" color={C_PINK}/>
            ))}
            {projects.byYear.length === 0 && <div className="ad-muted">No data yet.</div>}
          </div>
        </Card>

        {/* ── Image breakdowns ────────────────────────────────────── */}
        <Card padding="lg">
          <SectionHead eyebrow="Composition" title="The library at a glance"/>
          <div className="an-mini-section-label">By shoot type</div>
          <AnSegBar
            total={totalTypeImgs}
            items={(projects.byType || []).map((r, i) => ({
              label: r.type,
              value: r.count,
              color: typeColors[i % typeColors.length],
            }))}
          />

          <div className="an-mini-section-label" style={{ marginTop: 24 }}>Active vs rejected</div>
          <AnSegBar
            total={overview.totalImages}
            items={[
              { label: 'Active',   value: overview.totalImages - overview.totalRejected, color: C_BLUE },
              { label: 'Rejected', value: overview.totalRejected, color: C_RED },
            ]}
          />

          <div className="an-mini-section-label" style={{ marginTop: 24 }}>Tag distribution</div>
          <AnSegBar
            total={overview.totalImages}
            items={[
              { label: 'Select',    value: overview.totalSelected, color: C_PINK },
              { label: 'Favorite',  value: overview.totalFavorite, color: C_GOLD },
              { label: 'Untagged',  value: untagged, color: 'var(--rule)' },
            ]}
          />
        </Card>

      </div>

      <div className="an-overview-grid an-overview-4" style={{ marginTop: 32 }}>
        <AnStat
          label="Active clients"
          value={anFmtNum(totalClients)}
          sub={`across ${anFmtNum(overview.totalProjects)} projects`}
        />
        <AnStat
          label="Gallery links"
          value={anFmtNum(galleries.total)}
          sub={`${galleries.open} open · ${galleries.submitted} submitted`}
          accent
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
        />
      </div>

      <Card padding="lg">
        <SectionHead
          eyebrow="Roster"
          title="Projects per client"
          sub="Ranked by total shoots"
        />
        <div className="an-bar-list">
          {projects.byClient.slice(0, 10).map(r => (
            <AnBarRow
              key={r.client}
              label={r.client}
              value={r.count}
              max={maxClient}
              sub={r.count === 1 ? 'project' : 'projects'}
              color={C_BLUE}
            />
          ))}
          {projects.byClient.length === 0 && <div className="ad-muted">No data yet.</div>}
        </div>
      </Card>

      <div className="an-overview-grid an-overview-4" style={{ marginTop: 32 }}>
        <AnStat
          label="Open rate"
          value={openRate + '%'}
          sub={`${galleries.total - galleries.neverOpened} of ${galleries.total} links opened`}
          accent
        />
        <AnStat
          label="Select rate"
          value={selectRate + '%'}
          sub="of reviewed frames marked SELECT"
          accent
        />
        <AnStat
          label="Submit rate"
          value={anPct(galleries.submitted, galleries.total)}
          sub={`${galleries.submitted} fully reviewed`}
        />
        <AnStat
          label="Avg turnaround"
          value={galleries.avgTurnaroundDays != null ? galleries.avgTurnaroundDays + 'd' : '—'}
          sub="creation → submit"
        />
      </div>

      <div className="an-grid-2">

        {/* ── Funnel ──────────────────────────────────────────────── */}
        <Card padding="lg">
          <SectionHead eyebrow="Funnel" title="Created → submitted" sub="Step-by-step client review path"/>
          <div className="an-funnel-list">
            <AnFunnelRow label="Created"   value={galleries.total}                                color={C_PLUM} total={galleries.total}/>
            <AnFunnelRow label="Opened"    value={galleries.total - galleries.neverOpened}        color={C_BLUE} total={galleries.total}/>
            <AnFunnelRow label="Reviewed"  value={galleries.totalReviewed > 0 ? Math.min(galleries.total, galleries.submitted + (galleries.total - galleries.neverOpened)) : 0} color={C_PINK} total={galleries.total}/>
            <AnFunnelRow label="Submitted" value={galleries.submitted}                            color={C_GREEN} total={galleries.total}/>
          </div>
          <div className="an-funnel-summary">
            <div><strong>{anFmtNum(galleries.neverOpened)}</strong> links unseen</div>
            <div><strong>{anFmtNum(avgImgPerGal)}</strong> avg frames reviewed / gallery</div>
          </div>
        </Card>

        {/* ── What clients choose ─────────────────────────────────── */}
        <Card padding="lg">
          <SectionHead eyebrow="Choices" title="What clients pick" sub="Labels applied during reviews"/>
          <div className="an-mini-section-label">Selection labels</div>
          <AnSegBar
            total={(galleries.totalSelects + galleries.totalAlts + galleries.totalKills) || 1}
            items={[
              { label: 'SELECT', value: galleries.totalSelects, color: C_PINK },
              { label: 'ALT',    value: galleries.totalAlts,    color: C_BLUE },
              { label: 'KILL',   value: galleries.totalKills,   color: C_RED },
            ]}
          />

          <div className="an-mini-section-label" style={{ marginTop: 24 }}>Gallery status</div>
          <AnSegBar
            total={galleries.total || 1}
            items={[
              { label: 'Open',      value: galleries.open,      color: C_BLUE },
              { label: 'Submitted', value: galleries.submitted, color: C_GREEN },
              { label: 'Archived',  value: galleries.archived,  color: 'var(--ink-muted)' },
            ]}
          />

          <div className="an-metric-grid" style={{ marginTop: 24 }}>
            <AnMetric label="SELECT"      value={anFmtNum(galleries.totalSelects)} sub="hero picks"/>
            <AnMetric label="ALT"         value={anFmtNum(galleries.totalAlts)}    sub="alternates"/>
            <AnMetric label="KILL"        value={anFmtNum(galleries.totalKills)}   sub="rejected"/>
            <AnMetric label="Never opened" value={anFmtNum(galleries.neverOpened)}  sub="links unseen"/>
          </div>
        </Card>

        {/* ── Top viewed galleries (full width) ───────────────────── */}
        <Card padding="lg" className="an-span-2">
          <SectionHead eyebrow="Top performers" title="Most-viewed gallery links" sub="Ranked by total opens"/>
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
                      <div className="an-gallery-last">Last opened {new Date(g.lastViewedAt).toLocaleDateString()}</div>
                    )}
                  </div>
                  <div className="an-gallery-right">
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, justifyContent: 'flex-end' }}>
                      <span className={`ad-badge ${g.status === 'submitted' ? 'ad-badge-green' : g.status === 'archived' ? 'ad-badge-muted' : 'ad-badge-blue'}`}>
                        {g.status}
                      </span>
                      <span className="an-gallery-views">{anFmtNum(g.viewCount)} views</span>
                      <span className="ad-muted" style={{ fontSize: 11 }}>· {g.selects} sel</span>
                    </div>
                    <div className="an-mini-bar-track">
                      <div className="an-mini-bar" style={{ width: maxViews > 0 ? (g.viewCount / maxViews * 100) + '%' : '0%', background: C_PINK }}/>
                    </div>
                    <button className="ad-link" style={{ fontSize: 11, marginTop: 4 }} onClick={() => navigate(`#/galleries/${g.token}`)}>Review →</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

      </div>

      {/* ════════════════════════════════════════════════════════════
          05 — NOTABLE PATTERNS
      ════════════════════════════════════════════════════════════ */}
      {(topClientByImgs || largestProj || quickest || hottest) && (
        <Card padding="lg" className="an-span-2" style={{ marginTop: 32 }}>
          <SectionHead
            eyebrow="Insights"
            title="Notable patterns"
            sub="Highlights derived from your studio data"
          />
          <div className="an-insight-grid">
            {topClientByImgs && (
              <AnInsight
                eyebrow="Most prolific client"
                value={topClientByImgs[0]}
                sub={`${anFmtNum(topClientByImgs[1])} frames shot`}
                accent
              />
            )}
            {largestProj && (
              <AnInsight
                eyebrow="Largest project"
                value={largestProj.title}
                sub={`${anFmtNum(largestProj.images?.length || 0)} frames · ${largestProj.client || '—'}`}
              />
            )}
            {quickest ? (
              <AnInsight
                eyebrow="Quickest turnaround"
                value={`${quickest.days} ${quickest.days === 1 ? 'day' : 'days'}`}
                sub={quickest.title}
              />
            ) : (
              <AnInsight
                eyebrow="Quickest turnaround"
                value="—"
                sub="no submitted galleries yet"
              />
            )}
            {hottest ? (
              <AnInsight
                eyebrow="Most-viewed gallery"
                value={hottest.title}
                sub={`${anFmtNum(hottest.viewCount)} opens · ${hottest.clientName || '—'}`}
                accent
              />
            ) : (
              <AnInsight
                eyebrow="Most-viewed gallery"
                value="—"
                sub="no gallery views yet"
              />
            )}
          </div>
        </Card>
      )}
    </>
  );
}

Object.assign(window, { AnalyticsView });
