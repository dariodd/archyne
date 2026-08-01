import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Accessible modal shell: focus trap, Escape to close, focus restored to
 * whatever opened it, and the roles a screen reader needs to announce it.
 *
 * Dialogs previously rendered as plain nested `<div>`s with a window-level
 * Escape listener, so keyboard users could Tab straight out of an open dialog
 * into the canvas behind it and never find their way back.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Modal({
  title,
  onClose,
  className = "",
  hideTitle = false,
  children,
}: {
  /** Announced as the dialog's name. Also rendered as its heading. */
  title: string;
  onClose: () => void;
  className?: string;
  /** Keep the heading for screen readers but not on screen. */
  hideTitle?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    // Focus the first control, falling back to the dialog itself, so the
    // trap below has something to work against and the dialog is announced.
    (dialog?.querySelector<HTMLElement>(FOCUSABLE) ?? dialog)?.focus();
    return () => restoreTo?.focus?.();
  }, []);

  // Bound to the node rather than passed as a JSX prop: a dialog is not an
  // interactive element, so a `onKeyDown` attribute on it is (correctly)
  // flagged by jsx-a11y even though trapping keys here is exactly right.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Don't let the canvas or a parent menu also react to this Escape.
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      // `checkVisibility` skips controls hidden by a collapsed branch — the
      // export dialog swaps options in and out as the format changes. Not
      // every engine implements it, and `offsetParent` is the wrong test
      // here (it is null for `position: fixed`, which the overlay is), so
      // fall back to treating the control as visible.
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.checkVisibility?.() ?? true,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    // The backdrop is a pointer-only convenience; Escape and the dialog's own
    // close button are the keyboard paths, so it is presentational.
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 className={hideTitle ? "visually-hidden" : "modal-title"} id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
