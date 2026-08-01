# Archyne — road to an enterprise-ready product

This is the working plan derived from a full audit of the codebase. It is a
living document: check items off as they land, and keep the rationale so future
contributors understand _why_ something is on the list.

The core editor is strong — the architectural bet (Mermaid text as the source of
truth, layout stored in a comment the rest of the world ignores) is sound, and
`src/model/` is clean and well tested. Almost everything below is about the
surrounding project: the things an organisation evaluates before it lets a tool
in the door, plus the multi-user layer that defines the category.

Phases are ordered by leverage, not by difficulty. Phase 1 is days of work and
changes how the project reads to an evaluator. Phase 2 unblocks buyers who
currently _cannot_ adopt Archyne for legal or contractual reasons. Phase 3 is
the multi-month work that decides whether Archyne is a good local tool or a
category competitor.

---

## Phase 1 — Credibility ✅ (except 1.6)

Cheap, high-leverage, mostly mechanical. Nothing here changes the product; all
of it changes how trustworthy the project looks and how safely it can evolve.

### 1.1 Toolchain ✅

- [x] ESLint (flat config) with `typescript-eslint`, `react-hooks`, `jsx-a11y`
- [x] Prettier + `.editorconfig`, and `format` / `format:check` scripts
- [x] `lint` and `lint:fix` scripts wired into CI

  _Why:_ there was no linter or formatter of any kind. `jsx-a11y` also starts
  paying down Phase 2 accessibility debt automatically.

  _Outcome:_ 13 errors on first run. Two were genuine React defects — a ref
  mutated during render in `CodeEditor`, and synchronous `setState` inside
  effects in `ExportDialog` and the architecture palette — and are fixed. The
  remaining 11 are accessibility warnings, tracked in 2.1.

### 1.2 Type checking that covers the whole repo ✅

- [x] Add `tsconfig.node.json` covering `mcp/`, `tests/` and `desktop/`;
      `typecheck` now runs both projects
- [x] Fix errors surfaced in previously unchecked code

  _Why:_ `tsconfig.json` only included `src`, so `mcp/`, `desktop/` and
  `tests/` had never been type-checked. `npm run typecheck` passing was partly
  false confidence.

  _Outcome:_ four implicit-`any` errors in `desktop/main.cjs` (now typed with
  JSDoc) and a missing `@types/jsdom` for the MCP server. `desktop/` is checked
  via `checkJs` since it is CommonJS JavaScript.

### 1.3 Continuous integration ✅

- [x] GitHub Actions: format check, lint, typecheck, unit tests, build, MCP
      smoke test
- [x] Initial-bundle size budget enforced as a CI step
- [x] Run on push to `main` and on every pull request
- [x] A second job builds on Windows, where most desktop users are

  _Why:_ no CI existed at all. Nothing prevented a broken build from being
  committed.

### 1.4 Governance and project health ✅

- [x] `SECURITY.md` — disclosure policy, supported versions, and a threat
      model covering the four real attack surfaces (untrusted diagram source,
      embed bridge, MCP server, desktop shell)
- [x] `CONTRIBUTING.md` — dev setup, architecture tour, PR expectations
- [x] `CODE_OF_CONDUCT.md`
- [x] `CHANGELOG.md` (Keep a Changelog format) + a documented semver policy
      naming the file format, embed protocol and MCP schemas as public API
- [x] Issue and pull request templates
- [x] Dependabot for npm and GitHub Actions

  _Why:_ enterprises assess project health explicitly — bus factor, release
  cadence, disclosure process. One commit and no policy files reads as a
  personal project regardless of code quality.

  _Remaining:_ both `SECURITY.md` and `CODE_OF_CONDUCT.md` carry a
  `TODO(maintainer)` for a contact address, which needs a public repo home.

### 1.5 Two concrete defects found in the audit ✅

- [x] **Embed bridge origin default.** `src/embed.ts` defaulted
      `allowedOrigin` to `"*"`, so an embedded Archyne answered any window and
      posted diagram content to any origin. Now default-deny with an explicit,
      comma-separated allowlist; `origin=*` is an opt-in development escape
      hatch that logs a warning. Covered by 8 tests.
- [x] **Icon search fan-out.** `searchIcons` iterated every bundled Iconify
      collection, so one query pulled ~6 MB gzipped. Names are now generated
      into `src/icon-names.generated.json` (~63 KB gzipped, lazily loaded) by
      `npm run icons:index`, and a collection is fetched only when an icon it
      owns is rendered. Covered by 10 tests.

