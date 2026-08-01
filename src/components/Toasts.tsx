import { pauseToasts, resumeToasts, useToasts } from "../toast";
import { useT } from "../i18n";

/**
 * Transient messages, bottom-centre over the canvas.
 *
 * The container is a live region so the text reaches screen readers too:
 * `polite` for confirmations, and each error carries `role="alert"` so it
 * interrupts. Dismissal is a real button rather than a click handler on the
 * toast body, so it is reachable from the keyboard.
 */
export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const t = useT();

  if (toasts.length === 0) return null;

  return (
    // Pointer and focus both hold the timers (WCAG 2.2.2). React's onFocus
    // and onBlur bubble from the dismiss buttons, so tabbing into the stack
    // is enough — a keyboard user does not have to reach the toast first.
    <div
      className="toasts"
      aria-live="polite"
      onMouseEnter={pauseToasts}
      onMouseLeave={resumeToasts}
      onFocus={pauseToasts}
      onBlur={resumeToasts}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.tone}`}
          {...(toast.tone === "error" ? { role: "alert" } : {})}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            className="toast-close"
            aria-label={t("toast.dismiss")}
            onClick={() => dismiss(toast.id)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ))}
    </div>
  );
}
