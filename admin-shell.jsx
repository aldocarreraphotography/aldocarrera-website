/* admin-shell.jsx — top-level App: auth gate, hash router, layout chrome.
   Keep this thin — page rendering lives in the view files. */

const { useState: sS, useEffect: sE } = React;

/* ============================================================
   HASH ROUTER
   ============================================================ */
/* Routes:
   #/login
   #/dashboard
   #/projects
   #/projects/new
   #/projects/:id/edit
   #/projects/:id/upload
   #/projects/:id/images
   #/galleries
   #/galleries/:token
   #/portals
   #/about
   #/services
   #/clients
   #/settings
*/
function parseRoute(hash) {
  const path = (hash || '').replace(/^#/, '').replace(/^\/?/, '/');
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'dashboard' };
  if (parts[0] === 'login')   return { name: 'login' };
  if (parts[0] === 'dashboard') return { name: 'dashboard' };
  if (parts[0] === 'projects') {
    if (!parts[1])           return { name: 'projects' };
    if (parts[1] === 'new')  return { name: 'project-new' };
    const id = decodeURIComponent(parts[1]);
    if (parts[2] === 'edit')   return { name: 'project-edit',   id };
    if (parts[2] === 'upload') return { name: 'project-upload', id };
    if (parts[2] === 'images' || !parts[2]) return { name: 'project-images', id };
  }
  if (parts[0] === 'galleries') {
    if (!parts[1]) return { name: 'galleries' };
    return { name: 'gallery-detail', token: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === 'portals') return { name: 'portals' };
  if (parts[0] === 'videos') return { name: 'videos' };
  if (parts[0] === 'about')    return { name: 'about' };
  if (parts[0] === 'services') return { name: 'services' };
  if (parts[0] === 'clients')  return { name: 'clients' };
  if (parts[0] === 'settings')  return { name: 'settings' };
  if (parts[0] === 'analytics') return { name: 'analytics' };
  if (parts[0] === 'dropbox')   return { name: 'dropbox' };
  return { name: 'dashboard' };
}
function navigate(to) {
  if (window.location.hash !== to) window.location.hash = to;
}

/* ============================================================
   SIDEBAR NAV
   ============================================================ */
const NAV = [
  { id: 'dashboard',  label: 'Dashboard', match: ['dashboard'],                  hash: '#/dashboard' },
  { id: 'projects',   label: 'Projects',  match: ['projects','project-new','project-edit','project-upload','project-images'], hash: '#/projects' },
  { id: 'galleries',  label: 'Galleries',       match: ['galleries','gallery-detail'],  hash: '#/galleries' },
  { id: 'portals',   label: 'Client Portals', match: ['portals'],                     hash: '#/portals'   },
  { id: 'videos',    label: 'Videos',         match: ['videos'],                      hash: '#/videos'    },
  { id: 'about',      label: 'About',     match: ['about'],                       hash: '#/about' },
  { id: 'services',   label: 'Services',  match: ['services'],                    hash: '#/services' },
  { id: 'clients',    label: 'Clients',   match: ['clients'],                     hash: '#/clients' },
  { id: 'settings',   label: 'Settings',  match: ['settings'],                    hash: '#/settings' },
  { id: 'dropbox',    label: 'AI Import',  match: ['dropbox'],                      hash: '#/dropbox'   },
  { id: 'analytics',  label: 'Analytics', match: ['analytics'],                    hash: '#/analytics' },
];

function AdminSidebar({ route, onLogout }) {
  window.useStoreSubscribe();
  const settings = window.AdminStore.getSettings();
  return (
    <aside className="ad-sidebar">
      <div className="ad-side-head">
        <div className="ad-side-brand">
          <AldoLogo size={26} fill="var(--accent)"/>
          <div>
            <div className="ad-side-brand-name">Aldo Carrera</div>
            <div className="ad-side-brand-sub">studio admin</div>
          </div>
        </div>
      </div>

      <nav className="ad-side-nav">
        <div className="ad-side-section">Workspace</div>
        {NAV.slice(0, 3).map(item => (
          <SideLink key={item.id} item={item} route={route}/>
        ))}
        <div className="ad-side-section">Content</div>
        {NAV.slice(3, 6).map(item => (
          <SideLink key={item.id} item={item} route={route}/>
        ))}
        <div className="ad-side-section">System</div>
        {NAV.slice(6).map(item => (
          <SideLink key={item.id} item={item} route={route}/>
        ))}
      </nav>

      <div className="ad-side-foot">
        <a className="ad-side-public" href="/" target="_blank" rel="noopener">
          <span>View public archive</span>
          <span>↗</span>
        </a>
        <div className="ad-side-contact">
          <div>{settings.contactEmail}</div>
          <div>{settings.instagram}</div>
        </div>
        <button className="ad-side-logout" onClick={onLogout}>Sign out</button>
      </div>
    </aside>
  );
}

function SideLink({ item, route }) {
  const active = item.match.includes(route.name);
  return (
    <a
      className={`ad-side-link ${active ? 'is-active' : ''}`}
      href={item.hash}
    >
      <span className="ad-side-link-dot"/>
      <span>{item.label}</span>
    </a>
  );
}

/* ============================================================
   TOP MENUBAR
   ============================================================ */
function AdminTopBar({ onLogout }) {
  const [now, setNow] = sS(new Date());
  sE(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  const fmt = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <header className="ad-topbar">
      <div className="ad-topbar-left">
        <span className="ad-topbar-brand"><AldoLogo size={14} fill="currentColor"/> Aldo Carrera · Admin</span>
      </div>
      <div className="ad-topbar-right">
        <span className="ad-topbar-meta">{day}</span>
        <span className="ad-topbar-sep">·</span>
        <span className="ad-topbar-meta">{fmt}</span>
        <span className="ad-topbar-sep">·</span>
        <button className="ad-topbar-logout" onClick={onLogout}>Sign out</button>
      </div>
    </header>
  );
}

/* ============================================================
   APP ROOT
   ============================================================ */
function AdminApp() {
  const [authed, setAuthed] = sS(window.AdminStore.isAuthenticated());
  const [route,  setRoute]  = sS(parseRoute(window.location.hash));

  sE(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Push the accent color from settings onto the CSS root so the whole admin
  // (and the embedded public-site components) recolors immediately.
  window.useStoreSubscribe();
  const settings = window.AdminStore.getSettings();
  sE(() => {
    if (settings.accentColor) {
      document.documentElement.style.setProperty('--accent', settings.accentColor);
    }
  }, [settings.accentColor]);

  const handleLogout = () => {
    window.AdminStore.logout();
    setAuthed(false);
    navigate('#/login');
  };
  const handleLogin = () => {
    setAuthed(true);
    navigate('#/dashboard');
  };

  if (!authed) {
    return (
      <>
        <LoginView onLogin={handleLogin}/>
        <ToastHost/>
      </>
    );
  }

  let view;
  switch (route.name) {
    case 'dashboard':       view = <DashboardView      navigate={navigate}/>; break;
    case 'projects':        view = <ProjectsListView   navigate={navigate}/>; break;
    case 'project-new':     view = <ProjectEditorView  projectId="new" navigate={navigate}/>; break;
    case 'project-edit':    view = <ProjectEditorView  projectId={route.id} navigate={navigate}/>; break;
    case 'project-upload':  view = <ProjectUploadView  projectId={route.id} navigate={navigate}/>; break;
    case 'project-images':  view = <ProjectImagesView  projectId={route.id} navigate={navigate}/>; break;
    case 'galleries':       view = <GalleriesView            navigate={navigate}/>; break;
    case 'gallery-detail':  view = <GalleryDetailView        token={route.token} navigate={navigate}/>; break;
    case 'portals':         view = <ClientGalleryPortalsView navigate={navigate}/>; break;
    case 'videos':          view = <VideosView          navigate={navigate}/>; break;
    case 'about':           view = <AboutEditorView    navigate={navigate}/>; break;
    case 'services':        view = <ServicesEditorView navigate={navigate}/>; break;
    case 'clients':         view = <ClientsEditorView  navigate={navigate}/>; break;
    case 'settings':        view = <SettingsEditorView navigate={navigate}/>; break;
    case 'analytics':       view = <AnalyticsView      navigate={navigate}/>; break;
    case 'dropbox':         view = <DropboxImportView  navigate={navigate}/>; break;
    default:                view = <DashboardView      navigate={navigate}/>;
  }

  return (
    <div className="ad-shell">
      <AdminTopBar onLogout={handleLogout}/>
      <div className="ad-shell-body">
        <AdminSidebar route={route} onLogout={handleLogout}/>
        <main className="ad-main">
          <div className="ad-main-inner">{view}</div>
        </main>
      </div>
      <ToastHost/>
    </div>
  );
}

window.AdminApp = AdminApp;
