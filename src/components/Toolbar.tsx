import { useRef, useState } from "react";
import { useGraphStore } from "../store";
import { useThemeStore, type ThemeChoice } from "../theme";
import { useLayoutStore } from "../layoutStore";
import { useFileStore } from "../files";
import { createDoc, documentMenuActions } from "../documents";
import { toast, toastError } from "../toast";
import { LOCALES, useI18n, useT, type Locale } from "../i18n";
import { ExportDialog } from "./ExportDialog";
import { AboutDialog } from "./AboutDialog";
import { TemplateDialog } from "./TemplateDialog";
import { MenuButton, MenuItem } from "./MenuButton";
import type { DiagramKind, Direction } from "../model/types";

/** Diagram kinds in menu order; labels come from the catalogue. */
const KINDS: DiagramKind[] = [
  "flowchart",
  "state",
  "er",
  "class",
  "sequence",
  "architecture",
  "c4",
];

export function Toolbar() {
  const direction = useGraphStore((s) => s.direction);
  const kind = useGraphStore((s) => s.kind);
  const unsupported = useGraphStore((s) => s.unsupported);
  const setDirection = useGraphStore((s) => s.setDirection);
  const runAutoLayout = useGraphStore((s) => s.runAutoLayout);
  const applyCode = useGraphStore((s) => s.applyCode);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const canUndo = useGraphStore((s) => s.canUndo);
  const canRedo = useGraphStore((s) => s.canRedo);
  const fileRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const paletteOpen = useLayoutStore((s) => s.paletteOpen);
  const sideOpen = useLayoutStore((s) => s.sideOpen);
  const togglePalette = useLayoutStore((s) => s.togglePalette);
  const toggleSide = useLayoutStore((s) => s.toggleSide);
  const openFile = useFileStore((s) => s.open);
  const saveFile = useFileStore((s) => s.save);
  const saveAsFile = useFileStore((s) => s.saveAs);
  const themeChoice = useThemeStore((s) => s.choice);
  const setTheme = useThemeStore((s) => s.setTheme);
  const t = useT();
  const docActions = documentMenuActions();
  const locale = useI18n((s) => s.locale);
  const setLocale = useI18n((s) => s.setLocale);

  /**
   * Prefer a real picker so Save writes back to the file the user opened.
   * `open()` throws "no-picker" on browsers without one, which is the signal
   * to fall back to the hidden <input type=file>.
   */
  const open = async () => {
    try {
      await openFile();
    } catch (err) {
      if (err instanceof Error && err.message === "no-picker") {
        fileRef.current?.click();
        return;
      }
      toastError("toast.openFailed", err);
    }
  };

  const runSave = (fn: () => Promise<void>) => () =>
    void fn()
      .then(() => toast("toast.saved"))
      .catch((err: unknown) => toastError("toast.saveFailed", err));

  const copy = async () => {
    await navigator.clipboard.writeText(useGraphStore.getState().code);
    setCopied(true);
    toast("toast.copied");
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <header className="toolbar">
      {/* Identity and document state — what you are looking at. */}
      <div className="tb-group tb-identity">
        <button
          className="brand-button"
          title={t("toolbar.aboutTitle")}
          aria-label={t("toolbar.about")}
          onClick={() => setShowAbout(true)}
        >
          <img src="./logo.svg" alt="" className="brand-logo" />
          <span className="brand">{t("app.name")}</span>
        </button>
        <span className="kind-badge" role="status">
          {unsupported ? t("unsupported.badge", { type: unsupported }) : t(`kind.${kind}`)}
        </span>
      </div>

      {/* Drawer toggles, deliberately not inside a `.tb-group`: the group
          would keep its separator once its only children were hidden at wide
          widths. CSS reveals these at the narrow breakpoint. */}
      <button
        type="button"
        className="drawer-toggle"
        aria-expanded={paletteOpen}
        onClick={togglePalette}
      >
        {t("toolbar.shapesDrawer")}
      </button>
      <button
        type="button"
        className="drawer-toggle"
        aria-expanded={sideOpen}
        onClick={toggleSide}
      >
        {t("toolbar.codeDrawer")}
      </button>

      <div className="toolbar-spacer" />

      {/* Editing the current diagram. */}
      <div className="tb-group">
        {/* Glyph-only, so they need an explicit name — `title` alone is not
            reliably announced. */}
        <button
          className="icon-button"
          onClick={() => void undo()}
          disabled={!canUndo}
          title={t("toolbar.undoHint")}
          aria-label={t("toolbar.undo")}
        >
          <span aria-hidden="true">↶</span>
        </button>
        <button
          className="icon-button"
          onClick={() => void redo()}
          disabled={!canRedo}
          title={t("toolbar.redoHint")}
          aria-label={t("toolbar.redo")}
        >
          <span aria-hidden="true">↷</span>
        </button>
        {!unsupported && kind !== "sequence" && kind !== "architecture" && kind !== "c4" && (
          <select
            className="tb-compact"
            value={direction === "TD" ? "TB" : direction}
            title={t("toolbar.direction")}
            aria-label={t("toolbar.direction")}
            onChange={(e) => setDirection(e.target.value as Direction)}
          >
            <option value="TB">{t("toolbar.dirTB")}</option>
            <option value="LR">{t("toolbar.dirLR")}</option>
            <option value="BT">{t("toolbar.dirBT")}</option>
            <option value="RL">{t("toolbar.dirRL")}</option>
          </select>
        )}
        {!unsupported && (
          <button onClick={() => void runAutoLayout()}>{t("toolbar.autoLayout")}</button>
        )}
      </div>

      {/* The document itself. */}
      <div className="tb-group">
        <select
          className="tb-compact"
          value=""
          aria-label={t("toolbar.newDiagram")}
          onChange={(e) => {
            if (e.target.value) void createDoc(e.target.value as DiagramKind);
            e.target.value = "";
          }}
        >
          <option value="" disabled>
            {t("toolbar.new")}
          </option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`kind.${k}`)}
            </option>
          ))}
        </select>
        <button onClick={() => setShowTemplates(true)}>{t("tpl.open")}</button>
        <button onClick={() => void open()}>{t("toolbar.open")}</button>
        <button onClick={runSave(saveFile)}>{t("toolbar.save")}</button>
        <button className="primary" onClick={() => setShowExport(true)}>
          {t("toolbar.export")}
        </button>
      </div>

      {/* Everything else. Keeping theme, language and Save as… out here is
          what lets the bar stay one row instead of wrapping to three. */}
      <MenuButton className="overflow-menu" label={t("toolbar.more")}>
        <>
          <MenuItem onSelect={runSave(saveAsFile)}>{t("toolbar.saveAs")}</MenuItem>
          <MenuItem onSelect={docActions.rename}>{t("doc.rename")}</MenuItem>
          <MenuItem onSelect={docActions.duplicate}>{t("doc.duplicate")}</MenuItem>
          <MenuItem onSelect={() => void copy()}>
            {copied ? t("toolbar.copied") : t("toolbar.copyCode")}
          </MenuItem>
          <div className="menu-separator" />
          <label className="menu-field">
            {t("toolbar.theme")}
            <select
              value={themeChoice}
              aria-label={t("toolbar.theme")}
              onChange={(e) => setTheme(e.target.value as ThemeChoice)}
            >
              <option value="dark">{t("toolbar.themeDark")}</option>
              <option value="light">{t("toolbar.themeLight")}</option>
              <option value="system">{t("toolbar.themeSystem")}</option>
            </select>
          </label>
          <label className="menu-field">
            {t("toolbar.language")}
            <select
              value={locale}
              aria-label={t("toolbar.language")}
              onChange={(e) => void setLocale(e.target.value as Locale)}
            >
              {(Object.keys(LOCALES) as Locale[]).map((c) => (
                <option key={c} value={c}>
                  {LOCALES[c].label}
                </option>
              ))}
            </select>
          </label>
          <div className="menu-separator" />
          <MenuItem onSelect={() => setShowAbout(true)}>{t("about.title")}</MenuItem>
        </>
      </MenuButton>

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
      {showTemplates && <TemplateDialog onClose={() => setShowTemplates(false)} />}
      <input
        ref={fileRef}
        type="file"
        accept=".mmd,.txt,.md"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await applyCode(await file.text(), { record: true });
          e.target.value = "";
        }}
      />
    </header>
  );
}
