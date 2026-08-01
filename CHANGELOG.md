# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning policy

Archyne is pre-1.0, so the public surface can still change between minor
versions. Once 1.0 ships, the following count as the public API for semver
purposes:

- the **`.mmd` file format contract** — in particular the `%% graph:positions`
  comment, which must always leave the file valid Mermaid
- the **embed `postMessage` protocol** (`src/embed.ts`)
- the **MCP tool names and their schemas** (`mcp/server.ts`)

Breaking any of those requires a major version. The React component structure,
CSS class names and internal store shape are _not_ public API.

## [Unreleased]

### Added

- **`npx archyne`** — the build ships as an npm package with a dependency-free
  CLI that serves it locally (`bin/archyne.mjs`). Trying the editor no longer
  requires a clone, an install and a build. `npx archyne diagram.mmd` opens a
  file directly.
- **A hosted demo**, published from `main` by
  `.github/workflows/pages.yml`. It is the same static build; nothing is
  uploaded.
- **Security architecture whitepaper** (`docs/security-whitepaper.md`) —
  data flows, threat model, how the sanitizer and CSP layers are verified,
  supply-chain posture, and a stated list of gaps.
- **Accessibility Conformance Report** (`docs/accessibility-conformance-report.md`)
  covering WCAG 2.2 A and AA criterion by criterion, with the evidence for
  each and an explicit account of what has not been tested. It is a
  self-assessment, not a signed VPAT, and says so.
- **Browser end-to-end suites now run in CI** — export, non-Latin export,
  right-to-left, accessibility and the security suite, against the built app.
  They previously only ran when someone remembered to run them by hand.
- **Dependency advisory gate** (`npm run audit`): fails on high or critical
  advisories in production dependencies, with exceptions in
  `audit-allow.json` that require a written reason and an expiry date.
- **Release workflow** publishing to npm with `--provenance` from a tagged
  commit, plus macOS and Linux desktop targets alongside Windows.
- `docs/repo-setup.md` — the settings that live in GitHub rather than in the
  repository, and the certificates still needed to sign desktop builds.
- README screenshots, generated from the real app by
  `node scripts/screenshots.mjs` so they cannot silently go stale.
- ESLint (flat config) with `typescript-eslint`, `react-hooks` and `jsx-a11y`,
  plus Prettier and an `.editorconfig`
- Type checking for `mcp/`, `tests/` and `desktop/`, which were previously
  excluded from `tsconfig.json` and had never been checked
- GitHub Actions CI: format check, lint, typecheck, unit tests, build, MCP
  smoke test, and a Windows build job