### 1.6 First impressions ✅ (pending a public repo)

- [x] Hosted demo — `.github/workflows/pages.yml` publishes `dist/` from
      `main` to GitHub Pages. `base: "./"` means no path configuration.
- [x] Screenshots in the README, generated from the real app by
      `node scripts/screenshots.mjs`. Hand-taken screenshots go stale the
      moment the toolbar moves and nobody notices; scripted ones are one
      command to refresh.
- [x] npm package — `private: true` dropped, `files`/`bin`/`repository`
      metadata added, and `bin/archyne.mjs` serves the build so `npx archyne`
      works with no clone and no build. Zero dependencies: a tool whose pitch
      is "nothing leaves your machine" should not pull a server framework to
      show you a local page.
- [ ] A short GIF — still worth having; a still cannot show two-way sync.

  _Blocked on the maintainer, not on code:_ every item above needs the
  repository to exist publicly. `docs/repo-setup.md` lists the settings to
  flip, including replacing the `dariodd` placeholder in the URLs.

---

## Phase 2 — Unblocking buyers

Everything here is a hard gate for some class of customer. Accessibility and
i18n in particular are not polish; they are the difference between "can
evaluate" and "cannot legally purchase".

### 2.1 Accessibility — mostly done

Before this work the entire UI contained four `alt` attributes and two
`onKeyDown` handlers, with zero `aria-*`, zero `role`, and no focus management
anywhere.

- [x] Dialogs: a shared `Modal` primitive (`src/components/Modal.tsx`) with
      `role="dialog"`, `aria-modal`, a focus trap, Escape, and focus restored
      to the invoking control. `ExportDialog` and `AboutDialog` use it;
      `ContextMenu` gained `role="menu"`, arrow/Home/End navigation, focus on
      open and focus restore on close.
- [x] Accessible names on the toolbar and palette controls — the undo/redo
      glyphs (↶/↷) had no name at all, and `title` is not reliably announced
- [x] Landmarks: `main` for the canvas, labelled `aside` for the palette and
      the side panel, a real tablist for the Mermaid/Preview tabs
- [x] **Keyboard-operable canvas.** The palette was drag-and-drop only, so a
      keyboard user could not place a single node; items are now buttons that
      drop a node in the centre of the view (`src/placement.ts`). Edges were
      pointer-only too — `useKeyboardConnect` adds Tab → `C` → Tab → Enter,
      with Escape to cancel and a visible outline on the pending source.
- [x] Live region announcements for parse errors and warnings
      (`StatusAnnouncer`), always mounted so they reach users on the canvas or
      the Preview tab — previously the error was only rendered inside the code
      panel, which is hidden in both cases
- [x] `prefers-reduced-motion` support
- [x] Automated `axe` checks, with a negative control so they cannot pass
      vacuously; the `jsx-a11y` rules are now **errors**, not warnings
- [x] A parallel accessible view of the graph — the **Outline** tab lists
      every node with its outgoing connections, filters by name, and selects
      on the canvas when activated. A canvas conveys structure spatially,
      which is exactly what a screen reader cannot recover; this states it in
      text. It doubles as diagram navigation, which stops working by eye well
      before 200 nodes.
- [x] Contrast audit, in a real browser (`npm run test:e2e:a11y`). jsdom has
      no layout engine, so the `color-contrast` rule is disabled in the Vitest
      suite and would pass vacuously there. Eight combinations — light and
      dark × editor, outline, export dialog, about dialog — now report **no
      WCAG 2.2 AA violations**.
      Three real defects it found are described below.
- [x] **Accessibility Conformance Report drafted** —
      `docs/accessibility-conformance-report.md`, VPAT 2.5 format, every
      WCAG 2.2 A and AA criterion with the evidence behind its rating and an
      explicit "not evaluated" wherever there is none.
