/* admin-views-auth.jsx — login screen
 *
 * Autofill is intentionally disabled here. This admin protects the entire
 * studio (uploads, client galleries, settings) — saving creds in the OS
 * password manager would let anyone with physical access to the laptop
 * walk straight in. Browsers ignore autocomplete="off" on password fields,
 * so we use autocomplete="new-password" (the only reliable opt-out) plus
 * a randomized field name to defeat the "saved password" heuristics. */

function LoginView({ onLogin }) {
  const [password, setPassword] = React.useState('');
  const [remember, setRemember] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  // Random field name per render — prevents browsers from matching against
  // saved entries that share the literal name "password".
  const pwName = React.useMemo(
    () => `aldo_pw_${Math.random().toString(36).slice(2, 10)}`,
    []
  );

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

        <form
          onSubmit={submit}
          className="ad-login-form"
          autoComplete="off"
          action="#"
          method="post"
          data-form-type="other"
        >
          {/* Honeypot — invisible inputs that catch overly-aggressive autofillers
              (some browsers still autofill the first password field they see,
              regardless of attributes). Anything stuffed in here is ignored. */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            tabIndex={-1}
            aria-hidden="true"
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            tabIndex={-1}
            aria-hidden="true"
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />

          <Field label="Password" error={error}>
            <input
              type="password"
              name={pwName}
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              spellCheck="false"
              autoCorrect="off"
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
          <span>Aldo Carrera · Studio</span>
          <a href="/">← back to the archive</a>
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
