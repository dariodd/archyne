import { ACTOR_GLYPH } from "../render/glyphSizes";
import { ACTOR_PATH } from "../render/actorPath";
/**
 * The stick figure that marks a sequence actor.
 *
 * One path, shared by the palette entry and the participant head on the
 * canvas, so what you drag in and what you get cannot drift apart. Drawn the
 * way Mermaid draws an actor — head, spine, arms, legs — rather than as a
 * glyph from the text font, which lands at whatever size and weight the
 * platform happens to have and reads as a smiley rather than a person.
 *
 * Laid out in the palette's 48×24 frame, where it occupies x 16..32, y 2..22.
 */
export { ACTOR_PATH } from "../render/actorPath";

/** The figure alone, cropped out of that frame and inked in the text colour. */
export function ActorGlyph() {
  return (
    <svg
      className="actor-icon"
      width={ACTOR_GLYPH.width}
      height={ACTOR_GLYPH.height}
      viewBox="15 1 18 22"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={ACTOR_PATH} />
    </svg>
  );
}