- [ ] **Sign it.** The report is deliberately unsigned, and says why: no
      screen-reader testing has been done (NVDA, JAWS, VoiceOver), no testing
      with users with disabilities, and no recorded manual keyboard
      walkthrough. Writing the document surfaced four concrete defects that
      must be fixed first:
  - [ ] **2.5.7** — group resizing is drag-only, with no keyboard equivalent
        (`NodeResizer` in `src/components/ShapeNode.tsx`)
  - [ ] **2.1.4** — the single-character shortcuts (`C`, `?`) cannot be
        remapped or disabled
  - [ ] **2.2.2** — toasts auto-dismiss with no way to pause them
  - [ ] **1.1.1** — the Outline tab is the canvas's text alternative, but
        whether it is _sufficient_ is unvalidated

  _Why:_ the European Accessibility Act came into force in June 2025, and
  Section 508 / EN 301 549 already gate public-sector purchasing. Without a
  signed VPAT, most large enterprises and every public-sector buyer are
  contractually unable to adopt Archyne.

  _Note:_ axe catches roughly a third of WCAG issues, which is exactly why the
  report separates "Supports, on automated evidence" from "Not evaluated"
  rather than collapsing both into a green tick.

**What the contrast audit found.** Three real defects, all fixed. The
CodeMirror editor was an unlabelled `role="textbox"`. oneDark's background was
winning on precedence over ours, dropping its own syntax tokens to 4.38:1 —
against the app background the same token measures 5.76:1, so raising our
theme's precedence fixed every token at once rather than patching the palette.
And white on `--accent` was 3.23:1, so primary buttons now use a computed
`--accent-strong`.

### 2.2 Internationalisation

- [x] i18n framework and extraction of all hardcoded English strings. Typed,
      dependency-free, lazily loaded: only English is in the initial bundle
      (+3 KB), and other catalogues are separate chunks. Catalogues are typed
      against `en`, so a missing key is a compile error. Ships English,
      Spanish, Italian, German, Arabic, Simplified Chinese and Japanese;
      `docs/i18n.md` covers adding more.
- [x] RTL layout support. `<html dir>` is set from the locale and the chrome
      mirrors — palette, side panel, drawer slide direction. The Mermaid source
      panel and the canvas deliberately stay LTR: one is code, and the other
      belongs to the diagram's author rather than the reader's locale.
      Verified in a browser against Arabic.
- [x] Font handling in PNG/SVG export — see the note below
- [x] Initial locale set — English, Spanish, Italian, German, Arabic,
      Simplified Chinese, Japanese
- [ ] Community review of the shipped translations. They were written by the
      author of the i18n work, not by native speakers; the test suite proves
      they are structurally complete, not that they read well.
- [ ] Translate the repository documentation (README, CONTRIBUTING)

**Font embedding in export: the original audit finding was wrong.**

The reasoning behind it — an SVG loaded through a data URL is a separate
document with no access to the page's stylesheets — is correct as far as it
goes, but _system-installed_ fonts are still resolved in that context.
`tests/e2e-i18n-export.mts` drives the real app and measures rendered ink for
Japanese, Korean, Arabic and Cyrillic labels through both export pipelines.
All of them render, with correct Arabic shaping. No fix was needed, and the
test now guards it.

Two residual risks are worth knowing about, neither of them current bugs. If
Archyne ever adopts a **web font**, the mermaid pipeline would drop it —
`svgToPng` does no font embedding, unlike `html-to-image`, which inlines
`@font-face` for the canvas pipeline. And a host with no font covering a
script (a minimal Linux container without CJK fonts) will export tofu; that is
an environment property, not something Archyne can fix without shipping fonts.

### 2.3 Responsive and mobile ✅

- [x] Responsive layout — `src/styles.css` had **zero** media queries, and the
      fixed three-panel layout (170px palette + canvas + 380px side panel) left
      the canvas with nothing below ~1100px. Now: the toolbar wraps instead of
      overflowing; panels tighten at 1100px; below 900px the palette and side
      panel become overlay drawers with toggles in the toolbar, a backdrop, and
      the canvas at full width. Verified in a real browser at 1500 / 1050 / 820
      / 560px with no horizontal overflow at any size.
- [x] Touch/tablet interaction pass — larger hit targets under
      `@media (pointer: coarse)`
- [x] Revisit the desktop shell's hardcoded `minWidth` — lowered from 900×600
      to 680×520 now that the layout collapses gracefully

### 2.4 Robustness and file handling

- [x] **Read-only fallback for unsupported Mermaid types.** `parseDiagram`
      hard-threw for anything outside the seven supported families, so a valid
      `gantt` or `pie` file could not be opened at all. It now throws a typed
      `UnsupportedDiagramError`, and the app renders those diagrams read-only
      with Mermaid's own renderer. The palette, direction control and
      auto-layout hide themselves, and the kind badge names the real type.
      `regenerate()` is guarded on this state — see the note below.

