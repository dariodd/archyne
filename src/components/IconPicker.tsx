import { useEffect, useState } from "react";
import { useGraphStore } from "../store";
import { useIconPrefs } from "../iconPrefs";
import { iconifyUrl, searchIcons } from "../icons";
import { COMMON_ICONS } from "../iconSuggestions";
import { CUSTOM } from "../model/iconLibrary";
import { plainName, VENDORS, VENDOR_LABELS } from "../model/iconRole";
import { useIconPack } from "../iconPack";
import { useT } from "../i18n";
import { IconView } from "./ArchView";
import { ImportIcon } from "./ImportIcon";
import { Modal } from "./Modal";

/**
 * Choosing an icon for something that already exists.
 *
 * The palette could always *add* a node with an icon, and an icon imported
 * from a vendor's pack could always be searched for there — but putting one
 * on a node already on the canvas meant typing its reference into a text
 * field by hand. With seven hundred icons imported, that asked somebody to
 * remember `custom:virtual-networks` exactly, and an icon you cannot select
 * is an icon you do not have.
 *
 * The field stays: typing a reference is still the quickest route for
 * somebody who knows it, and it is what a diagram written by hand contains.
 * This is the way in for everybody else.
 */
export function IconPicker({
  current,
  onPick,
  onClose,
  asImage = false,
}: {
  current?: string;
  /** Called with a reference, or with "" to take the icon off. */
  onPick: (icon: string) => void;
  onClose: () => void;
  /**
   * Answer with a public URL rather than a name, for mermaid's image shape.
   *
   * Narrows what is on offer to the icons that *have* one: the collections
   * Iconify publishes. A diagram's imported icons and the bundled Azure set
   * have no address anyone else can fetch, and offering them here would be
   * offering a portability that isn't there.
   */
  asImage?: boolean;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const favorites = useIconPrefs((s) => s.favorites);
  const recents = useIconPrefs((s) => s.recents);
  const library = useGraphStore((s) => s.iconLibrary);
  const vendors = useIconPack((s) => s.vendors);

  // Imported icons, filed by whoever published them: somebody who has just
  // imported a pack is here to use what they imported, and Azure's six
  // hundred next to Amazon's four hundred is not a list anybody can read.
  const imported = Object.keys(library)
    .sort()
    .map((n) => `${CUSTOM}:${n}`);
  const byVendor = VENDORS.map((vendor) => ({
    vendor,
    icons: imported.filter((ref) => (vendors[plainName(ref)] ?? "other") === vendor),
  })).filter((section) => section.icons.length > 0);
  const pinned = [...favorites, ...recents.filter((r) => !favorites.includes(r))];

  useEffect(() => {
    let alive = true;
    const q = query.trim();
    // Debounced, and cleared on the same path: the bundled collections are
    // loaded and scanned per keystroke, and emptying the box should drop the
    // last results rather than leave them under the next query.
    const timer = setTimeout(() => {
      if (!q) {
        setResults([]);
        return;
      }
      void searchIcons(q, 120).then((r) => {
        if (alive) setResults(r);
      });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  function choose(icon: string) {
    if (icon) useIconPrefs.getState().recordRecent(icon);
    onPick(icon && asImage ? (iconifyUrl(icon) ?? "") : icon);
    onClose();
  }

  /** In image mode, only what has a public URL is worth showing. */
  const offer = (names: string[]) => (asImage ? names.filter((n) => iconifyUrl(n)) : names);

  const searching = query.trim().length > 0;
  const sections: Array<{ title: string; icons: string[] }> = searching
    ? [{ title: t("iconPicker.results"), icons: offer(results) }]
    : [
        ...(asImage
          ? []
          : byVendor.map(({ vendor, icons }) => ({
              title: VENDOR_LABELS[vendor] || t("iconPicker.otherVendor"),
              icons,
            }))),
        { title: t("palette.sectionPinned"), icons: offer(pinned) },
        { title: t("iconPicker.common"), icons: offer(COMMON_ICONS) },
      ];

  return (
    <Modal title={t("iconPicker.title")} onClose={onClose}>
      <div className="modal-body stacked">
        <input
          className="icon-search"
          placeholder={t("palette.searchIcons")}
          aria-label={t("palette.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="icon-picker-scroll">
          {sections
            .filter((s) => s.icons.length > 0)
            .map((section) => (
              <div key={section.title}>
                <div className="panel-title">{section.title}</div>
                <div className="icon-grid">
                  {section.icons.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className={`icon-add${name === current ? " current" : ""}`}
                      title={name}
                      aria-label={name}
                      aria-current={name === current}
                      onClick={() => choose(name)}
                    >
                      <IconView name={name} size={26} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          {searching && results.length === 0 && (
            <p className="field-hint">{t("iconPicker.nothing")}</p>
          )}
        </div>
      </div>
      <div className="modal-actions">
        {/* Importing from here too: running out of icons is exactly the
            moment somebody wants more of them. An imported icon has no
            public address, though, so in image mode there is nothing to
            import *to*. */}
        {!asImage && <ImportIcon />}
        <span className="spacer" />
        <button onClick={() => choose("")}>{t("iconPicker.none")}</button>
        <button onClick={onClose}>{t("common.cancel")}</button>
      </div>
    </Modal>
  );
}

/** The icon field's companion: shows what is set, opens the picker. */
export function IconField({
  value,
  onChange,
  asImage = false,
}: {
  value: string | undefined;
  onChange: (icon: string) => void;
  asImage?: boolean;
}) {
  const t = useT();
  const [picking, setPicking] = useState(false);

  return (
    <>
      <button type="button" className="icon-choose" onClick={() => setPicking(true)}>
        <span className="icon-choose-preview" aria-hidden="true">
          {value ? <IconView name={value} size={20} /> : null}
        </span>
        {t("iconPicker.choose")}
      </button>
      {picking && (
        <IconPicker
          current={value}
          asImage={asImage}
          onPick={onChange}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
