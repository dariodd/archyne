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

## [0.1.0-alpha.1] — 2026-08-01

First public release, deliberately labelled alpha: the editor is complete
enough to be useful and the surrounding project is honest about what has and
has not been verified, but nothing here has been exercised by anyone other
than its author.

### The editor

Two-way sync between a canvas and Mermaid source, across seven diagram
families — flowchart, state, ER, class, sequence, `architecture-beta` and C4.
Structural edits regenerate the text; dragging a node rewrites only the
trailing `%% graph:positions` comment, so a diagram stays valid Mermaid that
GitHub, Notion and `mermaid-cli` all render, while hand-arranged layout
survives save, reload and rewrites by an LLM.

Families with no visual editor — `gantt`, `pie`, `mindmap` and the rest —
open read-only rather than being rejected, with the source fully editable.

Also: undo/redo over code snapshots, copy/paste with id remapping, ELK
auto-layout in a web worker, PNG/SVG export, `.mmd` open and save-in-place
through the File System Access API, a command palette, a template gallery,
and roughly 13 000 searchable vendor icons bundled for architecture diagrams.

### Ways to run it

- The hosted demo at <https://dariodd.github.io/archyne/>
- `npx archyne`, which serves the build locally with no clone and no
  dependencies of its own
- Desktop builds for Windows, macOS and Linux, attached to this release —
  **not code-signed**; the release page explains what each platform will say
- An embeddable iframe with a default-deny `postMessage` origin allowlist
- An MCP server, so an agent can read and rewrite diagrams as text

### Accessibility

Keyboard operation of the canvas throughout: palette items place nodes,
`C` connects two of them, arrow keys move them. Dialogs trap and restore
focus. An Outline tab lists every node and its connections, because a canvas
conveys structure spatially and that is precisely what a screen reader cannot
recover. Parse errors announce through a live region wherever focus is.

`axe` reports no WCAG 2.2 AA violations across eight surfaces in both themes,
audited in a real browser. That evidence, and the four defects it does **not**
cover, are set out in
[`docs/accessibility-conformance-report.md`](docs/accessibility-conformance-report.md).
The report is unsigned, and says why.

### Internationalisation

English, Spanish, Italian, German, Arabic, Simplified Chinese and Japanese.
Catalogues are typed against the English source, so a missing key is a
compile error, and lazily loaded, so the initial bundle grows by ~3 KB
regardless of how many exist. Right-to-left mirrors the chrome; the source
panel and canvas stay left-to-right on purpose. The translations have not
been reviewed by native speakers.

### Security

No backend, no accounts, no telemetry, and no network request of Archyne's
own — `connect-src 'self'` in the Content Security Policy states a real
invariant rather than a hope. Untrusted diagram text is held by two
independent layers, mermaid's sanitizer and the CSP, each verified separately
in a browser on every pull request. The reasoning, the threat model and a
plainly stated list of gaps are in
[`docs/security-whitepaper.md`](docs/security-whitepaper.md).

Supply chain: a CycloneDX SBOM, an advisory gate on production dependencies
that requires written and expiring exceptions, a drift check on the
third-party notices, and npm publishing through trusted publishing, which
attaches SLSA provenance linking the tarball to the commit that produced it.

### What is not done

Named plainly, because an alpha that hides its edges is not an alpha:
desktop builds are unsigned; the accessibility report is a self-assessment
rather than a signed VPAT, and lists four real defects; the translations are
unreviewed; there is no multi-diagram workspace, so `localStorage` holds one
document; and there has been no independent security review.
