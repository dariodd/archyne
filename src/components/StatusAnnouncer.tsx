import { useGraphStore } from "../store";

/**
 * The single live region for diagram state.
 *
 * Parse errors and warnings are rendered inside the code panel, which is
 * hidden whenever the user is on the Preview tab or working on the canvas —
 * so a screen-reader user editing visually got no signal at all that the
 * document had stopped parsing. This is always mounted, so the announcement
 * happens wherever focus is.
 */
export function StatusAnnouncer() {
  const parseError = useGraphStore((s) => s.parseError);
  const warning = useGraphStore((s) => s.warning);

  const message = parseError
    ? `Diagram error: ${parseError}`
    : warning
      ? `Warning: ${warning}`
      : "";

  return (
    <div className="visually-hidden" role="alert" aria-atomic="true">
      {message}
    </div>
  );
}
