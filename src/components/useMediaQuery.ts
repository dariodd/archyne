import { useEffect, useState } from "react";

/**
 * A media query as React state.
 *
 * Some of what the layout does about size and input cannot be said in CSS.
 * Controls *move* between the toolbar and the overflow menu, and the canvas
 * answers to a finger differently than to a mouse — neither is a matter of
 * hiding something, so both need the answer in JavaScript.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      // No matchMedia (jsdom, older embedders): assume the roomy default.
      return false;
    }
  });

  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(query);
    } catch {
      return;
    }
    const onChange = () => setMatches(mq.matches);
    // The window can have changed between first render and this effect.
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * Phone-sized: the point at which the toolbar hands its less-used controls
 * to the overflow menu.
 *
 * Width *or* height, because a phone held sideways is neither narrow nor
 * roomy — 750 by 342 — and there the scarce dimension is the one the toolbar
 * spends. Two rows of controls is a third of that screen.
 *
 * The stylesheet trims the same bar on the same two measurements; kept in
 * step on purpose, since a size matching one and not the other would leave a
 * control in neither place.
 */
export function useNarrow(): boolean {
  return useMediaQuery("(max-width: 640px), (max-height: 420px)");
}

/**
 * A finger rather than a mouse.
 *
 * The canvas gives the two different gestures: a mouse drags a selection
 * rectangle and pans with the middle or right button, neither of which a
 * touchscreen has.
 */
export function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)");
}
