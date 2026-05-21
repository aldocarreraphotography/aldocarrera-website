/* admin-views-auth.jsx — login screen */

function LoginView({ onLogin }) {
  const [username, setUsername] = React.useState('aldocarrera');
  const [password, setPassword] = React.useState('');
  const [remember, setRemember] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await window.AdminStore.login(password);
      onLogin();
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ad-login">
      <div className="ad-login-card">
        <div className="ad-login-brand">
          <AldoLogo size={48} fill="var(--accent)"/>
          <div>
            <div className="ad-eyebrow">Aldo Carrera · Admin</div>
            <div className="ad-login-title">Sign in to the studio</div>
          </div>
        </div>

        <form onSubmit={submit} className="ad-login-form" autoComplete="on" action="#" method="post">
          <Field label="Username">
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="ad-input"
              disabled={busy}
            />
          </Field>
          <Field label="Password" error={error}>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              disabled={busy}
              className="ad-input"
            />
          </Field>
          <label className="ad-checkrow">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Remember me for 30 days</span>
          </label>
          <Btn type="submit" disabled={busy || !password.trim()}>{busy ? 'Signing in…' : 'Sign in'}</Btn>
        </form>

        <div className="ad-login-foot">
          <span>Prototype build · localStorage only</span>
          <a href="The Archive.html">← back to the archive</a>
        </div>
      </div>

      <aside className="ad-login-aside">
        <div className="ad-login-aside-eyebrow">Studio backend</div>
        <h2 className="ad-login-aside-title">Files, projects, and frames — under one keyring.</h2>
        <p>
          The admin panel is where you upload new shoots, tag selects, edit your
          bio, and update what the world sees on the public archive. Everything
          flows from here.
        </p>
        <ul className="ad-login-aside-list">
          <li>Drag-and-drop uploads · auto-EXIF date</li>
          <li>Tag select / favorite / reject per frame</li>
          <li>One place to edit About, Services, Clients</li>
          <li>Changes live on the public site immediately</li>
        </ul>
      </aside>
    </div>
  );
}

window.LoginView = LoginView;
