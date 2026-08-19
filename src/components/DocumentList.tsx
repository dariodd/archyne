import { useEffect, useId, useRef, useState } from "react";
import { KindBadge } from "./KindBadge";
import { useDocKinds } from "./useDocKinds";
import { moveDoc, sortDocs, switchTo, unsavedDocuments, useDocDialogs } from "../documents";
import { useWorkspace } from "../workspace";
import { useGraphStore } from "../store";
import { useFileStore } from "../files";
import { useT } from "../i18n";

/**
 * Every open document, in one panel.
 *
 * The tab strip can only ever show the tabs that fit. Past that it scrolls,
 * which answers "which diagram do I want" by making you go looking for it —
 * fine for six documents, useless for twenty. This is the list that always
 * shows all of them, and the only place the order can be changed without a
 * mouse.
 *
 * Not built on `MenuButton`, deliberately. That panel walks its arrow keys
 * through every button it contains, which here would be four per document:
 * with a dozen open, reaching the last one is fifty presses. The arrows move
 * between documents instead, and Alt with them moves the document — the
 * keyboard half of dragging a tab.
 */
export function DocumentList({ onAnnounce }: { onAnnounce: (message: string) => void }) {
  const t = useT();
  const docs = useWorkspace((s) => s.docs);
  const activeId = useWorkspace((s) => s.activeId);
  const kinds = useDocKinds();

  /* Subscribed to rather than read: `unsavedDocuments` goes to the stores
     itself, so without these the dots would only be right at the moment the
     panel opened. */
  useGraphStore((s) => s.code);
  useFileStore((s) => s.savedCode);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const panelId = useId();

  const dirty = new Set(open ? unsavedDocuments().map((d) => d.id) : []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture: the canvas stops propagation of its own pointer events.
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [open]);

  /* Escape on the panel rather than on the window, and stopped there, so it
     closes this and not the dialog or the selection behind it. */
  useEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    wrap?.addEventListener("keydown", onKey);
    return () => wrap?.removeEventListener("keydown", onKey);
  }, [open]);

  /* Opens on the document you are in: the one you are leaving is where a list
     of somewhere-else should start from. */
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-doc="${activeId}"] .doc-row-name`)
      ?.focus();
  }, [open, activeId]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function move(id: string, name: string, delta: -1 | 1) {
    const from = docs.findIndex((d) => d.id === id);
    if (from < 0) return;
    const at = moveDoc(id, from + delta);
    if (at === from) return;
    onAnnounce(t("doc.moved", { name, position: at + 1, count: docs.length }));
    // The row travels with the document, so focus has to follow it there —
    // otherwise the next Alt+Arrow moves whichever document took this slot.
    // Ids are `d` plus base-36 digits, so they need no escaping.
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-doc="${id}"] .doc-row-name`)?.focus(),
    );
  }

  function onRowKeys(e: React.KeyboardEvent, index: number, id: string, name: string) {
    const rows = () => [
      ...(listRef.current?.querySelectorAll<HTMLElement>(".doc-row-name") ?? []),
    ];
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      if (e.altKey) {
        move(id, name, delta);
        return;
      }
      const list = rows();
      list[(index + delta + list.length) % list.length]?.focus();
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const list = rows();
      (e.key === "Home" ? list[0] : list[list.length - 1])?.focus();
    }
  }

  return (
    <div className="doc-list" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="doc-tab-list"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t("doc.listLabel", { count: docs.length })}
        title={t("doc.listLabel", { count: docs.length })}
        onClick={() => setOpen((v) => !v)}
      >
        {/* The count is on the control's face and not only in its label: it
            stays true when the strip is showing four tabs out of twenty. */}
        <span aria-hidden="true">{docs.length}</span>
        <span aria-hidden="true" className="doc-list-caret">
          ▾
        </span>
      </button>

      {open && (
        <div className="menu-popover doc-list-panel" id={panelId}>
          <div className="doc-list-sort">
            <button type="button" onClick={() => sortDocs("name")}>
              {t("doc.sortName")}
            </button>
            <button type="button" onClick={() => sortDocs("recent")}>
              {t("doc.sortRecent")}
            </button>
          </div>

          <ul className="doc-list-rows" ref={listRef} aria-label={t("doc.list")}>
            {docs.map((d, i) => {
              const active = d.id === activeId;
              return (
                <li
                  key={d.id}
                  data-doc={d.id}
                  className={active ? "doc-row active" : "doc-row"}
                >
                  <button
                    type="button"
                    className="doc-row-name"
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      void switchTo(d.id);
                      close();
                    }}
                    onKeyDown={(e) => onRowKeys(e, i, d.id, d.name)}
                  >
                    {kinds[d.id] && <KindBadge kind={kinds[d.id]!} />}
                    <span className="doc-row-label">{d.name}</span>
                    {dirty.has(d.id) && (
                      <em className="file-dirty" aria-label={t("file.unsaved")}>
                        •
                      </em>
                    )}
                  </button>
                  {/* Out of the tab order on purpose: Alt with the arrows does
                      this from the row itself, and three more stops per
                      document would put the last one a long way from the
                      first. They stay reachable by pointer, and by a screen
                      reader's own cursor. */}
                  <button
                    type="button"
                    tabIndex={-1}
                    className="doc-row-move"
                    aria-label={t("doc.moveUp")}
                    title={t("doc.moveUp")}
                    disabled={i === 0}
                    onClick={() => move(d.id, d.name, -1)}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    className="doc-row-move"
                    aria-label={t("doc.moveDown")}
                    title={t("doc.moveDown")}
                    disabled={i === docs.length - 1}
                    onClick={() => move(d.id, d.name, 1)}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    className="doc-row-close"
                    aria-label={t("doc.closeNamed", { name: d.name })}
                    title={t("doc.closeNamed", { name: d.name })}
                    onClick={() => {
                      useDocDialogs.setState({ deleting: d.id });
                      close();
                    }}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="doc-list-hint">{t("doc.reorderHint")}</p>
        </div>
      )}
    </div>
  );
}
