import { useEffect, useRef, useState, type RefObject } from "react";
import { clampSideWidth, MIN_SIDE_WIDTH, useLayoutStore } from "../layoutStore";
import { useT } from "../i18n";

/** One arrow press; Shift makes it a stride. */
const STEP = 16;
const BIG_STEP = 64;

/**
 * The divider between the canvas and the side panel.
 *
 * A real `role="separator"` with a value, not a bare div with a mousedown
 * handler: the panel holds a code editor, and "make the code wider" is
 * exactly the thing someone who cannot use a mouse also wants. Arrow keys
 * move it, Home or End put it back, and so does a double-click.
 *
 * The width is measured from the panel itself rather than read from the
 * store, because until the first drag there is no stored width — it is
 * whatever the responsive stylesheet chose, and a drag has to continue from
 * that number instead of jumping to a default.
 */
export function SideResizer({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const setSideWidth = useLayoutStore((s) => s.setSideWidth);
  const resetSideWidth = useLayoutStore((s) => s.resetSideWidth);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  const t = useT();

  useEffect(() => {
    const panel = targetRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return;
    // Observed rather than derived: the panel is only sometimes the width the
    // store holds — before the first drag, and at the breakpoints, the
    // stylesheet decides — and the announced value has to be the real one.
    const observer = new ResizeObserver(() => setWidth(panel.getBoundingClientRect().width));
    observer.observe(panel);
    setWidth(panel.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [targetRef]);

  useEffect(() => {
    // The pointer is captured here, but the cursor and the text selection are
    // the whole window's business for as long as the drag lasts.
    if (!dragging) return;
    document.body.classList.add("resizing-side");
    return () => document.body.classList.remove("resizing-side");
  }, [dragging]);

  // In Arabic the whole layout mirrors, so the panel is on the left and the
  // pointer has to travel the other way to widen it.
  const rtl = () => document.documentElement.dir === "rtl";

  /**
   * The panel's width right now.
   *
   * Measured in the handler rather than read from the state above, which the
   * observer updates a frame late: two arrow presses in a row would both
   * start from the same number and the second would do nothing.
   */
  const measure = () => targetRef.current?.getBoundingClientRect().width ?? width;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragStart.current = { x: e.clientX, width: measure() };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const from = dragStart.current;
    if (!from) return;
    setSideWidth(from.width + (rtl() ? 1 : -1) * (e.clientX - from.x));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    dragStart.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? BIG_STEP : STEP;
    const grow = rtl() ? "ArrowRight" : "ArrowLeft";
    const shrink = rtl() ? "ArrowLeft" : "ArrowRight";
    if (e.key === grow) setSideWidth(measure() + step);
    else if (e.key === shrink) setSideWidth(measure() - step);
    else if (e.key === "Home" || e.key === "End") resetSideWidth();
    else return;
    e.preventDefault();
  };

  return (
    // A focusable separator carrying a value is the ARIA window-splitter
    // pattern, and it is what a resize handle is; the rules below only know
    // the decorative kind of separator, which has neither.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={`side-resizer${dragging ? " dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={t("panel.resize")}
      aria-valuenow={Math.round(width)}
      aria-valuemin={MIN_SIDE_WIDTH}
      aria-valuemax={clampSideWidth(Number.POSITIVE_INFINITY)}
      title={t("panel.resizeHint")}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => resetSideWidth()}
      onKeyDown={onKeyDown}
    />
  );
}
