/**
 * The vertical rhythm of a sequence diagram, in flow coordinates.
 *
 * These sat in `seqLayout.ts`, which also holds the Zustand store that carries
 * a drag in flight — so importing three numbers pulled Zustand, and React
 * behind it, into `archyne-render`. The package's build guard caught it, which
 * is the third time that check has paid for itself.
 *
 * They are constants about geometry. Nothing about them needs a store, and the
 * renderer, the canvas and the overlay all read them from here.
 */

/** How far the participant heads' band reaches. */
export const SEQ_HEADER = 48;

/** Where the first row sits, below the heads. */
export const SEQ_TOP = 100;

/** The pitch between one row and the next. */
export const SEQ_SPACING = 44;
