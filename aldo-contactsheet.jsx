/* aldo-contactsheet.jsx — a project shown as a film contact sheet.
 *
 * Frames sit on dark film stock with sprocket holes, frame numbers and an
 * edge print chosen from the project's format (35mm / medium format /
 * digital). Hovering a frame shows a loupe that magnifies it 3× from a
 * high-resolution copy, the way a photographer reviews a sheet on a light
 * table. Click a frame to open it in the viewer.
 */

const { useState: csS, useRef: csR } = React;

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

  const onMove = (e, i, img) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (px < 0 || py < 0 || px > r.width || py > r.height) return setLens(null);
    if (!hiRes.current[i]) hiRes.current[i] = window.aldoSized(img.blobPath, 1600);
    setLens({
      i, x: e.clientX, y: e.clientY, src: hiRes.current[i],
      bgW: r.width * CS_ZOOM, bgH: r.height * CS_ZOOM,
      bgX: -(px * CS_ZOOM - CS_LENS / 2), bgY: -(py * CS_ZOOM - CS_LENS / 2),
    });
  };

  return (
    <div className={`cs-sheet cs-${stock.kind}`} onMouseLeave={() => setLens(null)}>
      {images.map((img, i) => (
        <div key={img.filename} className="cs-cell">
          <div
            className="cs-frame"
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
