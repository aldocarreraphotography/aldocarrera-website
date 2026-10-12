/* aldo-contactsheet.jsx — a project shown as a film contact sheet.
 *
 * Frames sit on dark film stock with sprocket holes, frame numbers and an
 * edge print chosen from the project's format (35mm / medium format /
 * digital). Hovering a frame shows a loupe that magnifies it 3× from a
 * high-resolution copy, the way a photographer reviews a sheet on a light
 * table. Click a frame to open it in the viewer. On touch screens the
 * loupe appears on press-and-hold (it floats above the finger and follows
 * it); a quick tap still opens the frame.
 */

const { useState: csS, useRef: csR, useEffect: csE } = React;

const CS_ZOOM = 3;
const CS_LENS = 190; // px diameter

function _csStock(format) {
  const f = (format || '').toLowerCase();
  if (f.includes('medium') || f.includes('120') || f.includes('6x')) return { kind: 'mf', edge: 'KODAK PORTRA 400 · 120' };
  if (f.includes('35') || f.includes('film')) return { kind: '35', edge: 'KODAK 5063 TX · 35MM' };
  return { kind: 'dig', edge: 'DIGITAL · RAW' };
}

function _csAspect(img) {
  const m = /(\d+)\s*[×x]\s*(\d+)/.exec(img.exif?.dimensions || '');
  return m ? Number(m[1]) / Number(m[2]) : 2 / 3;
}

function ContactSheet({ project, images, viewerList, onOpenPhoto }) {
  const stock = _csStock(project.format);
  const [lens, setLens] = csS(null); // { i, x, y, bgW, bgH, bgX, bgY }
  const hiRes = csR({});

  const lensAt = (frameEl, i, img, clientX, clientY, lift = 0) => {
    const r = frameEl.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top;
    if (px < 0 || py < 0 || px > r.width || py > r.height) return setLens(null);
    if (!hiRes.current[i]) hiRes.current[i] = window.aldoSized(img.blobPath, 1600);
    setLens({
      i, x: clientX, y: clientY - lift, src: hiRes.current[i],
      bgW: r.width * CS_ZOOM, bgH: r.height * CS_ZOOM,
      bgX: -(px * CS_ZOOM - CS_LENS / 2), bgY: -(py * CS_ZOOM - CS_LENS / 2),
    });
  };
  const onMove = (e, i, img) => lensAt(e.currentTarget, i, img, e.clientX, e.clientY);

  /* Touch: long-press (250ms without moving) shows the loupe 110px above
     the finger; while it's up, moving the finger pans it instead of
     scrolling. Native listeners: React's touch handlers are passive, so
     they can't stop the page scrolling. */
  const sheetRef = csR(null);
  csE(() => {
    const el = sheetRef.current;
    if (!el) return;
    let timer = null, active = false, start = null, suppressClick = false;
    const frameOf = (t) => {
      const f = document.elementFromPoint(t.clientX, t.clientY)?.closest('.cs-frame');
      return f && el.contains(f) ? { f, i: Number(f.dataset.i) } : null;
    };
    const show = (t) => { const hit = frameOf(t); if (hit) lensAt(hit.f, hit.i, images[hit.i], t.clientX, t.clientY, 110); };
    const onStart = (e) => {
      const t = e.touches[0]; start = { x: t.clientX, y: t.clientY };
      timer = setTimeout(() => { active = true; suppressClick = true; show(t); }, 250);
    };
    const onTMove = (e) => {
      const t = e.touches[0];
      if (active) { e.preventDefault(); show(t); return; }
      if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) clearTimeout(timer);
    };
    const onEnd = () => { clearTimeout(timer); if (active) { active = false; setLens(null); } };
    const onClick = (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; } };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onTMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('click', onClick, true);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onTMove);
      el.removeEventListener('touchend', onEnd); el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('click', onClick, true);
    };
  }, [images]);

  return (
    <div ref={sheetRef} className={`cs-sheet cs-${stock.kind}`} onMouseLeave={() => setLens(null)} onContextMenu={e => e.preventDefault()}>
      {images.map((img, i) => (
        <div key={img.filename} className="cs-cell">
          <div
            className="cs-frame"
            data-i={i}
            style={{ aspectRatio: _csAspect(img) }}
            onMouseMove={e => onMove(e, i, img)}
            onMouseLeave={() => setLens(null)}
            onClick={() => onOpenPhoto(viewerList[i], viewerList)}
          >
            <img src={window.aldoSized(img.blobPath, 300)} srcSet={window.aldoSrcSet(img.blobPath)} sizes="200px" alt={`${project.name} — frame ${i + 1}`} loading="lazy" decoding="async"/>
          </div>
          <div className="cs-edge">
            <span className="cs-num">{i + 1}</span>
            <span className="cs-arrow">▸{i + 1}A</span>
            {i % 3 === 0 && <span className="cs-stock">{stock.edge}</span>}
          </div>
        </div>
      ))}
      {lens && (
        <div
          className="cs-lens"
          style={{
            left: lens.x - CS_LENS / 2, top: lens.y - CS_LENS / 2, width: CS_LENS, height: CS_LENS,
            backgroundImage: `url("${lens.src}")`,
            backgroundSize: `${lens.bgW}px ${lens.bgH}px`,
            backgroundPosition: `${lens.bgX}px ${lens.bgY}px`,
          }}
        />
      )}
    </div>
  );
}

window.ContactSheet = ContactSheet;