- [x] File System Access API: open a real file and save back to it. Three
      backends in `src/files.ts`, picked by capability: the desktop IPC
      bridge, the browser picker API, and download + `<input type=file>` as a
      last resort.
- [x] **Fix the desktop file handoff.** `desktop/main.cjs` passed file content
      through a URL query string (`?code=…`), which broke on large diagrams
      and threw away the path, so open-then-save could never round-trip.
      Replaced with an IPC bridge over a `contextIsolation`-safe preload
      (`desktop/preload.cjs`), which also gains native open/save dialogs and
      lets a second instance hand a file to the running window instead of
      opening another one.
- [x] Unsaved-changes guard and a dirty indicator in the toolbar. The guard
      only fires once a file has actually been opened or saved — a scratch
      diagram is autosaved to `localStorage`, so warning about it is noise.
- [ ] Autosave interval/status beyond the dirty marker

**Why `regenerate()` is guarded when read-only.** A read-only diagram has no
parsed graph behind it. Without the guard, touching any field in the inspector
would serialize from the empty node list and silently replace the user's gantt
with a blank diagram of whatever kind was loaded before it. Guarding the one
choke point covers every edit path at once, and `src/store.test.ts` pins it.

### 2.5 Test coverage where it matters

- [x] Tests for `src/store.ts` — history, clipboard round-trip, the
      `%% graph:positions` contract, and the read-only guards
- [x] Tests for `src/files.ts` — dirty tracking and the desktop bridge,
      including that Save writes back to the opened file rather than
      producing a new copy
- [x] Component tests for the `Modal` focus trap and the keyboard connect flow
- [x] Store coverage for grouping, selection, delete and nudging
- [x] **The browser-driven suites run in CI.** Export, non-Latin export, RTL,
      accessibility and the sanitizer/CSP suite previously only ran when
      someone remembered to run them by hand, against a dev server, in Edge.
      They now take `ARCHYNE_URL` and `PLAYWRIGHT_CHANNEL` (`tests/env.mts`)
      and run on every pull request. The a11y suite's fixed timeouts became
      waits on the elements themselves, because contrast and target size are
      measured from real layout and auditing mid-transition produces noise.
- [ ] Component tests for the inspector
- [ ] Coverage reporting in CI
- [ ] A performance benchmark. Auto-layout moved off the main thread, but
      nothing asserts how long a 500-node graph takes — so the next
      regression will not be noticed.

### 2.6 UX gaps

- [x] Toast / notification system. Confirmations and failures landed only
      inside `CodePanel`, which is hidden on the Preview tab and while working
      on the canvas — a failed save produced no visible feedback at all.
      Toasts are a live region, errors carry `role="alert"` and stay up more
      than twice as long.
- [x] Template gallery — seven complete starting diagrams, one per family.
      `NEW_DIAGRAM` only ever produced two-node stubs, which prove nothing to
      someone who does not already know the syntax. Every template is parsed
      and round-tripped in CI, because a typo in hand-written Mermaid would
      otherwise only surface when a user clicked it.
- [ ] First-run guidance beyond the gallery (a guided tour)
- [x] Command palette (Ctrl+K) — commands and diagram nodes in one list,
      since "what can I do" and "where is that node" are the same question in
      a large diagram. Uses the `aria-activedescendant` listbox pattern, so
      focus stays in the input while Arrow/Enter drive the active row.
- [x] Find within a diagram — via the command palette and the Outline filter
- [x] Expanded shortcuts: `Ctrl+S` / `Ctrl+Shift+S` save, `Ctrl+O` open,
      `Ctrl+D` duplicate, arrow-key nudge (Shift for a grid step), and a
      cheat sheet on `?`. Nudging goes through `repatchPositions`, so it
      rewrites only the positions comment — exactly as a drag does.
- [x] Toolbar redesign. It was one flat row of a dozen controls that wrapped
      onto two or three lines on an ordinary laptop (88–117px tall). Controls
      are now grouped with hairline separators, one action is emphasised, and
      the less-used ones (Save as…, Copy code, theme, language, About) live
      behind a "⋯" disclosure. **51px, a single row, down to 1180px.**
