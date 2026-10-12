/* aldo-screensaver.jsx — after a minute with no mouse, keyboard, scroll or
 * touch input, the desktop fades into a full-screen, slowly panning
 * slideshow of the portfolio (featured frames first, then a cover from each
 * project). Any input brings the desktop back. Desktop only; it never
 * starts while a video is playing or the tab is hidden, and reduced-motion
 * visitors get a plain crossfade without the pan. window.__aldoScreensaver()
 * starts it on demand (the Terminal's `screensaver` command).
 */

const { useState: ssS, useEffect: ssE, useRef: ssR } = React;

const SS_IDLE_MS = 60 * 1000;
const SS_SLIDE_MS = 7000;

function _ssSlides() {
  const P = (window.ALDO && window.ALDO.PROJECTS) || [];
  const featured = P.flatMap(p => (p.images || []).filter(i => i.highlighted).map(i => ({ src: i.blobPath, p })));
  const covers = P.map(p => {
    const imgs = (p.images || []).filter(i => !i.rejected);
    const c = imgs.find(i => i.cover) || imgs[0];
    return c && { src: c.blobPath, p };
  }).filter(Boolean);
  const seen = new Set();
  const all = [...featured, ...covers].filter(s => s.src && !seen.has(s.src) && seen.add(s.src));
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all.slice(0, 30);
}

function Screensaver() {
  const [on, setOn] = ssS(false);
  const [slides, setSlides] = ssS([]);
  const [idx, setIdx] = ssS(0);
  const timer = ssR(null);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const start = () => {
    const s = _ssSlides();
    if (!s.length) return;
    setSlides(s); setIdx(0); setOn(true);
  };

  ssE(() => {
    window.__aldoScreensaver = start;
    const desktop = () => !window.matchMedia('(max-width: 820px)').matches;
    const videoPlaying = () => [...document.querySelectorAll('video')].some(v => !v.paused && !v.muted);
    const arm = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (document.visibilityState === 'visible' && desktop() && !videoPlaying()) start();
        else arm();
      }, SS_IDLE_MS);
    };
    const wake = () => { setOn(false); arm(); };
    const evts = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
    evts.forEach(e => window.addEventListener(e, wake, { passive: true }));
    arm();
    return () => { clearTimeout(timer.current); evts.forEach(e => window.removeEventListener(e, wake)); delete window.__aldoScreensaver; };
  }, []);

  ssE(() => {
    if (!on || slides.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % slides.length), SS_SLIDE_MS);
    return () => clearInterval(t);
  }, [on, slides.length]);

  if (!on || !slides.length) return null;
  const cur = slides[Math.min(idx, slides.length - 1)];
  return (
    <div className={`ss-overlay ${reduce ? 'ss-still' : ''}`} aria-hidden="true">
      {slides.map((s, i) => (Math.abs(i - idx) <= 1 || (idx === slides.length - 1 && i === 0)) && (
        <img
          key={s.src}
          className={`ss-slide ${i === idx ? 'on' : ''} ss-pan-${i % 4}`}
          src={window.aldoSized(s.src, 2000)}
          alt=""
          decoding="async"
          onError={() => { // never sit on a black frame: drop it and move on
            setSlides(list => list.filter(x => x.src !== s.src));
            setIdx(n => Math.max(0, n - (i < n ? 1 : 0)));
          }}
        />
      ))}
      <div className="ss-caption">
        <div className="ss-name">{cur.p.name}</div>
        <div className="ss-meta">{[cur.p.client, cur.p.year].filter(Boolean).join(' · ')}</div>
      </div>
      <div className="ss-brand">ALDO CARRERA · move the mouse to return</div>
    </div>
  );
}

window.Screensaver = Screensaver;
