/* aldo-terminal.jsx — a working Terminal window, an easter egg that fits
 * the desktop concept. Visitors type commands to browse the site:
 * `ls`, `open <project>`, `play`, `search <vibe>`, `moodboard`, `contact`,
 * `screensaver`… Tab completes project names, ↑/↓ walk the history.
 */

const { useState: tmS, useEffect: tmE, useRef: tmR } = React;

const _tmSlug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const TM_BANNER = [
  'aldo-os 2026.10 — tty1',
  'last login: ' + new Date().toDateString() + ' from los-angeles',
  'type `help` to see what you can do.',
];

function TerminalView({ actions }) {
  const P = () => (window.ALDO && window.ALDO.PROJECTS) || [];
  const V = () => (window.ALDO && window.ALDO.VIDEOS) || [];
  const [lines, setLines] = tmS(TM_BANNER.map(t => ({ t, k: 'sys' })));
  const [input, setInput] = tmS('');
  const [hist, setHist] = tmS([]);
  const [hIdx, setHIdx] = tmS(-1);
  const scrollRef = tmR(null);
  const inputRef = tmR(null);

  tmE(() => { scrollRef.current && (scrollRef.current.scrollTop = scrollRef.current.scrollHeight); }, [lines]);
  tmE(() => { inputRef.current?.focus(); }, []);

  const findProject = (q) => {
    const s = _tmSlug(q);
    if (!s) return null;
    return P().find(p => _tmSlug(p.name) === s) || P().find(p => _tmSlug(p.name).startsWith(s)) || P().find(p => _tmSlug(p.name).includes(s) || _tmSlug(p.client).includes(s));
  };

  const COMMANDS = {
    help: () => [
      'ls [projects|reels|clients]   list things',
      'open <project>                open a project (tab completes)',
      'play [reel]                   open the reels feed',
      'search <words>                search photos by vibe',
      'moodboard                     your saved photos',
      'cd <archive|reels|about|…>    open a window',
      'whoami · about · contact · date · history · clear',
      'screensaver                   …try it',
    ],
    ls: (args) => {
      const what = (args[0] || 'projects').toLowerCase();
      if (what.startsWith('reel')) return V().map(v => `▶  ${_tmSlug(v.title).padEnd(30)} ${v.year || ''}`);
      if (what.startsWith('client')) return [...new Set(P().map(p => p.client).filter(Boolean))].sort().map(c => `   ${c}`);
      return P().map(p => `drwx  ${String(p.year).padEnd(5)} ${_tmSlug(p.name).padEnd(40)} ${p.count} photos`);
    },
    open: (args) => {
      const p = findProject(args.join(' '));
      if (!p) return [`open: ${args.join(' ') || '(nothing)'}: no such project — try \`ls\``];
      actions.openProject(p);
      return [`opening ${p.name}…`];
    },
    cd: (args) => {
      const k = (args[0] || '').toLowerCase().replace(/^~\/?/, '');
      const map = { archive: 'archive', portfolio: 'portfolio', work: 'portfolio', reels: 'reels', about: 'about', contact: 'contact', clients: 'clients', services: 'services', prints: 'prints', crew: 'crew', search: 'search', moodboard: 'moodboard' };
      if (!map[k]) { const p = findProject(args.join(' ')); if (p) { actions.openProject(p); return [`opening ${p.name}…`]; } return [`cd: ${args[0] || ''}: no such directory`]; }
      actions.open(map[k]);
      return [];
    },
    play: (args) => {
      const s = _tmSlug(args.join(' '));
      const v = (s && V().find(x => _tmSlug(x.title).includes(s))) || V()[0];
      if (!v) return ['play: no reels yet'];
      actions.openFeed(v);
      return [`▶ ${v.title}`];
    },
    search: (args) => { actions.open('search', { query: args.join(' ') }); return args.length ? [`searching for “${args.join(' ')}”…`] : []; },
    moodboard: () => { actions.open('moodboard'); const n = window.AldoMoodboard ? window.AldoMoodboard.items().length : 0; return [`${n} photo${n !== 1 ? 's' : ''} saved`]; },
    contact: () => { actions.open('contact'); return ['opening inquiry form…  (or email aldo@aldocarrera.com)']; },
    about: () => { actions.open('about'); return []; },
    whoami: () => ['guest — but Aldo Carrera is a fashion & campaign photographer in Los Angeles.'],
    date: () => [new Date().toString()],
    history: () => hist.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`),
    echo: (args) => [args.join(' ')],
    pwd: () => ['/Users/guest/aldocarrera.com'],
    screensaver: () => { setTimeout(() => window.__aldoScreensaver && window.__aldoScreensaver(), 300); return ['starting screensaver — move the mouse to wake']; },
    sudo: () => ['nice try. this incident will be reported to the photo editor.'],
    rm: () => ['rm: refusing to delete the archive. everything here is backed up anyway.'],
    exit: () => { actions.close(); return []; },
    clear: () => null,
  };

  const run = (raw) => {
    const cmdline = raw.trim();
    const out = [{ t: `guest@aldocarrera ~ % ${raw}`, k: 'cmd' }];
    if (!cmdline) { setLines(l => [...l, ...out]); return; }
    setHist(h => [...h, cmdline]);
    const [name, ...args] = cmdline.split(/\s+/);
    const fn = COMMANDS[name.toLowerCase()];
    if (!fn) { setLines(l => [...l, ...out, { t: `zsh: command not found: ${name}  (type \`help\`)`, k: 'err' }]); return; }
    const res = fn(args);
    if (res === null) { setLines([]); return; }
    setLines(l => [...l, ...out, ...res.map(t => ({ t, k: 'out' }))]);
  };

  const complete = () => {
    const m = /^(open|cd)\s+(.*)$/i.exec(input);
    if (!m) return;
    const s = _tmSlug(m[2]);
    const hits = P().map(p => _tmSlug(p.name)).filter(n => n.startsWith(s));
    if (hits.length === 1) setInput(`${m[1]} ${hits[0]}`);
    else if (hits.length > 1) setLines(l => [...l, { t: `guest@aldocarrera ~ % ${input}`, k: 'cmd' }, ...hits.map(t => ({ t, k: 'out' }))]);
  };

  const onKey = (e) => {
    if (e.key === 'Enter') { run(input); setInput(''); setHIdx(-1); }
    else if (e.key === 'Tab') { e.preventDefault(); complete(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); const i = hIdx < 0 ? hist.length - 1 : Math.max(0, hIdx - 1); if (hist[i] != null) { setHIdx(i); setInput(hist[i]); } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); const i = hIdx + 1; if (i >= hist.length) { setHIdx(-1); setInput(''); } else { setHIdx(i); setInput(hist[i]); } }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setLines([]); }
    e.stopPropagation(); // keep Escape/arrows from reaching the desktop shortcuts
  };

  return (
    <div className="tm-view" ref={scrollRef} onClick={() => inputRef.current?.focus()}>
      {lines.map((l, i) => <div key={i} className={`tm-line tm-${l.k}`}>{l.t}</div>)}
      <div className="tm-prompt">
        <span>guest@aldocarrera ~ %&nbsp;</span>
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey} spellCheck={false} autoCapitalize="off" autoComplete="off" aria-label="Terminal input"/>
      </div>
    </div>
  );
}

window.TerminalView = TerminalView;
