# Contributing to Archyne

Thanks for helping out. This document covers how to get set up, how the code
is organised, and what a reviewable change looks like.

## Getting started

Archyne needs Node 22 or newer.

```sh
npm install
npm run dev        # http://localhost:5173
```

Before pushing, run what CI runs:

```sh
npm run lint
npm run format
npm run typecheck
npm test
npm run build && npm run size
npm run audit
```

| Script                    | What it does                                   |
| ------------------------- | ---------------------------------------------- |
| `dev`                     | Vite dev server                                |
| `build`                   | Typecheck, then production build into `dist/`  |
| `test`                    | Round-trip parser/serializer tests (Vitest)    |
| `test:e2e:*`              | Browser-driven suites (see below)              |
| `typecheck`               | Both TS projects — browser code and Node code  |
| `lint` / `lint:fix`       | ESLint                                         |
| `format` / `format:check` | Prettier                                       |
| `size`                    | Initial-load bundle budget (see below)         |
| `audit`                   | Advisory gate on production deps (see below)   |
| `mcp` / `mcp:smoke`       | MCP server, and its end-to-end test            |
| `icons:index`             | Regenerate the icon name index (see below)     |
| `sbom`                    | Write `sbom.json` (CycloneDX, production deps) |
| `notices:check`           | Fail if THIRD-PARTY-NOTICES.md has drifted     |
| `desktop`                 | Electron shell around the current build        |

### Browser-driven tests

The Vitest suite runs under jsdom, which has no layout engine and no real
rendering — so contrast, target size, RTL geometry, export rasterization and
mermaid's sanitizer are all invisible to it. Those live in `tests/e2e-*.mts`
and drive a real browser through Playwright. CI runs all five.

```sh
npm run dev            # in one terminal
npm run test:e2e:csp   # sanitizer + Content Security Policy
npm run test:e2e:a11y  # WCAG 2.2 AA, both themes, eight surfaces
npm run test:e2e:rtl   # the chrome stays usable in right-to-left
npm run test:e2e:export # PNG export pipeline
npm run test:e2e:i18n  # non-Latin labels survive both export paths
```

Two environment variables (`tests/env.mts`) steer them:

- `ARCHYNE_URL` — where the app is served; defaults to the dev server.
- `PLAYWRIGHT_CHANNEL` — set to `msedge` to drive an installed Edge instead of
  downloading Playwright's Chromium.

`test:e2e:export` and `test:e2e:i18n` need `window.__graphTest`, which
`App.tsx` exposes only under `import.meta.env.DEV`, so they must run against
the dev server. The others work against `npm run preview` too.

### Dependency advisories

`npm run audit` gates on **high and critical** advisories in _production_
dependencies. The dev tree (Electron, Playwright, the toolchain) never reaches
a user, and gating on it only teaches people to ignore the gate.

An advisory that genuinely cannot be reached from Archyne's code can be
accepted in `audit-allow.json`, but only with a reason and an expiry date —
after that date the gate fails again, so the exception gets re-read instead of
becoming permanent.

## How the code is organised

The single most important idea: **the Mermaid text is the source of truth.**
The canvas is a view over it. Every structural edit regenerates the text, and
the text is re-parsed to rebuild the canvas. That is what makes undo a simple
snapshot stack, and what lets an LLM edit a diagram without Archyne needing to
understand the edit.

```
src/
  model/          the whole text ↔ graph contract — the heart of the project
    diagram.ts      parseDiagram / serializeDiagram; dispatches on diagram kind
    types.ts        node and edge shapes shared across kinds
    positions.ts    the `%% graph:positions` comment: read, patch, carry over
    kinds/          one module per Mermaid family (flowchart, state, er, …)
  components/     React UI — canvas, palette, inspector, code panel, dialogs
  store.ts        Zustand store: edits, selection, undo/redo, clipboard
  layout/         ELK auto-layout
  export.ts       PNG/SVG export
  embed.ts        postMessage bridge for host pages
mcp/              MCP server exposing .mmd files to agents
desktop/          Electron main process
```

### Layout positions

Manual layout lives in one trailing comment:

```
%% graph:positions {"start":{"x":0,"y":0},...}
```

The file stays 100% valid Mermaid, so GitHub, Notion and `mermaid-cli` all
render it, while hand-arranged layout survives save/reload and LLM rewrites.
If you touch serialization, keep this invariant: **a diagram that round-trips
must come back byte-identical apart from the positions line.**

### Adding a diagram kind