- [ ] Alignment guides, distribute, edge waypoints, non-group node resize
- [ ] Preferences beyond theme: grid size, snap, autosave interval, default kind

### 2.7 Security posture

- [x] Content Security Policy, verified against the built app in a browser:
      both export pipelines and the mermaid preview run with zero violations.
      `connect-src 'self'` states a real invariant — Archyne makes no network
      requests of its own.
- [x] **Security whitepaper** (`docs/security-whitepaper.md`) — data flows,
      threat model, the two rendering-security layers and how each is
      verified, supply-chain posture, and a stated list of gaps. A security
      document that claims no gaps is not credible.
- [x] **Dependency advisory gate** (`npm run audit`) — production dependencies
      only, high and critical block, exceptions in `audit-allow.json` need a
      reason and an expiry date. Gating on the dev tree would only teach
      people to ignore the gate.
- [x] **npm provenance** — `.github/workflows/release.yml` publishes from a
      `v*` tag with `--provenance`, linking the tarball to the workflow and
      the source commit through a transparency log.
- [ ] Signed desktop releases — see 2.8; this is the one item that costs
      money rather than time.
- [ ] Independent penetration test
- [x] SBOM generation (`npm run sbom`, CycloneDX 1.5, 269 production
      packages) read from `package-lock.json` rather than a subprocess, so it
      is deterministic and offline.
- [x] Automated drift check for `THIRD-PARTY-NOTICES.md`, wired into CI. It
      fails the build when a direct dependency or a licence type in the tree
      is unmentioned, so the file can no longer quietly go stale.

### 2.8 Desktop distribution

- [x] macOS and Linux build targets in `electron-builder.yml`, built by the
      release workflow on a tag (dmg/zip, AppImage/deb)
- [ ] **Code signing.** Windows needs an OV or EV certificate; macOS needs an
      Apple Developer membership plus notarisation, without which Gatekeeper
      refuses to open the app at all — a refusal, not a warning. Until then
      the desktop artifacts are marked "testing only" in the workflow and the
      README says so rather than letting a reviewer find out. The exact
      secrets are listed in `docs/repo-setup.md`.
- [ ] Auto-update via `electron-updater`

---

## Phase 3 — Category competitor

Multi-month work. The strategic question is whether Archyne stays a local-first
single-player tool or grows an optional collaboration layer. The recommendation
is the Excalidraw shape: **local-first by default, with an optional
self-hostable sync server**. That preserves the privacy story — which is a
genuine differentiator — while removing the adoption ceiling.

### 3.1 Collaboration

- [ ] Optional self-hostable sync server
- [ ] Real-time multiplayer with presence (a CRDT such as Yjs fits unusually
      well here, since the document is already text)
- [ ] Comments, @mentions, review/approval workflow
- [ ] Share links, permissions and roles
- [ ] SSO/SAML and SCIM provisioning
- [ ] Version history beyond the in-memory undo stack (capped at 100 snapshots
      in `src/store.ts`) — named versions, visual diff, restore
- [ ] Audit logs and an admin console

### 3.2 Workspace and integrations

- [ ] Multi-diagram workspace — today localStorage holds a single `graph:code`
      key, so working on five diagrams means five browser tabs
- [ ] Git integration: open a repo, edit `.mmd` in place, diff, commit. For a
      text-native diagram format this is the standout opportunity.
- [ ] VS Code extension — likely the highest-leverage distribution channel
      available to a Mermaid tool
- [ ] Confluence, Notion, Jira, Slack, GitHub PR previews

### 3.3 Migration paths

- [ ] Import from draw.io (`.drawio` XML), PlantUML, Graphviz DOT, Visio,
      Lucidchart

  _Why:_ enterprises arrive with an existing diagram estate. No migration path
  means no migration.

### 3.4 Diagram coverage

- [ ] Visual editing for the remaining Mermaid families: Gantt, timeline,
      mindmap, user journey, gitGraph, requirement, quadrant, block, sankey,
      kanban, pie

### 3.5 Export and performance

- [ ] PDF export, copy-image-to-clipboard, print stylesheet, batch export,
      shareable embed links
- [ ] Virtualisation and a benchmark for 500+ node diagrams

### 3.6 Commercial

- [ ] Docs site
- [ ] Docker image for self-hosting
- [ ] Support channels, SLA, commercial tier
- [ ] SOC 2, DPA, penetration test report
