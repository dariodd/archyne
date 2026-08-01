import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Lets an item close the panel it sits in.
 *
 * Context rather than a render prop: invoking `children(close)` during render
 * means calling a function that reads a ref, which React (rightly) rejects.
 */
const MenuCloseContext = createContext<(() => void) | null>(null);

/**
 * An action inside a `MenuButton`. Runs its handler, then closes the panel.
 *
 * This exists because closing used to happen in a native `click` listener on
 * the panel while the item carried its own React `onClick`. Two handlers for
 * one gesture raced, and the item's handler lost: "About Archyne" and
 * "Copy code" closed the panel and did nothing else.
 */
export function MenuItem({
  onSelect,
  children,
}: {
  onSelect: () => void;
  children: ReactNode;
}) {
  const close = useContext(MenuCloseContext);
  return (
    <button
      type="button"
      onClick={() => {
        onSelect();
        close?.();
      }}
    >
      {children}
    </button>
  );
}

/**
 * A button that opens a small panel anchored under it.
 *
 * The toolbar had every control in one flat row, which wrapped onto two or
 * three lines on an ordinary laptop. The less-used ones live in here instead,
 * so the bar stays a single row.
 *
 * Modelled as a disclosure, not a menu. It holds actions *and* settings, and
 * `role="menu"` forbids anything but menu items among its children — the
 * theme and language selects would be an ARIA violation. So: `aria-expanded`
 * plus `aria-controls`, with arrow-key navigation, Escape, and focus returned
 * to the trigger.
 */
export function MenuButton({
  label,
  children,
  className = "",
}: {
  label: string;
  /** Use `MenuItem` for actions; plain controls leave the panel open. */
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture: the canvas stops propagation of its own pointer events.
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    menu?.querySelector<HTMLElement>("button, select, a")?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = [...(menu?.querySelectorAll<HTMLElement>("button, select, a") ?? [])];
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "ArrowDown"
          ? (at + 1) % items.length
          : (at - 1 + items.length) % items.length;
      items[next].focus();
    };
    menu?.addEventListener("keydown", onKeyDown);
    return () => menu?.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className={`menu-button ${className}`.trim()} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div className="menu-popover" id={menuId} role="group" aria-label={label} ref={menuRef}>
          <MenuCloseContext.Provider
            value={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
          >
            {children}
          </MenuCloseContext.Provider>
        </div>
      )}
    </div>
  );
}
