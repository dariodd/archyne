/**
 * The stick figure that marks a sequence actor, as a path.
 *
 * It lived in `components/ActorGlyph.tsx`, and the renderer cannot import a
 * React component — so the path moves here and the component traces it from
 * the same constant. One figure, drawn by the palette, the canvas and the
 * emitter alike.
 *
 * Laid out in the palette's 48×24 frame, where it occupies x 16..32, y 2..22.
 */
export const ACTOR_PATH =
  "M24,2 a4,4 0 1 1 0,8 a4,4 0 1 1 0,-8 M24,10 v6 M16,13 h16 M24,16 l-6,6 M24,16 l6,6";
