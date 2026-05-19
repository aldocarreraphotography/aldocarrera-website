/* aldo-window.jsx — draggable, resizable window primitive (refined chrome)
   Drag/resize use a ref-stable handler pattern so re-renders triggered by
   onFocus()/onMove() during a drag don't tear down the listeners. */

const { useState: awUseState, useEffect: awUseEffect, useRef: awUseRef, useLayoutEffect: awUseLayoutEffect } = React;

function useAldoDrag(targetRef, handleRef, onChange, onStart) {
  // keep latest callbacks in a ref so the listener closure doesn't go stale
  // but the effect itself only runs once (when handle mounts)
  const cbs = awUseRef({ onChange, onStart });
  cbs.current = { onChange, onStart };

  awUseEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    let dragging = false, sx = 0, sy = 0, ix = 0, iy = 0;
    const down = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.dot')) return;
      if (e.target.closest('button')) return;
      dragging = true;
      // offsetLeft/offsetTop are parent-relative, matching the coord space we
      // write back via style.left/top. getBoundingClientRect() is viewport-
      // relative and would re-add any parent offset (e.g. the menubar) per drag.
      ix = targetRef.current.offsetLeft; iy = targetRef.current.offsetTop;
      sx = e.clientX; sy = e.clientY;
      cbs.current.onStart && cbs.current.onStart();
      e.preventDefault();
    };
    const move = (e) => {
      if (!dragging) return;
      cbs.current.onChange({
        x: ix + (e.clientX - sx),
        y: Math.max(0, iy + (e.clientY - sy)), // parent-local: 0 is just under the menubar
      });
    };
    const up = () => { dragging = false; };
    handle.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      handle.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []); // attach once
}

function useAldoResize(targetRef, handleRef, onChange, min = { w: 320, h: 220 }) {
  const cbs = awUseRef({ onChange });
  cbs.current = { onChange };

  awUseEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    let resizing = false, sx = 0, sy = 0, iw = 0, ih = 0;
    const down = (e) => {
      if (e.button !== 0) return;
      resizing = true;
      const r = targetRef.current.getBoundingClientRect();
      iw = r.width; ih = r.height; sx = e.clientX; sy = e.clientY;
      e.preventDefault();
      e.stopPropagation();
    };
    const move = (e) => {
      if (!resizing) return;
      cbs.current.onChange({
        w: Math.max(min.w, iw + (e.clientX - sx)),
        h: Math.max(min.h, ih + (e.clientY - sy)),
      });
    };
    const up = () => { resizing = false; };
    handle.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      handle.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, []); // attach once
}

function AWin({ id, title, path, x, y, w, h, z, focused, minimized, toolbar, statusbar,
                onMove, onResize, onFocus, onClose, onMinimize, onMaximize, children }) {
  const ref = awUseRef(null);
  const titleRef = awUseRef(null);
  const resizeRef = awUseRef(null);
  useAldoDrag(ref, titleRef, ({ x, y }) => onMove(id, x, y), () => onFocus(id));
  useAldoResize(ref, resizeRef, ({ w, h }) => onResize(id, w, h));

  return (
    <div
      ref={ref}
      className={`window ${focused ? 'focused' : ''} ${minimized ? 'minimized' : ''}`}
      style={{ left: x, top: y, width: w, height: h, zIndex: z }}
      onMouseDown={() => onFocus(id)}
    >
      <div className="title-bar" ref={titleRef}>
        <div className="dot-controls">
          <button className="dot close" onClick={() => onClose(id)} aria-label="close">×</button>
          <button className="dot min" onClick={() => onMinimize(id)} aria-label="minimize">−</button>
          <button className="dot max" onClick={() => onMaximize && onMaximize(id)} aria-label="maximize">+</button>
        </div>
        <div className="title">
          <span>{title}</span>
          {path && <span className="path">{path}</span>}
        </div>
        <div className="spacer-r"/>
      </div>
      <div className="window-body">
        {toolbar}
        <div className="window-content">{children}</div>
        {statusbar}
      </div>
      <div className="resize-handle" ref={resizeRef}/>
    </div>
  );
}

window.AWin = AWin;
