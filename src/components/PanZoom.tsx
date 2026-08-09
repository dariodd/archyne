import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";

/**
 * Pan and zoom over something that is not a canvas.
 *
 * The two preview panes were not the same instrument: the canvas is React
 * Flow, which brings wheel-zoom, drag-to-pan and a fit button, while the
 * Mermaid rendering is one fixed picture and had a pair of percentage buttons
 * bolted beside it. Switching between them meant switching how you look at
 * things, which is a poor thing to ask of somebody comparing the two.
 *
 * So the same gestures, over a plain transform: the wheel zooms about the
 * pointer rather than about a corner, dragging moves the picture, and the
 * controls sit where React Flow's do and do the same three things.
 */
const MIN = 0.1;
const MAX = 8;

interface View {
  x: number;
  y: number;
  k: number;
}

const clamp = (k: number) => Math.min(MAX, Math.max(MIN, k));

export function PanZoom({ children, label }: { children: ReactNode; label: string }) {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  /** Where the pointer took hold, and the view it took hold of. */
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);

  /**
   * Give an SVG the size its own `viewBox` describes.
   *
   * Mermaid writes `width="100%"` with a pixel `max-width`, and inside a
   * shrink-to-fit box a percentage has no width to be a percentage *of* — the
   * picture came out a fraction of its size and the fit then measured that.
   * Nor can it simply be left to `width: auto`: an SVG carrying only a
   * `viewBox` has a ratio but no intrinsic size, so that collapses it to
   * nothing. The `viewBox` is the one place the real size is written down.
   */
  const sizeFromViewBox = (inner: HTMLElement) => {
    const svg = inner.querySelector("svg");
    const vb = svg?.viewBox.baseVal;
    if (!svg || !vb?.width || !vb.height) return;
    svg.style.width = `${vb.width}px`;
    svg.style.height = `${vb.height}px`;
  };

  /** Scale and centre the content so all of it is on screen. */
  const fit = useCallback(() => {
    const box = host.current?.getBoundingClientRect();
    const inner = content.current;
    if (!box || !inner) return;
    sizeFromViewBox(inner);
    // The natural size, measured with no transform applied to it.
    const w = inner.offsetWidth;
    const h = inner.offsetHeight;
    if (!w || !h) return;

    // Scaling *up* is allowed, as React Flow's own fit does: a small diagram
    // in a large pane should fill it rather than sit in the middle of it.
    // Capped so that two boxes do not become a wall.
    const k = clamp(Math.min((box.width - 24) / w, (box.height - 24) / h, 2));
    setView({ k, x: (box.width - w * k) / 2, y: (box.height - h * k) / 2 });
  }, []);

  // Fit once the picture has a size. Mermaid renders asynchronously, so this
  // waits for a frame rather than measuring an empty box.
  useEffect(() => {
    const frame = requestAnimationFrame(fit);
    const observer = new ResizeObserver(() => requestAnimationFrame(fit));
    if (content.current) observer.observe(content.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fit]);

  /** Zoom about a point, so what is under the pointer stays under it. */
  const zoomAt = (px: number, py: number, factor: number) =>
    setView((v) => {
      const k = clamp(v.k * factor);
      return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
    });

  const zoomCentre = (factor: number) => {
    const box = host.current?.getBoundingClientRect();
    if (box) zoomAt(box.width / 2, box.height / 2, factor);
  };

  return (
    <div
      className="panzoom"
      ref={host}
      onWheel={(e) => {
        const box = host.current?.getBoundingClientRect();
        if (!box) return;
        // `deltaY` is lines on some devices and pixels on others; only the
        // sign is portable.
        zoomAt(e.clientX - box.left, e.clientY - box.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // The controls sit inside the pane, so a press on one bubbles to
        // here. Capturing the pointer for a pan then redirected the release
        // to this element and the button never saw a click at all — the
        // wheel and the drag worked while the three buttons did nothing.
        if ((e.target as HTMLElement).closest(".panzoom-controls")) return;
        drag.current = { x: e.clientX, y: e.clientY, view };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const from = drag.current;
        if (!from) return;
        setView({
          k: from.view.k,
          x: from.view.x + (e.clientX - from.x),
          y: from.view.y + (e.clientY - from.y),
        });
      }}
      onPointerUp={(e) => {
        drag.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => (drag.current = null)}
    >
      {/* Focusable and labelled: the gestures above are pointer-only, so the
          buttons are how this is reached without one (WCAG 2.1.1). */}
      <div className="panzoom-viewport" tabIndex={0} role="group" aria-label={label}>
        <div
          className="panzoom-content"
          ref={content}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          {children}
        </div>
      </div>

      <div className="panzoom-controls">
        <button type="button" aria-label={t("import.zoomIn")} onClick={() => zoomCentre(1.25)}>
          +
        </button>
        <button type="button" aria-label={t("import.zoomOut")} onClick={() => zoomCentre(0.8)}>
          −
        </button>
        <button type="button" aria-label={t("import.zoomFit")} onClick={fit}>
          ⤢
        </button>
      </div>
    </div>
  );
}