1. Add the kind to `DiagramKind` in `src/model/types.ts`
2. Create `src/model/kinds/<kind>.ts` with a parser and a serializer
3. Register it in the dispatch in `src/model/diagram.ts`
4. Add palette items, inspector fields, and a `NEW_DIAGRAM` template
5. **Add round-trip tests** — see below

## Tests

`src/model/roundtrip.test.ts` is the safety net. Every diagram kind has a test
that parses a representative diagram, serializes it back, and asserts the
result is equivalent. If you add a feature to a parser, add the syntax to that
kind's fixture. A parser change without a test change is almost always an
oversight.

Two further checks run outside Vitest:

- `npm run mcp:smoke` — spawns the MCP server and exercises every tool
- the `test:e2e:*` scripts — drive the real app in a browser; see
  [Browser-driven tests](#browser-driven-tests) above

## Bundle budget

`npm run size` measures what a browser downloads _before the editor is
interactive_: the entry chunk, its static imports, and the CSS. Total `dist/`
size is deliberately not measured — Mermaid's renderers and the Iconify
collections are lazily loaded and legitimately large.

If a change grows the initial load on purpose, run
`node scripts/check-bundle-size.mjs --update` and commit `bundle-budget.json`
with an explanation in the PR. If it grows it _by accident_, the usual cause
is a static `import` of something that should be a dynamic one.

## The icon name index

`src/icon-names.generated.json` is committed, and is generated by
`npm run icons:index`. It holds icon _names_ only.

Palette search must never import the `@iconify-json/*` packages: those carry
full SVG path data and come to roughly 6 MB gzipped across the five bundled
collections. Search reads the index (~63 KB gzipped, lazily loaded); the full
collection is fetched only when an icon it owns is actually rendered.

Regenerate the index whenever you add, remove or upgrade an icon collection,
and keep the `COLLECTIONS` list in `scripts/build-icon-index.mjs` in sync with
`LOADERS` in `src/icons.ts`.

## User-facing strings

Every string a user can see goes through the catalogue in `src/i18n/en.ts`,
resolved with `useT()` inside components or `t()` outside them. Do not add
literal English to JSX. See [`docs/i18n.md`](docs/i18n.md) for the rules,
including which strings deliberately stay untranslated and how right-to-left
is handled.

## Accessibility

Accessibility is a first-class workstream, not polish.
`eslint-plugin-jsx-a11y` runs in CI **as errors**,
`src/components/a11y.test.tsx` runs `axe` over the dialog primitives, and
`npm run test:e2e:a11y` audits ten interface surfaces in both themes against
WCAG 2.2 AA in a real browser. A criterion-by-criterion conformance report is
maintained outside the repository.

Ground rules for new UI:

- Anything clickable is a `<button>`. If you find yourself adding `onClick` to
  a `<div>`, that is the signal.
- Icon-only controls need `aria-label`; `title` alone is not reliably
  announced.
- Every action reachable by pointer must be reachable by keyboard. Dragging
  and connecting both have keyboard paths — see `src/placement.ts` and
  `src/components/useKeyboardConnect.ts`.
- Dialogs go through `src/components/Modal.tsx`, which handles the focus trap,
  Escape and focus restore.

`autoFocus` is disallowed except on an inline editor the user just opened; the
two existing uses carry a disable comment explaining why. Bear in mind that
axe catches roughly a third of WCAG issues — a green test run is a floor, not
a conformance claim.

## Pull requests

- Branch from `main`
- Keep the change focused; unrelated formatting churn makes review harder
- Match the surrounding style — the codebase favours short, explanatory
  comments that say _why_, not _what_
- Update `CHANGELOG.md` under `## [Unreleased]` for anything user-visible
- Make sure CI is green

Commit messages: a short imperative subject line, and a body explaining the
reasoning when it is not obvious from the diff.

## Self-hosting notes

The build is static — serve `dist/` from any web server. Because there is no
backend, the operator owns the HTTP response headers. A reasonable baseline:

- `Content-Security-Policy` — the app ships one as a `<meta>` tag; sending it
  as a header too is stronger, and is the only way to set `frame-ancestors`
  (meta-tag CSP ignores it). Archyne supports being embedded, so choose that
  value deliberately rather than copying `'none'`.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`

If you embed Archyne in another app, always pin the origin —
`?embed=1&origin=https://your.app`. See [`SECURITY.md`](SECURITY.md).

## Licence

By contributing you agree that your contributions are licensed under the
[MIT Licence](LICENSE).
