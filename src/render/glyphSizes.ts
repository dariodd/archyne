/**
 * The two sizes that are set in a component rather than in the stylesheet.
 *
 * Everything else `measureNode` needs is a CSS declaration, and
 * `scripts/build-box-model.mjs` reads those straight out of `styles.css`. These
 * two are props — `<IconView size={44}>` in `ArchView`, and the `width`/`height`
 * on `ActorGlyph` — so no amount of reading the stylesheet will find them.
 *
 * They live here, in a module with no React in it, so the components and the
 * measurement share one number instead of agreeing by coincidence.
 */

/**
 * What an architecture service's icon asks for.
 *
 * A size it wants, not one it insists on: once the node has been given a size
 * of its own the icon fits into it. The stylesheet says the same beside
 * `.arch-icon`.
 */
export const ARCH_ICON_SIZE = 44;

/** The stick figure marking a sequence actor, as drawn in its head. */
export const ACTOR_GLYPH = { width: 14, height: 17 };
