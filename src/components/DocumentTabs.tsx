import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { DocumentList } from "./DocumentList";
import { KindBadge } from "./KindBadge";
import { useDocKinds } from "./useDocKinds";
import { useWorkspace } from "../workspace";
import {
  closeAllDocs,
  createDoc,
  deleteDoc,
  moveDoc,
  renameDoc,
  switchTo,
  unsavedDocuments,
  useDocDialogs,
} from "../documents";
import { useGraphStore } from "../store";
import { useFileStore } from "../files";
import { useT } from "../i18n";

/**
 * One tab per open diagram.
 *
 * This started as a menu on the document name, chosen to spend no vertical
 * space on a screen where the canvas is the product. That was the wrong
 * trade: nothing on screen said other documents existed, so the feature was
 * only usable by someone who already knew it was there. Tabs cost about
 * thirty pixels and answer "how many diagrams do I have open" without being
 * asked.
 *
 * Shown even with one document, deliberately. A strip that appears when the
 * second document arrives would shift the canvas under the pointer, and a
 * lone tab beside a `+` is how every editor says "there can be more".
 */
export function DocumentTabs() {
  const t = useT();
  const docs = useWorkspace((s) => s.docs);
  const activeId = useWorkspace((s) => s.activeId);
  const code = useGraphStore((s) => s.code);
  const savedCode = useFileStore((s) => s.savedCode);
  const renaming = useDocDialogs((s) => s.renaming);
  const confirmDelete = useDocDialogs((s) => s.deleting);
  const setRenaming = (id: string | null) => useDocDialogs.setState({ renaming: id });
  const setConfirmDelete = (id: string | null) => useDocDialogs.setState({ deleting: id });
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);

  const activeDirty = savedCode !== null && savedCode !== code;
  // Named in the dialog rather than counted: "two documents have unsaved
  // changes" leaves you to work out which two.
  const unsaved = confirmCloseAll ? unsavedDocuments() : [];

  const kinds = useDocKinds();
  const target = docs.find((d) => d.id === (renaming ?? confirmDelete));

  /**
   * The strip scrolls once the tabs stop fitting.
   *
   * They used to shrink instead, with no floor: past about eight documents a
   * tab was a badge, one letter and a close button, and the strip answered
   * "how many are open" while refusing to say which. A minimum width in the
   * stylesheet stops the shrinking, and past it the strip scrolls — by the
   * wheel, by dragging a tab to its edge, or by picking the diagram out of
   * the list instead.
   *
   * An edge with more behind it fades out and carries a round chevron over
   * the fade. The chevron is positioned over the tabs rather than beside
   * them, which is the whole point: laid out in the row, it appeared only
   * once you had scrolled, and so shifted every tab sideways at the moment
   * you were reaching for one. A scrollbar is not an option either — a
   * thirty-pixel strip has no eight pixels to spare for one on Windows.
   *
   * `before` and `after` are the two ends of the *list*. Which of them is on
   * the left depends on the direction of the text, and only the gradient
   * needs to know: `rtl` is kept here so the mask can be told, while the
   * chevrons stay logical and let `inset-inline` place them.
   */
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ before: false, after: false, rtl: false });

  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    // `scrollLeft` counts down from zero when the strip runs right to left,
    // so the distance travelled is its magnitude in either direction.
    const from = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    setEdges({
      before: from > 1,
      after: from < max - 1,
      rtl: getComputedStyle(el).direction === "rtl",
    });
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [measure, docs]);

  /* A document can also be switched from the palette or the keyboard, which
     can land on a tab that is currently past the edge. */
  useEffect(() => {
    const active = stripRef.current?.querySelector<HTMLElement>(".doc-tab.active");
    active?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeId, docs]);

  /** A chevron moves most of a screenful, leaving a tab or so for context. */
  const page = () => Math.max(120, (stripRef.current?.clientWidth ?? 0) * 0.8);

  /** Positive is towards the end of the list, whichever way the text runs. */
  const slide = (amount: number) => {
    const el = stripRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollLeft += rtl ? -amount : amount;
  };

  /**
   * Dragging a tab to reorder it.
   *
   * `dropAt` is the slot the tab would land in, counted in the list as it
   * stands — so it runs from 0 to `docs.length`, one more than there are
   * tabs, because "after the last one" is a place too.
   *
   * The whole tab is the handle rather than a grip beside the name. A tab is
   * already the thing you point at to switch documents, and the browser's own
   * drag suppresses the click a drag turned into, so the two gestures do not
   * have to be told apart here.
   */
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  /** A reorder is silent otherwise: nothing about it reaches a screen reader. */
  const [moved, setMoved] = useState("");

  const endDrag = () => {
    if (dragId && dropAt !== null) {
      const from = docs.findIndex((d) => d.id === dragId);
      // The slot was counted with the tab still in it, so anything past its
      // own position is one place nearer the front once it leaves.
      const at = moveDoc(dragId, dropAt > from ? dropAt - 1 : dropAt);
      const name = docs[from]?.name;
      if (at >= 0 && at !== from && name) {
        setMoved(t("doc.moved", { name, position: at + 1, count: docs.length }));
      }
    }
    setDragId(null);
    setDropAt(null);
  };

  /** Which slot a drag hovering over tab `index` would drop into. */
  const slotUnder = (e: React.DragEvent<HTMLElement>, index: number) => {
    const box = e.currentTarget.getBoundingClientRect();
    const pastMiddle = e.clientX > box.left + box.width / 2;
    // Past the middle means the next slot along — except right to left, where
    // the next tab is the one to the left.
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    return index + (pastMiddle !== rtl ? 1 : 0);
  };

  return (
    <>
      {/* Not `role="tablist"`: these switch the whole document rather than a
          panel within one, and there is no tabpanel to point `aria-controls`
          at. A list of links-to-state with `aria-current` says what is true. */}
      <div className="doc-tabs" role="group" aria-label={t("doc.openDocuments")}>
        <div
          className="doc-tab-scroller"
          /* Held at an edge, a drag pulls the rest of the strip past it —
             otherwise a tab can only be moved as far as the tabs already on
             screen, which with twenty open is most of the way to nowhere.
             On the wrapper rather than the strip so a drag held over a
             chevron, which sits on top, still reaches this. Physical left
             and right: it follows the pointer, not the list. */
          onDragOver={(e) => {
            const el = stripRef.current;
            if (!dragId || !el) return;
            e.preventDefault();
            const box = el.getBoundingClientRect();
            const EDGE = 44;
            if (e.clientX < box.left + EDGE) el.scrollLeft -= 18;
            else if (e.clientX > box.right - EDGE) el.scrollLeft += 18;
          }}
        >
          <div
            className="doc-tab-strip"
            ref={stripRef}
            data-fade={
              [
                (edges.rtl ? edges.after : edges.before) ? "left" : "",
                (edges.rtl ? edges.before : edges.after) ? "right" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            /* A plain mouse has only a vertical wheel, and a trackpad that
               has a sideways one is already handled by the browser. */
            onWheel={(e) => {
              if (e.deltaX === 0) slide(e.deltaY);
            }}
          >
            {docs.map((d, i) => {
              const active = d.id === activeId;
              return (
                <span
                  key={d.id}
                  className={
                    (active ? "doc-tab active" : "doc-tab") +
                    (d.id === dragId ? " dragging" : "")
                  }
                  /* The marker goes on the tab the drop is next to: before it,
                   or after it when the drop is off the end of the list. */
                  data-drop={
                    dropAt === i
                      ? "before"
                      : dropAt === docs.length && i === docs.length - 1
                        ? "after"
                        : undefined
                  }
                  draggable
                  onDragStart={(e) => {
                    setDragId(d.id);
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox starts no drag at all unless the transfer carries
                    // something; the id is the honest thing to put in it.
                    e.dataTransfer.setData("text/plain", d.id);
                  }}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropAt(slotUnder(e, i));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    endDrag();
                  }}
                  onDragEnd={endDrag}
                >
                  <button
                    type="button"
                    className="doc-tab-name"
                    aria-current={active ? "true" : undefined}
                    title={kinds[d.id] ? `${d.name} — ${t(`kind.${kinds[d.id]!}`)}` : d.name}
                    onClick={() => void switchTo(d.id)}
                    onDoubleClick={() => setRenaming(d.id)}
                  >
                    {kinds[d.id] && <KindBadge kind={kinds[d.id]!} />}
                    <span className="doc-tab-label">{d.name}</span>
                    {active && activeDirty && (
                      <em className="file-dirty" aria-label={t("file.unsaved")}>
                        •
                      </em>
                    )}
                  </button>
                  <button
                    type="button"
                    className="doc-tab-close"
                    aria-label={t("doc.closeNamed", { name: d.name })}
                    onClick={() => setConfirmDelete(d.id)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              );
            })}
          </div>
          {edges.before && (
            <button
              type="button"
              className="doc-tab-scroll at-start"
              aria-label={t("doc.tabsPrev")}
              title={t("doc.tabsPrev")}
              onClick={() => slide(-page())}
            >
              <span aria-hidden="true">‹</span>
            </button>
          )}
          {edges.after && (
            <button
              type="button"
              className="doc-tab-scroll at-end"
              aria-label={t("doc.tabsNext")}
              title={t("doc.tabsNext")}
              onClick={() => slide(page())}
            >
              <span aria-hidden="true">›</span>
            </button>
          )}
        </div>
        <button
          type="button"
          className="doc-tab-add"
          aria-label={t("doc.new")}
          title={t("doc.new")}
          onClick={() => void createDoc()}
        >
          <span aria-hidden="true">+</span>
        </button>
        {docs.length > 1 && <DocumentList onAnnounce={setMoved} />}
        {docs.length > 1 && (
          /* Only with something to close. One document and a "close all" is
             a button that says the same thing as the × beside it. */
          <button
            type="button"
            className="doc-tab-close-all"
            onClick={() => setConfirmCloseAll(true)}
          >
            {t("doc.closeAll")}
          </button>
        )}
        {docs.length < 2 && (
          /* Says what the strip is, once, for anyone who has only ever had one
             diagram open and would otherwise read a lone tab as decoration. It
             goes when a second document makes the point by itself — dropped
             rather than hidden, since an invisible label is still read out. */
          <span className="doc-tabs-hint">{t("doc.tabsHint")}</span>
        )}
      </div>

      {/* Moving a tab changes nothing that is announced on its own: no focus
          moves and no dialog opens. This says what happened. */}
      <div className="visually-hidden doc-moved" role="status" aria-atomic="true">
        {moved}
      </div>

      {confirmCloseAll && (
        <Modal
          title={t("doc.closeAllTitle", { count: docs.length })}
          onClose={() => setConfirmCloseAll(false)}
          className="narrow"
        >
          <div className="modal-body">
            <p>{unsaved.length > 0 ? t("doc.closeAllUnsaved") : t("doc.closeAllBody")}</p>
            {unsaved.length > 0 && (
              <ul className="doc-unsaved-list">
                {unsaved.map((d) => (
                  <li key={d.id}>{d.name}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="modal-actions">
            <button onClick={() => setConfirmCloseAll(false)}>{t("common.cancel")}</button>
            <button
              className="danger"
              onClick={() => {
                setConfirmCloseAll(false);
                void closeAllDocs();
              }}
            >
              {t("doc.closeAll")}
            </button>
          </div>
        </Modal>
      )}

      {renaming && target && (
        <RenameDialog
          initial={target.name}
          onClose={() => setRenaming(null)}
          onSubmit={(name) => {
            renameDoc(renaming, name);
            setRenaming(null);
          }}
        />
      )}

      {confirmDelete && target && (
        <Modal
          title={t("doc.deleteTitle", { name: target.name })}
          onClose={() => setConfirmDelete(null)}
          className="narrow"
        >
          <div className="modal-body">
            <p>
              {confirmDelete === activeId && activeDirty
                ? t("doc.deleteUnsaved")
                : t("doc.deleteBody")}
            </p>
          </div>
          <div className="modal-actions">
            <button onClick={() => setConfirmDelete(null)}>{t("common.cancel")}</button>
            <button
              className="danger"
              onClick={() => {
                const id = confirmDelete;
                setConfirmDelete(null);
                void deleteDoc(id);
              }}
            >
              {t("doc.delete")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function RenameDialog({
  initial,
  onClose,
  onSubmit,
}: {
  initial: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const t = useT();
  const [value, setValue] = useState(initial);

  return (
    <Modal title={t("doc.renameTitle")} onClose={onClose} className="narrow">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <div className="modal-body stacked">
          <label className="field">
            {t("doc.nameLabel")}
            {/* Autofocus is the point of the dialog: it exists to take a name. */}
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <p className="field-hint">{t("doc.renameHint")}</p>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="primary">
            {t("doc.renameConfirm")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
