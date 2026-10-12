/* aldo-search.jsx — "search by vibe".
 *
 * Claude has written a caption and ~15 tags for every public photo
 * (nas-server/utils/ai-tags.js). The index loads once when Search opens
 * (GET /api/public/search-index) and matching happens in the browser:
 * every query word (and a few synonyms) is scored against tags, caption,
 * project, client and year. Results open in the photo viewer.
 */

const { useState: srS, useEffect: srE, useMemo: srM, useRef: srR } = React;

let _srIndex = null; // shared across opens
const _srLoad = () => _srIndex || (_srIndex = fetch(`${window.API_BASE || ''}/api/public/search-index`)
  .then(r => r.ok ? r.json() : { items: [] })
  .then(d => d.items || [])
  .catch(() => { _srIndex = null; return []; }));

const SR_SYNONYMS = {
  night: ['dark', 'evening', 'nighttime', 'flash'], dark: ['night', 'moody', 'low light'],
  bw: ['black and white', 'monochrome'], 'b&w': ['black and white', 'monochrome'], monochrome: ['black and white'],
  film: ['film grain', 'grain', '35mm', 'analog'], analog: ['film', 'film grain'],
  sun: ['sunlight', 'daylight', 'golden hour'], sunset: ['golden hour', 'warm light'], golden: ['golden hour'],
  outside: ['outdoor', 'street', 'exterior'], outdoor: ['outside', 'street'], inside: ['interior', 'indoor', 'studio'],
  red: ['crimson', 'scarlet'], pink: ['rose', 'blush'], blue: ['navy', 'teal'],
  lingerie: ['underwear', 'bra', 'lace'], swim: ['swimwear', 'bikini'], denim: ['jeans'],
  car: ['vehicle', 'automobile'], portrait: ['close-up', 'headshot'], group: ['duo', 'two people'],
};
const SR_SUGGEST = ['night flash', 'golden hour', 'film grain', 'black and white', 'street', 'studio', 'red', 'lingerie', 'denim', 'close-up', 'car', 'polaroid'];

const _srWords = (q) => q.toLowerCase().replace(/[^a-z0-9&\s-]/g, ' ').split(/\s+/).filter(w => w && !['a', 'an', 'the', 'and', 'of', 'in', 'at', 'with', 'on'].includes(w));

const _srRe = {};
const _srHas = (text, a) => (_srRe[a] || (_srRe[a] = new RegExp(`(^|[^a-z])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?([^a-z]|$)`))).test(text);

/* Whole-word matching ("car" must not hit "cardigan" or "scarf"). Returns
   { score, full } — full = every query word matched something. */
function _srScore(item, q) {
  const words = _srWords(q);
  if (!words.length) return { score: 0, full: false };
  const tags = item.t.join(' | ');
  const cap = (item.cap || '').toLowerCase();
  const meta = `${item.n} ${item.c} ${item.y}`.toLowerCase();
  let score = 0, hits = 0;
  const phrase = q.toLowerCase().trim();
  if (phrase.includes(' ') && item.t.includes(phrase)) score += 8;
  for (const w of words) {
    let best = 0;
    for (const a of [w, ...(SR_SYNONYMS[w] || [])]) {
      const weight = a === w ? 1 : 0.6;
      if (item.t.includes(a)) best = Math.max(best, 4 * weight);
      else if (_srHas(tags, a)) best = Math.max(best, 3 * weight);
      else if (_srHas(meta, a)) best = Math.max(best, 2 * weight);
      else if (_srHas(cap, a)) best = Math.max(best, 1.5 * weight);
    }
    if (best) hits++;
    score += best;
  }
  return { score, full: hits === words.length };
}

function SearchView({ onOpenPhoto, initialQuery = '' }) {
  const [index, setIndex] = srS(null);
  const [q, setQ] = srS(initialQuery);
  const inputRef = srR(null);
  srE(() => { _srLoad().then(setIndex); inputRef.current?.focus(); }, []);

  const results = srM(() => {
    if (!index || !q.trim()) return [];
    // A multi-word query that is itself a tag ("black and white", "golden
    // hour") means that concept, not each word separately.
    const phrase = q.toLowerCase().trim();
    if (phrase.includes(' ')) {
      const exact = index.filter(it => it.t.includes(phrase));
      if (exact.length >= 3) return exact.slice(0, 60);
    }
    const scored = index.map(it => ({ it, ...(_srScore(it, q)) })).filter(r => r.score >= 2);
    const full = scored.filter(r => r.full);
    // Only fall back to partial matches when the exact ones are thin
    const pool = full.length >= 6 ? full : [...full, ...scored.filter(r => !r.full).map(r => ({ ...r, score: r.score * 0.5 }))];
    return pool.sort((a, b) => b.score - a.score).slice(0, 60).map(r => r.it);
  }, [index, q]);

  const viewerList = results.map(it => ({
    id: `${it.p}/${it.f}`, photo: it.b, name: it.f, client: (it.c || '').toUpperCase(), project: it.p, note: it.cap,
  }));

  return (
    <div className="sr-view">
      <div className="sr-bar">
        <span className="sr-icon">⌕</span>
        <input
          ref={inputRef}
          className="sr-input"
          type="search"
          placeholder="Search by vibe — “red at night”, “film grain”, “golden hour street”…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>
      {!q.trim() ? (
        <div className="sr-suggest">
          <div className="sr-label">Try</div>
          <div className="sr-chips">
            {SR_SUGGEST.map(s => <button key={s} className="sr-chip" onClick={() => setQ(s)}>{s}</button>)}
          </div>
          {index && <div className="sr-note">{index.length} photographs indexed by Claude — describe a mood, colour, light or setting.</div>}
          {index && index.length === 0 && <div className="sr-note">The search index is still being built. Check back shortly.</div>}
        </div>
      ) : !index ? (
        <div className="sr-note sr-pad">Loading the index…</div>
      ) : results.length === 0 ? (
        <div className="sr-note sr-pad">Nothing matches “{q}”. Try fewer words, or one of the suggestions.</div>
      ) : (
        <>
          <div className="sr-count">{results.length} result{results.length !== 1 ? 's' : ''}</div>
          <div className="sr-grid">
            {results.map((it, i) => (
              <figure key={`${it.p}/${it.f}`} className="sr-item" onClick={() => onOpenPhoto && onOpenPhoto(viewerList[i], viewerList)}>
                <img src={window.aldoSized(it.b, 300)} srcSet={window.aldoSrcSet(it.b)} sizes="(max-width: 820px) 50vw, 240px" alt={it.cap} loading="lazy" decoding="async"/>
                {window.HeartButton && <window.HeartButton item={{ project: it.p, name: it.f, photo: it.b, client: it.c, projectName: it.n }} className="sr-heart"/>}
                <figcaption><b>{it.n}</b><span>{it.cap}</span></figcaption>
              </figure>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

window.SearchView = SearchView;
