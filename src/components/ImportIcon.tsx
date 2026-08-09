import { useRef, useState } from "react";
import { useGraphStore } from "../store";
import { useIconPrefs } from "../iconPrefs";
import { desktopBridge } from "../files";
import { fetchIcons } from "../iconFetch";
import { ICON_HOSTS, parseLinks } from "../model/iconUrl";
import { useT } from "../i18n";
import { toast, toastError } from "../toast";
import { Modal } from "./Modal";

/**
 * Bring SVGs in — from disk, or from a link.
 *
 * The vendors publish their icons as loose files, so importing them is the
 * path their terms are written for, and the icons travel in the diagram
 * rather than inside Archyne.
 *
 * Offered in two places, because it was first offered in only one and that
 * turned out to be the wrong one. In the inspector it points the selected
 * node at what it imported; in the shapes palette, beside the icon search, it
 * simply stocks the shelf — which is where somebody goes when they are
 * looking for an icon rather than editing a node.
 */
export function ImportIcon({ nodeId }: { nodeId?: string }) {
  const t = useT();
  const addCustomIcons = useGraphStore((s) => s.addCustomIcons);
  const updateNodeData = useGraphStore((s) => s.updateNodeData);
  const input = useRef<HTMLInputElement>(null);
  const [linksOpen, setLinksOpen] = useState(false);

  /** Everything imported arrives here, however it was fetched. */
  function accept(files: Array<{ name: string; svg: string }>, alreadyFailed = 0) {
    const refs = addCustomIcons(files);
    if (refs.length === 0) return false;
    useIconPrefs.getState().recordRecent(refs[0]);
    // The node takes the first; the rest are in the palette to be used.
    if (nodeId) updateNodeData(nodeId, { icon: refs[0] });
    if (files.length > 1 || alreadyFailed > 0 || !nodeId) {
      toast("toast.iconsImported", "info", {
        count: String(refs.length),
        skipped: String(files.length - refs.length + alreadyFailed),
      });
    }
    return true;
  }

  return (
    <>
      <button type="button" className="mini" onClick={() => input.current?.click()}>
        {t("insp.importIcon")}
      </button>
      <button type="button" className="mini" onClick={() => setLinksOpen(true)}>
        {t("insp.importUrl")}
      </button>
      {/* `multiple`, because the vendors ship hundreds of files in a folder
          and importing them one at a time is not importing them.

          Hidden but still in the accessibility tree, which is what
          `visually-hidden` is for and also why it needs a name of its own:
          the button above opens it, so it is skipped in the tab order, but a
          screen reader that lands on it must not hear "file upload, blank". */}
      <input
        ref={input}
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        aria-label={t("insp.importIcon")}
        tabIndex={-1}
        className="visually-hidden"
        onChange={async (e) => {
          const chosen = [...(e.target.files ?? [])];
          e.target.value = "";
          if (chosen.length === 0) return;

          const files = await Promise.all(
            chosen.map(async (f) => ({
              // The relative path when the files came from a folder: it says
              // whose icons these are, and the filename alone does not.
              name: f.webkitRelativePath || f.name,
              svg: await f.text(),
            })),
          );
          if (!accept(files)) toastError("toast.iconNotSvg", new Error(files[0].name));
        }}
      />
      {linksOpen && <ImportFromLinks onClose={() => setLinksOpen(false)} onImported={accept} />}
    </>
  );
}

/**
 * Paste links, get icons.
 *
 * What it will actually fetch differs between the builds, and the dialog says
 * which one you are in rather than letting you find out by failing: the
 * desktop shell downloads for the page and can take a vendor's zip, while the
 * browser is held to single SVGs from hosts that allow cross-origin reads.
 */
function ImportFromLinks({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (files: Array<{ name: string; svg: string }>, failed: number) => boolean;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const canTakeZips = Boolean(desktopBridge()?.fetchIcons);

  async function run() {
    const links = parseLinks(text);
    if (links.length === 0 || busy) return;

    setBusy(true);
    const { icons, failed } = await fetchIcons(links);
    setBusy(false);

    if (icons.length === 0 || !onImported(icons, failed.length)) {
      // Nothing came back, or nothing that survived sanitising. The dialog
      // stays open with the links still in it: the usual cause is a link to
      // a page rather than to a file, and that is a thing to correct rather
      // than to type again.
      toast("toast.iconsFetchFailed", "error");
      return;
    }
    onClose();
  }

  return (
    <Modal title={t("iconUrl.title")} onClose={onClose} className="narrow">
      <div className="modal-body stacked">
        <label className="field">
          {t("iconUrl.label")}
          <textarea
            className="link-list"
            rows={5}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`https://raw.githubusercontent.com/…/vnet.svg${
              canTakeZips ? "\nhttps://…/Azure_Public_Service_Icons.zip" : ""
            }`}
          />
        </label>
        <p className="field-hint">
          {canTakeZips
            ? t("iconUrl.hintDesktop")
            : t("iconUrl.hintWeb", { hosts: ICON_HOSTS.join(", ") })}
        </p>
        {/* The one worth spelling out: a name and a set is all it takes, and
            it reaches far more icons than the five collections bundled. */}
        <p className="field-hint">{t("iconUrl.hintIconify")}</p>
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>{t("common.cancel")}</button>
        <button className="primary" disabled={busy} onClick={() => void run()}>
          {busy ? t("iconUrl.fetching") : t("iconUrl.fetch")}
        </button>
      </div>
    </Modal>
  );
}