- An initial-load bundle budget (`npm run size`) enforced in CI
- `SECURITY.md` with a disclosure policy and a documented threat model,
  `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue and PR templates, and
  Dependabot
- `docs/PLAN.md` — the phased plan for taking Archyne to an enterprise-ready
  state

- **Keyboard operation of the canvas.** Palette items are now buttons, so a
  node can be placed without dragging; `C` then `Enter` connects two nodes
  from the keyboard, with `Escape` to cancel. Both were pointer-only before,
  which made the editor unusable without a mouse.
- Accessible dialogs: focus trap, `role="dialog"`, Escape, and focus restored
  to whatever opened them. The context menu gained menu semantics and
  arrow-key navigation.
- A live region that announces parse errors and warnings wherever focus is —
  they were previously only visible inside the code panel
- `prefers-reduced-motion` support, visible focus indicators, and landmark
  roles for the canvas, palette and side panel
- Automated `axe` accessibility tests, plus component tests for the focus trap
  and the keyboard connect flow
- **Internationalisation.** The UI ships in English, Spanish, German and
  Arabic, with a language picker in the toolbar. Catalogues are typed against
  the English source (a missing key is a compile error) and lazily loaded, so
  the initial bundle grows by ~3 KB regardless of how many locales exist.
  See `docs/i18n.md`.
- **Right-to-left support.** `<html dir>` follows the locale and the chrome
  mirrors. The Mermaid source panel and the canvas stay left-to-right on
  purpose — one is code, the other belongs to the diagram's author.
- **Responsive layout.** The stylesheet previously had no media queries at
  all, and the fixed three-panel layout left the canvas unusable below
  ~1100px. The toolbar now wraps, panels tighten at 1100px, and below 900px
  the palette and side panel become overlay drawers. Larger hit targets on
  coarse pointers. The desktop window minimum drops from 900×600 to 680×520.

- **Diagram families without a visual editor now open read-only** instead of
  failing. A `gantt`, `pie` or `mindmap` file previously could not be opened
  at all; it now renders with Mermaid's own renderer, with the Mermaid code
  fully editable and the file left byte-identical on save.
- **Real file open and save.** `Save .mmd` writes back to the file you opened
  rather than dropping a new copy in Downloads, via the File System Access API
  in the browser and native dialogs on the desktop. Added `Save as…`, an
  open-file name in the toolbar, an unsaved-changes marker, and a guard when
  leaving the page with unsaved work.

- **Toasts** for transient feedback. Confirmations and failures previously
  surfaced only inside the code panel, which is hidden on the Preview tab and
  while working on the canvas, so a failed save was silent.
- **More keyboard shortcuts** — `Ctrl+S` / `Ctrl+Shift+S` to save, `Ctrl+O` to
  open, `Ctrl+D` to duplicate, arrow keys to nudge the selection (Shift for a
  grid step) — and a cheat sheet on `?`.
- **A Content Security Policy**, verified in a browser against both export
  pipelines and the mermaid preview.
- **SBOM generation** (`npm run sbom`, CycloneDX) and an automated check that
  `THIRD-PARTY-NOTICES.md` has not drifted from the dependency tree, wired
  into CI.

- **An Outline tab**: every node with its outgoing connections, filterable,
  and selecting a row selects the node on the canvas. Gives screen readers the
  diagram structure a canvas can only convey spatially, and makes large
  diagrams navigable.

- **A command palette** on `Ctrl+K`: commands and diagram nodes in one
  filterable list, so jumping to a node in a large diagram is a keystroke.
- **A template gallery** — seven complete starting diagrams, one per family,
  instead of the two-node stubs a new diagram used to produce. Each is parsed
  and round-tripped in CI.

- **Italian, Simplified Chinese and Japanese** interface translations.
- **A redesigned toolbar.** It was a single flat row of a dozen controls that
  wrapped onto two or three lines on a normal laptop; controls are now grouped,
  and the less-used ones sit behind a "⋯" panel. One row, 51px, down to 1180px.
- **A new wordmark**, with light and dark variants generated from one source.

- **The project is now called Archyne.** It was Merflow, whose first syllable
  echoed the Mermaid mark it was never affiliated with. "Arch-" instead reads
  as both _architecture_ — two of the supported diagram families — and _arc_,
  the graph edge.

  Two things deliberately kept their old names, because renaming them would
  break data rather than branding: the `%% graph:positions` comment, which is
  the file-format contract declared as public API above, and the
  `graph:code` / `graph:locale` storage keys, which hold an existing user's
  autosaved diagram and language choice.

### Changed

- **Auto-layout runs in a web worker.** ELK is a GWT-compiled solver: a large
  graph pinned a core on the main thread and froze the canvas. It now runs off
  the main thread, with a main-thread fallback for environments that have no
  worker. Both paths produce identical positions.
- `@modelcontextprotocol/sdk` upgraded to 1.30.0 and `fast-uri` bumped,
  clearing the outstanding advisories. Neither was reachable from Archyne —
  the MCP server is stdio-only, so `serve-static` never loads, and `fast-uri`
  is used by `ajv` for schema `$ref`s rather than for trust decisions.
- **The desktop shell no longer passes file content through the URL.** Opening
  a `.mmd` file went through `?code=…`, which broke on large diagrams and lost
  the file's path, so saving could never write back to it. Replaced with an
  IPC bridge over a `contextIsolation`-safe preload script. A second instance
  now hands its file to the running window instead of opening another one.
- `undo()` and `redo()` return promises, so callers can wait for the restored
  code to be re-parsed instead of guessing.
- **The embed bridge is now default-deny.** Previously an embedded Archyne
  would answer any parent window and post diagram content back to any origin.
  Hosts must now pass `&origin=https://your.app`; `origin=*` re-enables the
  old behaviour and is intended for local development only.
- Icon search no longer loads every bundled Iconify collection. A search used
  to pull roughly 6 MB gzipped before returning results.

### Fixed

- **The security regression test was vacuous.** It asserted that hostile
  diagram _labels_ stay inert, which Mermaid guarantees at every security
  level — so it passed identically with `securityLevel` set to `"loose"` and
  proved nothing. The real difference the setting makes is `utils.formatUrl`,
  which sanitizes `click … href` targets only outside `"loose"`; under
  `"loose"` a `javascript:` URL in a shared `?code=` link reaches the rendered
  anchor and executes. The suite now asserts on that, with a benign link as a
  positive control, and flipping the setting makes it fail.
- **Menu actions did nothing.** "About Archyne", "Copy code" and "Save as…"
  in the toolbar's overflow panel closed it without running. Closing was done
  by a native `click` listener on the panel while each item carried its own
  React `onClick`; the two raced and the item's handler lost. Items now go
  through a `MenuItem` component that owns both steps.
- The Mermaid link in the About dialog pointed at the project's website; it
  now points at its source repository.
- The interface no longer picks its language from `navigator.languages`. It
  starts in English and remembers an explicit choice — browser sniffing meant
  adding a catalogue silently changed the language for existing users.

- **Right-to-left made the language choice irreversible.** The overflow panel
  was anchored to the physical right edge, but in RTL its trigger sits at the
  far left of the toolbar, so the panel opened off-screen — and the language
  selector is inside it. Switching to Arabic meant you could not switch back.
  Now anchored with `inset-inline-end`, and guarded by `npm run test:e2e:rtl`.

- **Three contrast and labelling defects found by a browser-based WCAG audit**:
  the Mermaid editor was an unlabelled `role="textbox"`; the dark syntax theme
  rendered some tokens at 4.38:1 against its own background; and white text on
  the accent colour was 3.23:1. All now clear 4.5:1.
- `CodeEditor` mutated a ref during render, which is unsafe under concurrent
  rendering
- `ExportDialog` and the architecture palette called `setState` synchronously
  inside an effect, causing cascading renders on every option change
- Four implicit-`any` type errors in `desktop/main.cjs` and a missing type
  dependency for the MCP server, both surfaced by the widened typecheck

## [0.1.0]

Initial release: visual Mermaid editor with two-way sync across seven diagram
families (flowchart, state, ER, class, sequence, architecture, C4), ELK
auto-layout, PNG/SVG export, an embed API, a desktop shell, and an MCP server
for LLM agents.
