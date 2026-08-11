/**
 * How small a node can get while everything in it still reads.
 *
 * `NODE_MIN` is a floor for the whole app, and a single number cannot know
 * that this node carries a 44px icon and a two-word name while that one
 * carries the word "OK". Dragged to a flat 48×28 they both clipped, so the
 * question the floor should answer — how small can this box be and still show
 * what is in it — was never being asked.
 *
 * Only the rendered element can answer it: the label's length, the type size
 * it is drawn at, the icon, the padding each family chose. So it is measured
 * from the DOM rather than estimated, and estimating is what `estimateSize`
 * is for — a guess for a node that has never been on screen.
 */

/** The node's own element, under React Flow's wrapper. */
function drawnElement(id: string): HTMLElement | null {
  const wrap = document.querySelector<HTMLElement>(
    `.react-flow__node[data-id="${CSS.escape(id)}"]`,
  );
  const el = wrap?.firstElementChild;
  return el instanceof HTMLElement ? el : null;
}

/**
 * Measure the node with the size it has been given lifted off it.
 *
 * `atWidth` asks the second question: given this width, how tall does the
 * content come out? Width and height are not independent — a label that needs
 * three lines in a narrow box needs one in a wide one — so a floor that
 * ignored the current width would keep a widened node needlessly tall.
 * Without it the width measured is `min-content`: the narrowest the content
 * goes before it has to be cut, which is the honest smallest.
 */
export function contentMinSize(
  id: string,
  atWidth?: number,
): { width: number; height: number } | null {
  const el = drawnElement(id);
  if (!el) return null;
  const saved = el.style.cssText;
  el.style.width = atWidth === undefined ? "min-content" : `${Math.max(0, atWidth)}px`;
  el.style.height = "auto";
  el.style.minWidth = "0";
  el.style.minHeight = "0";
  el.style.maxWidth = "none";
  el.style.maxHeight = "none";
  // Read before restoring: both reads force the one layout this costs.
  const width = Math.ceil(el.offsetWidth);
  const height = Math.ceil(el.offsetHeight);
  el.style.cssText = saved;
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The smallest box that holds this node's content, both directions answered
 * together: the narrowest the content goes, and then how tall it comes out at
 * the width actually being asked for.
 *
 * `want` is the size under consideration; the answer is that size raised to
 * wherever the content stops fitting. Falls back to `fallback` — the flat
 * minimum — while the node has nothing on screen to measure.
 */
export function fitToContent(
  id: string,
  want: { width: number; height: number },
  fallback: { width: number; height: number },
): { width: number; height: number } {
  const narrowest = contentMinSize(id) ?? fallback;
  const width = Math.max(want.width, narrowest.width);
  const at = contentMinSize(id, width) ?? narrowest;
  return { width, height: Math.max(want.height, at.height) };
}
